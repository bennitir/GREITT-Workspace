import type { LoadedInsightSummary } from "../_lib/load-summary";
import {
  buildInsightMixedManagementView,
  type InsightOperatingTrendPoint,
} from "../_lib/mixed-view";
import { insightMixedCopy, insightMixedLocale, insightUnitFlowCopy, insightUnitSemanticCopy } from "../_lib/mixed-copy";
import type { InsightPeriodPreset, InsightTruthState } from "../_lib/presentation-model";

function formatKr(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} kr.`;
}

function formatPercent(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(value))}%`;
}

function formatUnitPrice(value: number, unit: string, locale: string) {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} kr./${unit}`;
}

function formatDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatQuantity(value: number, unit: string, locale: string) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}

function formatSignedKr(value: number, locale: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatKr(Math.abs(value), locale)}`;
}

function formatSignedQuantity(value: number, unit: string, locale: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatQuantity(Math.abs(value), unit, locale)}`;
}

function formatSignedUnitPrice(value: number, unit: string, locale: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatUnitPrice(Math.abs(value), unit, locale)}`;
}

function effectTone(value: number) {
  if (value > 0.5) return "text-amber-700";
  if (value < -0.5) return "text-emerald-700";
  return "text-slate-700";
}

function formatMonthYear(periodKey: string, locale: string) {
  const [year, month] = periodKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

function formatMonth(periodKey: string, locale: string) {
  const [year, month] = periodKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(
    new Date(year, month - 1, 1),
  );
}

function unitPriceSparkline(
  points: LoadedInsightSummary["unitPrices"]["series"][number]["points"],
  locale: string,
  unit: string,
) {
  const visible = points.slice(-12);
  if (visible.length < 2) return null;

  const width = 260;
  const height = 72;
  const pad = 6;
  const prices = visible.map((point) => point.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(0.0001, max - min);
  const x = (index: number) =>
    visible.length === 1
      ? width / 2
      : pad + (index / (visible.length - 1)) * (width - pad * 2);
  const y = (value: number) =>
    pad + ((max - value) / range) * (height - pad * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img">
      <polyline
        points={visible.map((point, index) => `${x(index)},${y(point.unitPrice)}`).join(" ")}
        fill="none"
        className="stroke-sky-700"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {visible.map((point, index) => (
        <circle key={point.id} cx={x(index)} cy={y(point.unitPrice)} r="2.7" className="fill-sky-700">
          <title>{`${formatDate(point.date, locale)} · ${point.merchantName} · ${formatUnitPrice(point.unitPrice, unit, locale)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function truthDot(state: InsightTruthState) {
  if (state === "BOOKED") return "bg-emerald-500";
  if (state === "KNOWN") return "bg-sky-500";
  return "bg-amber-500";
}

function changeText(
  currentChange: number | null,
  changePercent: number | null,
  locale: string,
) {
  if (currentChange === null || changePercent === null) return null;
  const sign = currentChange >= 0 ? "+" : "−";
  return `${sign}${formatKr(Math.abs(currentChange), locale)} · ${sign}${formatPercent(changePercent, locale)}`;
}

function insightHref(
  period: InsightPeriodPreset,
  focus?: "account" | "merchant",
  id?: string,
  unitPriceId?: string | null,
) {
  const params = new URLSearchParams({ period });
  if (focus && id) {
    params.set("focus", focus);
    params.set("id", id);
  }
  if (unitPriceId) {
    params.set("unit", unitPriceId);
  }
  return `/innsyn/ny?${params.toString()}`;
}

function trendChart(
  months: LoadedInsightSummary["booked"]["months"],
  operatingTrend: InsightOperatingTrendPoint[],
  locale: string,
  labels: { revenue: string; expenses: string; result: string; operatingTrend: string },
) {
  const firstDataIndex = months.findIndex((month) => month.hasBookedEntries);
  if (firstDataIndex < 0) return null;

  let lastDataIndex = months.length - 1;
  while (lastDataIndex >= firstDataIndex && !months[lastDataIndex]?.hasBookedEntries) {
    lastDataIndex -= 1;
  }

  const visibleMonths = months.slice(firstDataIndex, lastDataIndex + 1);
  const dataMonths = visibleMonths.filter((month) => month.hasBookedEntries);
  if (dataMonths.length === 0) return null;

  const operatingTrendByPeriod = new Map(
    operatingTrend.map((point) => [point.periodKey, point.value] as const),
  );

  const width = 960;
  const height = 310;
  const left = 58;
  const right = 20;
  const top = 24;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = dataMonths.flatMap((month) => [month.revenue, month.expenses, month.result]);
  const trendValues = visibleMonths
    .map((month) => operatingTrendByPeriod.get(month.periodKey))
    .filter((value): value is number => value !== null && value !== undefined);
  const minValue = Math.min(0, ...values, ...trendValues);
  const maxValue = Math.max(1, ...values);
  const range = Math.max(1, maxValue - minValue);

  const x = (index: number) =>
    visibleMonths.length === 1
      ? left + plotWidth / 2
      : left + (index / (visibleMonths.length - 1)) * plotWidth;
  const y = (value: number) => top + ((maxValue - value) / range) * plotHeight;
  const zeroY = y(0);

  const lineSegments = (key: "revenue" | "expenses" | "result") => {
    const segments: string[][] = [];
    let current: string[] = [];

    visibleMonths.forEach((month, index) => {
      if (!month.hasBookedEntries) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push(`${x(index)},${y(month[key])}`);
    });

    if (current.length) segments.push(current);
    return segments;
  };

  const renderSegments = (
    key: "revenue" | "expenses" | "result",
    className: string,
  ) =>
    lineSegments(key).map((segment, index) =>
      segment.length > 1 ? (
        <polyline
          key={`${key}-${index}`}
          points={segment.join(" ")}
          fill="none"
          className={className}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null,
    );

  const operatingTrendSegments = () => {
    const segments: string[][] = [];
    let current: string[] = [];

    visibleMonths.forEach((month, index) => {
      const value = operatingTrendByPeriod.get(month.periodKey);
      if (!month.hasBookedEntries || value === null || value === undefined) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push(`${x(index)},${y(value)}`);
    });

    if (current.length) segments.push(current);
    return segments;
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[720px] w-full"
        role="img"
        aria-label={`${labels.revenue}, ${labels.expenses}, ${labels.result}`}
      >
        <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="stroke-slate-300" strokeWidth="1" />
        <text x={8} y={top + 5} className="fill-slate-400 text-[11px]">
          {formatKr(maxValue, locale)}
        </text>
        {minValue < 0 && (
          <text x={8} y={height - bottom} className="fill-slate-400 text-[11px]">
            {formatKr(minValue, locale)}
          </text>
        )}

        {renderSegments("revenue", "stroke-emerald-600")}
        {renderSegments("expenses", "stroke-amber-600")}
        {renderSegments("result", "stroke-sky-700")}
        {operatingTrendSegments().map((segment, index) =>
          segment.length > 1 ? (
            <polyline
              key={`operating-trend-${index}`}
              points={segment.join(" ")}
              fill="none"
              className="stroke-violet-600"
              strokeWidth="3"
              strokeDasharray="8 6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}

        {visibleMonths.map((month, index) => (
          <g key={month.periodKey}>
            {month.hasBookedEntries && (
              <>
                <circle cx={x(index)} cy={y(month.revenue)} r="3.5" className="fill-emerald-600">
                  <title>{`${formatMonth(month.periodKey, locale)} · ${labels.revenue}: ${formatKr(month.revenue, locale)}`}</title>
                </circle>
                <circle cx={x(index)} cy={y(month.expenses)} r="3.5" className="fill-amber-600">
                  <title>{`${formatMonth(month.periodKey, locale)} · ${labels.expenses}: ${formatKr(month.expenses, locale)}`}</title>
                </circle>
                <circle cx={x(index)} cy={y(month.result)} r="3.5" className="fill-sky-700">
                  <title>{`${formatMonth(month.periodKey, locale)} · ${labels.result}: ${formatKr(month.result, locale)}`}</title>
                </circle>
                {operatingTrendByPeriod.get(month.periodKey) !== null &&
                  operatingTrendByPeriod.get(month.periodKey) !== undefined && (
                    <circle
                      cx={x(index)}
                      cy={y(operatingTrendByPeriod.get(month.periodKey) as number)}
                      r="3"
                      className="fill-violet-600"
                    >
                      <title>{`${formatMonth(month.periodKey, locale)} · ${labels.operatingTrend}: ${formatKr(operatingTrendByPeriod.get(month.periodKey) as number, locale)}`}</title>
                    </circle>
                  )}
              </>
            )}
            <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {formatMonth(month.periodKey, locale)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
export function InsightMixedOverview({
  summary,
  language,
  selectedUnitPriceId,
}: {
  summary: LoadedInsightSummary;
  language: string;
  selectedUnitPriceId?: string | null;
}) {
  const t = insightMixedCopy(language);
  const locale = insightMixedLocale(language);
  const view = buildInsightMixedManagementView(summary);
  const periodOptions: Array<{ preset: InsightPeriodPreset; label: string }> = [
    { preset: "LAST_12_MONTHS", label: t.last12 },
    { preset: "THIS_YEAR", label: t.thisYear },
    { preset: "THIS_QUARTER", label: t.thisQuarter },
    { preset: "THIS_MONTH", label: t.thisMonth },
  ];

  const narrative: Array<{ text: string; state: InsightTruthState }> = [];
  narrative.push({
    text:
      view.result.current >= 0
        ? t.bookedResultPositive(formatKr(view.result.current, locale))
        : t.bookedResultNegative(formatKr(Math.abs(view.result.current), locale)),
    state: "BOOKED",
  });

  if (view.comparisonHasBookedData) {
    if (view.revenue.changePercent !== null && Math.abs(view.revenue.changePercent) >= 0.5) {
      narrative.push({
        text: t.revenueChanged(
          (view.revenue.change ?? 0) >= 0 ? t.rose : t.fell,
          formatPercent(view.revenue.changePercent, locale),
        ),
        state: "BOOKED",
      });
    }
    if (view.expenses.changePercent !== null && Math.abs(view.expenses.changePercent) >= 0.5) {
      narrative.push({
        text: t.expensesChanged(
          (view.expenses.change ?? 0) >= 0 ? t.rose : t.fell,
          formatPercent(view.expenses.changePercent, locale),
        ),
        state: "BOOKED",
      });
    }
  } else {
    narrative.push({ text: t.noComparison, state: "KNOWN" });
  }

  if (summary.cardReconciliation?.unreconciledTransactions) {
    narrative.push({
      text: t.cardPending(
        summary.cardReconciliation.unreconciledTransactions,
        formatKr(summary.cardReconciliation.unreconciledAbsoluteAmount, locale),
      ),
      state: "PENDING_CONFIRMATION",
    });
  } else if (summary.bankActivity?.unreconciledTransactions) {
    narrative.push({
      text: t.bankPending(
        summary.bankActivity.unreconciledTransactions,
        formatKr(summary.bankActivity.unreconciledAbsoluteAmount, locale),
      ),
      state: "PENDING_CONFIRMATION",
    });
  }

  const maxAccount = Math.max(1, ...view.topExpenseAccounts.map((row) => Math.abs(row.value)));
  const maxMerchant = Math.max(1, ...view.topExpenseMerchants.map((row) => Math.abs(row.value)));
  const bookedDocumentCount =
    summary.coverage.bookedDetectedDocuments + summary.coverage.bookedManualReceipts;
  const displayUnitPriceSeries = summary.unitPrices.series.slice(0, 6);
  const selectedUnitPriceSeries = selectedUnitPriceId
    ? summary.unitPrices.series.find((row) => row.id === selectedUnitPriceId) ?? null
    : null;
  const latestUnitCostChange = selectedUnitPriceSeries?.monthChanges.length
    ? selectedUnitPriceSeries.monthChanges[selectedUnitPriceSeries.monthChanges.length - 1]!
    : null;
  const selectedUnitSemantic = selectedUnitPriceSeries
    ? insightUnitSemanticCopy(language, selectedUnitPriceSeries.unit)
    : null;
  const selectedUnitFlow = selectedUnitPriceSeries
    ? insightUnitFlowCopy(language, selectedUnitPriceSeries.flow)
    : null;

  return (
    <main className="p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">GLÖGGT · {t.title}</p>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{t.testing}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{summary.company.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t.subtitle}</p>
          </div>
          <a href="/innsyn" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">← {t.back}</a>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">{t.mixed}</span>
            {[t.visual, t.numbers, t.explanation].map((label) => (
              <span key={label} className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-400">{label} · {t.next}</span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.period}</span>
            {periodOptions.map((option) => (
              <a
                key={option.preset}
                href={insightHref(
                  option.preset,
                  summary.drilldown?.selection.type,
                  summary.drilldown?.selection.id,
                  selectedUnitPriceId,
                )}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  summary.period.preset === option.preset
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>{formatDate(summary.period.start, locale)} – {formatDate(summary.period.end, locale)} · {t.comparison}</span>
          <span className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{t.booked}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />{t.known}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />{t.pending}</span>
          </span>
        </div>

        <section className="mt-7 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.standing}</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {narrative.slice(0, 4).map((item, index) => (
              <div key={`${item.state}-${index}`} className="flex gap-3 rounded-xl border bg-slate-50/60 p-4">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${truthDot(item.state)}`} />
                <p className="text-sm leading-6 text-slate-700">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="grid md:grid-cols-3">
            {[
              { label: t.revenue, metric: view.revenue },
              { label: t.expenses, metric: view.expenses },
              { label: t.result, metric: view.result },
            ].map(({ label, metric }, index) => (
              <div key={label} className={`p-5 md:p-6 ${index > 0 ? "border-t md:border-l md:border-t-0" : ""}`}>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{formatKr(metric.current, locale)}</p>
                {changeText(metric.change, metric.changePercent, locale) && (
                  <p className={`mt-2 text-xs font-semibold ${(metric.change ?? 0) > 0 ? (label === t.expenses ? "text-amber-700" : "text-emerald-700") : "text-slate-600"}`}>
                    {changeText(metric.change, metric.changePercent, locale)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{t.development}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.developmentHelp}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-emerald-600" />{t.revenue}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-amber-600" />{t.expenses}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-sky-700" />{t.result}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 border-t-2 border-dashed border-violet-600" />
                {t.operatingTrend}
              </span>
            </div>
          </div>
          <div className="mt-5">
            {trendChart(summary.booked.months, view.operatingTrend, locale, {
              revenue: t.revenue,
              expenses: t.expenses,
              result: t.result,
              operatingTrend: t.operatingTrend,
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t.operatingTrendHelp}</p>
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{t.unitPrices}</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">{t.unitPricesHelp}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              {t.unitPriceKnown}
            </span>
          </div>

          {displayUnitPriceSeries.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {displayUnitPriceSeries.map((row) => {
                const change = row.changeFromPreviousPercent;
                const changeSign = change === null || Math.abs(change) < 0.05 ? "" : change > 0 ? "+" : "−";
                return (
                  <a
                    key={row.id}
                    href={`${insightHref(summary.period.preset, undefined, undefined, row.id)}#unit-price-detail`}
                    className={`block rounded-xl border bg-slate-50/50 p-4 transition hover:border-sky-300 hover:bg-sky-50/40 ${
                      selectedUnitPriceSeries?.id === row.id ? "border-sky-300 ring-1 ring-sky-200" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800" title={row.label}>{row.label}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(row.latestObservedAt, locale)} · {t.unitPriceDateCount}: {row.distinctDateCount} · {t.unitPriceLineCount}: {row.observationCount}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-500">
                        {row.distinctDateCount >= 2 ? t.latestUnitPrice : t.lastKnownUnitPrice}
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{formatUnitPrice(row.latestPrice, row.unit, locale)}</p>
                      {change !== null && (
                        <p className={`mt-1 text-xs font-semibold ${change > 0.05 ? "text-amber-700" : change < -0.05 ? "text-emerald-700" : "text-slate-500"}`}>
                          {changeSign}{formatPercent(change, locale)}
                        </p>
                      )}
                    </div>
                    {row.distinctDateCount >= 2 ? (
                      <>
                        <div className="mt-2">{unitPriceSparkline(row.points, locale, row.unit)}</div>
                        <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3 text-xs text-slate-500">
                          <span>{t.averageUnitPrice}</span>
                          <span className="font-semibold tabular-nums text-slate-700">{formatUnitPrice(row.averagePrice, row.unit, locale)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="mt-4 border-t pt-3 text-xs leading-5 text-slate-500">{t.unitPriceSingleDate}</p>
                    )}
                    <p className="mt-3 text-right text-xs font-semibold text-sky-700">{t.openUnitPriceAnalysis} →</p>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
              {summary.unitPrices.observationCount > 0 ? t.unitPriceNoHistory : t.unitPriceNoData}
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">{t.unitPriceSourceNote}</p>

          {selectedUnitPriceSeries && (
            <div id="unit-price-detail" className="mt-6 rounded-xl border border-sky-200 bg-sky-50/30 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{t.unitPriceDrilldown}</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{selectedUnitPriceSeries.label}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedUnitPriceSeries.observationCount} {t.unitPriceLineCount.toLocaleLowerCase()} · {selectedUnitPriceSeries.distinctDateCount} {t.unitPriceDateCount.toLocaleLowerCase()}
                    {selectedUnitSemantic ? ` · ${selectedUnitSemantic.kindLabel}` : ""}
                  </p>
                </div>
                <a
                  href={insightHref(summary.period.preset)}
                  className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t.closeAnalysis}
                </a>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: selectedUnitSemantic?.totalQuantity ?? t.totalQuantity, value: formatQuantity(selectedUnitPriceSeries.totalQuantity, selectedUnitPriceSeries.unit, locale) },
                  { label: selectedUnitFlow?.totalValue ?? t.totalUnitCost, value: formatKr(selectedUnitPriceSeries.totalCost, locale) },
                  { label: selectedUnitSemantic?.averagePrice ?? t.averageUnitPrice, value: formatUnitPrice(selectedUnitPriceSeries.averagePrice, selectedUnitPriceSeries.unit, locale) },
                  { label: t.latestUnitPrice, value: formatUnitPrice(selectedUnitPriceSeries.latestPrice, selectedUnitPriceSeries.unit, locale) },
                  { label: t.minimumUnitPrice, value: formatUnitPrice(selectedUnitPriceSeries.minPrice, selectedUnitPriceSeries.unit, locale) },
                  { label: t.maximumUnitPrice, value: formatUnitPrice(selectedUnitPriceSeries.maxPrice, selectedUnitPriceSeries.unit, locale) },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border bg-white p-3">
                    <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                    <p className="mt-1 font-bold tabular-nums text-slate-950">{metric.value}</p>
                  </div>
                ))}
              </div>

              {selectedUnitPriceSeries.months.length > 0 && (() => {
                const maxQuantity = Math.max(1, ...selectedUnitPriceSeries.months.map((month) => month.quantity));
                return (
                  <div className="mt-5 rounded-xl border bg-white p-4">
                    <div>
                      <h4 className="font-semibold text-slate-900">{selectedUnitFlow?.monthlyTitle(selectedUnitSemantic?.kindLabel ?? t.quantity) ?? selectedUnitSemantic?.monthlyTitle ?? t.monthlyUnitUsage}</h4>
                      <p className="mt-1 text-sm text-slate-500">{selectedUnitFlow?.monthlyHelp ?? selectedUnitSemantic?.monthlyHelp ?? t.monthlyUnitUsageHelp}</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedUnitPriceSeries.months.map((month) => (
                        <div key={month.periodKey} className="grid gap-2 sm:grid-cols-[110px_1fr_110px_130px] sm:items-center">
                          <span className="text-sm font-medium text-slate-600">{formatMonthYear(month.periodKey, locale)}</span>
                          <div>
                            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                              <span>{formatQuantity(month.quantity, selectedUnitPriceSeries.unit, locale)}</span>
                              <span>{month.distinctDateCount} {t.unitPriceDateCount.toLocaleLowerCase()}</span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-sky-700"
                                style={{ width: `${Math.max(1, (month.quantity / maxQuantity) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-right text-sm font-semibold tabular-nums text-slate-800">{formatKr(month.totalCost, locale)}</span>
                          <span className="text-right text-sm tabular-nums text-slate-600">{formatUnitPrice(month.averagePrice, selectedUnitPriceSeries.unit, locale)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-5 rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-900">{t.costDrivers}</h4>
                    <p className="mt-1 text-sm text-slate-500">{selectedUnitFlow?.driverHelp ?? t.costDriversHelp}</p>
                  </div>
                  {latestUnitCostChange && (
                    <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {t.costDriversPeriod(
                        formatMonthYear(latestUnitCostChange.fromPeriodKey, locale),
                        formatMonthYear(latestUnitCostChange.toPeriodKey, locale),
                      )}
                    </span>
                  )}
                </div>

                {latestUnitCostChange ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        {
                          label: selectedUnitFlow?.valueChange ?? t.costChange,
                          value: formatSignedKr(latestUnitCostChange.costChange, locale),
                          tone: effectTone(latestUnitCostChange.costChange),
                        },
                        {
                          label: selectedUnitSemantic?.quantityEffect ?? t.quantityEffect,
                          value: formatSignedKr(latestUnitCostChange.quantityEffect, locale),
                          tone: effectTone(latestUnitCostChange.quantityEffect),
                        },
                        {
                          label: t.priceEffect,
                          value: formatSignedKr(latestUnitCostChange.priceEffect, locale),
                          tone: effectTone(latestUnitCostChange.priceEffect),
                        },
                      ].map((metric) => (
                        <div key={metric.label} className="rounded-lg border bg-slate-50/70 p-3">
                          <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                          <p className={`mt-1 text-lg font-bold tabular-nums ${metric.tone}`}>{metric.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-slate-500">{selectedUnitSemantic?.quantityChange ?? t.quantityChange}</span>
                        <span className="font-semibold tabular-nums text-slate-800">
                          {formatSignedQuantity(latestUnitCostChange.quantityChange, selectedUnitPriceSeries.unit, locale)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-slate-500">{t.unitPriceChange}</span>
                        <span className="font-semibold tabular-nums text-slate-800">
                          {formatSignedUnitPrice(latestUnitCostChange.averagePriceChange, selectedUnitPriceSeries.unit, locale)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">{selectedUnitFlow?.exactNote ?? t.costDriversExactNote}</p>
                  </>
                ) : (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{t.noCostDriverComparison}</p>
                )}
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border bg-white">
                <div className="grid grid-cols-[90px_1fr_90px_110px_100px] gap-3 border-b bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 max-md:hidden">
                  <span>{t.date}</span>
                  <span>{t.merchant}</span>
                  <span className="text-right">{t.quantity}</span>
                  <span className="text-right">{t.unitPrice}</span>
                  <span className="text-right">{selectedUnitFlow?.lineValue ?? t.lineTotal}</span>
                </div>
                <div className="divide-y">
                  {[...selectedUnitPriceSeries.observations].reverse().map((observation) => {
                    const href = observation.voucherNumber
                      ? `/fylgiskjol/bokud/${observation.voucherNumber}`
                      : observation.receiptId
                        ? `/fylgiskjol/${observation.receiptId}?document=${observation.documentId}`
                        : null;
                    return (
                      <div key={observation.id} className="grid gap-2 px-4 py-3 md:grid-cols-[90px_1fr_90px_110px_100px] md:gap-3 md:items-center">
                        <span className="text-xs text-slate-500">{formatDate(observation.date, locale)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{observation.merchantName}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {observation.source === "EXPLICIT_UNIT_PRICE" ? t.printedUnitPrice : t.derivedUnitPrice}
                            {observation.voucherNumber ? ` · ${t.voucher} ${observation.voucherNumber}` : ""}
                          </p>
                        </div>
                        <span className="text-right text-sm tabular-nums text-slate-700">
                          {formatQuantity(observation.quantity, observation.unit, locale)}
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatUnitPrice(observation.unitPrice, observation.unit, locale)}
                        </span>
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm tabular-nums text-slate-700">
                            {observation.lineTotal === null ? "—" : formatKr(observation.lineTotal, locale)}
                          </span>
                          {href && (
                            <a href={href} className="rounded-md border bg-white px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                              {t.openDocument}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-xl font-bold text-slate-950">{t.whereMoney}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.accountsHelp}</p>
            {view.topExpenseAccounts.length ? (
              <div className="mt-5 space-y-4">
                {view.topExpenseAccounts.map((row) => {
                  const selected =
                    summary.drilldown?.selection.type === "account" &&
                    summary.drilldown.selection.id === row.id;
                  return (
                    <a
                      key={row.id}
                      href={`${insightHref(summary.period.preset, "account", row.id)}#drilldown`}
                      className={`block rounded-xl p-2 -m-2 transition hover:bg-slate-50 ${selected ? "bg-slate-50 ring-1 ring-slate-200" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-4 text-sm">
                        <span className="font-medium text-slate-700">{row.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-950">{formatKr(row.value, locale)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(1, (Math.abs(row.value) / maxAccount) * 100)}%` }} />
                      </div>
                      <p className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>{row.count} {t.documents}</span>
                        <span className="font-medium text-slate-500">{t.openAnalysis} →</span>
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : <p className="mt-5 text-sm text-slate-500">{t.noExpenses}</p>}
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-xl font-bold text-slate-950">{t.vendors}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.vendorsHelp}</p>
            {view.topExpenseMerchants.length ? (
              <div className="mt-5 space-y-4">
                {view.topExpenseMerchants.map((row) => {
                  const selected =
                    summary.drilldown?.selection.type === "merchant" &&
                    summary.drilldown.selection.id === row.id;
                  return (
                    <a
                      key={row.id}
                      href={`${insightHref(summary.period.preset, "merchant", row.id)}#drilldown`}
                      className={`block rounded-xl p-2 -m-2 transition hover:bg-slate-50 ${selected ? "bg-sky-50/50 ring-1 ring-sky-200" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-4 text-sm">
                        <span className="font-medium text-slate-700">{row.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-950">{formatKr(row.value, locale)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-700" style={{ width: `${Math.max(1, (Math.abs(row.value) / maxMerchant) * 100)}%` }} />
                      </div>
                      <p className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>{row.count} {t.documents}</span>
                        <span className="font-medium text-sky-700">{t.openAnalysis} →</span>
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : <p className="mt-5 text-sm text-slate-500">{t.noExpenses}</p>}
          </section>
        </div>

        {summary.drilldown && (() => {
          const drilldown = summary.drilldown;
          const maxMonth = Math.max(1, ...drilldown.months.map((row) => Math.abs(row.value)));
          const maxSecondary = Math.max(1, ...drilldown.secondary.map((row) => Math.abs(row.value)));
          return (
            <section id="drilldown" className="mt-6 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t.drilldown}</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{drilldown.label}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {t.netBooked}: <span className="font-semibold text-slate-800">{formatKr(drilldown.total, locale)}</span> · {drilldown.count} {t.documents}
                  </p>
                </div>
                <a href={insightHref(summary.period.preset)} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  {t.closeAnalysis}
                </a>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{t.monthlyBreakdown}</h3>
                  <div className="mt-4 space-y-3">
                    {drilldown.months.map((row) => (
                      <div key={row.periodKey}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-600">{formatMonth(row.periodKey, locale)}</span>
                          <span className="font-semibold tabular-nums text-slate-900">{formatKr(row.value, locale)}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(1, (Math.abs(row.value) / maxMonth) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{row.count} {t.documents}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900">
                    {drilldown.secondaryTitle === "merchants" ? t.breakdownMerchants : t.breakdownAccounts}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {drilldown.secondary.slice(0, 10).map((row) => (
                      <div key={row.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-slate-600">{row.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatKr(row.value, locale)}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-sky-700" style={{ width: `${Math.max(1, (Math.abs(row.value) / maxSecondary) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{row.count} {t.documents}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-7">
                <h3 className="font-semibold text-slate-900">{t.sourceDocuments}</h3>
                <p className="mt-1 text-sm text-slate-500">{t.sourceDocumentsHelp}</p>
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <div className="divide-y">
                    {drilldown.documents.map((document) => (
                      <div key={document.id} className="grid gap-2 bg-white p-4 sm:grid-cols-[110px_1fr_auto] sm:items-center">
                        <div className="text-sm text-slate-500">{formatDate(document.date, locale)}</div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{document.merchantName}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {document.voucherNumber ? `${t.voucher} ${document.voucherNumber}` : t.noVoucher}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <span className="font-semibold tabular-nums text-slate-950">{formatKr(document.value, locale)}</span>
                          {document.href && (
                            <a href={document.href} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              {t.openDocument}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <h2 className="text-xl font-bold text-slate-950">{t.dataAndReconciliation}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-slate-50/60 p-4">
              <p className="text-sm font-medium text-slate-500">{t.bookedDocuments}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{bookedDocumentCount}</p>
            </div>
            <div className="rounded-xl border bg-slate-50/60 p-4">
              <p className="text-sm font-medium text-slate-500">{t.bankTransactions}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{summary.coverage.bankTransactions}</p>
              {summary.bankActivity ? (
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>{t.bankFlow}: <span className="font-semibold text-slate-700">{formatKr(summary.bankActivity.netCashFlow, locale)}</span></p>
                  <p>{t.bankUnreconciled}: <span className="font-semibold text-slate-700">{summary.bankActivity.unreconciledTransactions} · {formatKr(summary.bankActivity.unreconciledAbsoluteAmount, locale)}</span></p>
                </div>
              ) : <p className="mt-3 text-xs text-slate-400">{t.noBank}</p>}
            </div>
            <div className="rounded-xl border bg-slate-50/60 p-4">
              <p className="text-sm font-medium text-slate-500">{t.cardTransactions}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{summary.coverage.paymentCardTransactions}</p>
              {summary.cardReconciliation ? (
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>{t.cardPurchases}: <span className="font-semibold text-slate-700">{formatKr(summary.cardReconciliation.purchaseAmount, locale)}</span></p>
                  <p>{t.cardCredits}: <span className="font-semibold text-slate-700">{formatKr(summary.cardReconciliation.creditAmount, locale)}</span></p>
                  {view.cardCoveragePercent !== null && <p>{t.cardCoverage}: <span className="font-semibold text-slate-700">{formatPercent(view.cardCoveragePercent, locale)}</span></p>}
                </div>
              ) : <p className="mt-3 text-xs text-slate-400">{t.noCards}</p>}
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-xs leading-5 text-sky-900">{t.evidenceNote}</p>
        </section>

        <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 md:p-6">
          <p className="font-semibold text-violet-950">{t.testing}</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-violet-900/80">{t.testingHelp}</p>
          <a href="/innsyn" className="mt-4 inline-flex rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50">{t.openCurrent}</a>
        </section>
      </div>
    </main>
  );
}
