import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewedDocumentCandidateGraph,
  evaluateReviewedDocumentPair,
  type ReviewedDocumentBankInput,
  type ReviewedDocumentCandidateInput,
} from "./reviewed-document-provider";

function bank(overrides: Partial<ReviewedDocumentBankInput> = {}): ReviewedDocumentBankInput {
  return {
    id: 1,
    bankAccountId: 2,
    date: new Date("2026-07-15T00:00:00.000Z"),
    text: "Ríkissjóðsinnheimtur",
    amount: "-10272",
    reference: "BM108949863",
    sourceRawData: JSON.stringify({
      counterparty: "Skatturinn",
      counterpartyKennitala: "5402696029",
      reference: "BM108949863",
    }),
    ...overrides,
  };
}

function document(
  overrides: Partial<ReviewedDocumentCandidateInput> = {},
): ReviewedDocumentCandidateInput {
  return {
    documentId: 175,
    receiptId: 175,
    reviewedAt: new Date("2026-07-01T10:00:00.000Z"),
    effectiveDate: new Date("2026-06-30T00:00:00.000Z"),
    documentType: "PAYMENT_NOTICE",
    documentRole: "PRIMARY",
    totalAmount: 10272,
    merchantName: "Skatturinn",
    merchantKennitala: "540269-6029",
    receiptNumber: "BM108949863",
    invoiceIdentifiers: ["BM108949863"],
    hasPrimaryFinancialEvent: false,
    ...overrides,
  };
}

test("exact reference builds a reviewed-document candidate without materializing anything", () => {
  const candidate = evaluateReviewedDocumentPair(bank(), document());
  assert.ok(candidate);
  assert.equal(candidate.identityEvidence, "EXACT_REFERENCE");
  assert.equal(candidate.evidenceKind, "PAYMENT_NOTICE_EVIDENCE");
  assert.equal(candidate.writeState, "READ_ONLY");
});

test("payment confirmation remains payment evidence, never an obligation", () => {
  const candidate = evaluateReviewedDocumentPair(
    bank({ reference: null }),
    document({
      documentType: "PAYMENT_CONFIRMATION",
      receiptNumber: null,
      invoiceIdentifiers: [],
    }),
  );
  assert.ok(candidate);
  assert.equal(candidate.evidenceKind, "PAYMENT_CONFIRMATION_EVIDENCE");
  assert.equal(candidate.identityEvidence, "EXACT_COUNTERPARTY_KENNITALA");
});

test("amount/date without identity fails closed", () => {
  assert.equal(evaluateReviewedDocumentPair(
    bank({ reference: null, text: "Óþekkt", sourceRawData: null }),
    document({ merchantName: "Skatturinn", merchantKennitala: null, receiptNumber: null, invoiceIdentifiers: [] }),
  ), null);
});

test("documents with a PRIMARY FinancialEvent are excluded from the bridge", () => {
  assert.equal(evaluateReviewedDocumentPair(
    bank(),
    document({ hasPrimaryFinancialEvent: true }),
  ), null);
});

test("date window and absolute amount are mandatory", () => {
  assert.equal(evaluateReviewedDocumentPair(
    bank(),
    document({ effectiveDate: new Date("2026-05-01T00:00:00.000Z") }),
  ), null);
  assert.equal(evaluateReviewedDocumentPair(
    bank(),
    document({ totalAmount: 10271 }),
  ), null);
});

test("mutual uniqueness promotes exact reference/kennitala evidence to UNIQUE_STRONG", () => {
  const resolutions = buildReviewedDocumentCandidateGraph([bank()], [document()]);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_STRONG");
  assert.equal(resolutions[0].candidates[0].mutuallyUnique, true);
  assert.equal(resolutions[0].candidates[0].strength, "STRONG");
});

test("same bank matching multiple reviewed documents stays ambiguous", () => {
  const resolutions = buildReviewedDocumentCandidateGraph(
    [bank()],
    [document(), document({ documentId: 176, receiptId: 176 })],
  );
  assert.equal(resolutions[0].state, "AMBIGUOUS");
  assert.equal(resolutions[0].candidates.length, 2);
  assert.ok(resolutions[0].candidates.every((candidate) => candidate.strength === "POSSIBLE"));
});

