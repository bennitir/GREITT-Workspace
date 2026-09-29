export type EventBankCandidateInput = {
  id: number;
  bankAccountId: number;
  amount: string | number;
  date: Date;
  reference: string | null;
};

export type FinancialEventCandidateInput = {
  id: number;
  companyId: number;
  eventType: string;
  amount: string | number | null;
  eventDate: Date | null;
  externalReference: string | null;
  currency: string;
};

export type FinancialEventCandidateReason =
  | "EXACT_EVENT_AMOUNT_NEAR_DATE"
  | "EXACT_EVENT_AMOUNT_EXTENDED_DATE"
  | "EXACT_EVENT_REFERENCE";

export type BankFinancialEventCandidate = {
  bankTransactionId: number;
  eventId: number;
  eventType: "CHARGE" | "CREDIT";
  // Decimal strings preserve the exact source amounts, including large values.
  eventAmount: string;
  bankAmount: string;
  eventDate: Date;
  bankDate: Date;
  dateDistanceDays: number;
  externalReference: string | null;
  bankReference: string | null;
  reason: Exclude<FinancialEventCandidateReason, "EXACT_EVENT_REFERENCE">;
  evidence: Array<"EXACT_EVENT_REFERENCE">;
  strength: "POSSIBLE";
};

// Parse decimal text directly; never round amounts or use float tolerances.
function minorUnits(value: string | number | null): bigint | null {
  if (value === null) return null;
  if (typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) return null;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;
  const units = BigInt(match[2]) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return match[1] === "-" ? -units : units;
}

function dayOrdinal(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000);
}

// Only trim surrounding whitespace and fold case. Preserve punctuation,
// internal whitespace and leading zeros; never search bank description text.
function normalizeReference(value: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

/** Pure BANK_TO_FINANCIAL_EVENT evidence, never payment or unpaid-balance inference. */
export function buildBankFinancialEventCandidates(
  bankAccount: { id: number; companyId: number },
  transactions: EventBankCandidateInput[],
  events: FinancialEventCandidateInput[],
): BankFinancialEventCandidate[] {
  const candidates: BankFinancialEventCandidate[] = [];
  for (const bank of transactions) {
    if (bank.bankAccountId !== bankAccount.id || !Number.isFinite(bank.date.getTime())) continue;
    const bankMinor = minorUnits(bank.amount);
    if (bankMinor === null || bankMinor === BigInt(0)) continue;

    for (const event of events) {
      if (event.companyId !== bankAccount.companyId || event.currency !== "ISK" ||
        !event.eventDate || !Number.isFinite(event.eventDate.getTime()) ||
        (event.eventType !== "CHARGE" && event.eventType !== "CREDIT")) continue;
      const eventMinor = minorUnits(event.amount);
      if (eventMinor === null || eventMinor !== -bankMinor ||
        (event.eventType === "CHARGE" && eventMinor <= BigInt(0)) ||
        (event.eventType === "CREDIT" && eventMinor >= BigInt(0))) continue;

      const dateDistanceDays = Math.abs(dayOrdinal(bank.date) - dayOrdinal(event.eventDate));
      if (dateDistanceDays > 30) continue;
      const reference = normalizeReference(event.externalReference);
      candidates.push({
        bankTransactionId: bank.id,
        eventId: event.id,
        eventType: event.eventType,
        eventAmount: String(event.amount),
        bankAmount: String(bank.amount),
        eventDate: event.eventDate,
        bankDate: bank.date,
        dateDistanceDays,
        externalReference: event.externalReference,
        bankReference: bank.reference,
        reason: dateDistanceDays <= 3
          ? "EXACT_EVENT_AMOUNT_NEAR_DATE"
          : "EXACT_EVENT_AMOUNT_EXTENDED_DATE",
        evidence: reference && reference === normalizeReference(bank.reference)
          ? ["EXACT_EVENT_REFERENCE"] : [],
        strength: "POSSIBLE",
      });
    }
  }
  // Preserve all competing candidates. Ordering does not imply uniqueness.
  return candidates.sort((a, b) => a.bankTransactionId - b.bankTransactionId ||
    a.dateDistanceDays - b.dateDistanceDays || a.eventId - b.eventId);
}
