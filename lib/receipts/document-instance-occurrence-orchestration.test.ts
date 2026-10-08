import assert from "node:assert/strict";
import test from "node:test";
import type {
  IdentityCandidate,
  IdentityEvidence,
  parseDocumentIdentityEnvelope,
} from "./document-instance-envelope";
import {
  planDocumentInstanceOccurrencePreparation,
  type DocumentOccurrenceProvider,
} from "./document-instance-occurrence-orchestration";

type Existing = ReturnType<typeof parseDocumentIdentityEnvelope>;
type Context = { kind: "LOAN" | "OTHER" };

const candidate = { companyId: 8 } as IdentityCandidate;
const evidence = { sourceFileHash: "hash" } as IdentityEvidence;
const absent: Existing = { ok: false, code: "ABSENT" };

function provider(
  id: string,
  events: string[],
  applicable = true,
): DocumentOccurrenceProvider<Context> {
  return {
    id,
    isApplicable(ctx) {
      events.push(`${id}:match:${ctx.kind}`);
      return applicable;
    },
    async discover(ctx) {
      events.push(`${id}:discover:${ctx.kind}`);
      return { status: "DISCOVERED", candidate, evidence };
    },
  };
}

function existingEnvelope(
  state: "PROPOSED" | "CONFIRMED" | "INVALIDATED",
): Existing {
  // This tests orchestration over the already-parsed server-side envelope.
  // Envelope structure and audits are validated in their own test suite.
  return {
    ok: true,
    envelope: {
      state,
      revision: 3,
      evidenceDigest: "digest",
    } as Extract<Existing, { ok: true }>["envelope"],
  };
}

test("confirmed identity bypasses all occurrence providers", async () => {
  const events: string[] = [];
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: existingEnvelope("CONFIRMED"),
    context: { kind: "LOAN" },
    providers: [provider("loan", events)],
  });
  assert.deepEqual(result, { status: "CONFIRMED" });
  assert.deepEqual(events, []);
});

test("existing proposal is resumed, never replaced by discovery", async () => {
  const events: string[] = [];
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: existingEnvelope("PROPOSED"),
    context: { kind: "OTHER" },
    providers: [provider("one", events), provider("two", events)],
  });
  assert.deepEqual(result, {
    status: "EXECUTE",
    execution: {
      kind: "EXISTING_PROPOSAL",
      revision: 3,
      evidenceDigest: "digest",
    },
  });
  assert.deepEqual(events, []);
});

test("invalidated and invalid metadata both block discovery", async () => {
  for (const [existing, reason] of [
    [existingEnvelope("INVALIDATED"), "IDENTITY_NOT_PROPOSABLE"],
    [{ ok: false, code: "INVALID_ENVELOPE" } as Existing, "INVALID_ENVELOPE"],
  ] as const) {
    const events: string[] = [];
    const result = await planDocumentInstanceOccurrencePreparation({
      existing,
      context: { kind: "LOAN" },
      providers: [provider("loan", events)],
    });
    assert.deepEqual(result, { status: "UNAVAILABLE", reason });
    assert.deepEqual(events, []);
  }
});

test("no provider owns this occurrence: no proposal is created", async () => {
  const events: string[] = [];
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: absent,
    context: { kind: "OTHER" },
    providers: [provider("loan", events, false)],
  });
  assert.deepEqual(result, { status: "NOT_APPLICABLE" });
  assert.deepEqual(events, ["loan:match:OTHER"]);
});

test("one matching provider supplies evidence to the existing executor", async () => {
  const events: string[] = [];
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: absent,
    context: { kind: "LOAN" },
    providers: [provider("loan", events)],
  });
  assert.deepEqual(result, {
    status: "EXECUTE",
    execution: { kind: "NEW_PROPOSAL", candidate, evidence },
  });
  assert.deepEqual(events, ["loan:match:LOAN", "loan:discover:LOAN"]);
});

test("multiple eligible providers fail closed before evidence discovery", async () => {
  const events: string[] = [];
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: absent,
    context: { kind: "OTHER" },
    providers: [provider("one", events), provider("two", events)],
  });
  assert.deepEqual(result, {
    status: "UNAVAILABLE",
    reason: "AMBIGUOUS_OCCURRENCE_PROVIDER",
  });
  assert.deepEqual(events, ["one:match:OTHER", "two:match:OTHER"]);
});

test("unavailable source evidence never proceeds to proposal", async () => {
  const result = await planDocumentInstanceOccurrencePreparation({
    existing: absent,
    context: { kind: "LOAN" },
    providers: [{
      id: "loan",
      isApplicable: () => true,
      discover: async () => ({
        status: "UNAVAILABLE",
        reason: "TRUSTED_INSTANCE_EVIDENCE_NOT_FOUND",
      }),
    }],
  });
  assert.deepEqual(result, {
    status: "UNAVAILABLE",
    reason: "TRUSTED_INSTANCE_EVIDENCE_NOT_FOUND",
  });
});

test("provider error propagates to fail-closed caller", async () => {
  await assert.rejects(
    planDocumentInstanceOccurrencePreparation({
      existing: absent,
      context: { kind: "LOAN" },
      providers: [{
        id: "loan",
        isApplicable: () => true,
        discover: async () => { throw new Error("ARTIFACT_READ_FAILED"); },
      }],
    }),
    /ARTIFACT_READ_FAILED/,
  );
});
