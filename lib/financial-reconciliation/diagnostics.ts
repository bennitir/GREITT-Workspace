import type { MatchRejection } from "./domain-rule-result";
import {
  buildBankBookingCandidateGraph, evaluateBankBookingPair, bookingBankRejection,
} from "./candidates";
import {
  buildBankFinancialEventCandidates, evaluateBankFinancialEventPair,
  eventBankRejection, eventEligibilityRejection,
} from "./event-candidates";
import { evaluateReviewedFinancialDocument, type MaterializationRejection } from "../receipts/financial-event-materialization";
import { getSourceDocumentBookingState } from "./document-context";
import {
  BOOKING_STAGES, EVENT_STAGES, DIAGNOSTIC_VERSION, OVERALL_STATES, R, REASONS, STAGE,
  type Availability, type BankTransactionDiagnostic, type Bucket, type CandidateRef,
  type DiagnosticInput, type DiagnosticSnapshot, type DocumentDiagnostic, type EntityRef,
  type OverallState, type Reason, type ReasonCode, type StageCount, type StageId, type TargetRef,
} from "./diagnostics-contract";

// Exhaustive adapter: domain decisions do not know diagnostic vocabulary or metadata.
const DOMAIN_REASON_MAP = {
  BANK_AMOUNT_INVALID: R.BANK_AMOUNT_INVALID,
  BOOKING_AMOUNT_INVALID: R.BOOKING_AMOUNT_INVALID,
  BOOKING_SIGNED_AMOUNT_MISMATCH: R.BOOKING_SIGNED_AMOUNT_MISMATCH,
  BOOKING_DATE_PARTY_REJECTED: R.BOOKING_DATE_PARTY_REJECTED,
  BANK_SCOPE_MISMATCH: R.BANK_SCOPE_MISMATCH,
  BANK_DATE_INVALID: R.BANK_DATE_INVALID,
  ZERO_BANK_AMOUNT: R.ZERO_BANK_AMOUNT,
  EVENT_TYPE_UNSUPPORTED: R.EVENT_TYPE_UNSUPPORTED,
  EVENT_CURRENCY_UNSUPPORTED: R.EVENT_CURRENCY_UNSUPPORTED,
  EVENT_AMOUNT_NULL: R.EVENT_AMOUNT_NULL,
  EVENT_DATE_NULL: R.EVENT_DATE_NULL,
  EVENT_COMPANY_MISMATCH: R.EVENT_COMPANY_MISMATCH,
  EVENT_DATE_INVALID: R.EVENT_DATE_INVALID,
  EVENT_AMOUNT_INVALID: R.EVENT_AMOUNT_INVALID,
  EVENT_ABSOLUTE_AMOUNT_MISMATCH: R.EVENT_ABSOLUTE_AMOUNT_MISMATCH,
  EVENT_DIRECTION_MISMATCH: R.EVENT_DIRECTION_MISMATCH,
  EVENT_DATE_OUTSIDE_WINDOW: R.EVENT_DATE_OUTSIDE_WINDOW,
  BANK_BEFORE_ALL_PRIMARY_DOCUMENT_DATES: R.BANK_BEFORE_ALL_PRIMARY_DOCUMENT_DATES,
  DOCUMENT_ROLE_INELIGIBLE: R.DOCUMENT_ROLE_INELIGIBLE,
  MANUAL_CLASSIFICATION_EXCLUDED: R.MANUAL_CLASSIFICATION_EXCLUDED,
  DOCUMENT_AMOUNT_INVALID: R.DOCUMENT_AMOUNT_INVALID,
  PAYMENT_SCHEDULE_SEPARATE_FLOW: R.PAYMENT_SCHEDULE_SEPARATE_FLOW,
  INVOICE_LINK_COUNT_NOT_ONE: R.INVOICE_LINK_COUNT_NOT_ONE,
  DOCUMENT_TYPE_UNSUPPORTED: R.DOCUMENT_TYPE_UNSUPPORTED,
} satisfies Record<MatchRejection | MaterializationRejection, ReasonCode>;
function diagnosticReason(code: MatchRejection | MaterializationRejection | null): ReasonCode | null {
  return code === null ? null : DOMAIN_REASON_MAP[code];
}

const iso = (value: Date | null | undefined) => value && Number.isFinite(value.getTime()) ? value.toISOString() : null;
const key = (target: TargetRef) => `${target.type}:${target.id}`;
function reason(code: ReasonCode, source: EntityRef | null = null, target: EntityRef | null = null): Reason {
  return { code, ...REASONS[code], source, target };
}
function sourceReasons(availability: Availability) {
  return availability === "AVAILABLE" ? [] : [reason(availability === "UNAVAILABLE" ? R.SOURCE_UNAVAILABLE : R.SOURCE_NOT_EVALUATED)];
}

