import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCardReviewedDocumentCandidateGraph,
  cardReviewedDocumentExactSearchKey,
  evaluateCardReviewedDocumentPair,
  materializeCardCanonicalDocument,
  type CardCanonicalDocumentFacts,
  type CardReviewedDocumentInput,
  type ReviewedDocumentCardInput,
} from "./card-reviewed-document-provider";

function card(overrides: Partial<ReviewedDocumentCardInput> = {}): ReviewedDocumentCardInput {
  return {
    id: 501,
    paymentCardId: 7,
    date: new Date("2026-03-09T00:00:00.000Z"),
    merchantText: "OLIS MJODD",
    amount: "-7815",
    sourceRawData: JSON.stringify({ merchantText: "OLIS MJODD" }),
    ...overrides,
  };
}

function document(overrides: Partial<CardReviewedDocumentInput> = {}): CardReviewedDocumentInput {
  return {
    documentId: 601,
    receiptId: 601,
    reviewedAt: new Date("2026-03-10T10:00:00.000Z"),
    effectiveDate: new Date("2026-03-09T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "PRIMARY",
    totalAmount: 7815,
    merchantName: "Olís",
    merchantKennitala: null,
    receiptNumber: null,
    invoiceIdentifiers: [],
    hasPrimaryFinancialEvent: false,
    documentPageNumber: 1,
    documentFingerprint: "fingerprint-601",
    classificationSource: "RECEIPT_ANALYSIS",
    ...overrides,
  };
}

function canonicalFacts(overrides: Partial<CardCanonicalDocumentFacts> = {}): CardCanonicalDocumentFacts {
  return {
    documentId: 601,
    receiptId: 308,
    reviewedAt: new Date("2026-06-02T10:00:00.000Z"),
    date: new Date("2026-06-01T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "PRIMARY",
    totalAmount: 2503,
    merchantName: "Olís",
    merchantKennitala: null,
    receiptNumber: null,
    pageNumber: 12,
    documentFingerprint: "fingerprint-601",
    classificationSource: "RECEIPT_ANALYSIS",
    duplicateMarkedAt: null,
    disposedAt: null,
    disposition: null,
    invoiceIdentifiers: [],
    hasPrimaryFinancialEvent: false,
    ...overrides,
  };
}

test("Visa merchant suffix + exact amount/date produces a unique strong candidate", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph([card()], [document()]);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_STRONG");
  assert.equal(resolutions[0].candidates[0].identityEvidence, "EXACT_PARTY");
  assert.equal(resolutions[0].candidates[0].mutuallyUnique, true);
});

test("same amount/date but wrong merchant fails closed", () => {
  assert.equal(evaluateCardReviewedDocumentPair(
    card({ merchantText: "NOVA" }),
    document({ merchantName: "Olís" }),
  ), null);
});

test("two same-merchant documents with same amount remain ambiguous", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card()],
    [document(), document({ documentId: 602, receiptId: 602, documentPageNumber: 2 })],
  );
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "AMBIGUOUS");
  assert.equal(resolutions[0].candidates.length, 2);
  assert.ok(resolutions[0].candidates.every((candidate) => candidate.strength === "POSSIBLE"));
});

test("more than 30 days never becomes a card/document candidate", () => {
  assert.equal(evaluateCardReviewedDocumentPair(
    card(),
    document({ effectiveDate: new Date("2026-01-01T00:00:00.000Z") }),
  ), null);
});

test("PRIMARY FinancialEvent document is excluded so the event flow owns it", () => {
  assert.equal(evaluateCardReviewedDocumentPair(
    card(),
    document({ hasPrimaryFinancialEvent: true }),
  ), null);
});

