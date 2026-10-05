import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewedDocumentMatchDiagnostics } from "./reviewed-document-match-diagnostics";
import type { ReviewedDocumentCandidateInput } from "./reviewed-document-provider";

function document(overrides: Partial<ReviewedDocumentCandidateInput> = {}): ReviewedDocumentCandidateInput {
  return {
    documentId: 1,
    receiptId: 10,
    reviewedAt: new Date("2026-06-01T10:00:00.000Z"),
    effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "BOOKABLE",
    totalAmount: 2503,
    merchantName: "Olís",
    merchantKennitala: null,
    receiptNumber: null,
    invoiceIdentifiers: [],
    partyAliases: ["Olís"],
    hasPrimaryFinancialEvent: false,
    ...overrides,
  };
}

const source = {
  sourceId: 1,
  date: new Date("2026-06-01T00:00:00.000Z"),
  amount: -2503,
  partyText: "OLIS NJARDVIK FITJAR",
};

test("diagnostic explains missing amount before identity analysis", () => {
  const result = buildReviewedDocumentMatchDiagnostics({
    sources: [source],
    documents: [document({ totalAmount: 9999 })],
    resolutions: [],
    partyMode: "CONTAINMENT",
  });
  assert.equal(result.diagnostics[0].reason, "NO_AMOUNT_MATCH");
});

test("diagnostic separates date-window rejection from missing identity", () => {
  const result = buildReviewedDocumentMatchDiagnostics({
    sources: [source],
    documents: [document({ effectiveDate: new Date("2026-07-15T00:00:00.000Z") })],
    resolutions: [],
    partyMode: "CONTAINMENT",
  });
  assert.equal(result.diagnostics[0].reason, "DATE_OUTSIDE_WINDOW");
});

test("same amount and date with unresolved party is visible as identity gap", () => {
  const result = buildReviewedDocumentMatchDiagnostics({
    sources: [{ ...source, partyText: "UNKNOWN MERCHANT" }],
    documents: [document()],
    resolutions: [],
    partyMode: "CONTAINMENT",
  });
  assert.equal(result.diagnostics[0].reason, "IDENTITY_NOT_RESOLVED");
  assert.equal(result.diagnostics[0].amountMatchCount, 1);
  assert.equal(result.diagnostics[0].exactDateCount, 1);
});

test("document owned by another confirmed reconciliation is explained as ineligible", () => {
  const result = buildReviewedDocumentMatchDiagnostics({
    sources: [source],
    documents: [{ ...document(), blockedByConfirmedReconciliation: true }],
    resolutions: [],
    partyMode: "CONTAINMENT",
  });
  assert.equal(result.diagnostics[0].reason, "DOCUMENT_INELIGIBLE");
  assert.equal(result.diagnostics[0].confirmedOwnershipCount, 1);
});

test("existing resolution wins over diagnostic rejection buckets", () => {
  const result = buildReviewedDocumentMatchDiagnostics({
    sources: [source],
    documents: [document()],
    resolutions: [{ sourceId: 1, state: "UNIQUE_STRONG", candidateDocumentIds: [1] }],
    partyMode: "CONTAINMENT",
  });
  assert.equal(result.diagnostics[0].reason, "CANDIDATE_FOUND");
});
