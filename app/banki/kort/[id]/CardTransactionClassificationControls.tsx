import {
  clearPaymentCardTransactionClassificationAction,
  setPaymentCardTransactionClassificationAction,
} from "@/app/banki/kort/actions";
import type { FinancialSourceClassificationCode } from "@/lib/financial-reconciliation/source-classification";

type Labels = {
  title: string;
  help: string;
  business: string;
  personal: string;
  internalTransfer: string;
  nonDocument: string;
  review: string;
  clear: string;
  current: string;
};

function labelFor(classification: FinancialSourceClassificationCode, labels: Labels) {
  switch (classification) {
    case "BUSINESS": return labels.business;
    case "PERSONAL": return labels.personal;
    case "INTERNAL_TRANSFER": return labels.internalTransfer;
    case "NON_DOCUMENT": return labels.nonDocument;
    case "REVIEW": return labels.review;
  }
}

export function CardTransactionClassificationControls(props: {
  paymentCardId: number;
  paymentCardTransactionId: number;
  classification: FinancialSourceClassificationCode | null;
  allowPersonal: boolean;
  labels: Labels;
}) {
  const options: FinancialSourceClassificationCode[] = [
    "BUSINESS",
    ...(props.allowPersonal ? ["PERSONAL" as const] : []),
    "INTERNAL_TRANSFER",
    "NON_DOCUMENT",
    "REVIEW",
  ];

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-800">
        {props.labels.title}
        {props.classification
          ? ` · ${props.labels.current}: ${labelFor(props.classification, props.labels)}`
          : ""}
      </summary>
      <p className="mt-2 text-xs text-slate-600">{props.labels.help}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((classification) => (
          <form key={classification} action={setPaymentCardTransactionClassificationAction}>
            <input type="hidden" name="paymentCardId" value={props.paymentCardId} />
            <input
              type="hidden"
              name="paymentCardTransactionId"
              value={props.paymentCardTransactionId}
            />
            <input type="hidden" name="classification" value={classification} />
            <button
              type="submit"
              className={
                props.classification === classification
                  ? "rounded-md border border-slate-800 bg-slate-800 px-3 py-1.5 font-semibold text-white"
                  : "rounded-md border bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
              }
            >
              {labelFor(classification, props.labels)}
            </button>
          </form>
        ))}

        {props.classification ? (
          <form action={clearPaymentCardTransactionClassificationAction}>
            <input type="hidden" name="paymentCardId" value={props.paymentCardId} />
            <input
              type="hidden"
              name="paymentCardTransactionId"
              value={props.paymentCardTransactionId}
            />
            <button
              type="submit"
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50"
            >
              {props.labels.clear}
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
