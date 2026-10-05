import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBankDiagnosticCoverageSnapshot,
  buildCardReviewedDocumentCoverageSnapshot,
} from "./coverage-adapters";
import type { DiagnosticSnapshot } from "./diagnostics-contract";

function cardResolution(
  transactionId: number,
  state: "UNIQUE_STRONG" | "UNIQUE_POSSIBLE" | "AMBIGUOUS",
  documentIds: number[],
) {
  return {
    paymentCardTransactionId: transactionId,
    state,
    candidates: documentIds.map((documentId) => ({ documentId })),
  };
}

test("card coverage keeps mixed-use/informational gaps visible without REQUIRED assessment", () => {
  const snapshot = buildCardReviewedDocumentCoverageSnapshot({
    mode: "INFORMATIONAL",
    transactions: [
      { id: 1, amount: "-2503", status: "UNRECONCILED" },
      { id: 2, amount: "-3812", status: "UNRECONCILED" },
      { id: 3, amount: "100000", status: "UNRECONCILED" },
    ],
    documents: [
      { id: 10, amount: "2503", scope: "IN_SCOPE" },
      { id: 11, amount: "3812", scope: "UNKNOWN" },
    ],
    resolutions: [
      cardResolution(1, "UNIQUE_STRONG", [10]),
    ],
  });

  assert.equal(snapshot.assessment, "NOT_EVALUATED");
  assert.equal(snapshot.source.strongUnconfirmed.count, 1);
  assert.equal(snapshot.source.unresolved.count, 1);
  assert.equal(snapshot.source.unknown.count, 1);
  assert.equal(snapshot.target.strongUnconfirmed.count, 1);
  assert.equal(snapshot.target.unknown.count, 1);
});

test("card coverage marks confirmed pair on both sides and ambiguous candidates fail closed", () => {
  const snapshot = buildCardReviewedDocumentCoverageSnapshot({
    mode: "REQUIRED",
    transactions: [
      { id: 1, amount: "-100", status: "RECONCILED" },
      { id: 2, amount: "-200", status: "UNRECONCILED" },
    ],
    documents: [
      { id: 10, amount: "100", scope: "IN_SCOPE" },
      { id: 20, amount: "200", scope: "IN_SCOPE" },
      { id: 21, amount: "200", scope: "IN_SCOPE" },
    ],
    resolutions: [cardResolution(2, "AMBIGUOUS", [20, 21])],
    confirmedTransactionIds: [1],
    confirmedDocumentIds: [10],
  });

  assert.equal(snapshot.source.confirmed.count, 1);
  assert.equal(snapshot.target.confirmed.count, 1);
  assert.equal(snapshot.source.ambiguous.count, 1);
  assert.equal(snapshot.target.ambiguous.count, 2);
  assert.equal(snapshot.assessment, "OPEN");
});

test("EXCLUDED card context never creates an in-scope completeness denominator", () => {
  const snapshot = buildCardReviewedDocumentCoverageSnapshot({
    mode: "EXCLUDED",
    transactions: [{ id: 1, amount: "-100", status: "UNRECONCILED" }],
    documents: [{ id: 10, amount: "100", scope: "IN_SCOPE" }],
    resolutions: [cardResolution(1, "UNIQUE_STRONG", [10])],
  });

  assert.equal(snapshot.assessment, "EXCLUDED");
  assert.equal(snapshot.source.inScope.count, 0);
  assert.equal(snapshot.target.inScope.count, 0);
  assert.equal(snapshot.source.excluded.count, 1);
  assert.equal(snapshot.target.excluded.count, 1);
});

test("personal and non-document card classifications leave reviewed-document coverage", () => {
  const snapshot = buildCardReviewedDocumentCoverageSnapshot({
    mode: "INFORMATIONAL",
    transactions: [
      { id: 1, amount: "-1750", status: "UNRECONCILED" },
      { id: 2, amount: "-300", status: "UNRECONCILED" },
      { id: 3, amount: "-2503", status: "UNRECONCILED" },
    ],
    documents: [{ id: 10, amount: "2503", scope: "IN_SCOPE" }],
    resolutions: [cardResolution(3, "UNIQUE_STRONG", [10])],
    classifications: [
      { paymentCardTransactionId: 1, classification: "PERSONAL" },
      { paymentCardTransactionId: 2, classification: "NON_DOCUMENT" },
    ],
  });

  assert.equal(snapshot.source.excluded.count, 2);
  assert.equal(snapshot.source.strongUnconfirmed.count, 1);
  assert.equal(snapshot.source.inScope.count, 1);
  assert.equal(snapshot.target.strongUnconfirmed.count, 1);
});

