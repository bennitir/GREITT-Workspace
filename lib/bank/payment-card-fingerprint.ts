import { createHash } from "crypto";

/**
 * Card statement spreadsheets can represent the same whole-second timestamp
 * a millisecond on either side of the boundary (for example .999 vs .000).
 * The source file remains preserved in ImportRow.rawData; this value is the
 * canonical timestamp used for identity/deduplication and stored transactions.
 */
export function normalizePaymentCardFingerprintDate(date: Date) {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new Error("Ógild dagsetning í kortafærslu.");
  return new Date(Math.round(time / 1000) * 1000);
}

export function cardRowFingerprint(
  paymentCardId: number,
  date: Date,
  raw: Record<string, unknown>,
  amount: number,
) {
  const canonicalDate = normalizePaymentCardFingerprintDate(date);
  const source = [
    paymentCardId,
    canonicalDate.toISOString(),
    raw.merchantText ?? "",
    raw.merchantCategory ?? "",
    raw.foreignAmount ?? "",
    raw.currency ?? "",
    raw.exchangeRate ?? "",
    amount,
    raw.explanation ?? "",
    raw.cardPeriod ?? "",
  ].join("|");

  return createHash("sha256").update(source).digest("hex");
}


export function storedPaymentCardTransactionFingerprint(
  paymentCardId: number,
  transaction: {
    date: Date;
    merchantText: string;
    merchantCategory: string | null;
    foreignAmount: unknown;
    currency: string | null;
    exchangeRate: unknown;
    amount: unknown;
    explanation: string | null;
    cardPeriod: string | null;
    sourceRawData: string | null;
  },
) {
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount)) return null;

  let sourceRaw: Record<string, unknown> = {};
  if (transaction.sourceRawData) {
    try {
      sourceRaw = JSON.parse(transaction.sourceRawData) as Record<string, unknown>;
    } catch {
      // Legacy/manual rows may not have valid source JSON. Fall back to stored columns.
    }
  }

  const raw: Record<string, unknown> = {
    merchantText: sourceRaw.merchantText ?? transaction.merchantText,
    merchantCategory: sourceRaw.merchantCategory ?? transaction.merchantCategory ?? "",
    foreignAmount:
      sourceRaw.foreignAmount ??
      (transaction.foreignAmount === null ? null : Number(transaction.foreignAmount)),
    currency: sourceRaw.currency ?? transaction.currency ?? "",
    exchangeRate:
      sourceRaw.exchangeRate ??
      (transaction.exchangeRate === null ? null : Number(transaction.exchangeRate)),
    explanation: sourceRaw.explanation ?? transaction.explanation ?? "",
    cardPeriod: sourceRaw.cardPeriod ?? transaction.cardPeriod ?? "",
  };

  return cardRowFingerprint(paymentCardId, transaction.date, raw, amount);
}