test("exact party alone can surface a UNIQUE_POSSIBLE candidate", () => {
  const resolutions = buildReviewedDocumentCandidateGraph(
    [bank({ reference: null, sourceRawData: JSON.stringify({ counterparty: "Skatturinn" }) })],
    [document({ merchantKennitala: null, receiptNumber: null, invoiceIdentifiers: [] })],
  );
  assert.equal(resolutions[0].state, "UNIQUE_POSSIBLE");
  assert.equal(resolutions[0].candidates[0].identityEvidence, "EXACT_PARTY");
});

test("repeated company-specific confirmations can surface a learned party mapping", async () => {
  const {
    buildReviewedDocumentLearningObservation,
    buildReviewedDocumentLearningPatterns,
  } = await import("./reviewed-document-learning");
  const observations = [22, 24].map((dateDistanceDays) => {
    const observation = buildReviewedDocumentLearningObservation({
      bankText: "HS Veitur hf.",
      bankSourceRawData: JSON.stringify({ counterparty: "HS Veitur hf." }),
      bankAmount: "-29755",
      documentMerchantName: "HS Veitur hf. / HS Orka",
      documentType: "ACCOUNTING_DOCUMENT",
      dateDistanceDays,
    });
    assert.ok(observation);
    return { learning: observation };
  });
  const patterns = buildReviewedDocumentLearningPatterns(observations);

  const candidate = evaluateReviewedDocumentPair(
    bank({
      date: new Date("2026-08-24T00:00:00.000Z"),
      text: "HS Veitur hf.",
      amount: "-29755",
      reference: null,
      sourceRawData: JSON.stringify({ counterparty: "HS Veitur hf." }),
    }),
    document({
      documentId: 999,
      receiptId: 999,
      effectiveDate: new Date("2026-07-31T00:00:00.000Z"),
      documentType: "ACCOUNTING_DOCUMENT",
      totalAmount: 29755,
      merchantName: "HS Veitur hf. / HS Orka",
      merchantKennitala: null,
      receiptNumber: null,
      invoiceIdentifiers: [],
    }),
    patterns,
  );
  assert.ok(candidate);
  assert.equal(candidate.identityEvidence, "LEARNED_COMPANY_PATTERN");
  assert.equal(candidate.learningConfirmationCount, 2);
});

test("one prior confirmation is not enough to create a learned candidate", async () => {
  const {
    buildReviewedDocumentLearningObservation,
    buildReviewedDocumentLearningPatterns,
  } = await import("./reviewed-document-learning");
  const observation = buildReviewedDocumentLearningObservation({
    bankText: "HS Veitur hf.",
    bankSourceRawData: JSON.stringify({ counterparty: "HS Veitur hf." }),
    bankAmount: "-29755",
    documentMerchantName: "HS Veitur hf. / HS Orka",
    documentType: "ACCOUNTING_DOCUMENT",
    dateDistanceDays: 24,
  });
  assert.ok(observation);
  const patterns = buildReviewedDocumentLearningPatterns([{ learning: observation }]);

  assert.equal(evaluateReviewedDocumentPair(
    bank({
      date: new Date("2026-08-24T00:00:00.000Z"),
      text: "HS Veitur hf.",
      amount: "-29755",
      reference: null,
      sourceRawData: JSON.stringify({ counterparty: "HS Veitur hf." }),
    }),
    document({
      effectiveDate: new Date("2026-07-31T00:00:00.000Z"),
      documentType: "ACCOUNTING_DOCUMENT",
      totalAmount: 29755,
      merchantName: "HS Veitur hf. / HS Orka",
      merchantKennitala: null,
      receiptNumber: null,
      invoiceIdentifiers: [],
    }),
    patterns,
  ), null);
});

test("canonical party alias can resolve a legal-name document without weakening amount/date rules", () => {
  const candidate = evaluateReviewedDocumentPair(
    bank({
      reference: null,
      text: "Pítan",
      sourceRawData: JSON.stringify({ counterparty: "Pítan" }),
    }),
    document({
      merchantName: "Veitingarekstur Suðurlands ehf.",
      merchantKennitala: null,
      receiptNumber: null,
      invoiceIdentifiers: [],
      partyAliases: ["Pítan", "Veitingarekstur Suðurlands ehf."],
    }),
  );
  assert.ok(candidate);
  assert.equal(candidate.identityEvidence, "EXACT_PARTY");
});
