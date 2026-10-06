import assert from "node:assert/strict";
import test from "node:test";
import { compareDocumentInstanceIdentity as compare, DOCUMENT_INSTANCE_IDENTITY_VERSION as version,
  INSTANCE_COMPARISON as C, type ConfirmedDocumentInstanceIdentity } from "./document-instance-identity";

function identity(sequenceText = "16", documentId = 100): ConfirmedDocumentInstanceIdentity {
  return {
    version, companyId: 8, receiptId: documentId + 1, documentId,
    obligation: { companyId: 8, entityId: 42 },
    reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: { kind: "PRINTED_INSTALLMENT_SEQUENCE", sequenceText, totalText: "480",
      provenance: { origin: "ORIGINAL_DOCUMENT", receiptId: documentId + 1, documentId, pageNumber: 1, fieldLabel: "Gjaldagi" } },
    confirmation: { state: "CONFIRMED", confirmedByUserId: 3 },
  };
}

test("same obligation, printed 16/480 and 17/480 are distinct regardless of repeated reference", () => {
  assert.equal(compare(identity(), identity("17", 200)), C.DISTINCT_INSTANCE);
});
test("same confirmed instance in different uploads remains the same instance", () => {
  assert.equal(compare(identity(), identity("16", 200)), C.SAME_INSTANCE);
});
test("corrected amount, dates and reference do not manufacture a new instance", () => {
  const a = { ...identity(), amount: 242189, documentDate: "2026-01-01", dueDate: "2026-01-01" };
  const b = { ...identity("16", 200), amount: 244980, documentDate: "2026-02-01", dueDate: "2026-02-01" };
  b.reference.value = "OTHER-REFERENCE";
  assert.equal(compare(a, b), C.SAME_INSTANCE);
});
test("ordinary invoices and date/amount-only records cannot authorize an override", () => {
  const invoice = { companyId: 8, receiptNumber: "338379", amount: 242189, dueDate: "2026-01-01" };
  assert.equal(compare(invoice, { ...invoice, amount: 244980, dueDate: "2026-02-01" }), C.INSUFFICIENT_EVIDENCE);
  assert.equal(compare(identity(), { ...identity("17"), reference: { role: "INVOICE_NUMBER", value: "338379" } }), C.INSUFFICIENT_EVIDENCE);
});
test("different obligations and companies cannot be classified as distinct instances of the same obligation", () => {
  const other = identity("17"); other.obligation.entityId = 43;
  assert.equal(compare(identity(), other), C.INSUFFICIENT_EVIDENCE);
  other.obligation.entityId = 42; other.companyId = other.obligation.companyId = 9;
  assert.equal(compare(identity(), other), C.INSUFFICIENT_EVIDENCE);
});
test("changed schedule total is ambiguous even with different sequence", () => {
  const other = identity("17"); other.instance.totalText = "360";
  assert.equal(compare(identity(), other), C.INSUFFICIENT_EVIDENCE);
});
test("confirmation and trusted provenance are mandatory, not inferred from review or account binding", () => {
  const good = identity("17");
  const invalid: unknown[] = [
    { ...good, confirmation: undefined, reviewedAt: "2026-01-01", accountStatus: "CONFIRMED" },
    { ...good, confirmation: { state: "PROPOSED", confirmedByUserId: 3 } },
    { ...good, confirmation: { state: "CONFIRMED", confirmedByUserId: 0 } },
    { ...good, instance: { ...good.instance, provenance: undefined } },
    ...["INDEX_PLUS_ONE", "DOCUMENT_DATE", "DUE_DATE", "AMOUNT", "AI_INFERENCE"].map(origin => ({
      ...good, instance: { ...good.instance, provenance: { ...good.instance.provenance, origin } },
    })),
  ];
  for (const value of invalid) assert.equal(compare(identity(), value), C.INSUFFICIENT_EVIDENCE);
});

test("reviewed canonical summary provenance is a valid confirmed source class", () => {
  const reviewed = identity("17", 200);
  reviewed.instance.provenance = {
    origin: "REVIEWED_CANONICAL_TEXT",
    sourceField: "summary",
    receiptId: reviewed.receiptId,
    documentId: reviewed.documentId,
    pageNumber: 1,
    fieldLabel: "Gjalddagi",
  };
  assert.equal(compare(identity(), reviewed), C.DISTINCT_INSTANCE);

  const invalid = structuredClone(reviewed) as any;
  invalid.instance.provenance.sourceField = "ocrText";
  assert.equal(compare(identity(), invalid), C.INSUFFICIENT_EVIDENCE);
});
test("provenance must belong to the supplied document and receipt", () => {
  for (const patch of [{ documentId: 999 }, { receiptId: 999 }, { pageNumber: 0 }, { fieldLabel: " " }]) {
    const other = identity("17"); Object.assign(other.instance.provenance, patch);
    assert.equal(compare(identity(), other), C.INSUFFICIENT_EVIDENCE);
  }
});
test("invalid or synthesized numeric fields fail closed", () => {
  for (const sequenceText of [null, 17, "", "0", "-1", "1.5", "1e1", " 17 ", "481", "9007199254740993"]) {
    const other = identity("17");
    assert.equal(compare(identity(), { ...other, instance: { ...other.instance, sequenceText } }), C.INSUFFICIENT_EVIDENCE);
  }
});
test("missing identity, foreign ownership and unsupported versions fail closed", () => {
  for (const other of [null, undefined, [], {}, { ...identity(), version: "future-v2" },
    { ...identity(), obligation: { companyId: 9, entityId: 42 } },
    { ...identity(), documentId: 0 }, { ...identity(), instance: { kind: "DUE_DATE", value: "2026-01-01" } }]) {
    assert.equal(compare(identity(), other), C.INSUFFICIENT_EVIDENCE);
    assert.equal(compare(other, identity()), C.INSUFFICIENT_EVIDENCE);
  }
});
test("comparison is symmetric, deterministic and does not mutate supplied evidence", () => {
  const a = identity(), b = identity("17", 200), before = structuredClone([a, b]);
  assert.equal(compare(a, b), compare(b, a));
  assert.equal(compare(a, b), compare(a, b));
  assert.deepEqual([a, b], before);
});
