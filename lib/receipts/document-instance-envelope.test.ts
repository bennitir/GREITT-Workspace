import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_INSTANCE_IDENTITY_VERSION } from "./document-instance-identity";
import { ENVELOPE_KEY, ENVELOPE_VERSION, attachDocumentIdentityAudit as attach,
  documentIdentityEvidenceDigest as digest, parseDocumentIdentityEnvelope as parse,
  planDocumentIdentityTransition as plan, readCurrentConfirmedDocumentIdentity as read,
  type IdentityCandidate, type IdentityContext, type IdentityEvidence, type IdentityAuditRecord } from "./document-instance-envelope";

function fixture() {
  const candidate: IdentityCandidate = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION, companyId: 8, receiptId: 101, documentId: 100,
    obligation: { companyId: 8, entityId: 42 }, reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: { kind: "PRINTED_INSTALLMENT_SEQUENCE", sequenceText: "16", totalText: "480",
      provenance: { origin: "ORIGINAL_DOCUMENT", receiptId: 101, documentId: 100, pageNumber: 1, fieldLabel: "Gjaldagi" } },
  };
  const evidence: IdentityEvidence = { sourceFileHash: "a".repeat(64), verbatimText: "Gjaldagi 16 af 480", bindingRevision: "binding-1" };
  const context: IdentityContext = { companyId: 8, receiptId: 101, documentId: 100, obligationEntityId: 42,
    bindingRevision: "binding-1", sourceFileHash: evidence.sourceFileHash, verifiedEvidenceDigest: digest(candidate, evidence) };
  const base = { actorUserId: 3, requestId: "request-1", occurredAt: "2026-10-01T12:00:00Z", context };
  const metadata = { canonicalExtraction: { loanInfo: { loanNumber: "0142-338379" } }, unrelated: { values: [null, false, 12, "keep"] } };
  const proposed = plan({ ...base, metadata, previousAudit: null, expectedRevision: 0, expectedEvidenceDigest: null,
    command: { kind: "PROPOSE", candidate, evidence } });
  const proposedAudit: IdentityAuditRecord = { id: 1, ...proposed.audit };
  const proposedMetadata = attach(proposed, proposedAudit);
  const confirmArgs = { ...base, requestId: "request-2", metadata: proposedMetadata, previousAudit: proposedAudit,
    expectedRevision: 1, expectedEvidenceDigest: context.verifiedEvidenceDigest, command: { kind: "CONFIRM" as const } };
  const confirmed = plan(confirmArgs);
  const confirmedAudit: IdentityAuditRecord = { id: 2, ...confirmed.audit };
  const confirmedMetadata = attach(confirmed, confirmedAudit);
  return { candidate, evidence, context, base, metadata, proposed, proposedAudit, proposedMetadata,
    confirmArgs, confirmed, confirmedAudit, confirmedMetadata };
}

