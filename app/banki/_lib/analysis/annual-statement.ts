import { buildAnnualBankAnalysis } from "./annual";

export type AnnualBankAnalysis = ReturnType<typeof buildAnnualBankAnalysis>;

export type StatementRowKey =
  | "operatingRevenue"
  | "paymentSettlement"
  | "grantContribution"
  | "wages"
  | "payrollRelated"
  | "premises"
  | "utilities"
  | "telecom"
  | "software"
  | "insurance"
  | "vehicle"
  | "travel"
  | "advertising"
  | "transport"
  | "goodsServices"
  | "dining"
  | "groceryPurchase"
  | "officeSupplies"
  | "resaleGoods"
  | "eventHospitality"
  | "sportsEvent"
  | "sportsEquipment"
  | "telecomEquipment"
  | "posPaymentService"
  | "adminRegistrationFee"
  | "grantsPaid"
  | "contributionsPaid"
  | "costAllowances"
  | "interestIncome"
  | "bankFees"
  | "taxFinancial";

export type StatementRow = {
  key: StatementRowKey;
  amount: number;
};

export type ExcludedFlowKey =
  | "internalTransfers"
  | "grantRelatedInflows"
  | "unknownInflows"
  | "loanInflows"
  | "refundInflows"
  | "otherInflows"
  | "unknownOutflows"
  | "personPayments"
  | "relatedEntityFlows"
  | "assetInvestments"
  | "loanOutflows"
  | "refundOutflows"
  | "cashWithdrawals"
  | "otherOutflows";

export type ExcludedFlow = {
  key: ExcludedFlowKey;
  amount: number;
};

const OPERATING_EXPENSE_KEYS: Array<[StatementRowKey, keyof AnnualBankAnalysis["expenseClassificationTotals"]]> = [
  ["wages", "WAGES"],
  ["payrollRelated", "PAYROLL_RELATED"],
  ["premises", "PREMISES"],
  ["utilities", "UTILITIES"],
  ["telecom", "TELECOM"],
  ["software", "SOFTWARE"],
  ["insurance", "INSURANCE"],
  ["vehicle", "VEHICLE"],
  ["travel", "TRAVEL"],
  ["advertising", "ADVERTISING"],
  ["transport", "TRANSPORT"],
  ["goodsServices", "GOODS_SERVICES"],
  ["dining", "DINING"],
  ["groceryPurchase", "GROCERY_PURCHASE"],
  ["officeSupplies", "OFFICE_SUPPLIES"],
  ["resaleGoods", "RESALE_GOODS"],
  ["eventHospitality", "EVENT_HOSPITALITY"],
  ["sportsEvent", "SPORTS_EVENT"],
  ["sportsEquipment", "SPORTS_EQUIPMENT"],
  ["telecomEquipment", "TELECOM_EQUIPMENT"],
  ["posPaymentService", "POS_PAYMENT_SERVICE"],
  ["adminRegistrationFee", "ADMIN_REGISTRATION_FEE"],
  ["grantsPaid", "GRANT"],
  ["contributionsPaid", "CONTRIBUTION"],
  ["costAllowances", "COST_ALLOWANCE"],
];

export function buildAnnualStatement(analysis: AnnualBankAnalysis) {
  const revenueRows: StatementRow[] = [
    { key: "operatingRevenue", amount: analysis.classificationTotals.OPERATING_REVENUE },
    { key: "paymentSettlement", amount: analysis.classificationTotals.PAYMENT_SETTLEMENT },
  ].filter((row) => row.amount !== 0) as StatementRow[];

  const operatingExpenseRows: StatementRow[] = OPERATING_EXPENSE_KEYS
    .map(([key, source]) => ({ key, amount: analysis.expenseClassificationTotals[source] }))
    .filter((row) => row.amount !== 0);

  const financeRows: StatementRow[] = [
    { key: "interestIncome", amount: analysis.interestIncome },
    { key: "bankFees", amount: -analysis.expenseClassificationTotals.BANK_FEE },
    { key: "taxFinancial", amount: -analysis.expenseClassificationTotals.TAX_FINANCIAL },
  ].filter((row) => row.amount !== 0) as StatementRow[];

  const operatingRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
  const operatingExpenses = operatingExpenseRows.reduce((sum, row) => sum + row.amount, 0);
  const operatingResult = operatingRevenue - operatingExpenses;
  const financeResult = financeRows.reduce((sum, row) => sum + row.amount, 0);
  const resultFromClassifiedData = operatingResult + financeResult;

  const excludedFlows: ExcludedFlow[] = [
    { key: "internalTransfers", amount: analysis.likelyInternalInflows },
    // Grant-related inflows are deterministic research evidence, not yet
    // accounting confirmation. Keep them outside the formal result until a
    // bookkeeper/user confirms the accounting treatment.
    { key: "grantRelatedInflows", amount: analysis.classificationTotals.GRANT_CONTRIBUTION },
    { key: "unknownInflows", amount: analysis.classificationTotals.UNKNOWN },
    { key: "loanInflows", amount: analysis.classificationTotals.LOAN_CAPITAL },
    { key: "refundInflows", amount: analysis.classificationTotals.REFUND },
    { key: "otherInflows", amount: analysis.classificationTotals.OTHER },
    { key: "unknownOutflows", amount: analysis.expenseClassificationTotals.UNKNOWN },
    { key: "personPayments", amount: analysis.expenseClassificationTotals.PERSON_PAYMENT },
    { key: "relatedEntityFlows", amount: analysis.expenseClassificationTotals.RELATED_ENTITY_FLOW },
    { key: "assetInvestments", amount: analysis.expenseClassificationTotals.ASSET_INVESTMENT },
    { key: "loanOutflows", amount: analysis.expenseClassificationTotals.LOAN_CAPITAL },
    { key: "refundOutflows", amount: analysis.expenseClassificationTotals.REFUND },
    { key: "cashWithdrawals", amount: analysis.expenseClassificationTotals.CASH_WITHDRAWAL },
    { key: "otherOutflows", amount: analysis.expenseClassificationTotals.OTHER + analysis.expenseClassificationTotals.MIXED },
  ].filter((row) => row.amount !== 0) as ExcludedFlow[];

  return {
    revenueRows,
    operatingExpenseRows,
    financeRows,
    operatingRevenue,
    operatingExpenses,
    operatingResult,
    financeResult,
    resultFromClassifiedData,
    excludedFlows,
    grossInflows: analysis.grossInflows,
    grossOutflows: analysis.grossOutflows,
    netCashFlow: analysis.netCashFlow,
    transactionCount: analysis.transactionCount,
  };
}
