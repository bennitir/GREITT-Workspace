"use client";

import { confirmBankFinancialEventPayment } from "@/app/banki/actions";
import { useFormStatus } from "react-dom";

type Props = {
  companyId: number;
  bankTransactionId: number;
  eventId: number;
  confirmLabel: string;
  pendingLabel: string;
};

function SubmitButton({
  confirmLabel,
  pendingLabel,
}: Pick<Props, "confirmLabel" | "pendingLabel">) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
      className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-65"
    >
      <span aria-live="polite">
        {pending ? pendingLabel : confirmLabel}
      </span>
    </button>
  );
}

export function ConfirmFinancialEventMatchForm({
  companyId,
  bankTransactionId,
  eventId,
  confirmLabel,
  pendingLabel,
}: Props) {
  return (
    <form action={confirmBankFinancialEventPayment}>
      <input type="hidden" name="companyId" value={companyId} />
      <input
        type="hidden"
        name="bankTransactionId"
        value={bankTransactionId}
      />
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
      />
    </form>
  );
}
