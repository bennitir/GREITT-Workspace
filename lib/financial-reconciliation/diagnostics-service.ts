import { Decimal } from "@prisma/client/runtime/client";
import { buildBankDiagnostics } from "./diagnostics";
import { REASONS, type DiagnosticSnapshot, type Reason } from "./diagnostics-contract";
import type { BankDiagnosticSource } from "./diagnostics-source";
import {
  classifyBankReconciliationFlow,
  type BankReconciliationFlowKind,
} from "./flow-kind";

export type BankFlowObservationCode = BankReconciliationFlowKind;

export type MaterializationSourceObservations = {
  availability: BankDiagnosticSource["input"]["documents"]["availability"];
  unsupportedDocumentTypes: Array<{ documentType: string | null; count: number }> | null;
  invoiceLinkCountsNotOne: Array<{ invoiceLinkCount: number; count: number }> | null;
  invoiceLinkZeroContexts: Array<{
    documentType: string | null;
    merchantName: string | null;
    count: number;
  }> | null;
};

export type ReconciliationFlowSourceObservations = {
  amountMismatchNoCandidateCount: number;
  amountMismatchFlowHints: Array<{ flow: BankFlowObservationCode; count: number }>;
};

export type ReviewedDocumentAmountState =
  | "ELIGIBLE"
  | "SEPARATE_SCHEDULE_FLOW"
  | "DOCUMENT_TYPE_UNSUPPORTED"
  | "INVOICE_LINK_COUNT_NOT_ONE"
  | "DOCUMENT_ROLE_INELIGIBLE"
  | "MANUAL_CLASSIFICATION_EXCLUDED"
  | "OTHER_INELIGIBLE";

export type ReviewedDocumentAmountObservations = {
  availability: BankDiagnosticSource["input"]["documents"]["availability"];
  amountMismatchNoCandidateCount: number;
  reviewedAmountMatchTransactionCount: number | null;
  reviewedAmountNearDateTransactionCount: number | null;
  reviewedAmountNearDateUniqueTransactionCount: number | null;
  reviewedAmountNearDateMultipleTransactionCount: number | null;
  noReviewedAmountMatchTransactionCount: number | null;
  nearDateStateCounts: Array<{ state: ReviewedDocumentAmountState; count: number }> | null;
  examples: Array<{
    bankTransactionId: number;
    bankText: string;
    bankAmount: string;
    bankDate: string | null;
    matches: Array<{
      documentId: number;
      receiptId: number;
      merchantName: string | null;
      documentType: string | null;
      totalAmount: number;
      effectiveDate: string | null;
      eligibility: "ELIGIBLE" | "INELIGIBLE" | "SEPARATE_SCHEDULE_FLOW" | "NOT_EVALUATED";
      reasonCodes: string[];
    }>;
  }> | null;
};

export type AccountDiagnosticSnapshot = DiagnosticSnapshot & {
  source: Pick<BankDiagnosticSource, "readConsistency" | "issues" | "confirmationRecords" | "allocations" | "eventStatuses"> & {
    materializationObservations: MaterializationSourceObservations;
    reconciliationFlowObservations: ReconciliationFlowSourceObservations;
    reviewedDocumentAmountObservations: ReviewedDocumentAmountObservations;
  };
};