/** Each item contributes to exactly one first rejection, or passes all stages. */
function pipeline(stages: readonly StageId[], rejections: readonly (ReasonCode | null)[]): StageCount[] {
  let entered = rejections.length;
  return stages.map(stage => {
    const counts = new Map<ReasonCode, number>();
    for (const code of rejections) {
      if (code && REASONS[code].stage === stage) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const rejected = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const result = { stage, entered, passed: entered - rejected, rejected,
      rejectedByPrimaryReason: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })) };
    entered = result.passed;
    return result;
  });
}
const passed = (stages: StageCount[], stage: StageId) => stages.find(item => item.stage === stage)?.passed ?? null;
function aggregateReasons(stages: StageCount[]): Reason[] {
  return stages.flatMap(stage => stage.rejectedByPrimaryReason.map(({ code, count }) => ({
    ...reason(code), evidence: [{ fact: "COUNT" as const, value: count }],
  })));
}

// Exact decimal totals only. This is reporting arithmetic, never a matching predicate.
function decimal(value: string): { units: bigint; scale: number } | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return null;
  const exponent = Number(match[4] ?? 0);
  // Bound report arithmetic without changing any domain amount predicate.
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000 ||
    match[2].length + (match[3]?.length ?? 0) > 10000 || (match[3]?.length ?? 0) - exponent > 10000) return null;
  let units = BigInt(match[2] + (match[3] ?? ""));
  let scale = (match[3]?.length ?? 0) - exponent;
  if (scale < 0) { units *= BigInt(10) ** BigInt(-scale); scale = 0; }
  return { units, scale }; // absolute amounts by design
}
function addAbsolute(a: string, b: string) {
  const x = decimal(a), y = decimal(b);
  if (!x || !y) return null;
  const scale = Math.max(x.scale, y.scale);
  const units = x.units * BigInt(10) ** BigInt(scale - x.scale) + y.units * BigInt(10) ** BigInt(scale - y.scale);
  const digits = units.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "") : digits;
}
const bucket = (): Bucket => ({ transactionCount: 0, absoluteAmountByCurrency: {},
  amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } });
function increment(target: Bucket, bank: BankTransactionDiagnostic["bank"]) {
  target.transactionCount++;
  const currency = bank.currency ?? "UNKNOWN";
  const previous = Object.prototype.hasOwnProperty.call(target.absoluteAmountByCurrency, currency)
    ? target.absoluteAmountByCurrency[currency] : "0";
  const sum = addAbsolute(previous, bank.amount);
  if (sum === null) {
    target.amountTotals.completeness = "PARTIAL";
    target.amountTotals.excludedTransactionCount++;
    return;
  }
  Object.defineProperty(target.absoluteAmountByCurrency, currency, {
    value: sum, enumerable: true, configurable: true, writable: true,
  });
}
const cardinality = (count: number | null): "ZERO" | "ONE" | "MANY" | "NOT_EVALUATED" =>
  count === null ? "NOT_EVALUATED" : count === 0 ? "ZERO" : count === 1 ? "ONE" : "MANY";

/** Pure DTO projection. No database, filesystem, AI, clock, or write-flow calls.
 * Ownership fields are supplied by the future authorized loader. Foreign DTOs are
 * removed before any counts, graph degrees, references or evidence are produced.
 * Confirmation facts are assertions supplied by that caller, not DB validation.
 */
