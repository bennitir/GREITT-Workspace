import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import {
  ENVELOPE_KEY,
  IDENTITY_AUDIT,
  parseDocumentIdentityEnvelope,
  type IdentityAuditDraft,
  type IdentityAuditRecord,
  type IdentityPayload,
} from "./document-instance-envelope";
import type {
  CompletedIdentityRequest,
  IdentityRequestRecord,
  IdentityServiceDependencies,
  IdentityServiceDocument,
  IdentityServiceTransaction,
} from "./document-instance-service";

type IdentityPrismaRoot = Pick<
  PrismaClient,
  "$transaction" | "aiDetectedDocument" | "user" | "userCompany"
>;
type IdentityPrismaReadDb = Pick<
  Prisma.TransactionClient,
  "aiDetectedDocument" | "user" | "userCompany"
>;

type DocumentRow = {
  id: number;
  receiptId: number;
  extractionMetadata: Prisma.JsonValue | null;
  receipt: { companyId: number; fileHash: string | null };
  entityLinks: Array<{
    id: number;
    entityId: number;
    role: string;
    source: string;
    confidence: number | null;
    confirmedAt: Date | null;
    confirmedBy: number | null;
    createdAt: Date;
    entity: {
      id: number;
      companyId: number;
      entityType: string;
      status: string;
      identifierType: string | null;
      identifierValue: string | null;
      relationshipStatus: string | null;
      relationshipType: string | null;
      relationshipConfirmedAt: Date | null;
      relationshipConfirmedBy: number | null;
      updatedAt: Date;
    };
  }>;
};

