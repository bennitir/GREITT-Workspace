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
  let reconciledAmount = 0;
  let unreconciledAmount = 0;

  for (const transaction of selected) {
    if (isReconciled(transaction.status)) {
      reconciledTransactions += 1;
      reconciledAmount += transaction.amount;
    } else {
      unreconciledAmount += transaction.amount;
    }
  }

  return {
    totalTransactions: selected.length,
    reconciledTransactions,
    unreconciledTransactions: selected.length - reconciledTransactions,
    totalAmount: reconciledAmount + unreconciledAmount,
    reconciledAmount,
    unreconciledAmount,
  };
}
