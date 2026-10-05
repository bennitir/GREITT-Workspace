"use client";

import { confirmBankReviewedDocumentMatch } from "@/app/banki/actions";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: number;
  bankTransactionId: number;
  documentId: number;
  confirmLabel: string;
  pendingLabel: string;
  className?: string;
  successHref?: string;
};

export function ConfirmReviewedDocumentMatchForm({
  companyId,
  bankTransactionId,
  documentId,
  confirmLabel,
  pendingLabel,
  className,
  successHref,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await confirmBankReviewedDocumentMatch(formData);
        if (successHref) {
          router.replace(successHref);
        } else {
          router.refresh();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "RECONCILIATION_CONFIRMATION_FAILED");
      }
    });
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="bankTransactionId" value={bankTransactionId} />
        <input type="hidden" name="documentId" value={documentId} />
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          aria-busy={pending}
          className={className ?? "rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-65"}
        >
          <span aria-live="polite">{pending ? pendingLabel : confirmLabel}</span>
        </button>
      </form>
      {error ? (
        <div role="alert" className="mt-2 max-w-sm text-xs font-medium text-amber-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}
