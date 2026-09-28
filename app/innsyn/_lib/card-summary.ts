import type { InsightCardReconciliationSummary, InsightPeriod } from "./presentation-model";

export type InsightPaymentCardTransaction = {
  id: number;
  date: Date;
  amount: number;
  status: string;
};

function isReconciled(status: string) {
  return status.trim().toUpperCase() === "RECONCILED";
}

export function buildCardReconciliationSummary(
  transactions: InsightPaymentCardTransaction[],
  period: InsightPeriod,
): InsightCardReconciliationSummary {
  const selected = transactions.filter((transaction) => {
    const time = transaction.date.getTime();
    return time >= period.start.getTime() && time <= period.end.getTime();
  });

  let reconciledTransactions = 0;
  let purchaseAmount = 0;
  let creditAmount = 0;
  let reconciledAbsoluteAmount = 0;
  let unreconciledAbsoluteAmount = 0;

  for (const transaction of selected) {
    const absoluteAmount = Math.abs(transaction.amount);

    // Kortainnflutningur varðveitir formerki yfirlitsins:
    // neikvætt = kaup/úttekt, jákvætt = endurgreiðsla/inneign.
    if (transaction.amount < 0) {
      purchaseAmount += absoluteAmount;
    } else {
      creditAmount += transaction.amount;
    }

    if (isReconciled(transaction.status)) {
      reconciledTransactions += 1;
      reconciledAbsoluteAmount += absoluteAmount;
    } else {
      unreconciledAbsoluteAmount += absoluteAmount;
    }
  }

  return {
    totalTransactions: selected.length,
    reconciledTransactions,
    unreconciledTransactions: selected.length - reconciledTransactions,
    purchaseAmount,
    creditAmount,
    totalAbsoluteAmount: reconciledAbsoluteAmount + unreconciledAbsoluteAmount,
    reconciledAbsoluteAmount,
    unreconciledAbsoluteAmount,
  };
}
