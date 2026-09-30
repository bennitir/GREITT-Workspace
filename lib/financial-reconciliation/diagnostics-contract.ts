/** Closed vocabulary. Changing meanings/order requires a version bump. No DB imports. */
export const DIAGNOSTIC_VERSION = "bank-diagnostics-v3" as const;
export const STAGE = {
  SOURCE: "SOURCE", BOOKING_ACCOUNT: "BOOKING_ACCOUNT", BOOKING_STATUS: "BOOKING_STATUS",
  BOOKING_AMOUNT: "BOOKING_AMOUNT", BOOKING_SIGNED_AMOUNT: "BOOKING_SIGNED_AMOUNT",
  BOOKING_DATE_PARTY: "BOOKING_DATE_PARTY", EVENT_TYPE: "EVENT_TYPE",
  EVENT_CURRENCY: "EVENT_CURRENCY", EVENT_AMOUNT_PRESENT: "EVENT_AMOUNT_PRESENT",
  EVENT_DATE_PRESENT: "EVENT_DATE_PRESENT", EVENT_VALID_INPUT: "EVENT_VALID_INPUT",
  EVENT_AMOUNT: "EVENT_AMOUNT", EVENT_DIRECTION: "EVENT_DIRECTION", EVENT_DATE: "EVENT_DATE",
  EVENT_TEMPORAL: "EVENT_TEMPORAL", COMPETITION: "COMPETITION",
  CONFIRMATION: "CONFIRMATION", MATERIALIZATION: "MATERIALIZATION",
} as const;
export type StageId = typeof STAGE[keyof typeof STAGE];
export const BOOKING_STAGES = [STAGE.BOOKING_ACCOUNT, STAGE.BOOKING_STATUS,
  STAGE.BOOKING_AMOUNT, STAGE.BOOKING_SIGNED_AMOUNT, STAGE.BOOKING_DATE_PARTY] as const;
export const EVENT_STAGES = [STAGE.EVENT_TYPE, STAGE.EVENT_CURRENCY,
  STAGE.EVENT_AMOUNT_PRESENT, STAGE.EVENT_DATE_PRESENT, STAGE.EVENT_VALID_INPUT,
  STAGE.EVENT_AMOUNT, STAGE.EVENT_DIRECTION, STAGE.EVENT_DATE, STAGE.EVENT_TEMPORAL] as const;
