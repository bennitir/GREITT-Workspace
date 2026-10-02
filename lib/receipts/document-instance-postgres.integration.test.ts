import assert from "node:assert/strict";
import test from "node:test";

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../app/generated/prisma/client";
import {
  ENVELOPE_KEY,
  IDENTITY_AUDIT,
  attachDocumentIdentityAudit,
  documentIdentityEvidenceDigest,
  type IdentityAuditDraft,
  type IdentityCandidate,
  type IdentityEvidence,
} from "./document-instance-envelope";
import {
  createPrismaDocumentInstanceDependencies,
  createPrismaIdentityTransaction,
} from "./document-instance-prisma";
import {
  DOCUMENT_IDENTITY_LOCK_NAMESPACE,
  confirmDocumentInstanceIdentity,
  lockDocumentIdentityCompany,
} from "./document-instance-service";

const TEST_DATABASE_URL = process.env.DOCUMENT_INSTANCE_TEST_DATABASE_URL?.trim() ?? "";
const WRITE_ACK = process.env.DOCUMENT_INSTANCE_TEST_DATABASE_ALLOW_WRITES === "YES_I_KNOW_THIS_IS_TEST";
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.password = "";
    url.username = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

const TESTS_ENABLED = Boolean(TEST_DATABASE_URL) && WRITE_ACK &&
  (!PRODUCTION_DATABASE_URL || normalizedUrl(TEST_DATABASE_URL) !== normalizedUrl(PRODUCTION_DATABASE_URL));
const SKIP_REASON = !TEST_DATABASE_URL
  ? "DOCUMENT_INSTANCE_TEST_DATABASE_URL is not set"
  : !WRITE_ACK
    ? "DOCUMENT_INSTANCE_TEST_DATABASE_ALLOW_WRITES must equal YES_I_KNOW_THIS_IS_TEST"
    : PRODUCTION_DATABASE_URL && normalizedUrl(TEST_DATABASE_URL) === normalizedUrl(PRODUCTION_DATABASE_URL)
      ? "test database must not be the configured application DATABASE_URL"
      : false;