function diagnosticRow(input: {
  id: number;
  amount: string;
  state: DiagnosticSnapshot["transactions"][number]["overall"]["state"];
  strength?: "STRONG" | "POSSIBLE";
  targetId?: number;
  targetType?: "RECEIPT_ENTRY" | "FINANCIAL_EVENT";
  confirmed?: boolean;
}): DiagnosticSnapshot["transactions"][number] {
  const candidate = input.targetId
    ? {
        target: { type: input.targetType ?? "FINANCIAL_EVENT", id: input.targetId },
        strength: input.strength ?? "POSSIBLE",
        mutuallyUniqueStrong: null,
        otherBankCandidateCount: 0,
        confirmation: { state: "NOT_IMPLEMENTED" as const, reasons: [] },
      }
    : null;
  return {
    snapshotId: "test",
    bank: {
      bankTransactionId: input.id,
      companyId: 1,
      bankAccountId: 1,
      amount: input.amount,
      currency: "ISK",
      date: "2026-10-05T00:00:00.000Z",
      reference: null,
      status: input.confirmed ? "RECONCILED" : "UNRECONCILED",
    },
    booking: {
      availability: "AVAILABLE",
      state: null,
      eligibleRowCount: 0,
      signedAmountMatchingRowCount: 0,
      candidateCount: candidate?.target.type === "RECEIPT_ENTRY" ? 1 : 0,
      strongCount: candidate?.target.type === "RECEIPT_ENTRY" && candidate.strength === "STRONG" ? 1 : 0,
      possibleCount: candidate?.target.type === "RECEIPT_ENTRY" && candidate.strength === "POSSIBLE" ? 1 : 0,
      pipeline: [],
      candidates: candidate?.target.type === "RECEIPT_ENTRY" ? [candidate] : [],
      reasons: [],
    },
    events: {
      availability: "AVAILABLE",
      eventCountBeforeFilters: 0,
      eligibleEventCount: 0,
      amountCompatibleCount: 0,
      directionCompatibleCount: 0,
      dateWindowCompatibleCount: 0,
      temporalCompatibleCount: 0,
      candidateCount: candidate?.target.type === "FINANCIAL_EVENT" ? 1 : 0,
      competingCandidateCount: 0,
      sharedTargetCount: 0,
      pipeline: [],
      candidates: candidate?.target.type === "FINANCIAL_EVENT" ? [candidate] : [],
      reasons: [],
    },
    confirmed: {
      availability: "AVAILABLE",
      state: input.confirmed ? "VALID" : "NONE",
      confirmed: input.confirmed ?? null,
      basis: "SUPPLIED_DIAGNOSTIC_FACTS",
      links: input.confirmed && input.targetId
        ? [{
            reconciliationId: 99,
            paymentId: null,
            target: { type: input.targetType ?? "FINANCIAL_EVENT", id: input.targetId },
            state: "VALID",
          }]
        : [],
    },
    documents: { availability: "AVAILABLE", contexts: [] },
    overall: {
      state: input.state,
      coverage: input.targetId ? "EVENT_ONLY" : "NONE",
      candidateTargetCount: input.targetId ? 1 : 0,
      knownBlockedCandidateCount: 0,
      confirmationCheckComplete: false,
    },
  };
}