function buildMaterializationSourceObservations(
  source: BankDiagnosticSource,
  snapshot: DiagnosticSnapshot,
): MaterializationSourceObservations {
  const availability = source.input.documents.availability;
  if (availability !== "AVAILABLE") {
    return {
      availability,
      unsupportedDocumentTypes: null,
      invoiceLinkCountsNotOne: null,
      invoiceLinkZeroContexts: null,
    };
  }

  const sourceById = new Map(source.input.documents.rows.map((document) => [document.id, document]));
  const rawDocumentById = new Map(source.sourceObservations.documents.map((document) => [document.id, document]));
  const reviewed = snapshot.companyDocumentInventory.documents.filter((document) => document.reviewedAt !== null);

  const unsupported = new Map<string | null, number>();
  const invoiceCounts = new Map<number, number>();
  const invoiceZeroContexts = new Map<string, {
    documentType: string | null;
    merchantName: string | null;
    count: number;
  }>();

  for (const diagnostic of reviewed) {
    if (diagnostic.documentId === null) continue;
    const document = sourceById.get(diagnostic.documentId);
    if (!document) continue;

    if (diagnostic.materialization.reasons.some((reason) => reason.code === "DOCUMENT_TYPE_UNSUPPORTED")) {
      const type = document.documentType?.trim() || null;
      unsupported.set(type, (unsupported.get(type) ?? 0) + 1);
    }
    if (diagnostic.materialization.reasons.some((reason) => reason.code === "INVOICE_LINK_COUNT_NOT_ONE")) {
      const invoiceLinkCount = document.entityLinks.filter(({ entity }) => entity.entityType === "INVOICE").length;
      invoiceCounts.set(invoiceLinkCount, (invoiceCounts.get(invoiceLinkCount) ?? 0) + 1);

      if (invoiceLinkCount === 0) {
        const rawDocument = rawDocumentById.get(diagnostic.documentId);
        const documentType = rawDocument?.documentType?.trim() || document.documentType?.trim() || null;
        const merchantName = rawDocument?.merchantName?.trim() || null;
        const key = `${documentType ?? ""}\u0000${merchantName ?? ""}`;
        const current = invoiceZeroContexts.get(key);
        if (current) current.count += 1;
        else invoiceZeroContexts.set(key, { documentType, merchantName, count: 1 });
      }
    }
  }

  return {
    availability,
    unsupportedDocumentTypes: [...unsupported]
      .map(([documentType, count]) => ({ documentType, count }))
      .sort((a, b) => b.count - a.count || (a.documentType ?? "").localeCompare(b.documentType ?? "")),
    invoiceLinkCountsNotOne: [...invoiceCounts]
      .map(([invoiceLinkCount, count]) => ({ invoiceLinkCount, count }))
      .sort((a, b) => a.invoiceLinkCount - b.invoiceLinkCount),
    invoiceLinkZeroContexts: [...invoiceZeroContexts.values()]
      .sort((a, b) => b.count - a.count || (a.merchantName ?? "").localeCompare(b.merchantName ?? "") ||
        (a.documentType ?? "").localeCompare(b.documentType ?? "")),
  };
}

function isAmountMismatchNoCandidateRow(
  row: DiagnosticSnapshot["transactions"][number],
) {
  if (row.overall.candidateTargetCount !== 0 || row.confirmed.state !== "NONE") return false;
  if (row.booking.availability !== "AVAILABLE" || row.events.availability !== "AVAILABLE") return false;

  const bookingEligible = row.booking.eligibleRowCount ?? 0;
  const eventEligible = row.events.eligibleEventCount ?? 0;
  if (bookingEligible === 0 && eventEligible === 0) return false;

  const bookingAmount = row.booking.signedAmountMatchingRowCount ?? 0;
  const eventAmount = row.events.amountCompatibleCount ?? 0;
  return bookingAmount === 0 && eventAmount === 0;
}

function absDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed.abs() : null;
  } catch {
    return null;
  }
}

