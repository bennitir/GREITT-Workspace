import type { InsightBankActivitySummary, InsightPeriod } from "./presentation-model";

export type InsightBankTransaction = {
  id: number;
  date: Date;
  amount: number;
  status: string;
};

function isReconciled(status: string) {
  return status.trim().toUpperCase() === "RECONCILED";
}

export function buildBankActivitySummary(
  transactions: InsightBankTransaction[],
  period: InsightPeriod,
): InsightBankActivitySummary {
  const selected = transactions.filter((transaction) => {
    const time = transaction.date.getTime();
    return time >= period.start.getTime() && time <= period.end.getTime();
  });

  let grossInflows = 0;
  let grossOutflows = 0;
  let unreconciledTransactions = 0;
  let unreconciledAbsoluteAmount = 0;

  for (const transaction of selected) {
    if (transaction.amount >= 0) {
      grossInflows += transaction.amount;
    } else {
      grossOutflows += Math.abs(transaction.amount);
    }

    if (!isReconciled(transaction.status)) {
      unreconciledTransactions += 1;
      unreconciledAbsoluteAmount += Math.abs(transaction.amount);
    }
  }

  return {
    totalTransactions: selected.length,
    grossInflows,
    grossOutflows,
    netCashFlow: grossInflows - grossOutflows,
    unreconciledTransactions,
    unreconciledAbsoluteAmount,
  };
}
