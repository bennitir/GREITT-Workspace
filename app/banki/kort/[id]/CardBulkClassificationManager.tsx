"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { FinancialSourceClassificationCode } from "@/lib/financial-reconciliation/source-classification";

type Labels = {
  bulkHelp: string;
  bulkBusiness: string;
  bulkPersonal: string;
  bulkInternalTransfer: string;
  bulkNonDocument: string;
  bulkReview: string;
  bulkSelected: string;
  bulkSelectVisible: string;
  bulkClearSelection: string;
  bulkSaving: string;
  bulkSelectionSaved: string;
  bulkError: string;
};

type Props = {
  paymentCardId: number;
  filterKey: string;
  allowPersonal: boolean;
  labels: Labels;
  action: (formData: FormData) => Promise<void>;
};

function checkboxSelector(paymentCardId: number) {
  return `input[data-card-bulk-selection="${paymentCardId}"]`;
}

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function CardBulkClassificationManager({
  paymentCardId,
  filterKey,
  allowPersonal,
  labels,
  action,
}: Props) {
  const storageKey = useMemo(
    () => `gloggt:card-bulk-selection:${paymentCardId}:${filterKey}`,
    [paymentCardId, filterKey],
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const syncCheckboxes = useCallback((ids: number[]) => {
    const selected = new Set(ids);
    document.querySelectorAll<HTMLInputElement>(checkboxSelector(paymentCardId)).forEach((checkbox) => {
      const id = parseId(checkbox.value);
      checkbox.checked = id != null && selected.has(id);
    });
  }, [paymentCardId]);

  const persist = useCallback((ids: number[]) => {
    setSelectedIds(ids);
    try {
      if (ids.length > 0) sessionStorage.setItem(storageKey, JSON.stringify(ids));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // Selection persistence is a UX safeguard only; classification still works without storage.
    }
    syncCheckboxes(ids);
  }, [storageKey, syncCheckboxes]);

  useEffect(() => {
    let restored: number[] = [];
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        restored = [...new Set(parsed.map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0))];
      }
    } catch {
      restored = [];
    }

    // Keep only rows that are still present and selectable in this filter after refresh/revalidation.
    const available = new Set(
      [...document.querySelectorAll<HTMLInputElement>(checkboxSelector(paymentCardId))]
        .filter((checkbox) => !checkbox.disabled)
        .map((checkbox) => Number(checkbox.value)),
    );
    restored = restored.filter((id) => available.has(id));
    persist(restored);

    const onChange = (event: Event) => {
      const checkbox = event.target as HTMLInputElement | null;
      if (!checkbox?.matches(checkboxSelector(paymentCardId))) return;
      const id = parseId(checkbox.value);
      if (id == null) return;
      setError(null);
      setSelectedIds((current) => {
        const next = new Set(current);
        if (checkbox.checked) next.add(id);
        else next.delete(id);
        const ids = [...next];
        try {
          if (ids.length > 0) sessionStorage.setItem(storageKey, JSON.stringify(ids));
          else sessionStorage.removeItem(storageKey);
        } catch {
          // See note in persist().
        }
        return ids;
      });
    };

    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [paymentCardId, persist, storageKey]);

  const clearSelection = useCallback(() => {
    setError(null);
    persist([]);
  }, [persist]);

  const selectVisible = useCallback(() => {
    const ids = [...document.querySelectorAll<HTMLInputElement>(checkboxSelector(paymentCardId))]
      .filter((checkbox) => !checkbox.disabled)
      .map((checkbox) => parseId(checkbox.value))
      .filter((id): id is number => id != null);
    persist([...new Set(ids)]);
  }, [paymentCardId, persist]);

  const classify = useCallback((classification: FinancialSourceClassificationCode) => {
    if (selectedIds.length === 0 || isPending) return;
    setError(null);
    const ids = [...selectedIds];
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("paymentCardId", String(paymentCardId));
        formData.set("classification", classification);
        ids.forEach((id) => formData.append("paymentCardTransactionId", String(id)));
        await action(formData);
        persist([]);
      } catch (caught) {
        console.error(caught);
        setError(labels.bulkError);
        // Keep every checkbox selected so the user's work is not lost on failure.
        syncCheckboxes(ids);
      }
    });
  }, [action, isPending, labels.bulkError, paymentCardId, persist, selectedIds, syncCheckboxes]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-600">{labels.bulkSelectionSaved}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectVisible}
            className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {labels.bulkSelectVisible}
          </button>
          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {labels.bulkClearSelection}
            </button>
          ) : null}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(96vw,1100px)] -translate-x-1/2 rounded-xl border border-slate-300 bg-white/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                {selectedIds.length} {labels.bulkSelected}
              </p>
              <p className="text-xs text-slate-600">{labels.bulkHelp}</p>
              {error ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={isPending} onClick={() => classify("BUSINESS")} className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {labels.bulkBusiness}
              </button>
              {allowPersonal ? (
                <button type="button" disabled={isPending} onClick={() => classify("PERSONAL")} className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">
                  {labels.bulkPersonal}
                </button>
              ) : null}
              <button type="button" disabled={isPending} onClick={() => classify("INTERNAL_TRANSFER")} className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {labels.bulkInternalTransfer}
              </button>
              <button type="button" disabled={isPending} onClick={() => classify("NON_DOCUMENT")} className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {labels.bulkNonDocument}
              </button>
              <button type="button" disabled={isPending} onClick={() => classify("REVIEW")} className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {labels.bulkReview}
              </button>
              <button type="button" disabled={isPending} onClick={clearSelection} className="rounded-md border bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                {labels.bulkClearSelection}
              </button>
            </div>
          </div>
          {isPending ? <p className="mt-2 text-xs font-semibold text-blue-700">{labels.bulkSaving}</p> : null}
        </div>
      ) : null}
    </>
  );
}