test("versioned envelope goes from proposal to confirmed using actual audit references", () => {
  const f = fixture();
  const p = parse(f.proposedMetadata), c = parse(f.confirmedMetadata);
  assert.ok(p.ok && c.ok);
  assert.equal(p.envelope.envelopeVersion, ENVELOPE_VERSION);
  assert.equal(p.envelope.state, "PROPOSED"); assert.equal(p.envelope.confirmedIdentity, null);
  assert.equal(c.envelope.revision, 2); assert.equal(c.envelope.lastAuditEventId, 2);
  assert.equal(c.envelope.confirmationAuditEventId, 2);
  const result = read(f.confirmedMetadata, f.context, f.confirmedAudit);
  assert.ok(result.ok); assert.equal(result.identity.instance.sequenceText, "16");
});
test("proposal is never current-confirmed even with verified evidence", () => {
  const f = fixture();
  assert.deepEqual(read(f.proposedMetadata, f.context, f.proposedAudit), { ok: false, code: "NOT_CONFIRMED" });
});
test("absent, malformed and unsupported versions fail closed without replacing metadata", () => {
  const f = fixture();
  for (const metadata of [null, {}]) assert.deepEqual(parse(metadata), { ok: false, code: "ABSENT" });
  for (const metadata of [[], "bad", { invalid: undefined }]) assert.deepEqual(parse(metadata), { ok: false, code: "INVALID_METADATA" });
  assert.deepEqual(parse({ [ENVELOPE_KEY]: { envelopeVersion: "future-v2" } }), { ok: false, code: "UNSUPPORTED_VERSION" });
  assert.deepEqual(parse({ [ENVELOPE_KEY]: { envelopeVersion: ENVELOPE_VERSION } }), { ok: false, code: "INVALID_ENVELOPE" });
  assert.throws(() => plan({ ...f.confirmArgs, metadata: { [ENVELOPE_KEY]: { envelopeVersion: "future-v2" } } }), /UNSUPPORTED_VERSION/);
});
test("confirmation requires current server-verified source, binding and evidence", () => {
  const f = fixture();
  for (const patch of [{ sourceFileHash: "b".repeat(64) }, { sourceFileHash: null }, { bindingRevision: "binding-2" },
    { obligationEntityId: 43 }, { verifiedEvidenceDigest: null }, { verifiedEvidenceDigest: "b".repeat(64) }]) {
    const context = { ...f.context, ...patch };
    assert.throws(() => plan({ ...f.confirmArgs, context }), /STALE_EVIDENCE/);
    assert.deepEqual(read(f.confirmedMetadata, context, f.confirmedAudit), { ok: false, code: "STALE_EVIDENCE" });
  }
});
test("company/document/receipt mismatch is rejected by reader and transition planner", () => {
  const f = fixture();
  for (const patch of [{ companyId: 9 }, { receiptId: 999 }, { documentId: 999 }]) {
    const context = { ...f.context, ...patch };
    assert.deepEqual(read(f.confirmedMetadata, context, f.confirmedAudit), { ok: false, code: "SCOPE_MISMATCH" });
    assert.throws(() => plan({ ...f.confirmArgs, context }), /IDENTITY_SCOPE_OR_AUDIT_MISMATCH/);
  }
});
test("missing or mismatched audit anchor never authenticates metadata", () => {
  const f = fixture();
  for (const audit of [null, { ...f.confirmedAudit, id: 999 }, { ...f.confirmedAudit, companyId: 9 },
    { ...f.confirmedAudit, userId: 99 }, { ...f.confirmedAudit, afterData: f.proposed.audit.afterData }]) {
    assert.deepEqual(read(f.confirmedMetadata, f.context, audit), { ok: false, code: "AUDIT_MISMATCH" });
  }
  assert.throws(() => attach(f.confirmed, { ...f.confirmedAudit, metadata: { ...f.confirmedAudit.metadata, requestId: "other" } }), /IDENTITY_AUDIT_MISMATCH/);
});
test("modified evidence fails digest validation and metadata tampering cannot bypass audit", () => {
  const f = fixture(), metadata = structuredClone(f.confirmedMetadata);
  const envelope = parse(metadata); assert.ok(envelope.ok);
  envelope.envelope.evidence.verbatimText = "Gjaldagi 17 af 480";
  metadata[ENVELOPE_KEY] = envelope.envelope;
  assert.deepEqual(parse(metadata), { ok: false, code: "INVALID_ENVELOPE" });
  envelope.envelope.evidenceDigest = digest(envelope.envelope.candidate, envelope.envelope.evidence);
  assert.deepEqual(read(metadata, { ...f.context, verifiedEvidenceDigest: envelope.envelope.evidenceDigest }, f.confirmedAudit), { ok: false, code: "AUDIT_MISMATCH" });
});
test("confirmed identity cannot be edited or confirmed in place", () => {
  const f = fixture();
  const args = { ...f.confirmArgs, metadata: f.confirmedMetadata, previousAudit: f.confirmedAudit, expectedRevision: 2 };
  assert.throws(() => plan(args), /IDENTITY_STATE_CONFLICT/);
  assert.throws(() => plan({ ...args, command: { kind: "PROPOSE", candidate: f.candidate, evidence: f.evidence } }), /IDENTITY_REQUIRES_INVALIDATION/);
});
test("binding change invalidates old identity before a new proposal and confirmation", () => {
  const f = fixture();
  const context = { ...f.context, bindingRevision: "binding-2" };
  const invalid = plan({ ...f.confirmArgs, context, metadata: f.confirmedMetadata, previousAudit: f.confirmedAudit,
    expectedRevision: 2, command: { kind: "INVALIDATE", reason: "BINDING_CHANGED" } });
  const audit: IdentityAuditRecord = { id: 3, ...invalid.audit }, metadata = attach(invalid, audit);
  assert.equal(invalid.audit.beforeData?.state, "CONFIRMED");
  assert.equal(invalid.audit.afterData.confirmedIdentity, null);
  assert.equal(invalid.audit.metadata.previousAuditEventId, 2);
  assert.deepEqual(read(metadata, context, audit), { ok: false, code: "NOT_CONFIRMED" });
  assert.throws(() => plan({ ...f.confirmArgs, metadata, previousAudit: audit, expectedRevision: 3 }), /IDENTITY_STATE_CONFLICT/);
  const proposed = plan({ ...f.confirmArgs, context, metadata, previousAudit: audit, expectedRevision: 3,
    command: { kind: "PROPOSE", candidate: f.candidate, evidence: { ...f.evidence, bindingRevision: "binding-2" } } });
  assert.equal(proposed.audit.afterData.revision, 4); assert.equal(proposed.audit.afterData.state, "PROPOSED");
});
test("stale expected revision or evidence rejects retry instead of overwriting state", () => {
  const f = fixture();
  assert.throws(() => plan({ ...f.confirmArgs, expectedRevision: 0 }), /IDENTITY_REVISION_CONFLICT/);
  assert.throws(() => plan({ ...f.confirmArgs, expectedEvidenceDigest: null }), /IDENTITY_REVISION_CONFLICT/);
});
test("merge preserves unrelated extraction metadata and planning/reading never mutate inputs", () => {
  const f = fixture(), before = structuredClone(f);
  const p = plan(f.confirmArgs); const metadata = attach(p, { ...p.audit, id: 5 });
  assert.deepEqual(metadata.canonicalExtraction, f.metadata.canonicalExtraction);
  assert.deepEqual(metadata.unrelated, f.metadata.unrelated);
  const result = read(f.confirmedMetadata, f.context, f.confirmedAudit); assert.ok(result.ok);
  result.identity.instance.sequenceText = "99";
  assert.deepEqual(f, before);
});
test("audit/state plans contain no booking writes for approved or duplicate-marked documents", () => {
  const f = fixture();
  const bookingState = { approvedAt: "2026-01-01", reviewedAt: "2026-01-01", amount: 100, voucherNumber: 12, duplicateMarkedAt: "2026-01-01", entries: [{ credit: 100 }] };
  const before = structuredClone(bookingState); const p = plan(f.confirmArgs);
  assert.deepEqual(Object.keys(p).sort(), ["audit", "metadataBefore"]);
  assert.deepEqual(bookingState, before);
  assert.doesNotMatch(JSON.stringify(p), /approvedAt|reviewedAt|voucherNumber|duplicateMarkedAt/);
});
test("new document ID after re-ingestion does not inherit confirmation", () => {
  const f = fixture();
  assert.deepEqual(read(f.confirmedMetadata, { ...f.context, documentId: 200 }, f.confirmedAudit), { ok: false, code: "SCOPE_MISMATCH" });
});
test("digest is stable across JSON key order and changes with evidence or binding", () => {
  const f = fixture();
  const reordered = { bindingRevision: f.evidence.bindingRevision, verbatimText: f.evidence.verbatimText, sourceFileHash: f.evidence.sourceFileHash };
  assert.equal(digest(f.candidate, f.evidence), digest(f.candidate, reordered));
  assert.notEqual(digest(f.candidate, f.evidence), digest(f.candidate, { ...f.evidence, bindingRevision: "new" }));
});
test("cyclic or non-JSON metadata is rejected without recursion errors", () => {
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const metadata of [cyclic, { nested: { amount: Infinity } }, { date: new Date() }]) {
    assert.deepEqual(parse(metadata), { ok: false, code: "INVALID_METADATA" });
  }
});
