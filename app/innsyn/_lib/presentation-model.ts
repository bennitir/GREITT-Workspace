/**
 * Presentation contracts for the next Innsýn layer.
 *
 * Important: this file does not decide accounting truth. It only gives the
 * presentation layer explicit contracts for facts that have already been
 * calculated/verified by deterministic data layers.
 */

export type InsightTruthState =
  | "BOOKED"
  | "KNOWN"
  | "PENDING_CONFIRMATION";

export type InsightViewMode =
  | "MIXED"
  | "VISUAL"
  | "NUMBERS"
  | "EXPLANATION";

export type InsightPeriodPreset =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "LAST_12_MONTHS"
  | "CUSTOM";

export type InsightEvidenceKind =
  | "RECEIPT"
  | "BOOKING_ENTRY"
  | "BANK_TRANSACTION"
  | "PAYMENT_CARD_TRANSACTION"
  | "FINANCIAL_EVENT"
  | "INSIGHT_FACT"
  | "ENTITY"
  | "CONTRACT"
  | "OTHER";

export type InsightEvidenceLink = {
  kind: InsightEvidenceKind;
  id: number | string;
  label: string;
  href?: string;
  truthState: InsightTruthState;
};

export type InsightPeriod = {
  preset: InsightPeriodPreset;
  start: Date;
  end: Date;
  comparisonStart?: Date;
  comparisonEnd?: Date;
};

export type InsightNarrativeItem = {
  id: string;
  title: string;
  explanation: string;
  truthState: InsightTruthState;
  importance: "INFO" | "ATTENTION" | "HIGH";
  evidence: InsightEvidenceLink[];
};

export type InsightSeriesPoint = {
  periodKey: string;
  label: string;
  value: number;
};

export type InsightSeries = {
  id: string;
  label: string;
  unit: "ISK" | "COUNT" | "PERCENT" | string;
  truthState: InsightTruthState;
  points: InsightSeriesPoint[];
};

export type InsightBreakdownRow = {
  id: string;
  label: string;
  value: number;
  count?: number;
  sharePercent?: number;
  truthState: InsightTruthState;
  href?: string;
  evidence?: InsightEvidenceLink[];
};

export type InsightAttentionItem = {
  id: string;
  title: string;
  explanation: string;
  dueDate?: Date;
  amount?: number;
  truthState: InsightTruthState;
  evidence: InsightEvidenceLink[];
};

export type InsightBankActivitySummary = {
  totalTransactions: number;
  grossInflows: number;
  grossOutflows: number;
  netCashFlow: number;
  unreconciledTransactions: number;
  unreconciledAbsoluteAmount: number;
};

export type InsightCardReconciliationSummary = {
  totalTransactions: number;
  reconciledTransactions: number;
  unreconciledTransactions: number;
  /** Purchases/charges represented as a positive magnitude. */
  purchaseAmount: number;
  /** Refunds/credits represented as a positive magnitude. */
  creditAmount: number;
  /** Sum of absolute transaction values; useful for reconciliation coverage. */
  totalAbsoluteAmount: number;
  reconciledAbsoluteAmount: number;
  unreconciledAbsoluteAmount: number;
};

export type InsightPresentationModel = {
  companyId: number;
  companyName: string;
  generatedAt: Date;
  period: InsightPeriod;
  viewMode: InsightViewMode;

  /** Short management-level explanation: what happened and what matters. */
  narrative: InsightNarrativeItem[];

  /** Deterministic time series used by the visual/numeric views. */
  trends: InsightSeries[];

  /** Drill-down entry points such as expenses, vendors and vehicles. */
  breakdowns: {
    expenses: InsightBreakdownRow[];
    vendors: InsightBreakdownRow[];
    categories: InsightBreakdownRow[];
  };

  /** Upcoming obligations, anomalies and other items worth attention. */
  attention: InsightAttentionItem[];

  /** Included when bank data exists for the selected period. */
  bankActivity?: InsightBankActivitySummary;

  /** Included when payment-card data exists for the selected period. */
  cardReconciliation?: InsightCardReconciliationSummary;
};
