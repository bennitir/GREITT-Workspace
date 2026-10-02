import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "../../app/generated/prisma/client";
import {
  attachDocumentIdentityAudit,
  documentIdentityEvidenceDigest,
  planDocumentIdentityTransition,
  type IdentityAuditRecord,
  type IdentityCandidate,
} from "./document-instance-envelope";
import { DOCUMENT_INSTANCE_IDENTITY_VERSION } from "./document-instance-identity";
import {
  createPrismaDocumentInstanceDependencies,
  createPrismaIdentityTransaction,
} from "./document-instance-prisma";

function fixture() {
  const candidate: IdentityCandidate = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION,
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    obligation: { companyId: 8, entityId: 42 },
    reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: {
      kind: "PRINTED_INSTALLMENT_SEQUENCE",
      sequenceText: "16",
      totalText: "480",
      provenance: {
        origin: "ORIGINAL_DOCUMENT",
        receiptId: 101,
        documentId: 100,
        pageNumber: 1,
        fieldLabel: "Gjaldagi",
      },
    },
  };
  const evidence = {
    sourceFileHash: "a".repeat(64),
    verbatimText: "Gjaldagi 16 af 480",
    bindingRevision: "placeholder",
  };
  return { candidate, evidence };
}

function documentRow(secondConfirmedLoan = false) {
  const link = (id: number, entityId: number) => ({
    id,
    entityId,
    role: "LOAN",
    source: "USER",
    confidence: 1,
    confirmedAt: new Date("2026-10-01T10:00:00Z"),
    confirmedBy: 3,
    createdAt: new Date("2026-10-01T09:00:00Z"),
    entity: {
      id: entityId,
      companyId: 8,
      entityType: "LOAN",
      status: "ACTIVE",
      identifierType: "LOAN_NUMBER",
      identifierValue: `0142-${entityId}`,
      relationshipStatus: "CONFIRMED",
      relationshipType: null,
      relationshipConfirmedAt: new Date("2026-10-01T09:30:00Z"),
      relationshipConfirmedBy: 3,
      updatedAt: new Date("2026-10-01T09:30:00Z"),
    },
  });
  return {
    id: 100,
    receiptId: 101,
    extractionMetadata: { existing: true },
    receipt: { companyId: 8, fileHash: "a".repeat(64) },
    entityLinks: secondConfirmedLoan ? [link(10, 42), link(11, 43)] : [link(10, 42)],
  };
}