test("separated document facts do not inherit merchant/date from sibling Receipt container", () => {
  const real = materializeCardCanonicalDocument(canonicalFacts());
  const siblingWithoutLocalFacts = materializeCardCanonicalDocument(canonicalFacts({
    documentId: 602,
    pageNumber: 13,
    documentFingerprint: "fingerprint-602",
    date: null,
    merchantName: null,
  }));

  assert.ok(real);
  assert.ok(siblingWithoutLocalFacts);

  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      date: new Date("2026-06-01T00:00:00.000Z"),
      merchantText: "OLIS NJARDVIK FITJAR",
      amount: "-2503",
    })],
    [real, siblingWithoutLocalFacts],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_STRONG");
  assert.equal(resolutions[0].candidates.length, 1);
  assert.equal(resolutions[0].candidates[0].documentId, 601);
  assert.equal(resolutions[0].candidates[0].receiptId, 308);
  assert.equal(resolutions[0].candidates[0].documentPageNumber, 12);
});

test("two genuinely separate documents inside the same Receipt remain ambiguous", () => {
  const first = materializeCardCanonicalDocument(canonicalFacts({
    documentId: 601,
    pageNumber: 12,
    documentFingerprint: "fingerprint-601",
  }));
  const second = materializeCardCanonicalDocument(canonicalFacts({
    documentId: 602,
    pageNumber: 37,
    documentFingerprint: "fingerprint-602",
  }));
  assert.ok(first && second);

  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      date: new Date("2026-06-01T00:00:00.000Z"),
      merchantText: "OLIS NJARDVIK FITJAR",
      amount: "-2503",
    })],
    [first, second],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "AMBIGUOUS");
  assert.deepEqual(
    resolutions[0].candidates.map((candidate) => candidate.documentPageNumber),
    [12, 37],
  );
});

test("duplicate-marked and disposed classified documents are not materialized for card matching", () => {
  assert.equal(materializeCardCanonicalDocument(canonicalFacts({
    duplicateMarkedAt: new Date("2026-06-02T00:00:00.000Z"),
  })), null);
  assert.equal(materializeCardCanonicalDocument(canonicalFacts({
    disposedAt: new Date("2026-06-02T00:00:00.000Z"),
  })), null);
  assert.equal(materializeCardCanonicalDocument(canonicalFacts({
    disposition: "DUPLICATE_RESOLVED",
  })), null);
});

test("exact card date dominates same merchant and amount 28 days later", () => {
  const exact = materializeCardCanonicalDocument(canonicalFacts({
    documentId: 601,
    receiptId: 308,
    date: new Date("2026-06-01T00:00:00.000Z"),
    totalAmount: 2503,
    merchantName: "Olís",
    pageNumber: 84,
    documentFingerprint: "olis-2026-06-01-2503",
  }));
  const laterSameAmount = materializeCardCanonicalDocument(canonicalFacts({
    documentId: 602,
    receiptId: 308,
    date: new Date("2026-06-29T00:00:00.000Z"),
    totalAmount: 2503,
    merchantName: "Olís",
    pageNumber: 60,
    documentFingerprint: "olis-2026-06-29-2503",
  }));
  assert.ok(exact && laterSameAmount);

  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 777,
      date: new Date("2026-06-01T00:00:00.000Z"),
      merchantText: "OLIS NJARDVIK FITJAR",
      amount: "-2503",
    })],
    [exact, laterSameAmount],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_STRONG");
  assert.equal(resolutions[0].candidates.length, 1);
  assert.equal(resolutions[0].candidates[0].documentId, 601);
  assert.equal(resolutions[0].candidates[0].dateDistanceDays, 0);
});

test("two exact-date same merchant and amount documents still fail closed as ambiguous", () => {
  const first = document({
    documentId: 701,
    receiptId: 308,
    effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
    totalAmount: 2503,
    merchantName: "Olís",
    documentPageNumber: 84,
  });
  const second = document({
    documentId: 702,
    receiptId: 309,
    effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
    totalAmount: 2503,
    merchantName: "Olís",
    documentPageNumber: 91,
  });

  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 778,
      date: new Date("2026-06-01T00:00:00.000Z"),
      merchantText: "OLIS NJARDVIK FITJAR",
      amount: "-2503",
    })],
    [first, second],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "AMBIGUOUS");
  assert.equal(resolutions[0].candidates.length, 2);
  assert.ok(resolutions[0].candidates.every((candidate) => candidate.dateDistanceDays === 0));
});

