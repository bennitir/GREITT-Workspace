import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_INSTANCE_IDENTITY_VERSION, type ConfirmedDocumentInstanceIdentity } from "./document-instance-identity";
import { DUPLICATE_REASON as R, evaluateDocumentDuplicatePair as pair, evaluateDocumentDuplicateCandidates as evaluate,
  type DuplicateDocumentFacts, type DuplicateCandidateFacts, type ObservedDuplicateReason } from "./document-duplicate-reasons";

function document(sequence = "16", documentId = 100): DuplicateDocumentFacts {
  const identity: ConfirmedDocumentInstanceIdentity = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION, companyId: 8, receiptId: documentId + 1, documentId,
    obligation: { companyId: 8, entityId: 42 }, reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: { kind: "PRINTED_INSTALLMENT_SEQUENCE", sequenceText: sequence, totalText: "480",
      provenance: { origin: "ORIGINAL_DOCUMENT", receiptId: documentId + 1, documentId, pageNumber: 1, fieldLabel: "Gjaldagi" } },
    confirmation: { state: "CONFIRMED", confirmedByUserId: 3 },
  };
  return { companyId: 8, receiptId: documentId + 1, documentId, receiptNumber: "338379",
    identity: { state: "CURRENT_CONFIRMED", value: identity } };
}
const candidate = (d: DuplicateDocumentFacts, observedReasons: ObservedDuplicateReason[] = [R.RECEIPT_NUMBER_MATCH]): DuplicateCandidateFacts =>
  ({ document: d, observedReasons });

test("338379: confirmed 16/480 vs 17/480 replaces generic number reason and dismisses only obligation reason", () => {
  const result = pair(document(), candidate(document("17", 200)));
  assert.equal(result.comparison, "DISTINCT_INSTANCE");
  assert.deepEqual(result.classifiedReasons, [R.OBLIGATION_REFERENCE_MATCH]);
  assert.deepEqual(result.dismissedReasons, [R.OBLIGATION_REFERENCE_MATCH]);
  assert.deepEqual(result.blockingReasons, []); assert.equal(result.blocked, false);
});
test("same 17/480 uploaded again blocks even without number-match evidence", () => {
  const result = pair(document("17"), candidate(document("17", 200), []));
  assert.equal(result.comparison, "SAME_INSTANCE");
  assert.deepEqual(result.blockingReasons, [R.SAME_DOCUMENT_INSTANCE]); assert.equal(result.blocked, true);
});
test("no confirmed number meaning retains legacy generic number block", () => {
  const b = document("17", 200); b.identity = null;
  const result = pair(document(), candidate(b));
  assert.equal(result.comparison, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
  assert.deepEqual(pair(b, candidate(document())).blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
});
test("ordinary invoice number remains blocking; only its number evidence is needed", () => {
  const a = { ...document(), identity: null, receiptNumber: "INV-2026-1" };
  const b = { ...document("17", 200), identity: null, receiptNumber: "INV-2026-1" };
  assert.deepEqual(pair(a, candidate(b)).blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
});
test("DISTINCT cannot dismiss generic number evidence not bound to the confirmed reference", () => {
  const a = document(), b = document("17", 200);
  a.receiptNumber = b.receiptNumber = "INVOICE-OTHER";
  const result = pair(a, candidate(b));
  assert.equal(result.comparison, "DISTINCT_INSTANCE");
  assert.deepEqual(result.blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
});
test("DISTINCT obligation reason plus independent fingerprint still blocks", () => {
  const result = pair(document(), candidate(document("17", 200), [R.RECEIPT_NUMBER_MATCH, R.FINGERPRINT_MATCH]));
  assert.deepEqual(result.dismissedReasons, [R.OBLIGATION_REFERENCE_MATCH]);
  assert.deepEqual(result.blockingReasons, [R.FINGERPRINT_MATCH]); assert.equal(result.blocked, true);
});
test("all other independent duplicate reasons survive DISTINCT", () => {
  for (const reason of [R.MERCHANT_DATE_AMOUNT_MATCH, R.MERCHANT_DATE_MATCH, R.MERCHANT_AMOUNT_MATCH, R.MANUAL_DUPLICATE_MARK]) {
    assert.deepEqual(pair(document(), candidate(document("17", 200), [R.RECEIPT_NUMBER_MATCH, reason])).blockingReasons, [reason]);
  }
});
test("any SAME blocks across all candidate permutations despite DISTINCT elsewhere", () => {
  const candidates = [candidate(document("17", 200)), candidate(document("16", 300)), candidate(document("18", 400))];
  const expected = evaluate(document(), candidates);
  assert.equal(expected.blocked, true);
  for (const order of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    assert.deepEqual(evaluate(document(), order.map(i => candidates[i])), expected);
  }
});
test("stale, invalidated and proposed discovery identities cannot classify or compare", () => {
  for (const state of ["STALE", "INVALIDATED", "PROPOSED"] as const) {
    const b = document("17", 200); b.identity!.state = state;
    const result = pair(document(), candidate(b));
    assert.equal(result.comparison, "INSUFFICIENT_EVIDENCE");
    assert.deepEqual(result.blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
  }
});
test("forged current flag with unconfirmed meaning or mismatched provenance cannot grant exception", () => {
  for (const patch of [{ confirmation: { state: "PROPOSED", confirmedByUserId: 3 } }, { documentId: 999 },
    { reference: { role: "INVOICE_NUMBER", value: "338379" } }]) {
    const b = document("17", 200);
    b.identity!.value = { ...(b.identity!.value as ConfirmedDocumentInstanceIdentity), ...patch };
    assert.deepEqual(pair(document(), candidate(b)).blockingReasons, [R.RECEIPT_NUMBER_MATCH]);
  }
});
test("confirmed obligation meaning with incomparable instances remains blocking", () => {
  const b = document("17", 200);
  (b.identity!.value as ConfirmedDocumentInstanceIdentity).instance.totalText = "360";
  const result = pair(document(), candidate(b));
  assert.equal(result.comparison, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.blockingReasons, [R.OBLIGATION_REFERENCE_MATCH]);
});
test("reason order and repetitions do not affect result or mutate inputs", () => {
  const a = document(), b = candidate(document("17", 200), [R.FINGERPRINT_MATCH, R.RECEIPT_NUMBER_MATCH, R.FINGERPRINT_MATCH]);
  const before = structuredClone([a, b]);
  assert.deepEqual(pair(a, b), pair(a, candidate(b.document, [R.RECEIPT_NUMBER_MATCH, R.FINGERPRINT_MATCH])));
  assert.deepEqual([a, b], before);
});
test("discovery bugs and unknown reason codes fail explicitly instead of dropping evidence", () => {
  const b = candidate(document("17", 200));
  assert.throws(() => evaluate(document(), [b, b]), /DUPLICATE_CANDIDATE_ID/);
  for (const code of ["FUTURE_REASON", R.OBLIGATION_REFERENCE_MATCH, R.SAME_DOCUMENT_INSTANCE]) {
    assert.throws(() => pair(document(), candidate(b.document, [code as ObservedDuplicateReason])), /INVALID_OBSERVED_DUPLICATE_REASON/);
  }
});
