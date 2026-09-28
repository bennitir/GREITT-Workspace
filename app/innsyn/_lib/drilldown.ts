import type { InsightPeriod, InsightTruthState } from "./presentation-model";
import type {
  BookedInsightAccount,
  BookedInsightReceipt,
} from "./booked-summary";

export type InsightDrilldownSelection =
  | { type: "account"; id: string }
  | { type: "merchant"; id: string };

export type InsightDrilldownBreakdown = {
  id: string;
  label: string;
  value: number;
  count: number;
  truthState: InsightTruthState;
};

export type InsightDrilldownMonth = {
  periodKey: string;
  value: number;
  count: number;
};

export type InsightDrilldownDocument = {
  id: string;
  date: Date;
  merchantName: string;
  description: string | null;
  voucherNumber: number | null;
  receiptId: number | null;
  documentId: number | null;
  value: number;
  href: string | null;
};

export type InsightDrilldown = {
  selection: InsightDrilldownSelection;
  label: string;
  total: number;
  count: number;
  truthState: "BOOKED";
  months: InsightDrilldownMonth[];
  secondaryTitle: "merchants" | "accounts";
  secondary: InsightDrilldownBreakdown[];
  documents: InsightDrilldownDocument[];
};

function inPeriod(date: Date | null, period: InsightPeriod) {
  if (!date) return false;
  const time = date.getTime();
  return time >= period.start.getTime() && time <= period.end.getTime();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMerchant(value: string) {
  return value.trim().toLocaleLowerCase("is-IS");
}

function merchantLabel(receipt: BookedInsightReceipt) {
  return receipt.merchantName?.trim() || receipt.description?.trim() || "Óþekktur mótaðili";
}

function addBreakdown(
  map: Map<string, { label: string; value: number; ids: Set<string> }>,
  id: string,
  label: string,
  value: number,
  receiptId: string,
) {
  if (Math.abs(value) < 0.005) return;
  const current = map.get(id);
  map.set(id, {
    label,
    value: (current?.value ?? 0) + value,
    ids: new Set([...(current?.ids ?? []), receiptId]),
  });
}

export function buildInsightDrilldown(
  accounts: BookedInsightAccount[],
  receipts: BookedInsightReceipt[],
  period: InsightPeriod,
  selection: InsightDrilldownSelection,
): InsightDrilldown | null {
  const accountByNumber = new Map(accounts.map((account) => [account.number, account]));
  const expenseAccounts = new Set(
    accounts.filter((account) => account.entryRole === "EXPENSE").map((account) => account.number),
  );

  const monthMap = new Map<string, { value: number; ids: Set<string> }>();
  const secondaryMap = new Map<string, { label: string; value: number; ids: Set<string> }>();
  const documents: InsightDrilldownDocument[] = [];
  let total = 0;
  let label = selection.id;

  for (const receipt of receipts) {
    if (!receipt.date || !inPeriod(receipt.date, period)) continue;

    const expenseByAccount = new Map<string, number>();
    let receiptExpense = 0;
    for (const entry of receipt.entries) {
      if (!expenseAccounts.has(entry.account)) continue;
      const amount = entry.debit - entry.credit;
      if (Math.abs(amount) < 0.005) continue;
      expenseByAccount.set(entry.account, (expenseByAccount.get(entry.account) ?? 0) + amount);
      receiptExpense += amount;
    }

    const currentMerchant = merchantLabel(receipt);
    const currentMerchantId = normalizeMerchant(currentMerchant);
    let selectedValue = 0;

    if (selection.type === "account") {
      selectedValue = expenseByAccount.get(selection.id) ?? 0;
      const account = accountByNumber.get(selection.id);
      label = account ? `${account.number} – ${account.name}` : selection.id;
      if (Math.abs(selectedValue) >= 0.005) {
        addBreakdown(
          secondaryMap,
          currentMerchantId,
          currentMerchant,
          selectedValue,
          receipt.id,
        );
      }
    } else {
      if (currentMerchantId !== selection.id) continue;
      selectedValue = receiptExpense;
      label = currentMerchant;
      for (const [accountNumber, amount] of expenseByAccount.entries()) {
        const account = accountByNumber.get(accountNumber);
        addBreakdown(
          secondaryMap,
          accountNumber,
          account ? `${account.number} – ${account.name}` : accountNumber,
          amount,
          receipt.id,
        );
      }
    }

    if (Math.abs(selectedValue) < 0.005) continue;

    total += selectedValue;
    const key = monthKey(receipt.date);
    const month = monthMap.get(key);
    monthMap.set(key, {
      value: (month?.value ?? 0) + selectedValue,
      ids: new Set([...(month?.ids ?? []), receipt.id]),
    });

    documents.push({
      id: receipt.id,
      date: receipt.date,
      merchantName: currentMerchant,
      description: receipt.description,
      voucherNumber: receipt.voucherNumber,
      receiptId: receipt.receiptId,
      documentId: receipt.documentId,
      value: selectedValue,
      href: receipt.voucherNumber
        ? `/fylgiskjol/bokud/${receipt.voucherNumber}`
        : receipt.receiptId
          ? `/fylgiskjol/${receipt.receiptId}${receipt.documentId ? `?document=${receipt.documentId}` : ""}`
          : null,
    });
  }

  if (!documents.length) return null;

  documents.sort((a, b) => b.date.getTime() - a.date.getTime());

  const months = Array.from(monthMap.entries())
    .map(([periodKey, item]) => ({ periodKey, value: item.value, count: item.ids.size }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  const secondary = Array.from(secondaryMap.entries())
    .map(([id, item]) => ({
      id,
      label: item.label,
      value: item.value,
      count: item.ids.size,
      truthState: "BOOKED" as const,
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return {
    selection,
    label,
    total,
    count: documents.length,
    truthState: "BOOKED",
    months,
    secondaryTitle: selection.type === "account" ? "merchants" : "accounts",
    secondary,
    documents,
  };
}
