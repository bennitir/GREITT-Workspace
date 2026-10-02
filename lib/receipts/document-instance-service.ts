import {
  attachDocumentIdentityAudit, parseDocumentIdentityEnvelope, planDocumentIdentityTransition,
  type IdentityAuditDraft, type IdentityAuditRecord, type IdentityContext,
} from "./document-instance-envelope";

// Reserved namespace for ALL future duplicate/identity writers in this company.
// Transaction-scoped, never a session lock. No fallback or nested transaction.
export const DOCUMENT_IDENTITY_LOCK_NAMESPACE = 1195983945;
export type CompanyLockTransaction = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};
export async function lockDocumentIdentityCompany(tx: CompanyLockTransaction, companyId: number) {
  if (!positiveId(companyId)) throw new Error("INVALID_COMPANY_SCOPE");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${DOCUMENT_IDENTITY_LOCK_NAMESPACE}::integer, ${companyId}::integer)`;
}

export type IdentityServiceDocument = {
  companyId: number; receiptId: number; documentId: number; extractionMetadata: unknown;
  sourceFileHash: string | null;
  binding: { companyId: number; entityId: number; revision: string; confirmed: boolean } | null;
};
export type IdentityServiceRequest = {
  companyId: number; documentId: number; requestId: string;
  expectedRevision: number; expectedEvidenceDigest: string;
};
type Operation = { kind: "CONFIRM" } | { kind: "INVALIDATE"; reason: string };
export type IdentityRequestRecord = IdentityServiceRequest & { actorUserId: number; operation: Operation };
export type CompletedIdentityRequest = { request: IdentityRequestRecord; audit: IdentityAuditRecord };
export type IdentityServiceResult = { auditEventId: number; appliedRevision: number;
  transitionState: "CONFIRMED" | "INVALIDATED"; replay: boolean };

/** No booking delegates. Adapter must persist request identity WITH the audit and
 * roll back audit+metadata together. findRequest is company-wide, not document-
 * scoped, so reusing a request key for a different document is a conflict.
 */
export type IdentityServiceTransaction = CompanyLockTransaction & {
  authorizeCompany(actorUserId: number, companyId: number): Promise<boolean>;
  readDocument(companyId: number, documentId: number): Promise<IdentityServiceDocument | null>;
  findRequest(companyId: number, requestId: string): Promise<CompletedIdentityRequest | null>;
  readAudit(companyId: number, auditEventId: number): Promise<IdentityAuditRecord | null>;
  createAudit(draft: IdentityAuditDraft, request: IdentityRequestRecord): Promise<IdentityAuditRecord>;
  writeMetadata(input: { companyId: number; documentId: number; expectedRevision: number;
    expectedEvidenceDigest: string; extractionMetadata: Record<string, unknown> }): Promise<boolean>;
};
export type IdentityServiceDependencies = {
  authenticatedUserId(): Promise<number | null>;
  authorizeCompany(actorUserId: number, companyId: number): Promise<boolean>;
  /** Authorized preflight only. Never used as authoritative transaction state. */
  readForEvidence(companyId: number, documentId: number): Promise<IdentityServiceDocument | null>;
  /** Trusted server verifier: original immutable artifact + displayed source
   * evidence, not a browser-provided digest. Implementation deliberately absent. */
  verifyEvidence(document: IdentityServiceDocument): Promise<{ sourceFileHash: string; evidenceDigest: string } | null>;
  transaction<T>(work: (tx: IdentityServiceTransaction) => Promise<T>, options: { isolationLevel: "ReadCommitted" }): Promise<T>;
  now(): string;
};
const positiveId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function scoped(document: IdentityServiceDocument | null, request: IdentityServiceRequest): IdentityServiceDocument {
  if (!document || document.companyId !== request.companyId || document.documentId !== request.documentId || !positiveId(document.receiptId)) {
    throw new Error("DOCUMENT_NOT_FOUND_IN_COMPANY");
  }
  return document;
}
function sameRequest(a: IdentityRequestRecord, b: IdentityRequestRecord) {
  return a.companyId === b.companyId && a.documentId === b.documentId && a.requestId === b.requestId &&
    a.actorUserId === b.actorUserId && a.expectedRevision === b.expectedRevision &&
    a.expectedEvidenceDigest === b.expectedEvidenceDigest && a.operation.kind === b.operation.kind &&
    (a.operation.kind !== "INVALIDATE" || b.operation.kind === "INVALIDATE" && a.operation.reason === b.operation.reason);
}
function replayResult(completed: CompletedIdentityRequest, request: IdentityRequestRecord): IdentityServiceResult {
  const { audit } = completed;
  const state = request.operation.kind === "CONFIRM" ? "CONFIRMED" : "INVALIDATED";
  if (!sameRequest(completed.request, request)) throw new Error("IDENTITY_REQUEST_CONFLICT");
  if (!positiveId(audit.id) || audit.companyId !== request.companyId || audit.userId !== request.actorUserId ||
    audit.entityType !== "AiDetectedDocument" || audit.entityId !== request.documentId ||
    audit.metadata.requestId !== request.requestId || audit.action !== `DOCUMENT_INSTANCE_IDENTITY_${state}` ||
    audit.beforeData?.revision !== request.expectedRevision || audit.beforeData?.evidenceDigest !== request.expectedEvidenceDigest ||
    audit.afterData.revision !== request.expectedRevision + 1 || audit.afterData.state !== state) throw new Error("IDENTITY_REQUEST_AUDIT_MISMATCH");
  // A historical operation receipt, NOT an assertion about current identity state.
  return { auditEventId: audit.id, appliedRevision: audit.afterData.revision, transitionState: state, replay: true };
}

async function executeIdentityOperation(input: IdentityServiceRequest, operation: Operation, deps: IdentityServiceDependencies): Promise<IdentityServiceResult> {
  if (!positiveId(input.companyId) || !positiveId(input.documentId) || !positiveId(input.expectedRevision) ||
    !digest(input.expectedEvidenceDigest) || typeof input.requestId !== "string" || !input.requestId.trim() ||
    (operation.kind === "INVALIDATE" && (typeof operation.reason !== "string" || !operation.reason.trim()))) throw new Error("INVALID_IDENTITY_REQUEST");
  const actorUserId = await deps.authenticatedUserId();
  if (!positiveId(actorUserId) || !await deps.authorizeCompany(actorUserId, input.companyId)) throw new Error("IDENTITY_FORBIDDEN");
  const request: IdentityRequestRecord = { companyId: input.companyId, documentId: input.documentId,
    requestId: input.requestId, expectedRevision: input.expectedRevision, expectedEvidenceDigest: input.expectedEvidenceDigest,
    actorUserId, operation };
  // Evidence failure does not preclude replaying an already completed operation.
  // No verification exception/message crosses this boundary.
  let verified: { sourceFileHash: string; evidenceDigest: string; receiptId: number } | null = null;
  if (operation.kind === "CONFIRM") {
    const source = await deps.readForEvidence(input.companyId, input.documentId);
    const preflight = source ? scoped(source, input) : null;
    try {
      if (preflight) {
        const proof = await deps.verifyEvidence(structuredClone(preflight));
        if (proof && digest(proof.sourceFileHash) && digest(proof.evidenceDigest) && proof.sourceFileHash === preflight.sourceFileHash) {
          verified = { ...proof, receiptId: preflight.receiptId };
        }
      }
    } catch { /* Fail closed unless the locked audit proves this is a replay. */ }
  }
  return deps.transaction(async tx => {
    await lockDocumentIdentityCompany(tx, input.companyId);
    if (!await tx.authorizeCompany(actorUserId, input.companyId)) throw new Error("IDENTITY_FORBIDDEN");
    const completed = await tx.findRequest(input.companyId, input.requestId);
    if (completed) return replayResult(completed, request);
    const document = scoped(await tx.readDocument(input.companyId, input.documentId), input);
    const parsed = parseDocumentIdentityEnvelope(document.extractionMetadata);
    if (!parsed.ok) throw new Error(parsed.code);
    const binding = document.binding;
    if (operation.kind === "CONFIRM" && (!verified || verified.receiptId !== document.receiptId ||
      !binding || binding.companyId !== document.companyId || !binding.confirmed || !positiveId(binding.entityId))) {
      throw new Error("IDENTITY_EVIDENCE_NOT_VERIFIED");
    }
    const context: IdentityContext = { companyId: document.companyId, receiptId: document.receiptId, documentId: document.documentId,
      obligationEntityId: binding?.entityId ?? 0, bindingRevision: binding?.revision ?? "",
      sourceFileHash: document.sourceFileHash,
      verifiedEvidenceDigest: verified?.sourceFileHash === document.sourceFileHash ? verified.evidenceDigest : null };
    const previousAudit = await tx.readAudit(input.companyId, parsed.envelope.lastAuditEventId);
    const plan = planDocumentIdentityTransition({ metadata: document.extractionMetadata, previousAudit, context,
      expectedRevision: input.expectedRevision, expectedEvidenceDigest: input.expectedEvidenceDigest,
      actorUserId, requestId: input.requestId, occurredAt: deps.now(), command: operation });
    const audit = await tx.createAudit(plan.audit, request);
    const extractionMetadata = attachDocumentIdentityAudit(plan, audit);
    if (!await tx.writeMetadata({ companyId: input.companyId, documentId: input.documentId,
      expectedRevision: input.expectedRevision, expectedEvidenceDigest: input.expectedEvidenceDigest, extractionMetadata })) {
      throw new Error("IDENTITY_REVISION_CONFLICT");
    }
    return { auditEventId: audit.id, appliedRevision: plan.audit.afterData.revision,
      transitionState: operation.kind === "CONFIRM" ? "CONFIRMED" : "INVALIDATED", replay: false };
  }, { isolationLevel: "ReadCommitted" });
}

/** Service only: no server action, default Prisma client, UI, or guard wiring. */
export function confirmDocumentInstanceIdentity(input: IdentityServiceRequest, deps: IdentityServiceDependencies) {
  return executeIdentityOperation(input, { kind: "CONFIRM" }, deps);
}
export function invalidateDocumentInstanceIdentity(input: IdentityServiceRequest & { reason: string }, deps: IdentityServiceDependencies) {
  return executeIdentityOperation(input, { kind: "INVALIDATE", reason: input.reason }, deps);
}
