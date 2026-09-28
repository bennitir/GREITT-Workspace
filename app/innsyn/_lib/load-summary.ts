import { prisma } from "@/lib/prisma";
import { buildBankActivitySummary } from "./bank-summary";
import { buildBookedInsightSummary, type BookedInsightReceipt } from "./booked-summary";
import { buildCardReconciliationSummary } from "./card-summary";
import { buildUnitPriceSummary, type InsightUnitPriceFlow } from "./unit-price";
import { buildInsightDrilldown, type InsightDrilldown, type InsightDrilldownSelection } from "./drilldown";
import type {
  InsightBankActivitySummary,
  InsightCardReconciliationSummary,
  InsightPeriod,
} from "./presentation-model";

export type InsightSummaryCoverage = {
  bookedDetectedDocuments: number;
  bookedManualReceipts: number;
  bankTransactions: number;
  paymentCardTransactions: number;
};

export type LoadedInsightSummary = {
  company: {
    id: number;
    name: string;
  };
  period: InsightPeriod;
  comparisonPeriod: InsightPeriod | null;
  booked: ReturnType<typeof buildBookedInsightSummary>;
  comparisonBooked: ReturnType<typeof buildBookedInsightSummary> | null;
  bankActivity: InsightBankActivitySummary | null;
  comparisonBankActivity: InsightBankActivitySummary | null;
  cardReconciliation: InsightCardReconciliationSummary | null;
  unitPrices: ReturnType<typeof buildUnitPriceSummary>;
  comparisonCardReconciliation: InsightCardReconciliationSummary | null;
  coverage: InsightSummaryCoverage;
  drilldown: InsightDrilldown | null;
};


function unitPriceFlowForDocument(
  entries: Array<{ account: string; debit: number; credit: number }>,
  accountRoleByNumber: Map<string, string | null>,
): InsightUnitPriceFlow {
  let hasRevenue = false;
  let hasExpense = false;

  for (const entry of entries) {
    const role = accountRoleByNumber.get(entry.account) ?? null;
    if (role === "REVENUE" && (entry.credit > 0 || entry.debit > 0)) hasRevenue = true;
    if (role === "EXPENSE" && (entry.debit > 0 || entry.credit > 0)) hasExpense = true;
  }

  if (hasRevenue && !hasExpense) return "SALE";
  if (hasExpense && !hasRevenue) return "PURCHASE";
  return "UNKNOWN";
}

function comparisonPeriodFor(period: InsightPeriod): InsightPeriod | null {
  if (!period.comparisonStart || !period.comparisonEnd) return null;

  return {
    preset: period.preset,
    start: period.comparisonStart,
    end: period.comparisonEnd,
  };
}

function queryRange(period: InsightPeriod) {
  const starts = [period.start, period.comparisonStart].filter(
    (value): value is Date => value instanceof Date,
  );
  const ends = [period.end, period.comparisonEnd].filter(
    (value): value is Date => value instanceof Date,
  );

  return {
    start: new Date(Math.min(...starts.map((value) => value.getTime()))),
    end: new Date(Math.max(...ends.map((value) => value.getTime()))),
  };
}

/**
 * Loads only the bounded data required by the first Innsýn management summary.
 *
 * Important accounting rule:
 * - AI-reviewed/booked documents are read from AiDetectedDocument.bookingEntries,
 *   because one uploaded Receipt can contain multiple booked documents/vouchers.
 * - Manual receipts are read from Receipt.entries only when Receipt.voucherNumber
 *   is set. This avoids counting AI document postings twice at Receipt level.
 */