type Category = "SOURCE" | "PAIR_REJECTION" | "MATERIALIZATION" | "CONFIRMATION" | "UNSUPPORTED";
type Scope = "ACCOUNT" | "BANK" | "TARGET" | "PAIR" | "DOCUMENT";
type Effect = "EXCLUDED" | "BLOCKED" | "OBSERVED" | "ERROR";
function meta<C extends Category, S extends Scope, T extends StageId, E extends Effect>(category: C, scope: S, stage: T, effect: E) {
  return { category, scope, stage, effect, ruleVersion: DIAGNOSTIC_VERSION } as const;
}
export const REASONS = {
  TENANT_SCOPE_VIOLATION: meta("SOURCE", "ACCOUNT", STAGE.SOURCE, "ERROR"),
  TARGET_REFERENCE_UNRESOLVED: meta("SOURCE", "ACCOUNT", STAGE.SOURCE, "ERROR"),
  SOURCE_UNAVAILABLE: meta("SOURCE", "ACCOUNT", STAGE.SOURCE, "ERROR"),
  SOURCE_NOT_EVALUATED: meta("SOURCE", "ACCOUNT", STAGE.SOURCE, "OBSERVED"),
  LEDGER_ACCOUNT_NOT_LINKED: meta("SOURCE", "ACCOUNT", STAGE.SOURCE, "ERROR"),
  BANK_AMOUNT_INVALID: meta("SOURCE", "BANK", STAGE.SOURCE, "ERROR"),
  BANK_DATE_INVALID: meta("SOURCE", "BANK", STAGE.SOURCE, "ERROR"),
  BANK_SCOPE_MISMATCH: meta("SOURCE", "BANK", STAGE.SOURCE, "ERROR"),
  ZERO_BANK_AMOUNT: meta("UNSUPPORTED", "BANK", STAGE.SOURCE, "EXCLUDED"),
  EVENT_COMPANY_MISMATCH: meta("SOURCE", "TARGET", STAGE.SOURCE, "ERROR"),
  BOOKING_ACCOUNT_NOT_SELECTED: meta("SOURCE", "TARGET", STAGE.BOOKING_ACCOUNT, "EXCLUDED"),
  RECEIPT_STATUS_NOT_APPROVED: meta("SOURCE", "TARGET", STAGE.BOOKING_STATUS, "EXCLUDED"),
  BOOKING_AMOUNT_INVALID: meta("PAIR_REJECTION", "PAIR", STAGE.BOOKING_AMOUNT, "EXCLUDED"),
  BOOKING_SIGNED_AMOUNT_MISMATCH: meta("PAIR_REJECTION", "PAIR", STAGE.BOOKING_SIGNED_AMOUNT, "EXCLUDED"),
  BOOKING_DATE_PARTY_REJECTED: meta("PAIR_REJECTION", "PAIR", STAGE.BOOKING_DATE_PARTY, "EXCLUDED"),
  EVENT_TYPE_UNSUPPORTED: meta("UNSUPPORTED", "TARGET", STAGE.EVENT_TYPE, "EXCLUDED"),
  EVENT_CURRENCY_UNSUPPORTED: meta("UNSUPPORTED", "TARGET", STAGE.EVENT_CURRENCY, "EXCLUDED"),
  EVENT_AMOUNT_NULL: meta("SOURCE", "TARGET", STAGE.EVENT_AMOUNT_PRESENT, "EXCLUDED"),
  EVENT_DATE_NULL: meta("SOURCE", "TARGET", STAGE.EVENT_DATE_PRESENT, "EXCLUDED"),
  EVENT_DATE_INVALID: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_VALID_INPUT, "EXCLUDED"),
  EVENT_AMOUNT_INVALID: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_VALID_INPUT, "EXCLUDED"),
  EVENT_ABSOLUTE_AMOUNT_MISMATCH: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_AMOUNT, "EXCLUDED"),
  EVENT_DIRECTION_MISMATCH: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_DIRECTION, "EXCLUDED"),
  EVENT_DATE_OUTSIDE_WINDOW: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_DATE, "EXCLUDED"),
  BANK_BEFORE_ALL_PRIMARY_DOCUMENT_DATES: meta("PAIR_REJECTION", "PAIR", STAGE.EVENT_TEMPORAL, "EXCLUDED"),
  DOCUMENT_ROLE_INELIGIBLE: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "EXCLUDED"),
  MANUAL_CLASSIFICATION_EXCLUDED: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "EXCLUDED"),
  DOCUMENT_AMOUNT_INVALID: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "EXCLUDED"),
  DOCUMENT_TYPE_UNSUPPORTED: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "EXCLUDED"),
  INVOICE_LINK_COUNT_NOT_ONE: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "EXCLUDED"),
  PAYMENT_SCHEDULE_SEPARATE_FLOW: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "OBSERVED"),
  PRIMARY_EVENT_EXISTS: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "OBSERVED"),
  ELIGIBLE_DOCUMENT_WITHOUT_PRIMARY_EVENT: meta("MATERIALIZATION", "DOCUMENT", STAGE.MATERIALIZATION, "OBSERVED"),
  BANK_TRANSACTION_ALREADY_RECONCILED: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  EVENT_PAYMENT_OVER_ALLOCATION: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  BANK_PAYMENT_OVER_ALLOCATION: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  PAYMENT_STATUS_NOT_CONFIRMABLE: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  PAIR_NO_LONGER_VALID: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  CONFIRMED_PAYMENT_MISMATCH: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  AMBIGUOUS_EXISTING_RECONCILIATION: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  RECONCILIATION_STATUS_NOT_CONFIRMABLE: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  RECONCILIATION_PARTICIPANTS_MISMATCH: meta("CONFIRMATION", "PAIR", STAGE.CONFIRMATION, "BLOCKED"),
  CONFIRMED_DATA_CONFLICT: meta("CONFIRMATION", "BANK", STAGE.CONFIRMATION, "ERROR"),
  RECONCILIATION_TYPE_NOT_VALIDATED: meta("UNSUPPORTED", "BANK", STAGE.CONFIRMATION, "OBSERVED"),
} as const;
export type ReasonCode = keyof typeof REASONS;
// Consumers use R.CODE; definitions and metadata live only in this registry.
export const R = Object.fromEntries(Object.keys(REASONS).map(code => [code, code])) as {
  readonly [K in ReasonCode]: K;
};
export type Availability = "AVAILABLE" | "UNAVAILABLE" | "NOT_EVALUATED";
export type TargetRef = { type: "RECEIPT_ENTRY" | "FINANCIAL_EVENT"; id: number };
export type EntityRef = { type: TargetRef["type"] | "BANK_TRANSACTION" | "DOCUMENT" | "BANK_ACCOUNT"; id: number };
export type Reason = typeof REASONS[ReasonCode] & {
  code: ReasonCode; source: EntityRef | null; target: EntityRef | null;
  evidence?: { fact: "COUNT" | "DATE_DISTANCE_DAYS" | "EXACT_REFERENCE"; value: number | boolean }[];
};
export type StageCount = { stage: StageId; entered: number; passed: number; rejected: number;
  rejectedByPrimaryReason: { code: ReasonCode; count: number }[] };
