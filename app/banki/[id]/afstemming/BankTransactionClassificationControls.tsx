import {
  clearBankTransactionClassificationAction,
  setBankTransactionClassificationAction,
} from "@/app/banki/actions";
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
  suggested: string;
  suggestedNonDocument: string;
  suggestedPersonal: string;
  suggestedBusiness: string;
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

function suggestionLabel(
  classification: FinancialSourceClassificationCode | null,
  labels: Labels,
) {
  if (classification === "NON_DOCUMENT") return labels.suggestedNonDocument;
  if (classification === "PERSONAL") return labels.suggestedPersonal;
  if (classification === "BUSINESS") return labels.suggestedBusiness;
  return null;
}

export function BankTransactionClassificationControls(props: {
  companyId: number;
  bankAccountId: number;
  bankTransactionId: number;
  classification: FinancialSourceClassificationCode | null;
  allowPersonal: boolean;
  suggestedClassification: FinancialSourceClassificationCode | null;
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
          : suggestionLabel(props.suggestedClassification, props.labels)
            ? ` · ${suggestionLabel(props.suggestedClassification, props.labels)}`
            : ""}
      </summary>
      <p className="mt-2 text-xs text-slate-600">{props.labels.help}</p>

      {props.suggestedClassification && !props.classification && suggestionLabel(props.suggestedClassification, props.labels) ? (
        <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900">
          {props.labels.suggested}: {suggestionLabel(props.suggestedClassification, props.labels)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((classification) => (
          <form key={classification} action={setBankTransactionClassificationAction}>
            <input type="hidden" name="companyId" value={props.companyId} />
            <input type="hidden" name="bankAccountId" value={props.bankAccountId} />
            <input type="hidden" name="bankTransactionId" value={props.bankTransactionId} />
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
          <form action={clearBankTransactionClassificationAction}>
            <input type="hidden" name="companyId" value={props.companyId} />
            <input type="hidden" name="bankAccountId" value={props.bankAccountId} />
            <input type="hidden" name="bankTransactionId" value={props.bankTransactionId} />
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