function createClient(): PrismaClient {
  if (!TESTS_ENABLED) throw new Error("DOCUMENT_INSTANCE_TEST_DATABASE_NOT_ENABLED");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

function unique(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function assertTestDatabase(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRaw<Array<{ company_table: string | null; audit_table: string | null }>>`
    SELECT to_regclass('"Company"')::text AS company_table,
           to_regclass('"AuditEvent"')::text AS audit_table
  `;
  assert.equal(rows[0]?.company_table, '"Company"', "test database must contain the GLÖGGT schema");
  assert.equal(rows[0]?.audit_table, '"AuditEvent"', "test database must contain the GLÖGGT schema");
}

type Fixture = {
  client: PrismaClient;
  companyId: number;
  userId: number;
  receiptId: number;
  documentId: number;
  sourceFileHash: string;
  evidenceDigest: string;
  expectedRevision: number;
};

async function createFixture(client = createClient()): Promise<Fixture> {
  await assertTestDatabase(client);
  const marker = unique("document-instance-integration");
  const company = await client.company.create({
    data: {
      name: marker,
      kennitala: `${Date.now()}`.slice(-10).padStart(10, "0") + Math.floor(Math.random() * 9),
      address: "Integration test",
      phone: "0000000",
      email: `${marker}@example.invalid`,
      contact: "Integration test",
    },
  });
  const user = await client.user.create({
    data: {
      name: marker,
      email: `${marker}@example.invalid`,
      role: "CLIENT",
      isActive: true,
    },
  });
  await client.userCompany.create({
    data: {
      userId: user.id,
      companyId: company.id,
      isActive: true,
      canBookEntries: true,
    },
  });

  const sourceFileHash = "a".repeat(64);
  const receipt = await client.receipt.create({
    data: {
      description: "Document instance integration fixture",
      amount: 0,
      companyId: company.id,
      fileHash: sourceFileHash,
    },
  });
  const document = await client.aiDetectedDocument.create({
    data: {
      summary: "Installment 16 of 480",
      receiptId: receipt.id,
      pageNumber: 1,
    },
  });
  const entity = await client.insightEntity.create({
    data: {
      companyId: company.id,
      entityType: "LOAN",
      name: "Integration loan",
      status: "ACTIVE",
      identifierType: "LOAN_NUMBER",
      identifierValue: "338379",
      relationshipStatus: "CONFIRMED",
      relationshipType: "BORROWER",
      relationshipConfirmedAt: new Date(),
      relationshipConfirmedBy: user.id,
    },
  });
  await client.documentEntityLink.create({
    data: {
      receiptId: receipt.id,
      documentId: document.id,
      entityId: entity.id,
      role: "LOAN",
      source: "USER",
      confirmedAt: new Date(),
      confirmedBy: user.id,
    },
  });

  const snapshot = await createPrismaIdentityTransaction(client as unknown as Prisma.TransactionClient)
    .readDocument(company.id, document.id);
  assert.ok(snapshot?.binding, "fixture must produce exactly one confirmed loan binding");

  const candidate: IdentityCandidate = {
    version: "document-instance-identity-v1",
    companyId: company.id,
    receiptId: receipt.id,
    documentId: document.id,
    obligation: { companyId: company.id, entityId: entity.id },
    reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: {
      kind: "PRINTED_INSTALLMENT_SEQUENCE",
      sequenceText: "16",
      totalText: "480",
      provenance: {
        origin: "ORIGINAL_DOCUMENT",
        receiptId: receipt.id,
        documentId: document.id,
        pageNumber: 1,
        fieldLabel: "Gjaldagi",
      },
    },
  };
  const evidence: IdentityEvidence = {
    sourceFileHash,
    verbatimText: "Gjaldagi 16 af 480",
    bindingRevision: snapshot.binding.revision,
  };
  const evidenceDigest = documentIdentityEvidenceDigest(candidate, evidence);
  const proposedPayload = {
    envelopeVersion: "document-instance-envelope-v1" as const,
    revision: 1,
    state: "PROPOSED" as const,
    candidate,
    evidence,
    evidenceDigest,
    confirmedIdentity: null,
  };
  const proposedDraft: IdentityAuditDraft = {
    companyId: company.id,
    userId: user.id,
    entityType: "AiDetectedDocument",
    entityId: document.id,
    parentEntityType: "Receipt",
    parentEntityId: receipt.id,
    action: IDENTITY_AUDIT.PROPOSED,
    source: "USER",
    beforeData: null,
    afterData: proposedPayload,
    metadata: {
      requestId: unique("proposal"),
      occurredAt: new Date().toISOString(),
      previousAuditEventId: null,
      reason: null,
    },
  };
  const proposalAudit = await client.auditEvent.create({
    data: {
      companyId: proposedDraft.companyId,
      userId: proposedDraft.userId,
      entityType: proposedDraft.entityType,
      entityId: proposedDraft.entityId,
      parentEntityType: proposedDraft.parentEntityType,
      parentEntityId: proposedDraft.parentEntityId,
      action: proposedDraft.action,
      source: proposedDraft.source,
      beforeData: Prisma.JsonNull,
      afterData: proposedDraft.afterData as unknown as Prisma.InputJsonObject,
      metadata: proposedDraft.metadata as unknown as Prisma.InputJsonObject,
    },
  });
  const metadata = attachDocumentIdentityAudit(proposedDraftToPlan(proposedDraft), {
    id: proposalAudit.id,
    ...proposedDraft,
  });
  await client.aiDetectedDocument.update({
    where: { id: document.id },
    data: { extractionMetadata: metadata as Prisma.InputJsonObject },
  });

  return {
    client,
    companyId: company.id,
    userId: user.id,
    receiptId: receipt.id,
    documentId: document.id,
    sourceFileHash,
    evidenceDigest,
    expectedRevision: 1,
  };
}

function proposedDraftToPlan(draft: IdentityAuditDraft) {
  return { metadataBefore: null, audit: draft };
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  try {
    await fixture.client.receipt.deleteMany({
      where: { id: fixture.receiptId, companyId: fixture.companyId },
    });
    await fixture.client.company.delete({ where: { id: fixture.companyId } });
  } finally {
    await fixture.client.user.deleteMany({ where: { id: fixture.userId } });
    await fixture.client.$disconnect();
  }
}

function dependencies(fixture: Fixture, client = fixture.client) {
  return createPrismaDocumentInstanceDependencies({
    prisma: client,
    authenticatedUserId: async () => fixture.userId,
    verifyEvidence: async () => ({
      sourceFileHash: fixture.sourceFileHash,
      evidenceDigest: fixture.evidenceDigest,
    }),
    now: () => "2026-10-02T08:30:00.000Z",
  });
}

async function confirm(fixture: Fixture, client: PrismaClient, requestId: string) {
  return confirmDocumentInstanceIdentity({
    companyId: fixture.companyId,
    documentId: fixture.documentId,
    requestId,
    expectedRevision: fixture.expectedRevision,
    expectedEvidenceDigest: fixture.evidenceDigest,
  }, dependencies(fixture, client));
}

const integration = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: SKIP_REASON || undefined, timeout: 20_000 }, fn);

integration("company advisory lock serializes two real PostgreSQL transactions", async () => {
  const fixture = await createFixture();
  const second = createClient();
  let releaseFirst!: () => void;
  const release = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstLocked!: () => void;
  const firstAcquired = new Promise<void>(resolve => { firstLocked = resolve; });
  let secondAcquired = false;

  try {
    const firstTx = fixture.client.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, fixture.companyId);
      firstLocked();
      await release;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await firstAcquired;
    const secondTx = second.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, fixture.companyId);
      secondAcquired = true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(secondAcquired, false, "second transaction must wait for the same company lock");
    releaseFirst();
    await Promise.all([firstTx, secondTx]);
    assert.equal(secondAcquired, true);
  } finally {
    releaseFirst?.();
    await second.$disconnect();
    await destroyFixture(fixture);
  }
});

