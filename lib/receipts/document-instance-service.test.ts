import assert from "node:assert/strict";
import test from "node:test";
import { DOCUMENT_INSTANCE_IDENTITY_VERSION } from "./document-instance-identity";
import { attachDocumentIdentityAudit, documentIdentityEvidenceDigest, parseDocumentIdentityEnvelope,
  planDocumentIdentityTransition, type IdentityAuditRecord, type IdentityCandidate } from "./document-instance-envelope";
import { confirmDocumentInstanceIdentity as confirm, invalidateDocumentInstanceIdentity as invalidate,
  DOCUMENT_IDENTITY_LOCK_NAMESPACE, type CompletedIdentityRequest, type IdentityServiceDependencies,
  type IdentityServiceDocument, type IdentityServiceRequest, type IdentityServiceTransaction } from "./document-instance-service";

function fake() {
  const candidate: IdentityCandidate = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION, companyId: 8, receiptId: 101, documentId: 100,
    obligation: { companyId: 8, entityId: 42 }, reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: { kind: "PRINTED_INSTALLMENT_SEQUENCE", sequenceText: "16", totalText: "480",
      provenance: { origin: "ORIGINAL_DOCUMENT", receiptId: 101, documentId: 100, pageNumber: 1, fieldLabel: "Gjaldagi" } },
  };
  const evidence = { sourceFileHash: "a".repeat(64), verbatimText: "Gjaldagi 16 af 480", bindingRevision: "binding-1" };
  const evidenceDigest = documentIdentityEvidenceDigest(candidate, evidence);
  const proposed = planDocumentIdentityTransition({ metadata: { unrelated: { keep: [1, "yes"] } }, previousAudit: null,
    context: { companyId: 8, receiptId: 101, documentId: 100, obligationEntityId: 42, bindingRevision: "binding-1",
      sourceFileHash: evidence.sourceFileHash, verifiedEvidenceDigest: evidenceDigest }, expectedRevision: 0, expectedEvidenceDigest: null,
    actorUserId: 3, requestId: "propose", occurredAt: "2026-10-01T12:00:00Z", command: { kind: "PROPOSE", candidate, evidence } });
  const audit: IdentityAuditRecord = { id: 1, ...proposed.audit };
  const document: IdentityServiceDocument & { approvedAt: string; reviewedAt: string; voucherNumber: number;
    amount: number; entries: { credit: number }[]; duplicateMarkedAt: string } = {
    companyId: 8, receiptId: 101, documentId: 100, extractionMetadata: attachDocumentIdentityAudit(proposed, audit),
    sourceFileHash: evidence.sourceFileHash, binding: { companyId: 8, entityId: 42, revision: "binding-1", confirmed: true },
    approvedAt: "2026-01-01", reviewedAt: "2026-01-01", voucherNumber: 12, amount: 100, entries: [{ credit: 100 }], duplicateMarkedAt: "2026-01-01",
  };
  let state = { document, audits: [audit], requests: [] as CompletedIdentityRequest[] };
  const trace: string[] = [];
  const options = { actor: 3 as number | null, allowed: true, lockedAllowed: true, proof: true,
    auditFails: false, metadataFails: false, casFails: false, commitFails: false, lockFails: false,
    beforeTransaction: (() => {}) as () => void };
  let tail = Promise.resolve();
  let nextTransaction = 0;
  const deps: IdentityServiceDependencies = {
    async authenticatedUserId() { trace.push("session"); return options.actor; },
    async authorizeCompany(actor, company) { trace.push("authorize"); return options.allowed && actor === 3 && company === 8; },
    async readForEvidence(company, id) { trace.push("preflight"); return company === 8 && id === 100 ? structuredClone(state.document) : null; },
    async verifyEvidence() { trace.push("verify"); return options.proof ? { sourceFileHash: evidence.sourceFileHash, evidenceDigest } : null; },
    now() { return "2026-10-01T13:00:00Z"; },
    async transaction(work, transactionOptions) {
      assert.deepEqual(transactionOptions, { isolationLevel: "ReadCommitted" });
      options.beforeTransaction();
      const name = `tx${++nextTransaction}`;
      trace.push(`${name}:begin`);
      let release: (() => void) | null = null;
      let staged: typeof state | null = null;
      const locked = () => { assert.ok(staged, "all authoritative operations require the company lock"); return staged; };
      const tx: IdentityServiceTransaction = {
        async $queryRaw(strings, ...values) {
          trace.push(`${name}:lock-wait`);
          assert.deepEqual([...strings], ["SELECT pg_advisory_xact_lock(", "::integer, ", "::integer)"]);
          assert.deepEqual(values, [DOCUMENT_IDENTITY_LOCK_NAMESPACE, 8]);
          if (options.lockFails) throw new Error("lock failed");
          const previous = tail;
          tail = new Promise<void>(resolve => { release = resolve; });
          await previous;
          staged = structuredClone(state);
          trace.push(`${name}:locked`);
          return [];
        },
        async authorizeCompany(actor, company) { locked(); trace.push(`${name}:authorize`); return options.lockedAllowed && actor === 3 && company === 8; },
        async readDocument(company, id) { trace.push(`${name}:read`); return company === 8 && id === 100 ? structuredClone(locked().document) : null; },
        async findRequest(company, requestId) { trace.push(`${name}:request`); return structuredClone(locked().requests.find(r => r.request.companyId === company && r.request.requestId === requestId) ?? null); },
        async readAudit(company, auditId) { trace.push(`${name}:audit-read`); return structuredClone(locked().audits.find(a => a.companyId === company && a.id === auditId) ?? null); },
        async createAudit(draft, request) {
          trace.push(`${name}:audit-write`); if (options.auditFails) throw new Error("audit failed");
          const data = locked(), record = { id: data.audits.length + 1, ...structuredClone(draft) };
          data.audits.push(record); data.requests.push({ request: structuredClone(request), audit: record }); return record;
        },
        async writeMetadata(input) {
          trace.push(`${name}:metadata-write`);
          assert.deepEqual(Object.keys(input).sort(), ["companyId", "documentId", "expectedEvidenceDigest", "expectedRevision", "extractionMetadata"]);
          if (options.metadataFails) throw new Error("metadata failed");
          const data = locked(), current = parseDocumentIdentityEnvelope(data.document.extractionMetadata);
          if (options.casFails || !current.ok || input.companyId !== data.document.companyId || input.documentId !== data.document.documentId ||
            input.expectedRevision !== current.envelope.revision || input.expectedEvidenceDigest !== current.envelope.evidenceDigest) return false;
          data.document.extractionMetadata = structuredClone(input.extractionMetadata); return true;
        },
      };
      try {
        const result = await work(tx);
        if (options.commitFails) throw new Error("commit failed");
        state = locked(); trace.push(`${name}:commit`); return result;
      } catch (error) { trace.push(`${name}:rollback`); throw error; }
      finally { if (release) (release as () => void)(); }
    },
  };
  const request: IdentityServiceRequest = { companyId: 8, documentId: 100, requestId: "confirm-1", expectedRevision: 1, expectedEvidenceDigest: evidenceDigest };
  return { deps, options, request, trace, state: () => structuredClone(state), mutate: (fn: (data: typeof state) => void) => fn(state) };
}

