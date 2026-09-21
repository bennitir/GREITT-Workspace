"use client";

import { completeWorkOrder, reopenWorkOrder } from "./actions";

type Props = {
  workOrderId: number;
  mode: "complete" | "reopen";
  actionLabel: string;
  confirmText: string;
  disabled?: boolean;
};

export default function WorkOrderLifecycleControls({
  workOrderId,
  mode,
  actionLabel,
  confirmText,
  disabled = false,
}: Props) {
  const action = mode === "complete" ? completeWorkOrder : reopenWorkOrder;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    >
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <button
        type="submit"
        disabled={disabled}
        className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
          mode === "complete"
            ? "bg-emerald-700 hover:bg-emerald-800"
            : "bg-slate-900 hover:bg-slate-800"
        }`}
      >
        {actionLabel}
      </button>
    </form>
  );
}