test("bank diagnostic adapter projects source health without pretending 1:1 target equality", () => {
  const rows = [
    diagnosticRow({ id: 1, amount: "-100", state: "CONFIRMED", targetId: 10, confirmed: true }),
    diagnosticRow({ id: 2, amount: "-200", state: "SINGLE_TARGET_CANDIDATE", targetId: 20, strength: "STRONG" }),
    diagnosticRow({ id: 3, amount: "-300", state: "UNRESOLVED" }),
  ];
  const diagnostic = {
    schemaVersion: "bank-diagnostics-v3",
    ruleVersion: "bank-diagnostics-v3",
    snapshotId: "test",
    capturedAt: "2026-10-05T00:00:00.000Z",
    companyId: 1,
    bankAccountId: 1,
    consistency: "CALLER_SUPPLIED",
    completeness: "COMPLETE",
    integrity: { state: "VALID", reasons: [] },
    total: { transactionCount: 3, absoluteAmountByCurrency: { ISK: "600" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    overall: {} as DiagnosticSnapshot["overall"],
    coverage: {} as DiagnosticSnapshot["coverage"],
    noCandidateInEitherLayer: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "300" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    noCandidateUnconfirmed: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "300" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    bookingEventMatrix: [],
    confirmedCandidateMatrix: [],
    transactions: rows,
    companyDocumentInventory: { scope: "COMPANY", availability: "AVAILABLE", documents: [], countsByEligibility: null },
  } satisfies DiagnosticSnapshot;

  const snapshot = buildBankDiagnosticCoverageSnapshot({
    mode: "INFORMATIONAL",
    diagnostic,
  });

  assert.equal(snapshot.cardinality, "MANY_TO_MANY");
  assert.equal(snapshot.comparison.count.comparability, "NOT_APPLICABLE");
  assert.equal(snapshot.source.confirmed.count, 1);
  assert.equal(snapshot.source.strongUnconfirmed.count, 1);
  assert.equal(snapshot.source.unresolved.count, 1);
  assert.equal(snapshot.target.confirmed.count, 1);
  assert.equal(snapshot.target.strongUnconfirmed.count, 1);
  assert.equal(snapshot.target.total.amountCompleteness, "PARTIAL");
});


test("confirmed personal bank classification removes source and its candidates from coverage", () => {
  const rows = [
    diagnosticRow({ id: 1, amount: "-100", state: "SINGLE_TARGET_CANDIDATE", targetId: 10, strength: "STRONG" }),
    diagnosticRow({ id: 2, amount: "-200", state: "UNRESOLVED" }),
  ];
  const diagnostic = {
    schemaVersion: "bank-diagnostics-v3",
    ruleVersion: "bank-diagnostics-v3",
    snapshotId: "classification-test",
    capturedAt: "2026-10-05T00:00:00.000Z",
    companyId: 1,
    bankAccountId: 1,
    consistency: "CALLER_SUPPLIED",
    completeness: "COMPLETE",
    integrity: { state: "VALID", reasons: [] },
    total: { transactionCount: 2, absoluteAmountByCurrency: { ISK: "300" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    overall: {} as DiagnosticSnapshot["overall"],
    coverage: {} as DiagnosticSnapshot["coverage"],
    noCandidateInEitherLayer: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "200" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    noCandidateUnconfirmed: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "200" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    bookingEventMatrix: [],
    confirmedCandidateMatrix: [],
    transactions: rows,
    companyDocumentInventory: { scope: "COMPANY", availability: "AVAILABLE", documents: [], countsByEligibility: null },
  } satisfies DiagnosticSnapshot;

  const snapshot = buildBankDiagnosticCoverageSnapshot({
    mode: "INFORMATIONAL",
    diagnostic,
    classifications: [{ bankTransactionId: 1, classification: "PERSONAL" }],
  });

  assert.equal(snapshot.source.excluded.count, 1);
  assert.equal(snapshot.source.unresolved.count, 1);
  assert.equal(snapshot.target.total.count, 0);
});

test("non-document classification stays in overall financial reconciliation coverage", () => {
  const rows = [diagnosticRow({ id: 7, amount: "-450", state: "UNRESOLVED" })];
  const diagnostic = {
    schemaVersion: "bank-diagnostics-v3",
    ruleVersion: "bank-diagnostics-v3",
    snapshotId: "non-document-test",
    capturedAt: "2026-10-05T00:00:00.000Z",
    companyId: 1,
    bankAccountId: 1,
    consistency: "CALLER_SUPPLIED",
    completeness: "COMPLETE",
    integrity: { state: "VALID", reasons: [] },
    total: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "450" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    overall: {} as DiagnosticSnapshot["overall"],
    coverage: {} as DiagnosticSnapshot["coverage"],
    noCandidateInEitherLayer: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "450" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    noCandidateUnconfirmed: { transactionCount: 1, absoluteAmountByCurrency: { ISK: "450" }, amountTotals: { completeness: "COMPLETE", excludedTransactionCount: 0 } },
    bookingEventMatrix: [],
    confirmedCandidateMatrix: [],
    transactions: rows,
    companyDocumentInventory: { scope: "COMPANY", availability: "AVAILABLE", documents: [], countsByEligibility: null },
  } satisfies DiagnosticSnapshot;

  const snapshot = buildBankDiagnosticCoverageSnapshot({
    mode: "INFORMATIONAL",
    diagnostic,
    classifications: [{ bankTransactionId: 7, classification: "NON_DOCUMENT" }],
  });

  assert.equal(snapshot.source.excluded.count, 0);
  assert.equal(snapshot.source.unresolved.count, 1);
});
