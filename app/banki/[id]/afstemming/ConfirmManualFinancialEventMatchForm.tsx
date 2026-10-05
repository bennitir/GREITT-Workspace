"use client";

import { confirmManualBankFinancialEventPayment } from "@/app/banki/actions";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: number;
  bankTransactionId: number;
  eventId: number;
  documentId: number;
  confirmLabel: string;
  pendingLabel: string;
  overAllocationLabel: string;
  successHref?: string;
};

export function ConfirmManualFinancialEventMatchForm({
  companyId,
  bankTransactionId,
  eventId,
  documentId,
  confirmLabel,
  pendingLabel,
  overAllocationLabel,
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
      const result = await confirmManualBankFinancialEventPayment(formData);
      if (!result.ok) {
        setError(
          result.code === "EVENT_PAYMENT_OVER_ALLOCATION" ||
          result.code === "BANK_PAYMENT_OVER_ALLOCATION"
            ? overAllocationLabel
            : result.code,
        );
        return;
      }

      if (successHref) {
        router.replace(successHref);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="bankTransactionId" value={bankTransactionId} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="documentId" value={documentId} />
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          aria-busy={pending}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-65"
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