type AuditRow = {
  id: number;
  companyId: number;
  userId: number | null;
  entityType: string;
  entityId: number;
  parentEntityType: string | null;
  parentEntityId: number | null;
  action: string;
  source: string;
  beforeData: Prisma.JsonValue | null;
  afterData: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function bindingRevision(link: DocumentRow["entityLinks"][number]): string {
  const e = link.entity;
  const value = [
    link.id,
    link.entityId,
    link.role,
    link.source,
    link.confidence,
    link.confirmedAt?.toISOString() ?? null,
    link.confirmedBy,
    link.createdAt.toISOString(),
    e.id,
    e.companyId,
    e.entityType,
    e.status,
    e.identifierType,
    e.identifierValue,
    e.relationshipStatus,
    e.relationshipType,
    e.relationshipConfirmedAt?.toISOString() ?? null,
    e.relationshipConfirmedBy,
    e.updatedAt.toISOString(),
  ];
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toServiceDocument(row: DocumentRow | null): IdentityServiceDocument | null {
  if (!row) return null;
  const confirmedLoanLinks = row.entityLinks.filter((link) => {
    const e = link.entity;
    return (
      link.role === "LOAN" &&
      e.companyId === row.receipt.companyId &&
      e.entityType === "LOAN" &&
      e.status === "ACTIVE" &&
      e.relationshipStatus === "CONFIRMED" &&
      e.identifierType === "LOAN_NUMBER" &&
      text(e.identifierValue)
    );
  });
  const link = confirmedLoanLinks.length === 1 ? confirmedLoanLinks[0] : null;
  return {
    companyId: row.receipt.companyId,
    receiptId: row.receiptId,
    documentId: row.id,
    extractionMetadata: row.extractionMetadata,
    sourceFileHash: digest(row.receipt.fileHash) ? row.receipt.fileHash : null,
    binding: link
      ? {
          companyId: link.entity.companyId,
          entityId: link.entity.id,
          revision: bindingRevision(link),
          confirmed: true,
        }
      : null,
  };
}

const documentSelect = {
  id: true,
  receiptId: true,
  extractionMetadata: true,
  receipt: { select: { companyId: true, fileHash: true } },
  entityLinks: {
    where: { role: "LOAN" },
    orderBy: { id: "asc" },
    select: {
      id: true,
      entityId: true,
      role: true,
      source: true,
      confidence: true,
      confirmedAt: true,
      confirmedBy: true,
      createdAt: true,
      entity: {
        select: {
          id: true,
          companyId: true,
          entityType: true,
          status: true,
          identifierType: true,
          identifierValue: true,
          relationshipStatus: true,
          relationshipType: true,
          relationshipConfirmedAt: true,
          relationshipConfirmedBy: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AiDetectedDocumentSelect;

async function readDocument(
  db: Pick<IdentityPrismaReadDb, "aiDetectedDocument">,
  companyId: number,
  documentId: number,
): Promise<IdentityServiceDocument | null> {
  const row = await db.aiDetectedDocument.findFirst({
    where: { id: documentId, receipt: { companyId } },
    select: documentSelect,
  });
  return toServiceDocument(row as DocumentRow | null);
}

async function authorizeCompany(
  db: Pick<IdentityPrismaReadDb, "user" | "userCompany">,
  actorUserId: number,
  companyId: number,
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: actorUserId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive) return false;
  if (user.role === "ADMIN") return true;
  const access = await db.userCompany.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId } },
    select: { isActive: true, canBookEntries: true },
  });
  return access?.isActive === true && access.canBookEntries === true;
}

function payloadFromAfterData(value: unknown, auditId: number): IdentityPayload | null {
  if (!object(value)) return null;
  const state = value.state;
  if (state !== "PROPOSED" && state !== "CONFIRMED" && state !== "INVALIDATED") return null;
  const parsed = parseDocumentIdentityEnvelope({
    [ENVELOPE_KEY]: {
      ...value,
      lastAuditEventId: auditId,
      confirmationAuditEventId: state === "CONFIRMED" ? auditId : null,
    },
  });
  if (!parsed.ok) return null;
  const { lastAuditEventId: _last, confirmationAuditEventId: _confirmation, ...payload } = parsed.envelope;
  return payload;
}

function beforePayload(value: unknown): IdentityPayload | null {
  if (!object(value) || !positiveId(value.revision) || !digest(value.evidenceDigest)) return null;
  return value as unknown as IdentityPayload;
}

function toAuditRecord(row: AuditRow | null): IdentityAuditRecord | null {
  if (!row || !positiveId(row.id) || !positiveId(row.companyId) || !positiveId(row.userId) ||
    row.entityType !== "AiDetectedDocument" || !positiveId(row.entityId) || row.parentEntityType !== "Receipt" ||
    !positiveId(row.parentEntityId) || row.source !== "USER" || !object(row.metadata)) return null;
  const afterData = payloadFromAfterData(row.afterData, row.id);
  if (!afterData) return null;
  const beforeData = row.beforeData === null ? null : beforePayload(row.beforeData);
  if (row.beforeData !== null && !beforeData) return null;
  const metadata = row.metadata;
  if (!text(metadata.requestId) || !text(metadata.occurredAt) ||
    !(metadata.previousAuditEventId === null || positiveId(metadata.previousAuditEventId)) ||
    !(metadata.reason === null || typeof metadata.reason === "string")) return null;
  const expectedAction = IDENTITY_AUDIT[afterData.state];
  if (row.action !== expectedAction) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    entityType: "AiDetectedDocument",
    entityId: row.entityId,
    parentEntityType: "Receipt",
    parentEntityId: row.parentEntityId,
    action: expectedAction,
    source: "USER",
    beforeData,
    afterData,
    metadata: {
      requestId: metadata.requestId,
      occurredAt: metadata.occurredAt,
      previousAuditEventId: metadata.previousAuditEventId as number | null,
      reason: metadata.reason as string | null,
    },
  };
}

function completedRequest(row: AuditRow | null): CompletedIdentityRequest | null {
  const audit = toAuditRecord(row);
  if (!audit || !audit.beforeData ||
    (audit.action !== IDENTITY_AUDIT.CONFIRMED && audit.action !== IDENTITY_AUDIT.INVALIDATED)) return null;
  const requestId = audit.metadata.requestId;
  const expectedEvidenceDigest = audit.beforeData.evidenceDigest;
  const operation = audit.action === IDENTITY_AUDIT.CONFIRMED
    ? ({ kind: "CONFIRM" } as const)
    : ({ kind: "INVALIDATE", reason: audit.metadata.reason ?? "" } as const);
  if (operation.kind === "INVALIDATE" && !text(operation.reason)) return null;
  const request: IdentityRequestRecord = {
    companyId: audit.companyId,
    documentId: audit.entityId,
    requestId,
    expectedRevision: audit.beforeData.revision,
    expectedEvidenceDigest,
    actorUserId: audit.userId,
    operation,
  };
  return { request, audit };
}

function auditSelect() {
  return {
    id: true,
    companyId: true,
    userId: true,
    entityType: true,
    entityId: true,
    parentEntityType: true,
    parentEntityId: true,
    action: true,
    source: true,
    beforeData: true,
    afterData: true,
    metadata: true,
  } as const;
}

export function createPrismaIdentityTransaction(tx: Prisma.TransactionClient): IdentityServiceTransaction {
  return {
    $queryRaw: (query, ...values) => tx.$queryRaw(query, ...values),
    authorizeCompany: (actorUserId, companyId) => authorizeCompany(tx, actorUserId, companyId),
    readDocument: (companyId, documentId) => readDocument(tx, companyId, documentId),
    async findRequest(companyId, requestId) {
      const rows = await tx.auditEvent.findMany({
        where: {
          companyId,
          action: { in: [IDENTITY_AUDIT.CONFIRMED, IDENTITY_AUDIT.INVALIDATED] },
          metadata: { path: ["requestId"], equals: requestId },
        },
        orderBy: { id: "desc" },
        take: 2,
        select: auditSelect(),
      });
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new Error("IDENTITY_REQUEST_AUDIT_MISMATCH");
      const completed = completedRequest(rows[0] as AuditRow);
      if (!completed) throw new Error("IDENTITY_REQUEST_AUDIT_MISMATCH");
      return completed;
    },
    async readAudit(companyId, auditEventId) {
      const row = await tx.auditEvent.findFirst({
        where: { id: auditEventId, companyId },
        select: auditSelect(),
      });
      return toAuditRecord(row as AuditRow | null);
    },
    async createAudit(draft: IdentityAuditDraft) {
      const row = await tx.auditEvent.create({
        data: {
          companyId: draft.companyId,
          userId: draft.userId,
          entityType: draft.entityType,
          entityId: draft.entityId,
          parentEntityType: draft.parentEntityType,
          parentEntityId: draft.parentEntityId,
          action: draft.action,
          source: draft.source,
          beforeData: draft.beforeData === null ? Prisma.JsonNull : draft.beforeData as unknown as Prisma.InputJsonObject,
          afterData: draft.afterData as unknown as Prisma.InputJsonObject,
          metadata: draft.metadata as unknown as Prisma.InputJsonObject,
        },
        select: auditSelect(),
      });
      const audit = toAuditRecord(row as AuditRow);
      if (!audit) throw new Error("IDENTITY_AUDIT_PERSISTENCE_MISMATCH");
      return audit;
    },
    async writeMetadata(input) {
      const result = await tx.aiDetectedDocument.updateMany({
        where: {
          id: input.documentId,
          receipt: { companyId: input.companyId },
          AND: [
            { extractionMetadata: { path: [ENVELOPE_KEY, "revision"], equals: input.expectedRevision } },
            { extractionMetadata: { path: [ENVELOPE_KEY, "evidenceDigest"], equals: input.expectedEvidenceDigest } },
          ],
        },
        data: { extractionMetadata: input.extractionMetadata as Prisma.InputJsonObject },
      });
      return result.count === 1;
    },
  };
}

/** Persistence/authentication adapter only. Original-artifact evidence verification
 * stays explicit and injected by the caller; no storage or UI trust is hidden here.
 */
export function createPrismaDocumentInstanceDependencies(args: {
  prisma: IdentityPrismaRoot;
  authenticatedUserId(): Promise<number | null>;
  verifyEvidence: IdentityServiceDependencies["verifyEvidence"];
  now?: () => string;
}): IdentityServiceDependencies {
  return {
    authenticatedUserId: args.authenticatedUserId,
    authorizeCompany: (actorUserId, companyId) => authorizeCompany(args.prisma, actorUserId, companyId),
    readForEvidence: (companyId, documentId) => readDocument(args.prisma, companyId, documentId),
    verifyEvidence: args.verifyEvidence,
    now: args.now ?? (() => new Date().toISOString()),
    transaction: (work, options) => args.prisma.$transaction(
      tx => work(createPrismaIdentityTransaction(tx)),
      { isolationLevel: options.isolationLevel },
    ),
  };
}
