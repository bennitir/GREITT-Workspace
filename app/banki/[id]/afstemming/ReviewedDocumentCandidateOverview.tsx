import { ConfirmReviewedDocumentMatchForm } from "@/app/banki/[id]/afstemming/ConfirmReviewedDocumentMatchForm";
import type {
  ReviewedDocumentCandidate,
  ReviewedDocumentCandidateResolution,
} from "@/lib/financial-reconciliation/reviewed-document-provider";
import { formatNumber } from "@/lib/locale";
import Link from "next/link";

type Labels = {
  title: string;
  help: string;
  readOnlyBadge: string;
  bankTransactions: string;
  uniqueStrong: string;
  uniquePossible: string;
  ambiguous: string;
  details: string;
  accountingDocument: string;
  paymentNotice: string;
  paymentConfirmation: string;
  paymentConfirmationHelp: string;
  exactReference: string;
  exactKennitala: string;
  exactParty: string;
  learnedPattern: string;
  learnedPatternHelp: string;
  strong: string;
  possible: string;
  receipt: string;
  dateDistance: string;
  days: string;
  confirm: string;
  confirming: string;
  openDocument: string;
};

type Props = {
  resolutions: ReviewedDocumentCandidateResolution[];
  counts: {
    uniqueStrong: number;
    uniquePossible: number;
    ambiguous: number;
    accountingDocument: number;
    paymentNotice: number;
    paymentConfirmation: number;
    learnedPattern: number;
  };
  labels: Labels;
  companyId: number;
  canReconcile: boolean;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("is-IS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatAmount(value: string) {
  return `${formatNumber(Number(value))} kr.`;
}

function evidenceLabel(
  candidate: ReviewedDocumentCandidate,
  labels: Labels,
) {
  switch (candidate.identityEvidence) {
    case "EXACT_REFERENCE":
      return labels.exactReference;
    case "EXACT_COUNTERPARTY_KENNITALA":
      return labels.exactKennitala;
    case "EXACT_PARTY":
      return labels.exactParty;
    case "LEARNED_COMPANY_PATTERN":
      return labels.learnedPattern;
  }
}

function documentTypeLabel(
  candidate: ReviewedDocumentCandidate,
  labels: Labels,
) {
  switch (candidate.evidenceKind) {
    case "ACCOUNTING_DOCUMENT_EVIDENCE":
      return labels.accountingDocument;
    case "PAYMENT_NOTICE_EVIDENCE":
      return labels.paymentNotice;
    case "PAYMENT_CONFIRMATION_EVIDENCE":
      return labels.paymentConfirmation;
  }
}

export function ReviewedDocumentCandidateOverview({
  resolutions,
  counts,
  labels,
  companyId,
  canReconcile,
}: Props) {
  if (resolutions.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-cyan-950">{labels.title}</h3>
          <p className="mt-1 max-w-4xl text-sm text-cyan-900/80">{labels.help}</p>
        </div>
        <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-800">
          {labels.readOnlyBadge}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-cyan-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.bankTransactions}</div>
          <div className="mt-1 text-2xl font-semibold">{resolutions.length}</div>
        </div>
        <div className="rounded-lg border border-cyan-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.uniqueStrong}</div>
          <div className="mt-1 text-2xl font-semibold">{counts.uniqueStrong}</div>
        </div>
        <div className="rounded-lg border border-cyan-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.uniquePossible}</div>
          <div className="mt-1 text-2xl font-semibold">{counts.uniquePossible}</div>
        </div>
        <div className="rounded-lg border border-cyan-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.ambiguous}</div>
          <div className="mt-1 text-2xl font-semibold">{counts.ambiguous}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-950">
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-cyan-100">
          {labels.accountingDocument}: {counts.accountingDocument}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-cyan-100">
          {labels.paymentNotice}: {counts.paymentNotice}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-cyan-100">
          {labels.paymentConfirmation}: {counts.paymentConfirmation}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-cyan-100">
          {labels.learnedPattern}: {counts.learnedPattern}
        </span>
      </div>

      <details className="mt-4 rounded-lg border border-cyan-100 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-cyan-950">
          {labels.details}
        </summary>
        <div className="border-t border-cyan-100 px-4 py-2">
          {resolutions.map((resolution) => (
            <div key={resolution.bankTransactionId} className="border-b py-4 last:border-b-0">
              {resolution.candidates.map((candidate) => (
                <div
                  key={`${candidate.bankTransactionId}:${candidate.documentId}`}
                  className="grid gap-3 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        candidate.strength === "STRONG"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {candidate.strength === "STRONG" ? labels.strong : labels.possible}
                      </span>
                      <span className="text-sm text-gray-500">{formatDate(candidate.bankDate)}</span>
                    </div>
                    <div className="mt-1 font-medium">{candidate.bankText}</div>
                    <div className="mt-1 font-semibold">{formatAmount(candidate.bankAmount)}</div>
                  </div>

                  <div className="rounded-lg bg-cyan-50/70 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-800">
                      {documentTypeLabel(candidate, labels)}
                    </div>
                    <div className="mt-1 font-medium">
                      {labels.receipt} #{candidate.receiptId}
                      {candidate.merchantName ? ` · ${candidate.merchantName}` : ""}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatDate(candidate.documentDate)} · {formatAmount(candidate.documentAmount)}
                    </div>
                    {candidate.evidenceKind === "PAYMENT_CONFIRMATION_EVIDENCE" ? (
                      <div className="mt-1 text-xs text-cyan-900">{labels.paymentConfirmationHelp}</div>
                    ) : null}
                  </div>

                  <div className="text-xs text-gray-600 md:text-right">
                    <div className="font-semibold text-gray-800">{evidenceLabel(candidate, labels)}</div>
                    <div className="mt-1">
                      {labels.dateDistance}: {candidate.dateDistanceDays} {labels.days}
                    </div>
                    {candidate.identityEvidence === "LEARNED_COMPANY_PATTERN" && candidate.learningConfirmationCount ? (
                      <div className="mt-1 text-cyan-800">
                        {labels.learnedPatternHelp.replace("{count}", String(candidate.learningConfirmationCount))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/fylgiskjol/${candidate.receiptId}?document=${candidate.documentId}`}
                        className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-50"
                      >
                        {labels.openDocument}
                      </Link>
                      {canReconcile ? (
                        <ConfirmReviewedDocumentMatchForm
                          companyId={companyId}
                          bankTransactionId={candidate.bankTransactionId}
                          documentId={candidate.documentId}
                          confirmLabel={labels.confirm}
                          pendingLabel={labels.confirming}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
