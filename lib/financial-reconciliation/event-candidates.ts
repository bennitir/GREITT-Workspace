import { MATCH_REJECTION as D, rejected, type RuleResult } from "./domain-rule-result";
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
  primarySourceDocumentDates?: readonly Date[];
  sourceDueDate?: Date | null;
  sourceFinalDueDate?: Date | null;
};

export type FinancialEventCandidateReason =
  | "EXACT_EVENT_AMOUNT_NEAR_DATE"
  | "EXACT_EVENT_AMOUNT_EXTENDED_DATE"
  | "EXACT_EVENT_REFERENCE";

export type BankFinancialEventCandidateEvidence =
  | "EXACT_EVENT_REFERENCE"
  | "BANK_DATE_EQUALS_DUE_DATE"
  | "BANK_DATE_EQUALS_FINAL_DUE_DATE";

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
  evidence: BankFinancialEventCandidateEvidence[];
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

export function eventBankRejection(bankAccount: { id: number }, bank: EventBankCandidateInput) {
  if (bank.bankAccountId !== bankAccount.id) return D.BANK_SCOPE_MISMATCH;
  if (!Number.isFinite(bank.date.getTime())) return D.BANK_DATE_INVALID;
  const amount = minorUnits(bank.amount);
  if (amount === null) return D.BANK_AMOUNT_INVALID;
  return amount === BigInt(0) ? D.ZERO_BANK_AMOUNT : null;
}

/** Same loader predicates, ordered only to assign one diagnostic exclusion. */
export function eventEligibilityRejection(event: FinancialEventCandidateInput) {
  if (event.eventType !== "CHARGE" && event.eventType !== "CREDIT") return D.EVENT_TYPE_UNSUPPORTED;
  if (event.currency !== "ISK") return D.EVENT_CURRENCY_UNSUPPORTED;
  if (event.amount === null) return D.EVENT_AMOUNT_NULL;
  if (!event.eventDate) return D.EVENT_DATE_NULL;
  return null;
}

export function evaluateBankFinancialEventPair(
  bankAccount: { id: number; companyId: number }, bank: EventBankCandidateInput,
  event: FinancialEventCandidateInput,
): RuleResult<BankFinancialEventCandidate> {
  const bankRejection = eventBankRejection(bankAccount, bank);
  if (bankRejection) return rejected(bankRejection);
  if (event.companyId !== bankAccount.companyId) return rejected(D.EVENT_COMPANY_MISMATCH);
  const eligibility = eventEligibilityRejection(event);
  if (eligibility) return rejected(eligibility);
  if (!event.eventDate || !Number.isFinite(event.eventDate.getTime())) return rejected(D.EVENT_DATE_INVALID);
  const bankMinor = minorUnits(bank.amount)!;
  const eventMinor = minorUnits(event.amount);
  if (eventMinor === null) return rejected(D.EVENT_AMOUNT_INVALID);
  const abs = (value: bigint) => value < BigInt(0) ? -value : value;
  if (abs(eventMinor) !== abs(bankMinor)) return rejected(D.EVENT_ABSOLUTE_AMOUNT_MISMATCH);
  if (eventMinor !== -bankMinor ||
      (event.eventType === "CHARGE" && eventMinor <= BigInt(0)) ||
      (event.eventType === "CREDIT" && eventMinor >= BigInt(0))) return rejected(D.EVENT_DIRECTION_MISMATCH);
  const bankDay = dayOrdinal(bank.date);
  const eventDay = dayOrdinal(event.eventDate);
  const dateDistanceDays = Math.abs(bankDay - eventDay);
  if (dateDistanceDays > 30) return rejected(D.EVENT_DATE_OUTSIDE_WINDOW);

  const reference = normalizeReference(event.externalReference);
  const exactReference = Boolean(
    reference && reference === normalizeReference(bank.reference),
  );
  const primarySourceDocumentDates = (event.primarySourceDocumentDates ?? [])
    .filter((date) => Number.isFinite(date.getTime()));

  // A reviewed CHARGE cannot ordinarily be paid before every known PRIMARY
  // source document exists. Exact external-reference evidence is the one
  // conservative exception because it can represent a documented prepayment.
  if (
    event.eventType === "CHARGE" &&
    primarySourceDocumentDates.length > 0 &&
    primarySourceDocumentDates.every((date) => dayOrdinal(date) > bankDay) &&
    !exactReference
  ) return rejected(D.BANK_BEFORE_ALL_PRIMARY_DOCUMENT_DATES);

  const evidence: BankFinancialEventCandidateEvidence[] = [];
  if (exactReference) evidence.push("EXACT_EVENT_REFERENCE");
  if (event.sourceDueDate && Number.isFinite(event.sourceDueDate.getTime()) &&
    dayOrdinal(event.sourceDueDate) === bankDay) {
    evidence.push("BANK_DATE_EQUALS_DUE_DATE");
  }
  if (event.sourceFinalDueDate && Number.isFinite(event.sourceFinalDueDate.getTime()) &&
    dayOrdinal(event.sourceFinalDueDate) === bankDay) {
    evidence.push("BANK_DATE_EQUALS_FINAL_DUE_DATE");
  }

  return {
    candidate: {
      bankTransactionId: bank.id,
      eventId: event.id,
      eventType: event.eventType as "CHARGE" | "CREDIT",
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
      evidence,
      strength: "POSSIBLE",
    },
    rejection: null,
  };
}

/** Pure BANK_TO_FINANCIAL_EVENT evidence, never payment or unpaid-balance inference. */
export function buildBankFinancialEventCandidates(
  bankAccount: { id: number; companyId: number },
  transactions: EventBankCandidateInput[],
  events: FinancialEventCandidateInput[],
): BankFinancialEventCandidate[] {
  const candidates: BankFinancialEventCandidate[] = [];
  for (const bank of transactions) {
    for (const event of events) {
      const result = evaluateBankFinancialEventPair(bankAccount, bank, event);
      if (result.candidate) candidates.push(result.candidate);
    }
  }
  // Preserve all competing candidates. Ordering does not imply uniqueness.
  return candidates.sort((a, b) => a.bankTransactionId - b.bankTransactionId ||
    a.dateDistanceDays - b.dateDistanceDays || a.eventId - b.eventId);
}
