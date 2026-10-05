import type {
  ReviewedDocumentDiagnosticReason,
  ReviewedDocumentDiagnosticSummary,
} from "@/lib/financial-reconciliation/reviewed-document-match-diagnostics";
import { formatDate, formatNumber } from "@/lib/locale";
import Link from "next/link";

type Labels = {
  title: string;
  help: string;
  sourceCount: string;
  noAmountMatch: string;
  dateOutsideWindow: string;
  documentIneligible: string;
  identityNotResolved: string;
  details: string;
  sameAmount: string;
  nearDate: string;
  exactDate: string;
  candidateCount: string;
  primaryEvent: string;
  confirmedOwner: string;
  unsupportedType: string;
  missingDate: string;
  examples: string;
  reason: Record<ReviewedDocumentDiagnosticReason, string>;
};

type Props = {
  summary: ReviewedDocumentDiagnosticSummary;
  labels: Labels;
};

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-violet-100 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

export function CardReviewedDocumentDiagnosticOverview({ summary, labels }: Props) {
  const unresolved = summary.diagnostics.filter((item) =>
    item.reason !== "CANDIDATE_FOUND" && item.reason !== "AMBIGUOUS",
  );

  return (
    <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-5">
      <div>
        <h3 className="text-lg font-semibold text-violet-950">{labels.title}</h3>
        <p className="mt-1 max-w-5xl text-sm text-violet-900/80">{labels.help}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CountCard label={labels.sourceCount} value={summary.sourceCount} />
        <CountCard label={labels.noAmountMatch} value={summary.noAmountMatch} />
        <CountCard label={labels.dateOutsideWindow} value={summary.dateOutsideWindow} />
        <CountCard label={labels.documentIneligible} value={summary.documentIneligible} />
        <CountCard label={labels.identityNotResolved} value={summary.identityNotResolved} />
      </div>

      {unresolved.length > 0 ? (
        <details className="mt-4 rounded-lg border border-violet-100 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-violet-950">
            {labels.details} · {unresolved.length}
          </summary>
          <div className="max-h-[34rem] overflow-auto border-t border-violet-100 px-4">
            {unresolved.slice(0, 100).map((item) => (
              <div key={item.sourceId} className="border-b py-4 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{item.sourcePartyText}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatDate(item.sourceDate)} · {formatNumber(Number(item.sourceAmount))} kr. · #{item.sourceId}
                    </div>
                  </div>
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-900">
                    {labels.reason[item.reason]}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>{labels.sameAmount}: {item.amountMatchCount}</span>
                  <span>{labels.nearDate}: {item.nearDateCount}</span>
                  <span>{labels.exactDate}: {item.exactDateCount}</span>
                  <span>{labels.candidateCount}: {item.candidateCount}</span>
                  {item.primaryEventCount > 0 ? <span>{labels.primaryEvent}: {item.primaryEventCount}</span> : null}
                  {item.confirmedOwnershipCount > 0 ? <span>{labels.confirmedOwner}: {item.confirmedOwnershipCount}</span> : null}
                  {item.unsupportedDocumentTypeCount > 0 ? <span>{labels.unsupportedType}: {item.unsupportedDocumentTypeCount}</span> : null}
                  {item.missingCanonicalDateCount > 0 ? <span>{labels.missingDate}: {item.missingCanonicalDateCount}</span> : null}
                </div>

                {item.examples.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.examples}</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {item.examples.map((example) => (
                        <Link
                          key={example.documentId}
                          href={`/fylgiskjol/${example.receiptId}?document=${example.documentId}`}
                          className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5 text-xs hover:bg-violet-50"
                        >
                          <div className="font-semibold text-slate-900">
                            #{example.receiptId} · undirskjal {example.documentId}
                          </div>
                          <div className="mt-1 text-slate-700">
                            {example.merchantName ?? "—"}
                          </div>
                          <div className="mt-1 text-slate-500">
                            {example.effectiveDate ? formatDate(example.effectiveDate) : "—"}
                            {` · ${formatNumber(Number(example.totalAmount))} kr.`}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