export function buildBankDiagnostics(input: DiagnosticInput): DiagnosticSnapshot {
  const { account } = input;
  let integrityViolation = false;
  let unresolvedReference = false;
  // Only a boolean survives rejected ownership checks: never copy foreign evidence.
  const inScope = (valid: boolean) => {
    if (!valid) integrityViolation = true;
    return valid;
  };
  // Absence from a supplied source is not evidence of foreign ownership.
  const referenceResolved = (valid: boolean) => {
    if (!valid) unresolvedReference = true;
    return valid;
  };
  const banks = input.banks.filter(bank => inScope(bank.companyId === account.companyId && bank.bankAccountId === account.id));
  if (new Set(banks.map(bank => bank.id)).size !== banks.length) throw new Error("Duplicate diagnostic bank id");
  const bookings = input.bookings.availability === "AVAILABLE" ? input.bookings.rows.filter(row => inScope(row.companyId === account.companyId)) : [];
  const events = input.events.availability === "AVAILABLE" ? input.events.rows.filter(event => inScope(event.companyId === account.companyId)) : [];
  const documents = input.documents.availability === "AVAILABLE" ? input.documents.rows.filter(document =>
    inScope(document.companyId === account.companyId && document.entityLinks.every(link => link.entity.companyId === account.companyId))) : [];
  for (const ids of [bookings.map(row => row.entryId), events.map(event => event.id), documents.map(document => document.id)]) {
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate diagnostic source id");
  }
  const eventIds = new Set(events.map(event => event.id));
  const entryIds = new Set(bookings.map(row => row.entryId));
  const validTarget = (target: TargetRef) => target.type === "FINANCIAL_EVENT" ? eventIds.has(target.id) : entryIds.has(target.id);
  const targetSourceKnown = (target: TargetRef) => target.type === "FINANCIAL_EVENT"
    ? input.events.availability === "AVAILABLE" : input.bookings.availability === "AVAILABLE";
  const bankIds = new Set(banks.map(bank => bank.id));
  const scopedBankFact = (fact: { companyId: number; bankAccountId: number; bankTransactionId: number; target: TargetRef }) =>
    inScope(fact.companyId === account.companyId && fact.bankAccountId === account.id) && referenceResolved(bankIds.has(fact.bankTransactionId));
  const confirmations = input.confirmations.availability === "AVAILABLE" ? input.confirmations.rows.filter(fact => {
    if (!scopedBankFact(fact)) return false;
    // Keep unresolved local assertions for NOT_EVALUATED, but never expose their ids.
    referenceResolved(targetSourceKnown(fact.target) && validTarget(fact.target));
    return true;
  }) : [];
  const scopedBlockers = (input.blockers ?? []).filter(fact => {
    if (!scopedBankFact(fact)) return false;
    return referenceResolved(targetSourceKnown(fact.target) && validTarget(fact.target));
  });
  const docById = new Map(documents.map(document => [document.id, document]));
  const links = input.documentLinks.availability === "AVAILABLE" ? input.documentLinks.rows.filter(link => {
    if (!inScope(link.companyId === account.companyId)) return false;
    if (!referenceResolved(input.events.availability === "AVAILABLE" && input.documents.availability === "AVAILABLE")) return false;
    if (!referenceResolved(eventIds.has(link.eventId))) return false;
    if (link.documentId === null) return false; // receipt-only is not an ownership assertion about a document
    return referenceResolved(docById.get(link.documentId)?.receiptId === link.receiptId) && link.role === "PRIMARY";
  }) : [];
  const integrityIssue = integrityViolation || unresolvedReference;
  // Links passed to this contract are PRIMARY links only; receipt-only links cannot identify a document.
  const inventory: DocumentDiagnostic[] = documents.map(document => {
    const result = evaluateReviewedFinancialDocument(document);
    const primaryEventIds = [...new Set(links.filter(link => link.documentId === document.id).map(link => link.eventId))].sort((a, b) => a - b);
    const linksKnown = !integrityIssue && input.documentLinks.availability === "AVAILABLE" && input.events.availability === "AVAILABLE";
    const materializationReason = diagnosticReason(result.reason);
    const code = materializationReason ?? (linksKnown ? (primaryEventIds.length ? R.PRIMARY_EVENT_EXISTS : R.ELIGIBLE_DOCUMENT_WITHOUT_PRIMARY_EVENT) : null);
    return {
      receiptId: document.receiptId, documentId: document.id, receiptStatus: document.receiptStatus,
      reviewedAt: iso(document.reviewedAt), approvedAt: iso(document.approvedAt),
      bookingState: getSourceDocumentBookingState({ receiptId: document.receiptId, receiptStatus: document.receiptStatus,
        documentId: document.id, reviewedAt: document.reviewedAt, approvedAt: document.approvedAt,
        documentType: document.documentType, documentRole: document.documentRole,
        bookingEntries: (document.bookingEntries ?? []).map((entry, id) => ({ ...entry, id, text: entry.text ?? "" })) }),
      materialization: {
        eligibility: result.decision ? "ELIGIBLE" : materializationReason === R.PAYMENT_SCHEDULE_SEPARATE_FLOW ? "SEPARATE_SCHEDULE_FLOW" : "INELIGIBLE",
        hasPrimaryEvent: linksKnown ? primaryEventIds.length > 0 : null, primaryEventIds,
        reasons: code ? [reason(code, { type: "DOCUMENT", id: document.id })] : [],
      },
    };
  });
  const bookingAvailability: Availability = input.bookings.availability === "AVAILABLE" && account.ledgerAccountNumber === null ? "UNAVAILABLE" : input.bookings.availability;
  const loaderBookingRejection = (row: typeof bookings[number]) => row.account !== account.ledgerAccountNumber
    ? R.BOOKING_ACCOUNT_NOT_SELECTED : row.receiptStatus !== "APPROVED" ? R.RECEIPT_STATUS_NOT_APPROVED : null;
  const eligibleBookings = bookingAvailability === "AVAILABLE" ? bookings.filter(row => !loaderBookingRejection(row)) : [];
  const bookingGraph = buildBankBookingCandidateGraph(banks, eligibleBookings);
  const eventCandidates = buildBankFinancialEventCandidates(account, banks, events);
  const allBookingCandidates = bookingGraph.flatMap(row => [...row.strongCandidates, ...row.possibleCandidates]);
  const transactions: BankTransactionDiagnostic[] = banks.map(bank => {
    const bankRef: EntityRef = { type: "BANK_TRANSACTION", id: bank.id };
    const amountTotalInvalid = decimal(String(bank.amount)) === null;
    const bookingInputError = diagnosticReason(bookingBankRejection(bank));
    const eventInputError = diagnosticReason(eventBankRejection(account, bank));
    const bAvailable = bookingAvailability === "AVAILABLE";
    const eAvailable = input.events.availability === "AVAILABLE";
    const bStages = bAvailable && !bookingInputError ? pipeline(BOOKING_STAGES, bookings.map(row =>
      loaderBookingRejection(row) ?? diagnosticReason(evaluateBankBookingPair(bank, row).rejection))) : [];
    const eStages = eAvailable && !eventInputError ? pipeline(EVENT_STAGES, events.map(event =>
      diagnosticReason(evaluateBankFinancialEventPair(account, bank, event).rejection))) : [];
    const candidateRef = (target: TargetRef, strength: CandidateRef["strength"], mutuallyUniqueStrong: boolean | null, otherBankCandidateCount: number): CandidateRef => {
      const blockers = scopedBlockers.filter(blocker => blocker.companyId === account.companyId &&
        blocker.bankAccountId === account.id && blocker.bankTransactionId === bank.id && key(blocker.target) === key(target) &&
        REASONS[blocker.code].effect === "BLOCKED");
      return { target, strength, mutuallyUniqueStrong, otherBankCandidateCount,
        confirmation: { state: blockers.length ? "BLOCKED" : "NOT_IMPLEMENTED",
          reasons: [...new Set(blockers.map(blocker => blocker.code))].map(code => reason(code, bankRef, target)) } };
    };
    const resolution = bookingGraph.find(row => row.bankTransactionId === bank.id)!;
    const bCandidates = [...resolution.strongCandidates, ...resolution.possibleCandidates].map(candidate => candidateRef(
      { type: "RECEIPT_ENTRY", id: candidate.receiptEntryId }, candidate.strength, candidate.mutuallyUnique,
      new Set(allBookingCandidates.filter(other => other.receiptEntryId === candidate.receiptEntryId && other.bankTransactionId !== bank.id).map(other => other.bankTransactionId)).size));
    const eCandidates = eventCandidates.filter(candidate => candidate.bankTransactionId === bank.id).map(candidate => candidateRef(
      { type: "FINANCIAL_EVENT", id: candidate.eventId }, candidate.strength, null,
      new Set(eventCandidates.filter(other => other.eventId === candidate.eventId && other.bankTransactionId !== bank.id).map(other => other.bankTransactionId)).size));
    const confirmedRows = confirmations.filter(row => row.bankTransactionId === bank.id);
    const confirmedLinks = confirmedRows.filter(row => validTarget(row.target)).map(row => ({
      reconciliationId: row.reconciliationId, paymentId: row.paymentId, target: { ...row.target }, state: row.state,
    }));
    const unresolvableConfirmation = confirmedRows.length !== confirmedLinks.length;
    const conflict = confirmedLinks.some(link => link.state === "INCONSISTENT") || confirmedLinks.filter(link => link.state === "VALID").length > 1;
    const confirmedState: BankTransactionDiagnostic["confirmed"]["state"] = conflict ? "INCONSISTENT" :
      unresolvableConfirmation || input.confirmations.availability !== "AVAILABLE" ? "NOT_EVALUATED" :
      confirmedLinks.some(link => link.state === "UNSUPPORTED_RECORD") ? "UNSUPPORTED_RECORD" :
      confirmedLinks.some(link => link.state === "VALID") ? "VALID" : "NONE";
    const candidates = [...bCandidates, ...eCandidates];
    const coverage = !bAvailable || !eAvailable ? null : bCandidates.length ? (eCandidates.length ? "BOTH" : "BOOKING_ONLY") : eCandidates.length ? "EVENT_ONLY" : "NONE";
    const count = bAvailable && eAvailable ? candidates.length : null;
    const blockedCount = candidates.filter(candidate => candidate.confirmation.state === "BLOCKED").length;
    // Unsupported target facts never imply an unsupported bank flow.
    const overallState: OverallState = conflict ? "DATA_CONFLICT" : confirmedState === "VALID" ? "CONFIRMED" :
      amountTotalInvalid || !bAvailable || !eAvailable || bookingInputError !== null || (eventInputError !== null && eventInputError !== R.ZERO_BANK_AMOUNT) ||
      confirmedState === "NOT_EVALUATED" || confirmedState === "UNSUPPORTED_RECORD" ? "SOURCE_ERROR" :
      candidates.length > 0 && blockedCount === candidates.length ? "CANDIDATES_BLOCKED" :
      candidates.length === 1 ? "SINGLE_TARGET_CANDIDATE" : candidates.length > 1 ? "MULTIPLE_TARGET_CANDIDATES" : "UNRESOLVED";
    const contexts: BankTransactionDiagnostic["documents"]["contexts"] = [];
    const addContext = (target: TargetRef, kind: "CANDIDATE" | "CONFIRMED_LINK") => {
      if (target.type === "FINANCIAL_EVENT") {
        for (const doc of inventory.filter(document => document.materialization.primaryEventIds.includes(target.id))) {
          contexts.push({ ...doc, via: { kind, target: { ...target } } });
        }
      } else {
        const row = bookings.find(booking => booking.entryId === target.id);
        if (row) contexts.push({ receiptId: row.receiptId, documentId: null, receiptStatus: row.receiptStatus,
          reviewedAt: null, approvedAt: null, bookingState: null,
          materialization: { eligibility: "NOT_EVALUATED", hasPrimaryEvent: null, primaryEventIds: [], reasons: [] },
          via: { kind, target: { ...target } } });
      }
    };
    for (const candidate of candidates) addContext(candidate.target, "CANDIDATE");
    for (const link of confirmedLinks) {
      if (link.state === "VALID") addContext(link.target, "CONFIRMED_LINK");
    }
    return {
      snapshotId: input.snapshotId,
      bank: { bankTransactionId: bank.id, companyId: account.companyId, bankAccountId: account.id,
        amount: String(bank.amount), currency: bank.currency, date: iso(bank.date), reference: bank.reference, status: bank.status },
      booking: { availability: bookingAvailability, state: bAvailable ? resolution.state : null,
        eligibleRowCount: bAvailable ? eligibleBookings.length : null,
        signedAmountMatchingRowCount: passed(bStages, STAGE.BOOKING_SIGNED_AMOUNT),
        candidateCount: bAvailable ? bCandidates.length : null, strongCount: bAvailable ? resolution.strongCandidates.length : null,
        possibleCount: bAvailable ? resolution.possibleCandidates.length : null, pipeline: bStages, candidates: bCandidates,
        reasons: [...sourceReasons(bookingAvailability), ...aggregateReasons(bStages),
          ...(amountTotalInvalid ? [reason(R.BANK_AMOUNT_INVALID, bankRef)] : bAvailable && bookingInputError ? [reason(bookingInputError, bankRef)] : []),
          ...(input.bookings.availability === "AVAILABLE" && account.ledgerAccountNumber === null ? [reason(R.LEDGER_ACCOUNT_NOT_LINKED)] : [])] },
      events: { availability: input.events.availability, eventCountBeforeFilters: eAvailable ? events.length : null,
        eligibleEventCount: eAvailable ? events.filter(event => !eventEligibilityRejection(event)).length : null,
        amountCompatibleCount: passed(eStages, STAGE.EVENT_AMOUNT), directionCompatibleCount: passed(eStages, STAGE.EVENT_DIRECTION),
        dateWindowCompatibleCount: passed(eStages, STAGE.EVENT_DATE), temporalCompatibleCount: passed(eStages, STAGE.EVENT_TEMPORAL),
        candidateCount: eAvailable ? eCandidates.length : null, competingCandidateCount: eAvailable ? Math.max(eCandidates.length - 1, 0) : null,
        sharedTargetCount: eAvailable ? eCandidates.filter(candidate => candidate.otherBankCandidateCount > 0).length : null,
        pipeline: eStages, candidates: eCandidates,
        reasons: [...sourceReasons(input.events.availability), ...aggregateReasons(eStages), ...(eAvailable && eventInputError ? [reason(eventInputError, bankRef)] : [])] },
      confirmed: { availability: input.confirmations.availability, state: confirmedState,
        confirmed: confirmedState === "VALID" ? true : confirmedState === "NONE" ? false : null,
        basis: "SUPPLIED_DIAGNOSTIC_FACTS", links: confirmedLinks },
      documents: { availability: input.documents.availability === "AVAILABLE" ? input.documentLinks.availability : input.documents.availability, contexts },
      overall: { state: overallState, coverage, candidateTargetCount: count, knownBlockedCandidateCount: blockedCount, confirmationCheckComplete: false },
    };
  });
  const overall = Object.fromEntries(OVERALL_STATES.map(state => [state, bucket()])) as Record<OverallState, Bucket>;
  const coverage = { NONE: bucket(), BOOKING_ONLY: bucket(), EVENT_ONLY: bucket(), BOTH: bucket(), UNKNOWN: bucket() };
  const total = bucket(), noCandidateInEitherLayer = bucket(), noCandidateUnconfirmed = bucket();
  const bookingEventMatrix: DiagnosticSnapshot["bookingEventMatrix"] = [];
  const confirmedCandidateMatrix: DiagnosticSnapshot["confirmedCandidateMatrix"] = [];
  for (const row of transactions) {
    increment(total, row.bank); increment(overall[row.overall.state], row.bank); increment(coverage[row.overall.coverage ?? "UNKNOWN"], row.bank);
    if (row.overall.candidateTargetCount === 0) {
      increment(noCandidateInEitherLayer, row.bank);
      if (row.confirmed.state === "NONE") increment(noCandidateUnconfirmed, row.bank);
    }
    const bookingState = row.booking.state ?? "NOT_EVALUATED", eventState = cardinality(row.events.candidateCount);
    let be = bookingEventMatrix.find(cell => cell.bookingState === bookingState && cell.eventState === eventState);
    if (!be) { be = { bookingState, eventState, bucket: bucket() }; bookingEventMatrix.push(be); }
    increment(be.bucket, row.bank);
    const confirmationState = row.confirmed.state, candidateState = cardinality(row.overall.candidateTargetCount);
    let cc = confirmedCandidateMatrix.find(cell => cell.confirmationState === confirmationState && cell.candidateState === candidateState);
    if (!cc) { cc = { confirmationState, candidateState, bucket: bucket() }; confirmedCandidateMatrix.push(cc); }
    increment(cc.bucket, row.bank);
  }
  const countsByEligibility = { ELIGIBLE: 0, INELIGIBLE: 0, SEPARATE_SCHEDULE_FLOW: 0, NOT_EVALUATED: 0 };
  for (const doc of inventory) countsByEligibility[doc.materialization.eligibility]++;
  return { schemaVersion: DIAGNOSTIC_VERSION, ruleVersion: DIAGNOSTIC_VERSION, snapshotId: input.snapshotId,
    capturedAt: input.capturedAt, companyId: account.companyId, bankAccountId: account.id, consistency: "CALLER_SUPPLIED",
    integrity: { state: integrityIssue ? "ERROR" : "VALID", reasons: [
      ...(integrityViolation ? [reason(R.TENANT_SCOPE_VIOLATION)] : []),
      ...(unresolvedReference ? [reason(R.TARGET_REFERENCE_UNRESOLVED)] : []),
    ] },
    completeness: !integrityIssue && total.amountTotals.completeness === "COMPLETE" && [bookingAvailability, input.events.availability, input.confirmations.availability, input.documents.availability,
      input.documentLinks.availability].every(value => value === "AVAILABLE") && transactions.every(row => row.confirmed.state !== "NOT_EVALUATED") ? "COMPLETE" : "PARTIAL",
    total, overall, coverage, noCandidateInEitherLayer, noCandidateUnconfirmed, bookingEventMatrix, confirmedCandidateMatrix, transactions,
    companyDocumentInventory: { scope: "COMPANY", availability: input.documents.availability, documents: inventory,
      countsByEligibility: input.documents.availability === "AVAILABLE" ? countsByEligibility : null } };
}