function dateDistanceDays(left: string | null, right: Date | null) {
  if (!left || !right) return null;
  const leftTime = new Date(left).getTime();
  const rightTime = right.getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function strongestReviewedDocumentState(
  matches: Array<DiagnosticSnapshot["companyDocumentInventory"]["documents"][number]>,
): ReviewedDocumentAmountState {
  if (matches.some((document) => document.materialization.eligibility === "ELIGIBLE")) return "ELIGIBLE";
  if (matches.some((document) => document.materialization.eligibility === "SEPARATE_SCHEDULE_FLOW")) {
    return "SEPARATE_SCHEDULE_FLOW";
  }
  const reasonPriority: Array<[string, ReviewedDocumentAmountState]> = [
    ["DOCUMENT_TYPE_UNSUPPORTED", "DOCUMENT_TYPE_UNSUPPORTED"],
    ["INVOICE_LINK_COUNT_NOT_ONE", "INVOICE_LINK_COUNT_NOT_ONE"],
    ["DOCUMENT_ROLE_INELIGIBLE", "DOCUMENT_ROLE_INELIGIBLE"],
    ["MANUAL_CLASSIFICATION_EXCLUDED", "MANUAL_CLASSIFICATION_EXCLUDED"],
  ];
  for (const [reasonCode, state] of reasonPriority) {
    if (matches.some((document) =>
      document.materialization.reasons.some((reason) => reason.code === reasonCode))) return state;
  }
  return "OTHER_INELIGIBLE";
}

function buildReviewedDocumentAmountObservations(
  source: BankDiagnosticSource,
  snapshot: DiagnosticSnapshot,
): ReviewedDocumentAmountObservations {
  const availability = source.input.documents.availability;
  const amountMismatchRows = snapshot.transactions.filter(isAmountMismatchNoCandidateRow);
  if (availability !== "AVAILABLE") {
    return {
      availability,
      amountMismatchNoCandidateCount: amountMismatchRows.length,
      reviewedAmountMatchTransactionCount: null,
      reviewedAmountNearDateTransactionCount: null,
      reviewedAmountNearDateUniqueTransactionCount: null,
      reviewedAmountNearDateMultipleTransactionCount: null,
      noReviewedAmountMatchTransactionCount: null,
      nearDateStateCounts: null,
      examples: null,
    };
  }

  const rawDocumentById = new Map(source.sourceObservations.documents.map((document) => [document.id, document]));
  const diagnosticDocumentById = new Map(
    snapshot.companyDocumentInventory.documents
      .filter((document) => document.documentId !== null)
      .map((document) => [document.documentId!, document]),
  );
  const reviewedDocuments = source.input.documents.rows.filter((document) => document.reviewedAt !== null);

  let reviewedAmountMatchTransactionCount = 0;
  let reviewedAmountNearDateTransactionCount = 0;
  let reviewedAmountNearDateUniqueTransactionCount = 0;
  let reviewedAmountNearDateMultipleTransactionCount = 0;
  const stateCounts = new Map<ReviewedDocumentAmountState, number>();
  const examples: NonNullable<ReviewedDocumentAmountObservations["examples"]> = [];

  for (const row of amountMismatchRows) {
    const bankAmount = absDecimal(row.bank.amount);
    if (!bankAmount || bankAmount.isZero()) continue;

    const amountMatches = reviewedDocuments.filter((document) => {
      const documentAmount = absDecimal(document.totalAmount ?? null);
      return documentAmount !== null && !documentAmount.isZero() && documentAmount.eq(bankAmount);
    });
    if (!amountMatches.length) continue;
    reviewedAmountMatchTransactionCount += 1;

    const nearDateMatches = amountMatches.filter((document) => {
      const rawDocument = rawDocumentById.get(document.id);
      const distance = dateDistanceDays(row.bank.date, rawDocument?.effectiveDate ?? null);
      return distance !== null && distance <= 30;
    });
    if (!nearDateMatches.length) continue;

    reviewedAmountNearDateTransactionCount += 1;
    if (nearDateMatches.length === 1) reviewedAmountNearDateUniqueTransactionCount += 1;
    else reviewedAmountNearDateMultipleTransactionCount += 1;

    const diagnosticMatches = nearDateMatches
      .map((document) => diagnosticDocumentById.get(document.id))
      .filter((document): document is NonNullable<typeof document> => Boolean(document));
    if (diagnosticMatches.length) {
      const state = strongestReviewedDocumentState(diagnosticMatches);
      stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    }

    if (examples.length < 12) {
      examples.push({
        bankTransactionId: row.bank.bankTransactionId,
        bankText: source.sourceObservations.banks.find((bank) => bank.id === row.bank.bankTransactionId)?.text ?? "",
        bankAmount: row.bank.amount,
        bankDate: row.bank.date,
        matches: nearDateMatches.slice(0, 3).map((document) => {
          const rawDocument = rawDocumentById.get(document.id);
          const diagnostic = diagnosticDocumentById.get(document.id);
          return {
            documentId: document.id,
            receiptId: document.receiptId,
            merchantName: rawDocument?.merchantName ?? null,
            documentType: document.documentType,
            totalAmount: document.totalAmount ?? 0,
            effectiveDate: rawDocument?.effectiveDate?.toISOString() ?? null,
            eligibility: diagnostic?.materialization.eligibility ?? "NOT_EVALUATED",
            reasonCodes: diagnostic?.materialization.reasons.map((reason) => reason.code) ?? [],
          };
        }),
      });
    }
  }

  const order: ReviewedDocumentAmountState[] = [
    "ELIGIBLE",
    "SEPARATE_SCHEDULE_FLOW",
    "DOCUMENT_TYPE_UNSUPPORTED",
    "INVOICE_LINK_COUNT_NOT_ONE",
    "DOCUMENT_ROLE_INELIGIBLE",
    "MANUAL_CLASSIFICATION_EXCLUDED",
    "OTHER_INELIGIBLE",
  ];

  return {
    availability,
    amountMismatchNoCandidateCount: amountMismatchRows.length,
    reviewedAmountMatchTransactionCount,
    reviewedAmountNearDateTransactionCount,
    reviewedAmountNearDateUniqueTransactionCount,
    reviewedAmountNearDateMultipleTransactionCount,
    noReviewedAmountMatchTransactionCount: amountMismatchRows.length - reviewedAmountMatchTransactionCount,
    nearDateStateCounts: order
      .map((state) => ({ state, count: stateCounts.get(state) ?? 0 }))
      .filter((row) => row.count > 0),
    examples,
  };
}

function buildReconciliationFlowSourceObservations(
  source: BankDiagnosticSource,
  snapshot: DiagnosticSnapshot,
): ReconciliationFlowSourceObservations {
  const sourceBankById = new Map(source.sourceObservations.banks.map((bank) => [bank.id, bank]));
  const counts = new Map<BankFlowObservationCode, number>();
  let amountMismatchNoCandidateCount = 0;

  for (const row of snapshot.transactions) {
    if (!isAmountMismatchNoCandidateRow(row)) continue;

    amountMismatchNoCandidateCount += 1;
    const bank = sourceBankById.get(row.bank.bankTransactionId);
    const flow = bank
      ? classifyBankReconciliationFlow(bank).kind
      : "UNKNOWN";
    counts.set(flow, (counts.get(flow) ?? 0) + 1);
  }

  const order: BankFlowObservationCode[] = [
    "BANK_FEE",
    "INTEREST",
    "REVERSAL",
    "CARD_PURCHASE",
    "CARD_ACCOUNT_MOVEMENT",
    "TRANSFER",
    "LOAN_PAYMENT",
    "UNKNOWN",
  ];

  return {
    amountMismatchNoCandidateCount,
    amountMismatchFlowHints: order
      .map((flow) => ({ flow, count: counts.get(flow) ?? 0 }))
      .filter((row) => row.count > 0),
  };
}

/** Pure orchestration. Overall states and all totals belong exclusively to v3. */
export function buildBankDiagnosticSnapshotFromSource(source: BankDiagnosticSource): AccountDiagnosticSnapshot {
  const snapshot = buildBankDiagnostics(source.input);
  const reasons: Reason[] = [...snapshot.integrity.reasons];
  for (const { code } of source.issues) if (!reasons.some(r => r.code === code)) {
    reasons.push({ code, ...REASONS[code], source: null, target: null });
  }
  const materializationObservations = buildMaterializationSourceObservations(source, snapshot);
  const reconciliationFlowObservations = buildReconciliationFlowSourceObservations(source, snapshot);
  const reviewedDocumentAmountObservations = buildReviewedDocumentAmountObservations(source, snapshot);
  return { ...snapshot,
    completeness: source.issues.length ? "PARTIAL" : snapshot.completeness,
    integrity: reasons.length ? { state: "ERROR", reasons } : snapshot.integrity,
    source: { readConsistency: source.readConsistency, issues: source.issues,
      confirmationRecords: source.confirmationRecords, allocations: source.allocations, eventStatuses: source.eventStatuses,
      materializationObservations, reconciliationFlowObservations, reviewedDocumentAmountObservations },
  };
}