test("card merchant can match a canonical company-local trading-name alias", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      merchantText: "PITAN VEITINGAHUS",
      amount: "-7815",
    })],
    [document({
      merchantName: "Veitingarekstur Suðurlands ehf.",
      partyAliases: ["Pítan", "Veitingarekstur Suðurlands ehf."],
      totalAmount: 7815,
    })],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_STRONG");
  assert.equal(resolutions[0].candidates[0].identityEvidence, "EXACT_PARTY");
});


test("exact date + amount surfaces a unique possible match even when merchant identity is unresolved", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 880,
      date: new Date("2026-05-13T00:00:00.000Z"),
      merchantText: "KFC HJALLAHRAUNI",
      amount: "-679",
    })],
    [document({
      documentId: 980,
      receiptId: 533,
      effectiveDate: new Date("2026-05-13T00:00:00.000Z"),
      totalAmount: 679,
      merchantName: "KFC Hafnarfirði",
    })],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_POSSIBLE");
  assert.equal(resolutions[0].candidates.length, 1);
  assert.equal(resolutions[0].candidates[0].identityEvidence, "EXACT_AMOUNT_DATE");
  assert.equal(resolutions[0].candidates[0].providerCode, "CARD_REVIEWED_DOCUMENT_EXACT_AMOUNT_DATE");
  assert.equal(resolutions[0].candidates[0].dateDistanceDays, 0);
});

test("OB/Olís exact date + amount becomes possible instead of disappearing on merchant text", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 881,
      date: new Date("2026-06-01T00:00:00.000Z"),
      merchantText: "OB Njardvik",
      amount: "-13255",
    })],
    [document({
      documentId: 981,
      receiptId: 539,
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      totalAmount: 13255,
      merchantName: "Olís",
    })],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "UNIQUE_POSSIBLE");
  assert.equal(resolutions[0].candidates[0].identityEvidence, "EXACT_AMOUNT_DATE");
});

test("multiple exact date + amount documents remain ambiguous when identity is unresolved", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 882,
      date: new Date("2026-05-13T00:00:00.000Z"),
      merchantText: "UNKNOWN TERMINAL",
      amount: "-679",
    })],
    [
      document({
        documentId: 982,
        receiptId: 533,
        effectiveDate: new Date("2026-05-13T00:00:00.000Z"),
        totalAmount: 679,
        merchantName: "KFC Hafnarfirði",
      }),
      document({
        documentId: 983,
        receiptId: 534,
        effectiveDate: new Date("2026-05-13T00:00:00.000Z"),
        totalAmount: 679,
        merchantName: "Annar söluaðili",
      }),
    ],
  );

  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].state, "AMBIGUOUS");
  assert.equal(resolutions[0].candidates.length, 2);
  assert.ok(resolutions[0].candidates.every((candidate) => candidate.strength === "POSSIBLE"));
});

test("exact amount/date search key ignores payment sign and merchant wording", () => {
  assert.equal(
    cardReviewedDocumentExactSearchKey({
      date: new Date("2026-05-20T18:45:00.000Z"),
      amount: -4645,
    }),
    cardReviewedDocumentExactSearchKey({
      date: new Date("2026-05-20T00:00:00.000Z"),
      amount: "4645.00",
    }),
  );
});

test("PRIMARY FinancialEvent still owns an exact amount/date document", () => {
  const resolutions = buildCardReviewedDocumentCandidateGraph(
    [card({
      id: 883,
      date: new Date("2026-05-20T00:00:00.000Z"),
      merchantText: "PITAN VEITINGAHUS",
      amount: "-4645",
    })],
    [document({
      documentId: 984,
      receiptId: 473,
      effectiveDate: new Date("2026-05-20T00:00:00.000Z"),
      totalAmount: 4645,
      merchantName: "Pítan",
      hasPrimaryFinancialEvent: true,
    })],
  );

  assert.equal(resolutions.length, 0);
});
