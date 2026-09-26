"use client";
import ApproveDocumentButton from "@/components/ApproveDocumentButton";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  updateDetectedDocumentEntries,
  applyConfirmedBookingSuggestions,
  addDetectedDocumentEntry,
  deleteDetectedDocumentEntry,
  markDetectedDocumentDuplicate,
  setDetectedDocumentVatDeduction,
} from "@/app/actions/receiptActions";

type Entry = {
  id: number;
  account: string;
  text: string;
  debit: number;
  credit: number;
};

type VatDeduction = {
  percent: number;
  fullVatAmount: number;
  deductibleVatAmount: number;
  nonDeductibleVatAmount: number;
  reason: string | null;
} | null;

type Props = {
  documentId: number;
  entries: Entry[];

  accounts: {
    number: string;
    name: string;
    type: string;
    entryRole: string;
    vatTreatment: string | null;
  }[];

  vatRegistered: boolean | null;
  vatDeduction: VatDeduction;

  date: Date | string | null;
  totalAmount: number | null;
  reviewedAt: Date | string | null;
  approvedAt: Date | string | null;
  voucherNumber: number | null;
  duplicateOfDocumentId: number | null;
duplicateVoucherNumber: number | null;
duplicateMarkedAt: Date | null;
canBook: boolean;
canEdit: boolean;
};

