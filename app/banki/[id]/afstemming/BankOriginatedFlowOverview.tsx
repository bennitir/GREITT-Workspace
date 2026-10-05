import type { BankOriginatedFlowCandidate } from "@/lib/financial-reconciliation/bank-originated-provider";
import { formatNumber } from "@/lib/locale";

type Labels = {
  title: string;
  help: string;
  total: string;
  bankFee: string;
  interest: string;
  details: string;
  readOnlyBadge: string;
  proposedEvent: string;
  noPostingAccount: string;
  charge: string;
  credit: string;
};

type Props = {
  candidates: BankOriginatedFlowCandidate[];
  counts: {
    bankFee: number;
    interest: number;
  };
  labels: Labels;
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

export function BankOriginatedFlowOverview({ candidates, counts, labels }: Props) {
  if (candidates.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-emerald-950">{labels.title}</h3>
          <p className="mt-1 max-w-3xl text-sm text-emerald-900/80">{labels.help}</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
          {labels.readOnlyBadge}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.total}</div>
          <div className="mt-1 text-2xl font-semibold">{candidates.length}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.bankFee}</div>
          <div className="mt-1 text-2xl font-semibold">{counts.bankFee}</div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">{labels.interest}</div>
          <div className="mt-1 text-2xl font-semibold">{counts.interest}</div>
        </div>
      </div>

      <details className="mt-4 rounded-lg border border-emerald-100 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-emerald-950">
          {labels.details}
        </summary>
        <div className="border-t border-emerald-100 px-4 py-2">
          {candidates.map((candidate) => (
            <div
              key={`${candidate.flowKind}:${candidate.bankTransactionId}`}
              className="grid gap-2 border-b py-3 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    {candidate.flowKind === "BANK_FEE" ? labels.bankFee : labels.interest}
                  </span>
                  <span className="text-sm text-gray-500">{formatDate(candidate.bankDate)}</span>
                </div>
                <div className="mt-1 font-medium">{candidate.bankText}</div>
                <div className="mt-1 text-xs text-gray-500">{labels.noPostingAccount}</div>
              </div>

              <div className="text-left md:text-right">
                <div className="font-semibold">{formatAmount(candidate.bankAmount)}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {labels.proposedEvent}: {candidate.proposedEventType === "CHARGE" ? labels.charge : labels.credit}
                  {" · "}
                  {formatAmount(candidate.proposedEventAmount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