export type ConfirmationCode = { [K in ReasonCode]: typeof REASONS[K]["category"] extends "CONFIRMATION"
  ? typeof REASONS[K]["effect"] extends "BLOCKED" ? K : never : never }[ReasonCode];
export type CandidateRef = {
  target: TargetRef; strength: "STRONG" | "POSSIBLE"; mutuallyUniqueStrong: boolean | null;
  otherBankCandidateCount: number;
  confirmation: { state: "BLOCKED" | "NOT_IMPLEMENTED"; reasons: Reason[] };
};
export const OVERALL_STATES = ["DATA_CONFLICT", "CONFIRMED", "SOURCE_ERROR", "CANDIDATES_BLOCKED",
  "SINGLE_TARGET_CANDIDATE", "MULTIPLE_TARGET_CANDIDATES", "UNSUPPORTED", "UNRESOLVED"] as const;
export type OverallState = typeof OVERALL_STATES[number];
export type Coverage = "NONE" | "BOOKING_ONLY" | "EVENT_ONLY" | "BOTH";
export type Bucket = {
  transactionCount: number;
  // Partial subtotals contain only summable values, never invented zeroes.
  absoluteAmountByCurrency: Record<string, string>;
  amountTotals: { completeness: "COMPLETE" | "PARTIAL"; excludedTransactionCount: number };
};

import type { BankCandidateInput, BookingCandidateInput, BankCandidateState } from "./candidates";
import type { FinancialEventCandidateInput } from "./event-candidates";
export type DiagnosticSource<T> =
  | { availability: "AVAILABLE"; rows: readonly T[] }
  | { availability: "UNAVAILABLE" | "NOT_EVALUATED"; rows?: never };
