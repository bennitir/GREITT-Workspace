import type { InsightPeriod, InsightTruthState } from "./presentation-model";

export type BookedInsightAccount = {
  number: string;
  name: string;
  entryRole: string | null;
  type: string | null;
};

export type BookedInsightEntry = {
  account: string;
  debit: number;
  credit: number;
};

export type BookedInsightReceipt = {
  id: number;
  date: Date | null;
  merchantName: string | null;
  description: string | null;
  entries: BookedInsightEntry[];
};

export type BookedInsightMonth = {
  periodKey: string;
  revenue: number;
  expenses: number;
  result: number;
};

export type BookedInsightBreakdown = {
  id: string;
  label: string;
  value: number;
  count: number;
  truthState: InsightTruthState;
};

export type BookedInsightSummary = {
  truthState: "BOOKED";
  revenue: number;
  expenses: number;
  result: number;
  outputVat: number;
  inputVat: number;
  months: BookedInsightMonth[];
  expenseAccounts: BookedInsightBreakdown[];
  expenseMerchants: BookedInsightBreakdown[];
};

function inPeriod(date: Date | null, period: InsightPeriod) {
  if (!date) return false;
  const time = date.getTime();
  return time >= period.start.getTime() && time <= period.end.getTime();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonths(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor.getTime() <= last.getTime()) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function addBreakdown(
  map: Map<string, { label: string; value: number; receiptIds: Set<number> }>,
  id: string,
  label: string,
  value: number,
  receiptId: number,
) {
  if (Math.abs(value) < 0.005) return;
  const current = map.get(id);
  map.set(id, {
    label,
    value: (current?.value ?? 0) + value,
    receiptIds: new Set([...(current?.receiptIds ?? []), receiptId]),
  });
}

export function buildBookedInsightSummary(
  accounts: BookedInsightAccount[],
  receipts: BookedInsightReceipt[],
  period: InsightPeriod,
): BookedInsightSummary {
  const accountByNumber = new Map(accounts.map((account) => [account.number, account]));
  const revenueAccounts = new Set(
    accounts.filter((account) => account.entryRole === "REVENUE").map((account) => account.number),
  );
  const expenseAccounts = new Set(
    accounts.filter((account) => account.entryRole === "EXPENSE").map((account) => account.number),
  );
  const outputVatAccounts = new Set(
    accounts.filter((account) => account.type === "VAT_OUTPUT").map((account) => account.number),
  );
  const inputVatAccounts = new Set(
    accounts.filter((account) => account.type === "VAT_INPUT").map((account) => account.number),
  );

  const monthMap = new Map(
    enumerateMonths(period.start, period.end).map((key) => [
      key,
      { periodKey: key, revenue: 0, expenses: 0, result: 0 },
    ]),
  );

  const expenseAccountMap = new Map<
    string,
    { label: string; value: number; receiptIds: Set<number> }
  >();
  const expenseMerchantMap = new Map<
    string,
    { label: string; value: number; receiptIds: Set<number> }
  >();

  let revenue = 0;
  let expenses = 0;
  let outputVat = 0;
  let inputVat = 0;

  for (const receipt of receipts) {
    if (!inPeriod(receipt.date, period) || !receipt.date) continue;

    const month = monthMap.get(monthKey(receipt.date));
    let receiptExpense = 0;

    for (const entry of receipt.entries) {
      if (revenueAccounts.has(entry.account)) {
        const amount = entry.credit - entry.debit;
        revenue += amount;
        if (month) month.revenue += amount;
      }

      if (expenseAccounts.has(entry.account)) {
        const amount = entry.debit - entry.credit;
        expenses += amount;
        receiptExpense += amount;
        if (month) month.expenses += amount;

        const account = accountByNumber.get(entry.account);
        addBreakdown(
          expenseAccountMap,
          entry.account,
          account ? `${account.number} – ${account.name}` : entry.account,
          amount,
          receipt.id,
        );
      }

      if (outputVatAccounts.has(entry.account)) {
        outputVat += entry.credit - entry.debit;
      }

      if (inputVatAccounts.has(entry.account)) {
        inputVat += entry.debit - entry.credit;
      }
    }

    if (Math.abs(receiptExpense) >= 0.005) {
      const label = receipt.merchantName?.trim() || receipt.description?.trim() || "Óþekktur mótaðili";
      addBreakdown(
        expenseMerchantMap,
        label.toLocaleLowerCase("is-IS"),
        label,
        receiptExpense,
        receipt.id,
      );
    }
  }

  const months = Array.from(monthMap.values()).map((month) => ({
    ...month,
    result: month.revenue - month.expenses,
  }));

  const toRows = (
    map: Map<string, { label: string; value: number; receiptIds: Set<number> }>,
  ): BookedInsightBreakdown[] =>
    Array.from(map.entries())
      .map(([id, item]) => ({
        id,
        label: item.label,
        value: item.value,
        count: item.receiptIds.size,
        truthState: "BOOKED" as const,
      }))
      .filter((item) => Math.abs(item.value) >= 0.005)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return {
    truthState: "BOOKED",
    revenue,
    expenses,
    result: revenue - expenses,
    outputVat,
    inputVat,
    months,
    expenseAccounts: toRows(expenseAccountMap),
    expenseMerchants: toRows(expenseMerchantMap),
  };
}