export async function loadInsightSummary(
  companyId: number,
  period: InsightPeriod,
  drilldownSelection?: InsightDrilldownSelection | null,
): Promise<LoadedInsightSummary> {
  const range = queryRange(period);
  const comparisonPeriod = comparisonPeriodFor(period);

  const [company, accounts, bookedDocuments, manualReceipts, bankTransactions, cardTransactions] =
    await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      }),
      prisma.account.findMany({
        where: { companyId },
        select: {
          number: true,
          name: true,
          entryRole: true,
          type: true,
        },
      }),
      prisma.aiDetectedDocument.findMany({
        where: {
          receipt: { companyId },
          approvedAt: { not: null },
          voucherNumber: { not: null },
          date: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          receiptId: true,
          voucherNumber: true,
          date: true,
          merchantName: true,
          summary: true,
          extractionMetadata: true,
          bookingEntries: {
            select: {
              account: true,
              debit: true,
              credit: true,
            },
          },
        },
      }),
      prisma.receipt.findMany({
        where: {
          companyId,
          voucherNumber: { not: null },
          aiDetectedDocuments: { none: {} },
          date: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          voucherNumber: true,
          date: true,
          merchantName: true,
          description: true,
          entries: {
            select: {
              account: true,
              debit: true,
              credit: true,
            },
          },
        },
      }),
      prisma.bankTransaction.findMany({
        where: {
          bankAccount: { companyId },
          date: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          status: true,
        },
      }),
      prisma.paymentCardTransaction.findMany({
        where: {
          paymentCard: { companyId },
          date: { gte: range.start, lte: range.end },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          status: true,
        },
      }),
    ]);

  if (!company) {
    throw new Error(`Fyrirtæki ${companyId} fannst ekki.`);
  }

  const bookedItems: BookedInsightReceipt[] = [
    ...bookedDocuments.map((document) => ({
      id: `document:${document.id}`,
      receiptId: document.receiptId,
      documentId: document.id,
      voucherNumber: document.voucherNumber,
      date: document.date,
      merchantName: document.merchantName,
      description: document.summary,
      entries: document.bookingEntries,
    })),
    ...manualReceipts.map((receipt) => ({
      id: `receipt:${receipt.id}`,
      receiptId: receipt.id,
      documentId: null,
      voucherNumber: receipt.voucherNumber,
      date: receipt.date,
      merchantName: receipt.merchantName,
      description: receipt.description,
      entries: receipt.entries,
    })),
  ];

  const accountRoleByNumber = new Map(accounts.map((account) => [account.number, account.entryRole]));

  const bankRows = bankTransactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    amount: Number(transaction.amount),
    status: transaction.status,
  }));

  const cardRows = cardTransactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    amount: Number(transaction.amount),
    status: transaction.status,
  }));

  return {
    company,
    period,
    comparisonPeriod,
    booked: buildBookedInsightSummary(accounts, bookedItems, period),
    comparisonBooked: comparisonPeriod
      ? buildBookedInsightSummary(accounts, bookedItems, comparisonPeriod)
      : null,
    bankActivity: bankRows.length ? buildBankActivitySummary(bankRows, period) : null,
    comparisonBankActivity:
      bankRows.length && comparisonPeriod
        ? buildBankActivitySummary(bankRows, comparisonPeriod)
        : null,
    cardReconciliation: cardRows.length
      ? buildCardReconciliationSummary(cardRows, period)
      : null,
    unitPrices: buildUnitPriceSummary(
      bookedDocuments.map((document) => ({
        id: document.id,
        receiptId: document.receiptId,
        voucherNumber: document.voucherNumber,
        date: document.date,
        merchantName: document.merchantName,
        flow: unitPriceFlowForDocument(document.bookingEntries, accountRoleByNumber),
        extractionMetadata: document.extractionMetadata,
      })),
      period,
    ),
    comparisonCardReconciliation:
      cardRows.length && comparisonPeriod
        ? buildCardReconciliationSummary(cardRows, comparisonPeriod)
        : null,
    drilldown: drilldownSelection
      ? buildInsightDrilldown(accounts, bookedItems, period, drilldownSelection)
      : null,
    coverage: {
      bookedDetectedDocuments: bookedDocuments.filter((document) =>
        document.date
          ? document.date.getTime() >= period.start.getTime() &&
            document.date.getTime() <= period.end.getTime()
          : false,
      ).length,
      bookedManualReceipts: manualReceipts.filter((receipt) =>
        receipt.date
          ? receipt.date.getTime() >= period.start.getTime() &&
            receipt.date.getTime() <= period.end.getTime()
          : false,
      ).length,
      bankTransactions: bankTransactions.filter((transaction) =>
        transaction.date.getTime() >= period.start.getTime() &&
        transaction.date.getTime() <= period.end.getTime(),
      ).length,
      paymentCardTransactions: cardTransactions.filter((transaction) =>
        transaction.date.getTime() >= period.start.getTime() &&
        transaction.date.getTime() <= period.end.getTime(),
      ).length,
    },
  };
}
