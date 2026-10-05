import assert from "node:assert/strict";
import test from "node:test";
import {
  materializeCanonicalReviewedDocuments,
  type ReviewedDocumentReadRow,
} from "./reviewed-document-read-model";

function row(overrides: Partial<ReviewedDocumentReadRow> = {}): ReviewedDocumentReadRow {
  return {
    id: 1,
    receiptId: 308,
    reviewedAt: new Date("2026-05-20T10:00:00.000Z"),
    date: new Date("2026-05-19T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "BOOKABLE",
    totalAmount: 4350,
    receiptNumber: null,
    merchantName: "Pítan",
    merchantKennitala: null,
    pageNumber: 10,
    documentFingerprint: "doc-1",
    classificationSource: "RECEIPT_ANALYSIS",
    duplicateMarkedAt: null,
    disposedAt: null,
    disposition: null,
    entityLinks: [
      {
        role: "ISSUER",
        entity: {
          id: 55,
          entityType: "ORGANIZATION",
          name: "Veitingarekstur Suðurlands ehf.",
          identifierType: "KENNITALA",
          identifierValue: "1234567890",
        },
      },
    ],
    financialEventLinks: [],
    ...overrides,
  };
}

test("same canonical issuer shares company-local trading aliases across reviewed documents", () => {
  const documents = materializeCanonicalReviewedDocuments([
    row(),
    row({
      id: 2,
      merchantName: "Bílabraut ehf / Salatbarinn",
      documentFingerprint: "doc-2",
    }),
  ]);

  assert.equal(documents.length, 2);
  assert.deepEqual(new Set(documents[0].partyAliases), new Set([
    "Bílabraut ehf / Salatbarinn",
    "Pítan",
    "Veitingarekstur Suðurlands ehf.",
  ]));
  assert.equal(documents[0].merchantKennitala, "1234567890");
  assert.deepEqual(documents[0].canonicalPartyEntityIds, [55]);
});

test("canonical read model never needs parent Receipt merchant/date fallback", () => {
  const documents = materializeCanonicalReviewedDocuments([
    row({ id: 3, date: null, merchantName: null, entityLinks: [] }),
  ]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].effectiveDate, null);
  assert.equal(documents[0].merchantName, null);
  assert.deepEqual(documents[0].partyAliases, []);
});

test("duplicate and disposed documents are excluded before both bank and card matching", () => {
  const documents = materializeCanonicalReviewedDocuments([
    row({ id: 4, duplicateMarkedAt: new Date("2026-05-20T00:00:00.000Z") }),
    row({ id: 5, disposedAt: new Date("2026-05-20T00:00:00.000Z") }),
    row({ id: 6, disposition: "DUPLICATE_RESOLVED" }),
  ]);
  assert.equal(documents.length, 0);
});

test("single-document legacy container fallback is allowed but multi-document fallback is blocked", () => {
  const single = materializeCanonicalReviewedDocuments([
    row({
      id: 7,
      date: null,
      merchantName: null,
      entityLinks: [],
      container: {
        detectedDocumentCount: 1,
        date: new Date("2026-05-19T00:00:00.000Z"),
        aiDate: null,
        merchantName: "Pítan",
        merchantKennitala: null,
      },
    }),
  ])[0];
  assert.equal(single.merchantName, "Pítan");
  assert.equal(single.effectiveDate?.toISOString().slice(0, 10), "2026-05-19");

  const bundle = materializeCanonicalReviewedDocuments([
    row({
      id: 8,
      date: null,
      merchantName: null,
      entityLinks: [],
      container: {
        detectedDocumentCount: 2,
        date: new Date("2026-05-19T00:00:00.000Z"),
        aiDate: null,
        merchantName: "Pítan",
        merchantKennitala: null,
      },
    }),
  ])[0];
  assert.equal(bundle.merchantName, null);
  assert.equal(bundle.effectiveDate, null);
});