export default function DetectedDocumentEntriesEditor({
  documentId,
  entries,
  accounts,
  vatRegistered,
  vatDeduction,
  date,
  totalAmount,
  reviewedAt,
  approvedAt,
  voucherNumber,
  duplicateOfDocumentId,
  duplicateVoucherNumber,
  duplicateMarkedAt,
  canBook,
  canEdit,
}: Props) {
  const router = useRouter();
  const datePickerRef = useRef<HTMLInputElement>(null);

  function isVatPostingAccount(account: {
    type: string;
    entryRole: string;
    vatTreatment: string | null;
  }) {
    return (
      account.type === "VAT_INPUT" ||
      account.type === "VAT_OUTPUT" ||
      account.entryRole === "VAT_INPUT" ||
      account.entryRole === "VAT_OUTPUT"
    );
  }

  function isVatInputPostingAccount(account: {
    type: string;
    entryRole: string;
  }) {
    return account.type === "VAT_INPUT" || account.entryRole === "VAT_INPUT";
  }

  function roundVatAmount(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // Ekki nota Intl/toLocaleString í SSR-renderuðum Client Component texta.
  // Node og vafri geta annars skilað mismunandi þúsunda-/tugabrotaskilum
  // og valdið hydration mismatch. Þetta formatter er viljandi deterministic.
  function formatIsNumber(value: number) {
    if (!Number.isFinite(value)) return "0";

    const rounded = roundVatAmount(value);
    const negative = rounded < 0;
    const absolute = Math.abs(rounded);
    const compact = absolute
      .toFixed(2)
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
    const [whole, decimals] = compact.split(".");
    const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    return `${negative ? "-" : ""}${groupedWhole}${
      decimals ? `,${decimals}` : ""
    }`;
  }

  const availableAccounts =
    vatRegistered === true
      ? accounts
      : accounts.filter((account) => !isVatPostingAccount(account));

  function normalizeAccountValue(value: string) {
    const trimmed = value.trim();

    if (accounts.some((account) => account.number === trimmed)) {
      return trimmed;
    }

    const leadingNumber = trimmed.match(/^(\\d+)/)?.[1];

    if (
      leadingNumber &&
      accounts.some((account) => account.number === leadingNumber)
    ) {
      return leadingNumber;
    }

    return trimmed;
  }

  function normalizeEntries(sourceEntries: Entry[]) {
    return sourceEntries.map((entry) => ({
      ...entry,
      account: normalizeAccountValue(entry.account),
    }));
  }

  const [rows, setRows] = useState(() => normalizeEntries(entries));
  const dirtyRef = useRef(false);
  const activeDocumentIdRef = useRef(documentId);

  // Server Components geta endursent ný prop-object við bakgrunnsuppfærslu
  // (t.d. router.refresh). Ekki má láta slíka uppfærslu skrifa yfir
  // bókunarlínur sem notandinn er byrjaður að breyta.
  const normalizedServerRows = normalizeEntries(entries);
  const serverRowsSignature = JSON.stringify(normalizedServerRows);
  const latestServerRowsRef = useRef(normalizedServerRows);
  latestServerRowsRef.current = normalizedServerRows;
  const suggestionAttemptedDocumentRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeDocumentIdRef.current !== documentId) {
      activeDocumentIdRef.current = documentId;
      dirtyRef.current = false;
      setHasUnsavedChanges(false);
      setRows(latestServerRowsRef.current);
      return;
    }

    if (dirtyRef.current) {
      // Varðveita óvistaðar breytingar, en taka samt inn nýjar línur sem
      // voru stofnaðar viljandi á server (t.d. „Bæta við bókunarlínu“).
      // Áður var allri server-uppfærslu hafnað meðan formið var dirty,
      // þannig að ný stofnuð lína birtist aldrei fyrr en formið var endurhlaðið.
      setRows((currentRows) => {
        const currentIds = new Set(currentRows.map((row) => row.id));
        const addedServerRows = latestServerRowsRef.current.filter(
          (row) => !currentIds.has(row.id)
        );

        if (addedServerRows.length === 0) {
          return currentRows;
        }

        return [...currentRows, ...addedServerRows];
      });
      return;
    }

    setRows(latestServerRowsRef.current);
  }, [documentId, serverRowsSignature]);

  // Ef deterministic greining skilaði engum bókunarlínum reynir GLÖGGT
  // sjálfkrafa að endurnýta áður staðfest bókaraval. Aðgerðin er fail-closed
  // og kallar ekki AI; ef ekkert öruggt mynstur finnst breytist ekkert.
  useEffect(() => {
    if (
      entries.length > 0 ||
      reviewedAt ||
      approvedAt ||
      voucherNumber != null ||
      !canEdit ||
      suggestionAttemptedDocumentRef.current === documentId
    ) {
      return;
    }

    suggestionAttemptedDocumentRef.current = documentId;
    let cancelled = false;

    void applyConfirmedBookingSuggestions(documentId)
      .then((result) => {
        if (!cancelled && result.changed) {
          router.refresh();
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          `Mistókst að endurnýta staðfesta bókunartillögu fyrir skjal ${documentId}:`,
          err,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    documentId,
    entries.length,
    reviewedAt,
    approvedAt,
    voucherNumber,
    canEdit,
    router,
  ]);

  const [documentDate, setDocumentDate] = useState(
  date
    ? new Date(date).toISOString().slice(0, 10)
    : ""
);

const [dateInputValue, setDateInputValue] = useState(
  date
    ? new Date(date).toISOString().slice(0, 10).split("-").reverse().join(".")
    : ""
);

const [documentAmount, setDocumentAmount] = useState(
  totalAmount != null ? String(totalAmount) : ""
);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [vatPercentInput, setVatPercentInput] = useState(
    String(vatDeduction?.percent ?? 100)
  );
  const [vatReason, setVatReason] = useState(vatDeduction?.reason ?? "");
  const [applyingVatDeduction, setApplyingVatDeduction] = useState(false);

  const vatDeductionSignature = JSON.stringify(vatDeduction);
  useEffect(() => {
    setVatPercentInput(String(vatDeduction?.percent ?? 100));
    setVatReason(vatDeduction?.reason ?? "");
  }, [documentId, vatDeductionSignature]);

  function markDirty() {
    dirtyRef.current = true;
    setHasUnsavedChanges(true);
  }

  function updateRow(
    id: number,
    field: keyof Entry,
    value: string
  ) {
    if (field === "account" && vatRegistered !== true) {
      const selectedAccount = accounts.find(
        (account) => account.number === value
      );

      if (selectedAccount && isVatPostingAccount(selectedAccount)) {
        setError(
          vatRegistered === false
            ? "Ekki er hægt að velja VSK-reikning vegna þess að fyrirtækið er ekki VSK-skráð."
            : "Ekki er hægt að velja VSK-reikning fyrr en VSK-skráningarstaða fyrirtækisins hefur verið staðfest."
        );
        setMessage("");
        return;
      }
    }

    markDirty();
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                field === "debit" ||
                field === "credit"
                  ? Number(value)
                  : value,
            }
          : row
      )
    );

    setMessage("");
    setError("");
  }

  const totalDebit = rows.reduce(
    (sum, row) => sum + row.debit,
    0
  );

  const totalCredit = rows.reduce(
    (sum, row) => sum + row.credit,
    0
  );

 const balances =
  rows.length > 0 &&
  totalDebit > 0 &&
  totalCredit > 0 &&
  Math.abs(totalDebit - totalCredit) <= 0.01;

  const vatInputAccountNumbers = new Set(
    accounts.filter(isVatInputPostingAccount).map((account) => account.number)
  );
  const currentVatInputAmount = roundVatAmount(
    rows
      .filter((row) => vatInputAccountNumbers.has(row.account))
      .reduce((sum, row) => sum + row.debit - row.credit, 0)
  );
  const fullVatAmount = roundVatAmount(
    vatDeduction?.fullVatAmount ?? Math.max(0, currentVatInputAmount)
  );
  const parsedVatPercent = Number(String(vatPercentInput).replace(",", "."));
  const previewVatPercent = Number.isFinite(parsedVatPercent)
    ? Math.min(100, Math.max(0, parsedVatPercent))
    : 0;
  const previewDeductibleVat = roundVatAmount(
    fullVatAmount * (previewVatPercent / 100)
  );
  const previewNonDeductibleVat = roundVatAmount(
    fullVatAmount - previewDeductibleVat
  );
  const showVatDeductionPanel = vatRegistered === true && fullVatAmount > 0;

  async function handleApplyVatDeduction() {
    try {
      setApplyingVatDeduction(true);
      setMessage("");
      setError("");

      if (!Number.isFinite(parsedVatPercent) || parsedVatPercent < 0 || parsedVatPercent > 100) {
        throw new Error("Innskattsfrádráttur verður að vera á bilinu 0–100%.");
      }
      if (hasUnsavedChanges) {
        throw new Error("Vistaðu bókunarlínurnar áður en hlutfallsfrádráttur er notaður.");
      }

      const result = await setDetectedDocumentVatDeduction(
        documentId,
        parsedVatPercent,
        vatReason
      );
      setVatPercentInput(String(result.percent));
      setMessage(
        `Innskattsfrádráttur ${result.percent}% vistaður · ${formatIsNumber(result.deductibleVatAmount)} kr. af ${formatIsNumber(result.fullVatAmount)} kr.`
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ekki tókst að vista hlutfallsfrádrátt innskatts."
      );
    } finally {
      setApplyingVatDeduction(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");
      setError("");

     const rowsToSave = rows.filter(
        (row) => Math.abs(row.debit) > 0 || Math.abs(row.credit) > 0
      );

      if (rowsToSave.length === 0) {
        throw new Error("Engar bókunarlínur með upphæð eru skráðar.");
      }

      await updateDetectedDocumentEntries(
        documentId,
        rowsToSave,
        documentDate,
        documentAmount
      );

      setMessage("Breytingar vistaðar.");
      dirtyRef.current = false;
      setHasUnsavedChanges(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Villa kom upp við vistun breytinga."
      );
    } finally {
      setSaving(false);
    }
  }

async function handleMarkDuplicate() {
  try {
    setError("");
    setMessage("");

    if (!duplicateOfDocumentId || !duplicateVoucherNumber) {
      setError("Vantar upplýsingar um hvaða bókaða fylgiskjal þetta er tvírit af.");
      return;
    }

    await markDetectedDocumentDuplicate(
      documentId,
      duplicateOfDocumentId,
      duplicateVoucherNumber
    );

    setMessage(
      `Tvírit merkt – þegar bókað sem fylgiskjal ${duplicateVoucherNumber}.`
    );

    router.refresh();
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Ekki tókst að merkja fylgiskjalið sem tvírit."
    );
  }
}

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
  <label className="text-sm">
    <span className="mb-1 block font-semibold">Dagsetning</span>
    <div className="flex gap-2">
      <input
        type="text"
        value={dateInputValue}
        disabled={!canEdit}
        onChange={(e) => {
          const value = e.target.value;

          setDateInputValue(value);
          markDirty();

          const match = value.match(
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
          );

          if (match) {
            const [, day, month, year] = match;

            setDocumentDate(
              `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
            );
          } else {
            setDocumentDate("");
          }
        }}
        placeholder="dd.mm.áááá"
        inputMode="numeric"
        className="min-w-0 flex-1 rounded border px-2 py-1"
      />

      <button
        type="button"
        disabled={!canEdit}
        onClick={() => datePickerRef.current?.showPicker()}
        title="Velja dagsetningu"
        aria-label="Velja dagsetningu úr dagatali"
        className="rounded border px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        📅
      </button>

      <input
        ref={datePickerRef}
        type="date"
        value={documentDate}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const value = e.target.value;
          setDocumentDate(value);

          if (value) {
            const [year, month, day] = value.split("-");
            setDateInputValue(`${day}.${month}.${year}`);
          } else {
            setDateInputValue("");
          }

          markDirty();
          setMessage("");
          setError("");
        }}
        className="absolute h-0 w-0 opacity-0"
      />
    </div>
  </label>

  <label className="text-sm">
    <span className="mb-1 block font-semibold">Upphæð</span>
    <input
      type="number"
      value={documentAmount}
      disabled={!canEdit}
      onChange={(e) => {
  setDocumentAmount(e.target.value);
  markDirty();
}}
      className="w-full rounded border px-2 py-1"
      placeholder="Upphæð"
    />
  </label>
</div>
{vatRegistered !== true && (
  <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    {vatRegistered === false
      ? "Fyrirtækið er ekki VSK-skráð. Innskattur og útskattur eru ekki bókaðir."
      : "VSK-skráningarstaða fyrirtækisins er ekki staðfest. VSK-bókun er óvirk þar til staðan hefur verið staðfest."}
  </div>
)}

{showVatDeductionPanel && (
  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-semibold text-sky-950">Innskattsfrádráttur</div>
        <p className="mt-1 text-xs text-sky-800">
          Hlutfallið er varðveitt með fylgiskjalinu og sést í rekjanleika bókunarinnar.
        </p>
      </div>
      <div className="rounded-full border border-sky-300 bg-white px-3 py-1 font-semibold text-sky-900">
        {vatDeduction ? `${vatDeduction.percent}% staðfest` : "100% núna"}
      </div>
    </div>

    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="rounded border border-sky-100 bg-white p-3">
        <div className="text-xs text-slate-500">VSK á reikningi</div>
        <div className="mt-1 text-lg font-semibold">
          {formatIsNumber(fullVatAmount)} kr.
        </div>
      </div>
      <div className="rounded border border-emerald-200 bg-white p-3">
        <div className="text-xs text-slate-500">Frádráttarbær innskattur</div>
        <div className="mt-1 text-lg font-semibold text-emerald-700">
          {formatIsNumber(previewDeductibleVat)} kr.
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-white p-3">
        <div className="text-xs text-slate-500">Ófrádráttarbær VSK</div>
        <div className="mt-1 text-lg font-semibold text-amber-700">
          {formatIsNumber(previewNonDeductibleVat)} kr.
        </div>
      </div>
    </div>

    {canEdit && !approvedAt && voucherNumber == null && (
      <div className="mt-4 grid gap-3 md:grid-cols-[170px_1fr_auto] md:items-end">
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            Frádráttarhlutfall
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={vatPercentInput}
              onChange={(e) => setVatPercentInput(e.target.value)}
              className="w-24 rounded border border-sky-300 bg-white px-2 py-2"
            />
            <span className="font-semibold text-slate-700">%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[100, 75, 50, 0].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setVatPercentInput(String(value))}
                className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                {value}%
              </button>
            ))}
          </div>
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            Ástæða / skýring
          </span>
          <input
            value={vatReason}
            onChange={(e) => setVatReason(e.target.value)}
            placeholder="t.d. blönduð notkun síma"
            className="w-full rounded border border-sky-300 bg-white px-3 py-2"
          />
        </label>

        <button
          type="button"
          onClick={handleApplyVatDeduction}
          disabled={applyingVatDeduction || hasUnsavedChanges}
          className="rounded bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyingVatDeduction ? "Vista..." : "Nota hlutfall"}
        </button>
      </div>
    )}

    {hasUnsavedChanges && (
      <p className="mt-2 text-xs font-medium text-amber-800">
        Vistaðu bókunarlínurnar áður en þú breytir innskattsfrádrætti.
      </p>
    )}
  </div>
)}

<div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-500">
        <span>Reikningslykill</span>
        <span>Texti</span>
        <span>Debet</span>
        <span>Kredit</span>
      </div>

      {rows.map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-5 gap-2 border-t py-3 text-sm"
        >
          <div className="relative">
            <select
              value={entry.account}
              disabled={!canEdit}
              onChange={(e) =>
                updateRow(
                  entry.id,
                  "account",
                  e.target.value
                )
              }
              className="w-full rounded border px-2 py-1"
            >
              {!availableAccounts.some(
                (account) => account.number === entry.account
              ) && (
                <option value={entry.account}>
                  {entry.account
                    ? `Ógildur lykill: ${entry.account}`
                    : "Veldu reikningslykil"}
                </option>
              )}

              {availableAccounts.map((account) => (
                <option
                  key={account.number}
                  value={account.number}
                >
                  {account.number} – {account.name}
                </option>
              ))}
            </select>
          </div>

          <input
            value={entry.text}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "text",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Texti"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            value={entry.debit}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "debit",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Debet"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            value={entry.credit}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "credit",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Kredit"
          />
          {!reviewedAt && (
  <button
    type="button"
    onClick={async () => {
      await deleteDetectedDocumentEntry(entry.id);
      // Eyðingin er þegar vistuð á server. Fjarlægjum línuna líka strax
      // úr local state svo dirty-vörnin haldi henni ekki sýnilegri.
      setRows((currentRows) =>
        currentRows.filter((row) => row.id !== entry.id)
      );
      router.refresh();
    }}
    className="rounded border border-red-300 px-2 py-1 text-red-700"
  >
    Eyða
  </button>
)}
        </div>
      ))}
{!reviewedAt && (
  <button
    type="button"
    onClick={async () => {
      await addDetectedDocumentEntry(documentId);
      router.refresh();
    }}
    className="mt-3 rounded border border-blue-600 px-3 py-2 text-sm text-blue-600"
  >
    + Bæta við bókunarlínu
  </button>
)}
      <div className="rounded bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>
            Debet samtals:
          </span>

          <strong>
            {formatIsNumber(totalDebit)} kr.
          </strong>
        </div>

        <div className="mt-1 flex justify-between">
          <span>
            Kredit samtals:
          </span>

          <strong>
            {formatIsNumber(totalCredit)} kr.
          </strong>
        </div>

        <div
  className={`mt-2 font-medium ${
    rows.length === 0
      ? "text-amber-700"
      : balances
        ? "text-green-700"
        : "text-red-700"
  }`}
>
  {rows.length === 0
    ? "⚠ Engar bókunarlínur"
    : balances
      ? "✓ Bókun stemmir"
      : "⚠ Debet og kredit stemma ekki"}
</div>
      </div>

{!voucherNumber && !duplicateMarkedAt && (
  <>
    {hasUnsavedChanges ? (
  <button
    type="button"
    onClick={handleSave}
    disabled={saving || !balances}
    className="rounded bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
  >
    {saving ? "Vista..." : "Vista breytingar"}
  </button>
) : canBook ? (
  <ApproveDocumentButton documentId={documentId} />
) : (
  <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Ekki bókunarheimild
  </div>
)}
</>
)}
{reviewedAt &&
  !voucherNumber &&
  duplicateOfDocumentId &&
  duplicateVoucherNumber &&
  !duplicateMarkedAt && (
    <button
      type="button"
      onClick={handleMarkDuplicate}
      className="rounded bg-amber-600 px-4 py-2 font-medium text-white"
    >
      Merkja sem tvírit af fylgiskjali {duplicateVoucherNumber}
    </button>
  )}
{duplicateMarkedAt && duplicateVoucherNumber && (
  <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
    Tvírit – þegar bókað sem fylgiskjal {duplicateVoucherNumber}
  </div>
)}

{message && (
  <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
    ✓ {message}
  </div>
)}

{error && (
  <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
    {error}
  </div>
)}

</div>
);
}