function fakeTx(options: {
  row?: ReturnType<typeof documentRow> | null;
  userRole?: string;
  userActive?: boolean;
  accessActive?: boolean;
  canBookEntries?: boolean;
  auditRow?: Record<string, unknown> | null;
  updateCount?: number;
} = {}) {
  const calls: Array<{ model: string; method: string; args: unknown }> = [];
  const tx = {
    async $queryRaw() { return []; },
    user: {
      async findUnique(args: unknown) {
        calls.push({ model: "user", method: "findUnique", args });
        return { role: options.userRole ?? "BOOKKEEPER", isActive: options.userActive ?? true };
      },
    },
    userCompany: {
      async findUnique(args: unknown) {
        calls.push({ model: "userCompany", method: "findUnique", args });
        return { isActive: options.accessActive ?? true, canBookEntries: options.canBookEntries ?? true };
      },
    },
    aiDetectedDocument: {
      async findFirst(args: unknown) {
        calls.push({ model: "aiDetectedDocument", method: "findFirst", args });
        return options.row === undefined ? documentRow() : options.row;
      },
      async updateMany(args: unknown) {
        calls.push({ model: "aiDetectedDocument", method: "updateMany", args });
        return { count: options.updateCount ?? 1 };
      },
    },
    auditEvent: {
      async findFirst(args: unknown) {
        calls.push({ model: "auditEvent", method: "findFirst", args });
        return options.auditRow ?? null;
      },
      async findMany(args: unknown) {
        calls.push({ model: "auditEvent", method: "findMany", args });
        return options.auditRow ? [options.auditRow] : [];
      },
      async create(args: { data: Record<string, unknown>; select: unknown }) {
        calls.push({ model: "auditEvent", method: "create", args });
        return { id: 22, ...args.data };
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

async function confirmedAudit(bindingRevision: string) {
  const { candidate, evidence } = fixture();
  evidence.bindingRevision = bindingRevision;
  const evidenceDigest = documentIdentityEvidenceDigest(candidate, evidence);
  const context = {
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    obligationEntityId: 42,
    bindingRevision,
    sourceFileHash: evidence.sourceFileHash,
    verifiedEvidenceDigest: evidenceDigest,
  };
  const proposed = planDocumentIdentityTransition({
    metadata: null,
    previousAudit: null,
    context,
    expectedRevision: 0,
    expectedEvidenceDigest: null,
    actorUserId: 3,
    requestId: "propose-1",
    occurredAt: "2026-10-01T10:00:00Z",
    command: { kind: "PROPOSE", candidate, evidence },
  });
  const proposedAudit: IdentityAuditRecord = { id: 21, ...proposed.audit };
  const proposedMetadata = attachDocumentIdentityAudit(proposed, proposedAudit);
  const confirmation = planDocumentIdentityTransition({
    metadata: proposedMetadata,
    previousAudit: proposedAudit,
    context,
    expectedRevision: 1,
    expectedEvidenceDigest: evidenceDigest,
    actorUserId: 3,
    requestId: "confirm-1",
    occurredAt: "2026-10-01T11:00:00Z",
    command: { kind: "CONFIRM" },
  });
  return { confirmation, proposedAudit, proposedMetadata, evidenceDigest };
}

test("readDocument is tenant-scoped and derives one confirmed LOAN binding revision", async () => {
  const f = fakeTx();
  const adapter = createPrismaIdentityTransaction(f.tx);
  const first = await adapter.readDocument(8, 100);
  const second = await adapter.readDocument(8, 100);
  assert.ok(first?.binding);
  assert.equal(first.companyId, 8);
  assert.equal(first.receiptId, 101);
  assert.equal(first.documentId, 100);
  assert.equal(first.sourceFileHash, "a".repeat(64));
  assert.equal(first.binding.companyId, 8);
  assert.equal(first.binding.entityId, 42);
  assert.match(first.binding.revision, /^[a-f0-9]{64}$/);
  assert.equal(second?.binding?.revision, first.binding.revision);
  const args = f.calls.find(call => call.model === "aiDetectedDocument" && call.method === "findFirst")!.args as {
    where: unknown;
  };
  assert.deepEqual(args.where, { id: 100, receipt: { companyId: 8 } });
});

test("ambiguous or non-current loan binding fails closed", async () => {
  const ambiguous = fakeTx({ row: documentRow(true) });
  assert.equal((await createPrismaIdentityTransaction(ambiguous.tx).readDocument(8, 100))?.binding, null);

  const inactive = documentRow();
  inactive.entityLinks[0].entity.relationshipStatus = "UNCONFIRMED";
  const f = fakeTx({ row: inactive });
  assert.equal((await createPrismaIdentityTransaction(f.tx).readDocument(8, 100))?.binding, null);
});

test("authorization is active ADMIN or active company user with booking permission", async () => {
  const admin = fakeTx({ userRole: "ADMIN", canBookEntries: false });
  assert.equal(await createPrismaIdentityTransaction(admin.tx).authorizeCompany(3, 8), true);
  assert.equal(admin.calls.filter(call => call.model === "userCompany").length, 0);

  const bookkeeper = fakeTx({ canBookEntries: true });
  assert.equal(await createPrismaIdentityTransaction(bookkeeper.tx).authorizeCompany(3, 8), true);
  const denied = fakeTx({ canBookEntries: false });
  assert.equal(await createPrismaIdentityTransaction(denied.tx).authorizeCompany(3, 8), false);
  const inactive = fakeTx({ userActive: false });
  assert.equal(await createPrismaIdentityTransaction(inactive.tx).authorizeCompany(3, 8), false);
});

test("completed request is reconstructed only from a valid identity audit receipt", async () => {
  const base = fakeTx();
  const doc = await createPrismaIdentityTransaction(base.tx).readDocument(8, 100);
  assert.ok(doc?.binding);
  const { confirmation } = await confirmedAudit(doc.binding.revision);
  const row = { id: 22, ...confirmation.audit };
  const f = fakeTx({ auditRow: row });
  const completed = await createPrismaIdentityTransaction(f.tx).findRequest(8, "confirm-1");
  assert.ok(completed);
  assert.deepEqual(completed.request, {
    companyId: 8,
    documentId: 100,
    requestId: "confirm-1",
    expectedRevision: 1,
    expectedEvidenceDigest: confirmation.audit.beforeData!.evidenceDigest,
    actorUserId: 3,
    operation: { kind: "CONFIRM" },
  });
  const args = f.calls.find(call => call.model === "auditEvent" && call.method === "findMany")!.args as {
    where: unknown; take: number;
  };
  assert.equal(args.take, 2);
  assert.deepEqual(args.where, {
    companyId: 8,
    action: { in: ["DOCUMENT_INSTANCE_IDENTITY_CONFIRMED", "DOCUMENT_INSTANCE_IDENTITY_INVALIDATED"] },
    metadata: { path: ["requestId"], equals: "confirm-1" },
  });
});

test("corrupt persisted request is never treated as absent", async () => {
  const f = fakeTx({ auditRow: {
    id: 22,
    companyId: 8,
    userId: 3,
    entityType: "AiDetectedDocument",
    entityId: 100,
    parentEntityType: "Receipt",
    parentEntityId: 101,
    action: "DOCUMENT_INSTANCE_IDENTITY_CONFIRMED",
    source: "USER",
    beforeData: { revision: 1, evidenceDigest: "bad" },
    afterData: {},
    metadata: { requestId: "confirm-1", occurredAt: "2026-10-01T11:00:00Z", previousAuditEventId: 21, reason: null },
  } });
  await assert.rejects(
    createPrismaIdentityTransaction(f.tx).findRequest(8, "confirm-1"),
    /IDENTITY_REQUEST_AUDIT_MISMATCH/,
  );
});

test("metadata write is one tenant-scoped compare-and-swap on revision and evidence digest", async () => {
  const f = fakeTx();
  const adapter = createPrismaIdentityTransaction(f.tx);
  const result = await adapter.writeMetadata({
    companyId: 8,
    documentId: 100,
    expectedRevision: 1,
    expectedEvidenceDigest: "b".repeat(64),
    extractionMetadata: { documentInstanceIdentity: { revision: 2 } },
  });
  assert.equal(result, true);
  const call = f.calls.find(item => item.model === "aiDetectedDocument" && item.method === "updateMany")!;
  const args = call.args as { where: unknown; data: unknown };
  assert.deepEqual(args.where, {
    id: 100,
    receipt: { companyId: 8 },
    AND: [
      { extractionMetadata: { path: ["documentInstanceIdentity", "revision"], equals: 1 } },
      { extractionMetadata: { path: ["documentInstanceIdentity", "evidenceDigest"], equals: "b".repeat(64) } },
    ],
  });

  const conflict = fakeTx({ updateCount: 0 });
  assert.equal(await createPrismaIdentityTransaction(conflict.tx).writeMetadata({
    companyId: 8,
    documentId: 100,
    expectedRevision: 1,
    expectedEvidenceDigest: "b".repeat(64),
    extractionMetadata: {},
  }), false);
});

test("dependency factory uses exactly one ReadCommitted Prisma transaction", async () => {
  const f = fakeTx();
  let seenOptions: unknown = null;
  let transactionCount = 0;
  const root = {
    user: f.tx.user,
    userCompany: f.tx.userCompany,
    aiDetectedDocument: f.tx.aiDetectedDocument,
    async $transaction(work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) {
      transactionCount += 1;
      seenOptions = options;
      return work(f.tx);
    },
  };
  const deps = createPrismaDocumentInstanceDependencies({
    prisma: root as never,
    authenticatedUserId: async () => 3,
    verifyEvidence: async () => null,
    now: () => "2026-10-02T00:00:00Z",
  });
  const value = await deps.transaction(async tx => {
    assert.equal(await tx.authorizeCompany(3, 8), true);
    return 7;
  }, { isolationLevel: "ReadCommitted" });
  assert.equal(value, 7);
  assert.equal(transactionCount, 1);
  assert.deepEqual(seenOptions, { isolationLevel: "ReadCommitted" });
});
