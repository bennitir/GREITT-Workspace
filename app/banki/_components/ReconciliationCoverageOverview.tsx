import type { ReconciliationCoverageSnapshot } from "@/lib/financial-reconciliation/coverage";

type Labels = {
  title: string;
  help: string;
  modeRequired: string;
  modeInformational: string;
  modeExcluded: string;
  assessmentComplete: string;
  assessmentOpen: string;
  assessmentInformational: string;
  assessmentNotEvaluated: string;
  assessmentExcluded: string;
  source: string;
  target: string;
  total: string;
  inScope: string;
  confirmed: string;
  strong: string;
  ambiguous: string;
  unresolved: string;
  unknown: string;
  excluded: string;
  countRatio: string;
  amountRatio: string;
  amountPartial: string;
  notComparable: string;
  informationalHelp: string;
  excludedHelp: string;
};

type Props = {
  snapshot: ReconciliationCoverageSnapshot;
  labels: Labels;
  targetBasisHelp?: string | null;
};

function percent(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function assessmentLabel(snapshot: ReconciliationCoverageSnapshot, labels: Labels) {
  switch (snapshot.assessment) {
    case "COMPLETE": return labels.assessmentComplete;
    case "OPEN": return labels.assessmentOpen;
    case "INFORMATIONAL": return labels.assessmentInformational;
    case "NOT_EVALUATED": return labels.assessmentNotEvaluated;
    case "EXCLUDED": return labels.assessmentExcluded;
  }
}

function modeLabel(snapshot: ReconciliationCoverageSnapshot, labels: Labels) {
  switch (snapshot.mode) {
    case "REQUIRED": return labels.modeRequired;
    case "INFORMATIONAL": return labels.modeInformational;
    case "EXCLUDED": return labels.modeExcluded;
  }
}

function StatusRows({
  side,
  labels,
}: {
  side: ReconciliationCoverageSnapshot["source"];
  labels: Labels;
}) {
  const rows = [
    [labels.confirmed, side.confirmed.count],
    [labels.strong, side.strongUnconfirmed.count],
    [labels.ambiguous, side.ambiguous.count],
    [labels.unresolved, side.unresolved.count],
    [labels.unknown, side.unknown.count],
    [labels.excluded, side.excluded.count],
  ] as const;

  return (
    <div className="mt-3 grid gap-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <span className="text-slate-600">{label}</span>
          <span className="font-medium tabular-nums text-slate-900">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function ReconciliationCoverageOverview({ snapshot, labels, targetBasisHelp }: Props) {
  const countComparison = snapshot.comparison.count;
  const amountEntries = Object.entries(snapshot.comparison.amountByCurrency);

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{labels.title}</h3>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">{labels.help}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
            {modeLabel(snapshot, labels)}
          </span>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">
            {assessmentLabel(snapshot, labels)}
          </span>
        </div>
      </div>

      {snapshot.mode === "INFORMATIONAL" ? (
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          {labels.informationalHelp}
        </p>
      ) : snapshot.mode === "EXCLUDED" ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          {labels.excludedHelp}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {([
          [labels.source, snapshot.source],
          [labels.target, snapshot.target],
        ] as const).map(([title, side]) => (
          <div key={title} className="rounded-lg border bg-white p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{side.total.count}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>{labels.inScope}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800">{side.inScope.count}</div>
              </div>
            </div>
            <StatusRows side={side} labels={labels} />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4 text-sm">
        {countComparison.comparability === "NOT_APPLICABLE" ? (
          <p className="text-slate-600">{labels.notComparable}</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium text-slate-700">{labels.countRatio}</span>
            <span className="text-lg font-semibold tabular-nums text-slate-950">
              {percent(countComparison.targetPerSourcePercent)}
            </span>
          </div>
        )}

        {amountEntries.map(([currency, item]) => (
          <div key={currency} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <span className="font-medium text-slate-700">
              {labels.amountRatio} · {currency}
              {item.completeness === "PARTIAL" ? ` · ${labels.amountPartial}` : ""}
            </span>
            <span className="font-semibold tabular-nums text-slate-950">
              {item.completeness === "PARTIAL" ? "—" : percent(item.targetPerSourcePercent)}
            </span>
          </div>
        ))}

        {targetBasisHelp ? (
          <p className="mt-3 border-t pt-3 text-xs text-slate-500">{targetBasisHelp}</p>
        ) : null}
      </div>
    </section>
  );
}
