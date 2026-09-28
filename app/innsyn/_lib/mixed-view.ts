import type { LoadedInsightSummary } from "./load-summary";

export type InsightMetricComparison = {
  current: number;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
};

export type InsightOperatingTrendPoint = {
  periodKey: string;
  value: number | null;
};

export type InsightMixedManagementView = {
  revenue: InsightMetricComparison;
  expenses: InsightMetricComparison;
  result: InsightMetricComparison;
  comparisonHasBookedData: boolean;
  topExpenseAccounts: LoadedInsightSummary["booked"]["expenseAccounts"];
  topExpenseMerchants: LoadedInsightSummary["booked"]["expenseMerchants"];
  cardCoveragePercent: number | null;
  operatingTrend: InsightOperatingTrendPoint[];
};


function buildOperatingTrend(
  months: LoadedInsightSummary["booked"]["months"],
  windowSize = 3,
): InsightOperatingTrendPoint[] {
  return months.map((month, index) => {
    if (index < windowSize - 1) {
      return { periodKey: month.periodKey, value: null };
    }

    const window = months.slice(index - windowSize + 1, index + 1);
    if (window.some((item) => !item.hasBookedEntries)) {
      return { periodKey: month.periodKey, value: null };
    }

    const average =
      window.reduce((sum, item) => sum + item.result, 0) / windowSize;

    return { periodKey: month.periodKey, value: average };
  });
}

function compare(current: number, previous: number | null): InsightMetricComparison {
  if (previous === null) {
    return { current, previous: null, change: null, changePercent: null };
  }

  const change = current - previous;
  const changePercent =
    Math.abs(previous) >= 0.005 ? (change / Math.abs(previous)) * 100 : null;

  return { current, previous, change, changePercent };
}

export function buildInsightMixedManagementView(
  summary: LoadedInsightSummary,
): InsightMixedManagementView {
  const comparison = summary.comparisonBooked;
  const comparisonHasBookedData = Boolean(
    comparison &&
      (Math.abs(comparison.revenue) >= 0.005 ||
        Math.abs(comparison.expenses) >= 0.005),
  );

  const previousRevenue = comparisonHasBookedData ? comparison!.revenue : null;
  const previousExpenses = comparisonHasBookedData ? comparison!.expenses : null;
  const previousResult = comparisonHasBookedData ? comparison!.result : null;

  const card = summary.cardReconciliation;
  const cardCoveragePercent =
    card && card.totalAbsoluteAmount > 0
      ? (card.reconciledAbsoluteAmount / card.totalAbsoluteAmount) * 100
      : null;

  return {
    revenue: compare(summary.booked.revenue, previousRevenue),
    expenses: compare(summary.booked.expenses, previousExpenses),
    result: compare(summary.booked.result, previousResult),
    comparisonHasBookedData,
    topExpenseAccounts: summary.booked.expenseAccounts.slice(0, 6),
    topExpenseMerchants: summary.booked.expenseMerchants.slice(0, 6),
    cardCoveragePercent,
    operatingTrend: buildOperatingTrend(summary.booked.months),
  };
}