test("confirmation verifies evidence before locking and reauthorizes/rereads after company lock", async () => {
  const f = fake(); const result = await confirm(f.request, f.deps);
  assert.deepEqual(result, { auditEventId: 2, appliedRevision: 2, transitionState: "CONFIRMED", replay: false });
  assert.ok(f.trace.indexOf("verify") < f.trace.indexOf("tx1:lock-wait"));
  assert.deepEqual(f.trace.slice(f.trace.indexOf("tx1:locked")), ["tx1:locked", "tx1:authorize", "tx1:request", "tx1:read", "tx1:audit-read", "tx1:audit-write", "tx1:metadata-write", "tx1:commit"]);
});
test("anonymous/unauthorized requests cannot read evidence or start transactions", async () => {
  for (const options of [{ actor: null }, { allowed: false }]) {
    const f = fake(); Object.assign(f.options, options); const before = f.state();
    await assert.rejects(confirm(f.request, f.deps), /IDENTITY_FORBIDDEN/);
    assert.ok(!f.trace.includes("preflight")); assert.deepEqual(f.state(), before);
  }
});
test("authorization revoked before transaction prevents authoritative reads and replay", async () => {
  const f = fake(); await confirm(f.request, f.deps); const before = f.state();
  f.options.lockedAllowed = false;
  await assert.rejects(confirm(f.request, f.deps), /IDENTITY_FORBIDDEN/);
  assert.ok(!f.trace.includes("tx2:request")); assert.deepEqual(f.state(), before);
});
test("foreign scoped row or binding cannot be confirmed", async () => {
  for (const foreign of ["document", "binding"] as const) {
    const f = fake(); f.mutate(s => { if (foreign === "document") s.document.companyId = 9; else s.document.binding!.companyId = 9; });
    const before = f.state(); await assert.rejects(confirm(f.request, f.deps), /DOCUMENT_NOT_FOUND_IN_COMPANY|IDENTITY_EVIDENCE_NOT_VERIFIED/);
    assert.deepEqual(f.state(), before);
  }
});
test("client actor/evidence fields are ignored; no proof means no write", async () => {
  const f = fake(); f.options.proof = false;
  await assert.rejects(confirm({ ...f.request, actorUserId: 999, verifiedEvidenceDigest: f.request.expectedEvidenceDigest } as IdentityServiceRequest, f.deps), /IDENTITY_EVIDENCE_NOT_VERIFIED/);
  assert.equal(f.state().audits.length, 1);
});
test("source/binding/evidence changes after preflight fail locked freshness checks", async () => {
  for (const field of ["source", "binding", "revision"] as const) {
    const f = fake(); f.options.beforeTransaction = () => f.mutate(s => {
      if (field === "source") s.document.sourceFileHash = "b".repeat(64);
      else if (field === "binding") s.document.binding!.revision = "binding-2";
      else s.document.receiptId = 999;
    });
    await assert.rejects(confirm(f.request, f.deps), /STALE_EVIDENCE|IDENTITY_EVIDENCE_NOT_VERIFIED/);
    assert.equal(f.state().audits.length, 1);
  }
});
test("stale expected revision and missing authoritative audit cannot write", async () => {
  const f = fake(); await assert.rejects(confirm({ ...f.request, expectedRevision: 2 }, f.deps), /IDENTITY_REVISION_CONFLICT/);
  f.mutate(s => { s.audits = []; });
  await assert.rejects(confirm(f.request, f.deps), /IDENTITY_SCOPE_OR_AUDIT_MISMATCH/);
  assert.equal(f.state().requests.length, 0);
});
for (const failure of ["auditFails", "metadataFails", "casFails", "commitFails", "lockFails"] as const) {
  test(`${failure}: atomic rollback leaves audit, request and metadata unchanged; no fallback`, async () => {
    const f = fake(); f.options[failure] = true; const before = f.state();
    await assert.rejects(confirm(f.request, f.deps)); assert.deepEqual(f.state(), before);
    assert.equal(f.trace.filter(t => t.endsWith(":begin")).length, 1);
  });
}
test("exact retry returns historical operation receipt without new audit or metadata write", async () => {
  const f = fake(); const first = await confirm(f.request, f.deps), before = f.state();
  f.options.proof = false;
  const retry = await confirm(f.request, f.deps);
  assert.deepEqual(retry, { ...first, replay: true }); assert.deepEqual(f.state(), before);
  assert.ok(!f.trace.includes("tx2:metadata-write"));
});
test("same request ID with different payload or operation is a conflict", async () => {
  const f = fake(); await confirm(f.request, f.deps); const before = f.state();
  await assert.rejects(confirm({ ...f.request, expectedRevision: 2 }, f.deps), /IDENTITY_REQUEST_CONFLICT/);
  await assert.rejects(invalidate({ ...f.request, reason: "changed" }, f.deps), /IDENTITY_REQUEST_CONFLICT/);
  assert.deepEqual(f.state(), before);
});
test("invalidation works for stale binding and does not require original evidence availability", async () => {
  const f = fake(); await confirm(f.request, f.deps);
  f.mutate(s => { s.document.binding = null; s.document.sourceFileHash = null; });
  f.options.proof = false;
  const request = { ...f.request, requestId: "invalidate-1", expectedRevision: 2, reason: "SOURCE_OR_BINDING_CHANGED" };
  const result = await invalidate(request, f.deps);
  assert.equal(result.transitionState, "INVALIDATED"); assert.equal(result.appliedRevision, 3);
  const before = f.state(); assert.equal((await invalidate(request, f.deps)).replay, true); assert.deepEqual(f.state(), before);
});
test("confirm/invalidate preserve every booking field and unrelated metadata", async () => {
  const f = fake(); const before = f.state().document;
  await confirm(f.request, f.deps);
  await invalidate({ ...f.request, requestId: "invalidate-1", expectedRevision: 2, reason: "CORRECTION" }, f.deps);
  const { extractionMetadata: _before, ...bookingBefore } = before;
  const { extractionMetadata, ...bookingAfter } = f.state().document;
  assert.deepEqual(bookingAfter, bookingBefore);
  assert.deepEqual((extractionMetadata as Record<string, unknown>).unrelated, { keep: [1, "yes"] });
});
test("concurrent identical requests serialize and create exactly one audit/revision", async () => {
  const f = fake(); const results = await Promise.all([confirm(f.request, f.deps), confirm(f.request, f.deps)]);
  assert.deepEqual(results.map(r => r.replay).sort(), [false, true]);
  assert.equal(f.state().audits.length, 2); assert.equal(f.state().requests.length, 1);
  assert.ok(f.trace.indexOf("tx1:commit") < f.trace.indexOf("tx2:locked"));
});
test("concurrent different requests cannot both confirm the same old revision", async () => {
  const f = fake(); const results = await Promise.allSettled([confirm(f.request, f.deps), confirm({ ...f.request, requestId: "other" }, f.deps)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(f.state().audits.length, 2);
});
test("new confirmation request after invalidation cannot revive an old revision", async () => {
  const f = fake(); await confirm(f.request, f.deps);
  await invalidate({ ...f.request, requestId: "invalidate-1", expectedRevision: 2, reason: "CHANGE" }, f.deps);
  await assert.rejects(confirm({ ...f.request, requestId: "new-confirm", expectedRevision: 3 }, f.deps), /IDENTITY_STATE_CONFLICT/);
  const replay = await confirm(f.request, f.deps); assert.equal(replay.appliedRevision, 2); assert.equal(replay.replay, true);
  assert.equal(parseDocumentIdentityEnvelope(f.state().document.extractionMetadata).ok, true);
});

test("evidence verifier errors fail closed without exposing source details or writing", async () => {
  const f = fake(), before = f.state();
  f.deps.verifyEvidence = async () => { throw new Error("private original document text"); };
  await assert.rejects(confirm(f.request, f.deps), /^Error: IDENTITY_EVIDENCE_NOT_VERIFIED$/);
  assert.deepEqual(f.state(), before);
});

test("a wrong verified evidence digest cannot confirm even with the same source hash", async () => {
  const f = fake(), before = f.state();
  f.deps.verifyEvidence = async () => ({ sourceFileHash: "a".repeat(64), evidenceDigest: "b".repeat(64) });
  await assert.rejects(confirm(f.request, f.deps), /STALE_EVIDENCE/);
  assert.deepEqual(f.state(), before);
});

test("a corrupted idempotency audit cannot grant a successful replay", async () => {
  const f = fake(); await confirm(f.request, f.deps);
  f.mutate(s => { s.requests[0].audit.companyId = 9; });
  const before = f.state();
  await assert.rejects(confirm(f.request, f.deps), /IDENTITY_REQUEST_AUDIT_MISMATCH/);
  assert.deepEqual(f.state(), before);
});