export type DiagnosticBank = BankCandidateInput & {
  companyId: number; bankAccountId: number; currency: string | null; reference: string | null; status: string;
};
export type DiagnosticBooking = BookingCandidateInput & { companyId: number; receiptStatus: string };
export type DiagnosticDocument = {
  id: number; documentRole: string | null; documentType: string | null;
  classificationSource: string | null; totalAmount?: number | null;
  receiptNumber?: string | null; paymentSchedule?: unknown;
  bookingEntries?: Array<{ account: string; text?: string | null; debit: number; credit: number }>;
  companyId: number; receiptId: number; receiptStatus: string;
  reviewedAt: Date | null; approvedAt: Date | null;
  entityLinks: Array<{ entity: { id: number; companyId: number; entityType: string; identifierValue?: string | null } }>;
};
export type ConfirmedDiagnosticInput = {
  companyId: number; bankAccountId: number; bankTransactionId: number;
  // Caller-supplied assertion, NOT a validator of database records.
  state: "VALID" | "INCONSISTENT" | "UNSUPPORTED_RECORD";
  reconciliationId: number | null; paymentId: number | null; target: TargetRef;
};
export type DiagnosticInput = {
  snapshotId: string; capturedAt: string;
  account: { id: number; companyId: number; ledgerAccountNumber: string | null };
  banks: readonly DiagnosticBank[];
  bookings: DiagnosticSource<DiagnosticBooking>;
  events: DiagnosticSource<FinancialEventCandidateInput>;
  confirmations: DiagnosticSource<ConfirmedDiagnosticInput>;
  documents: DiagnosticSource<DiagnosticDocument>;
  documentLinks: DiagnosticSource<{
    // Explicitly scoped PRIMARY links, not arbitrary document/event associations.
    role: "PRIMARY";
    companyId: number; receiptId: number; documentId: number | null; eventId: number;
  }>;
  // Optional precomputed facts; this foundation does not compute confirmation eligibility.
  blockers?: readonly { companyId: number; bankAccountId: number; bankTransactionId: number;
    target: TargetRef; code: ConfirmationCode }[];
};
export type DocumentDiagnostic = {
  receiptId: number; documentId: number | null; receiptStatus: string;
  reviewedAt: string | null; approvedAt: string | null;
  bookingState: "BOOKED" | "REVIEWED_NOT_BOOKED" | "UNREVIEWED_NOT_BOOKED" | "NO_BOOKING_PROPOSAL" | null;
  materialization: {
    eligibility: "ELIGIBLE" | "INELIGIBLE" | "SEPARATE_SCHEDULE_FLOW" | "NOT_EVALUATED";
    hasPrimaryEvent: boolean | null; primaryEventIds: number[]; reasons: Reason[];
  };
};
export type BankTransactionDiagnostic = {
  snapshotId: string;
  bank: { bankTransactionId: number; companyId: number; bankAccountId: number;
    amount: string; currency: string | null; date: string | null; reference: string | null; status: string };
  booking: { availability: Availability; state: BankCandidateState | null; eligibleRowCount: number | null;
    signedAmountMatchingRowCount: number | null; candidateCount: number | null; strongCount: number | null;
    possibleCount: number | null; pipeline: StageCount[]; candidates: CandidateRef[]; reasons: Reason[] };
  events: { availability: Availability; eventCountBeforeFilters: number | null; eligibleEventCount: number | null;
    amountCompatibleCount: number | null; directionCompatibleCount: number | null;
    dateWindowCompatibleCount: number | null; temporalCompatibleCount: number | null;
    candidateCount: number | null; competingCandidateCount: number | null; sharedTargetCount: number | null;
    pipeline: StageCount[]; candidates: CandidateRef[]; reasons: Reason[] };
  confirmed: { availability: Availability; state: "NONE" | ConfirmedDiagnosticInput["state"] | "NOT_EVALUATED";
    confirmed: boolean | null; basis: "SUPPLIED_DIAGNOSTIC_FACTS";
    links: Array<Pick<ConfirmedDiagnosticInput, "reconciliationId" | "paymentId" | "target" | "state">> };
  documents: { availability: Availability; contexts: Array<DocumentDiagnostic & {
    via: { kind: "CANDIDATE" | "CONFIRMED_LINK"; target: TargetRef };
  }> };
  overall: { state: OverallState; coverage: Coverage | null; candidateTargetCount: number | null;
    knownBlockedCandidateCount: number; confirmationCheckComplete: false };
};
export type DiagnosticSnapshot = {
  schemaVersion: typeof DIAGNOSTIC_VERSION; ruleVersion: typeof DIAGNOSTIC_VERSION;
  snapshotId: string; capturedAt: string; companyId: number; bankAccountId: number;
  // No database consistency claim: input is an in-memory DTO snapshot.
  consistency: "CALLER_SUPPLIED"; completeness: "COMPLETE" | "PARTIAL";
  // Scope violations are reported without foreign identifiers or evidence.
  integrity: { state: "VALID" | "ERROR"; reasons: Reason[] };
  total: Bucket; overall: Record<OverallState, Bucket>; coverage: Record<Coverage | "UNKNOWN", Bucket>;
  noCandidateInEitherLayer: Bucket; noCandidateUnconfirmed: Bucket;
  bookingEventMatrix: Array<{ bookingState: BankCandidateState | "NOT_EVALUATED";
    eventState: "ZERO" | "ONE" | "MANY" | "NOT_EVALUATED"; bucket: Bucket }>;
  confirmedCandidateMatrix: Array<{ confirmationState: BankTransactionDiagnostic["confirmed"]["state"];
    candidateState: "ZERO" | "ONE" | "MANY" | "NOT_EVALUATED"; bucket: Bucket }>;
  transactions: BankTransactionDiagnostic[];
  companyDocumentInventory: { scope: "COMPANY"; availability: Availability;
    documents: DocumentDiagnostic[]; countsByEligibility: Record<DocumentDiagnostic["materialization"]["eligibility"], number> | null };
};