integration("different company locks do not block each other", async () => {
  const first = await createFixture();
  const second = await createFixture();
  let releaseFirst!: () => void;
  const release = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstLocked!: () => void;
  const firstAcquired = new Promise<void>(resolve => { firstLocked = resolve; });

  try {
    const held = first.client.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, first.companyId);
      firstLocked();
      await release;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await firstAcquired;

    let otherAcquired = false;
    await second.client.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, second.companyId);
      otherAcquired = true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    assert.equal(otherAcquired, true, "another company must use an independent advisory lock key");
    releaseFirst();
    await held;
  } finally {
    releaseFirst?.();
    await destroyFixture(first);
    await destroyFixture(second);
  }
});

integration("audit and metadata writes roll back atomically in a real transaction", async () => {
  const fixture = await createFixture();
  const requestId = unique("rollback");
  const before = await fixture.client.aiDetectedDocument.findUniqueOrThrow({ where: { id: fixture.documentId } });
  const parsed = before.extractionMetadata as Record<string, unknown>;
  const envelope = parsed[ENVELOPE_KEY] as Record<string, unknown>;
  const draft: IdentityAuditDraft = {
    companyId: fixture.companyId,
    userId: fixture.userId,
    entityType: "AiDetectedDocument",
    entityId: fixture.documentId,
    parentEntityType: "Receipt",
    parentEntityId: fixture.receiptId,
    action: IDENTITY_AUDIT.PROPOSED,
    source: "USER",
    beforeData: null,
    afterData: {
      ...(envelope as unknown as IdentityAuditDraft["afterData"]),
      revision: 2,
    },
    metadata: {
      requestId,
      occurredAt: new Date().toISOString(),
      previousAuditEventId: Number(envelope.lastAuditEventId),
      reason: null,
    },
  };

  try {
    await assert.rejects(
      fixture.client.$transaction(async tx => {
        const adapter = createPrismaIdentityTransaction(tx);
        await adapter.createAudit(draft, {
          companyId: fixture.companyId,
          documentId: fixture.documentId,
          requestId,
          expectedRevision: fixture.expectedRevision,
          expectedEvidenceDigest: fixture.evidenceDigest,
          actorUserId: fixture.userId,
          operation: { kind: "CONFIRM" },
        });
        const nextMetadata = structuredClone(parsed);
        nextMetadata.integrationRollbackMarker = true;
        const wrote = await adapter.writeMetadata({
          companyId: fixture.companyId,
          documentId: fixture.documentId,
          expectedRevision: fixture.expectedRevision,
          expectedEvidenceDigest: fixture.evidenceDigest,
          extractionMetadata: nextMetadata,
        });
        assert.equal(wrote, true);
        throw new Error("INTENTIONAL_INTEGRATION_ROLLBACK");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }),
      /INTENTIONAL_INTEGRATION_ROLLBACK/,
    );

    const after = await fixture.client.aiDetectedDocument.findUniqueOrThrow({ where: { id: fixture.documentId } });
    assert.deepEqual(after.extractionMetadata, before.extractionMetadata, "metadata write must roll back with the audit");
    const auditCount = await fixture.client.auditEvent.count({
      where: { companyId: fixture.companyId, metadata: { path: ["requestId"], equals: requestId } },
    });
    assert.equal(auditCount, 0, "audit insert must roll back with metadata");
  } finally {
    await destroyFixture(fixture);
  }
});

integration("concurrent identical confirms create one audit and one replay", async () => {
  const fixture = await createFixture();
  const second = createClient();
  const requestId = unique("same-request");
  try {
    const [left, right] = await Promise.all([
      confirm(fixture, fixture.client, requestId),
      confirm(fixture, second, requestId),
    ]);
    assert.deepEqual([left.replay, right.replay].sort(), [false, true]);
    assert.equal(left.auditEventId, right.auditEventId);
    const count = await fixture.client.auditEvent.count({
      where: {
        companyId: fixture.companyId,
        action: IDENTITY_AUDIT.CONFIRMED,
        metadata: { path: ["requestId"], equals: requestId },
      },
    });
    assert.equal(count, 1);
  } finally {
    await second.$disconnect();
    await destroyFixture(fixture);
  }
});

integration("concurrent different confirms cannot both consume the same revision", async () => {
  const fixture = await createFixture();
  const second = createClient();
  const requestA = unique("request-a");
  const requestB = unique("request-b");
  try {
    const results = await Promise.allSettled([
      confirm(fixture, fixture.client, requestA),
      confirm(fixture, second, requestB),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected").length, 1);
    const rejected = results.find(result => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(String(rejected.reason), /IDENTITY_(STATE_CONFLICT|REVISION_CONFLICT)/);

    const count = await fixture.client.auditEvent.count({
      where: {
        companyId: fixture.companyId,
        action: IDENTITY_AUDIT.CONFIRMED,
      },
    });
    assert.equal(count, 1, "only one confirmation may commit for the old revision");
  } finally {
    await second.$disconnect();
    await destroyFixture(fixture);
  }
});

integration("the advisory namespace used by the service is stable and nonzero", async () => {
  assert.equal(DOCUMENT_IDENTITY_LOCK_NAMESPACE, 1195983945);
  assert.notEqual(DOCUMENT_IDENTITY_LOCK_NAMESPACE, 0);
});
