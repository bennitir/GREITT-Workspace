import { normalizeIdentityText } from "@/lib/receipts/ingestion";

export type RecurringPurchaseLine = {
  description: string;
  lineTotal: number | null;
};

export type RecurringBookingEntry = {
  account: string;
  text: string;
  debit: number;
  credit: number;
};

export type RecurringPriorDocument = {
  receiptNumber: string | null;
  totalAmount: number | null;
  purchaseLines: RecurringPurchaseLine[];
  bookingEntries: RecurringBookingEntry[];
};

function money(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeLocalLine(value: string) {
  return normalizeIdentityText(value)
    .split(/\s+/)
    .filter(Boolean)
    // Fyrirtækjasértækt match má þekkja línuheiti eins og „Farsími“, en
    // auðkenni/símanúmer/upphæðir eiga ekki að verða hluti af lyklinum.
    .filter((token) => !/^\d+(?:[.,]\d+)?$/.test(token))
    .slice(0, 16)
    .join("_")
    .slice(0, 180);
}

export function buildRecurringPurchaseSignature(lines: RecurringPurchaseLine[]) {
  if (lines.length === 0) return null;

  const parts = lines.flatMap((line) => {
    const key = normalizeLocalLine(line.description);
    const lineTotal = Number(line.lineTotal);
    if (!key || !Number.isFinite(lineTotal) || lineTotal <= 0) return [];
    return [`${key}:${money(lineTotal).toFixed(2)}`];
  });

  if (parts.length !== lines.length) return null;
  return parts.sort().join("|");
}

function bookingSideShape(
  entries: RecurringBookingEntry[],
  side: "debit" | "credit",
) {
  const opposite = side === "debit" ? "credit" : "debit";
  const parts = entries.flatMap((entry) => {
    const amount = Number(entry[side]);
    const oppositeAmount = Number(entry[opposite]);
    const account = String(entry.account ?? "").trim();
    if (!account || !(amount > 0) || oppositeAmount !== 0) return [];
    return [`${account}:${money(amount).toFixed(2)}`];
  });
  return parts.sort().join("|");
}

function isBalanced(entries: RecurringBookingEntry[], totalAmount: number) {
  const debit = money(entries.reduce((sum, entry) => sum + Number(entry.debit || 0), 0));
  const credit = money(entries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0));
  const total = money(totalAmount);
  return Math.abs(debit - total) <= 0.01 && Math.abs(credit - total) <= 0.01;
}

/**
 * Endurtekið fylgiskjal má endurnýta bókun án AI aðeins þegar a.m.k. tvö
 * fyrri, yfirfarin skjöl hafa nákvæmlega sama línusnið + heild og sömu
 * bókunarupphæðir/reikninga. Debet- og kredithlið eru metnar sjálfstætt svo
 * breyttur greiðslumótreikningur geri ekki öruggan kostnaðar/VSK-grunn ónothæfan.
 */
export function findStableRecurringBookingTemplate(input: {
  totalAmount: number;
  purchaseLines: RecurringPurchaseLine[];
  priorDocuments: RecurringPriorDocument[];
  minimumEvidence?: number;
}) {
  const totalAmount = Number(input.totalAmount);
  const currentSignature = buildRecurringPurchaseSignature(input.purchaseLines);
  const minimumEvidence = Math.max(2, input.minimumEvidence ?? 2);

  if (!(totalAmount > 0) || !currentSignature) {
    return {
      evidenceCount: 0,
      debitEntries: [] as RecurringBookingEntry[],
      creditEntries: [] as RecurringBookingEntry[],
      sourceReceiptNumber: null as string | null,
    };
  }

  const matching = input.priorDocuments.filter((prior) => {
    if (Math.abs(Number(prior.totalAmount ?? 0) - totalAmount) > 0.01) return false;
    if (buildRecurringPurchaseSignature(prior.purchaseLines) !== currentSignature) return false;
    return isBalanced(prior.bookingEntries, totalAmount);
  });

  if (matching.length < minimumEvidence) {
    return {
      evidenceCount: matching.length,
      debitEntries: [] as RecurringBookingEntry[],
      creditEntries: [] as RecurringBookingEntry[],
      sourceReceiptNumber: matching[0]?.receiptNumber ?? null,
    };
  }

  const debitShapes = new Set(matching.map((prior) => bookingSideShape(prior.bookingEntries, "debit")));
  const creditShapes = new Set(matching.map((prior) => bookingSideShape(prior.bookingEntries, "credit")));
  const exemplar = matching[0];

  return {
    evidenceCount: matching.length,
    debitEntries:
      debitShapes.size === 1
        ? exemplar.bookingEntries.filter((entry) => Number(entry.debit) > 0 && Number(entry.credit) === 0)
        : [],
    creditEntries:
      creditShapes.size === 1
        ? exemplar.bookingEntries.filter((entry) => Number(entry.credit) > 0 && Number(entry.debit) === 0)
        : [],
    sourceReceiptNumber: exemplar.receiptNumber,
  };
}
