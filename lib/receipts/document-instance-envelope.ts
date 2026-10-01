import { createHash } from "node:crypto";
import { compareDocumentInstanceIdentity, type ConfirmedDocumentInstanceIdentity } from "./document-instance-identity";

export const ENVELOPE_VERSION = "document-instance-envelope-v1" as const;
export const ENVELOPE_KEY = "documentInstanceIdentity" as const;
export const IDENTITY_AUDIT = {
  PROPOSED: "DOCUMENT_INSTANCE_IDENTITY_PROPOSED",
  CONFIRMED: "DOCUMENT_INSTANCE_IDENTITY_CONFIRMED",
  INVALIDATED: "DOCUMENT_INSTANCE_IDENTITY_INVALIDATED",
} as const;
type State = keyof typeof IDENTITY_AUDIT;
export type IdentityCandidate = Omit<ConfirmedDocumentInstanceIdentity, "confirmation">;
export type IdentityEvidence = { sourceFileHash: string; verbatimText: string; bindingRevision: string };
export type IdentityPayload = {
  envelopeVersion: typeof ENVELOPE_VERSION;
  revision: number; state: State; candidate: IdentityCandidate; evidence: IdentityEvidence;
  evidenceDigest: string; confirmedIdentity: ConfirmedDocumentInstanceIdentity | null;
};
export type IdentityEnvelope = IdentityPayload & { lastAuditEventId: number; confirmationAuditEventId: number | null };
export type IdentityAuditDraft = {
  companyId: number; userId: number; entityType: "AiDetectedDocument"; entityId: number;
  parentEntityType: "Receipt"; parentEntityId: number; action: typeof IDENTITY_AUDIT[State];
  source: "USER"; beforeData: IdentityPayload | null; afterData: IdentityPayload;
  metadata: { requestId: string; occurredAt: string; previousAuditEventId: number | null; reason: string | null };
};
export type IdentityAuditRecord = IdentityAuditDraft & { id: number };
export type IdentityContext = {
  companyId: number; receiptId: number; documentId: number;
  obligationEntityId: number; bindingRevision: string;
  sourceFileHash: string | null;
  /** Supplied by a future trusted evidence verifier under the serialization protocol.
   * Never take this digest or ownership/binding fields from browser assertions.
   * This pure module neither downloads nor authenticates original documents. */
  verifiedEvidenceDigest: string | null;
};
export type IdentityReadFailure = "ABSENT" | "INVALID_METADATA" | "UNSUPPORTED_VERSION" | "INVALID_ENVELOPE"
  | "AUDIT_MISMATCH" | "SCOPE_MISMATCH" | "STALE_EVIDENCE" | "NOT_CONFIRMED";
type ReadResult = { ok: true; identity: ConfirmedDocumentInstanceIdentity }
  | { ok: false; code: IdentityReadFailure };

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function json(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
  if (depth > 128) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && (!object(value) || Object.getPrototypeOf(value) !== Object.prototype)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(child => json(child, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function documentIdentityEvidenceDigest(candidate: IdentityCandidate, evidence: IdentityEvidence): string {
  return createHash("sha256").update(canonical({ envelopeVersion: ENVELOPE_VERSION, candidate, evidence })).digest("hex");
}
function validCandidate(value: unknown): value is IdentityCandidate {
  if (!object(value) || "confirmation" in value) return false;
  const asserted = { ...value, confirmation: { state: "CONFIRMED", confirmedByUserId: 1 } };
  return compareDocumentInstanceIdentity(asserted, asserted) === "SAME_INSTANCE";
}
function validPayload(value: unknown): value is IdentityPayload {
  if (!object(value) || !json(value) || value.envelopeVersion !== ENVELOPE_VERSION || !id(value.revision) ||
    !["PROPOSED", "CONFIRMED", "INVALIDATED"].includes(String(value.state)) || !validCandidate(value.candidate) ||
    !object(value.evidence) || !hash(value.evidence.sourceFileHash) || !text(value.evidence.verbatimText) ||
    !text(value.evidence.bindingRevision) || !hash(value.evidenceDigest)) return false;
  const evidence = value.evidence as IdentityEvidence;
  if (documentIdentityEvidenceDigest(value.candidate, evidence) !== value.evidenceDigest) return false;
  if (value.state !== "CONFIRMED") return value.confirmedIdentity === null;
  if (compareDocumentInstanceIdentity(value.confirmedIdentity, value.confirmedIdentity) !== "SAME_INSTANCE") return false;
  const { confirmation: _confirmation, ...candidate } = value.confirmedIdentity as ConfirmedDocumentInstanceIdentity;
  return same(candidate, value.candidate);
}
function payload(envelope: IdentityEnvelope): IdentityPayload {
  const { lastAuditEventId: _last, confirmationAuditEventId: _confirmation, ...value } = envelope;
  return value;
}
export function parseDocumentIdentityEnvelope(metadata: unknown):
  { ok: true; envelope: IdentityEnvelope } | { ok: false; code: IdentityReadFailure } {
  if (metadata === null) return { ok: false, code: "ABSENT" };
  if (!object(metadata) || !json(metadata)) return { ok: false, code: "INVALID_METADATA" };
  if (!Object.hasOwn(metadata, ENVELOPE_KEY)) return { ok: false, code: "ABSENT" };
  const value = metadata[ENVELOPE_KEY];
  if (object(value) && value.envelopeVersion !== ENVELOPE_VERSION) return { ok: false, code: "UNSUPPORTED_VERSION" };
  if (!object(value)) return { ok: false, code: "INVALID_ENVELOPE" };
  const { lastAuditEventId, confirmationAuditEventId } = value;
  if (!validPayload(value) || !id(lastAuditEventId) ||
    (value.state === "CONFIRMED" ? confirmationAuditEventId !== lastAuditEventId : confirmationAuditEventId !== null)) {
    return { ok: false, code: "INVALID_ENVELOPE" };
  }
  return { ok: true, envelope: structuredClone(value) as IdentityEnvelope };
}
function auditMatches(envelope: IdentityEnvelope, audit: IdentityAuditRecord | null): boolean {
  return !!audit && audit.id === envelope.lastAuditEventId && audit.companyId === envelope.candidate.companyId &&
    audit.entityType === "AiDetectedDocument" && audit.entityId === envelope.candidate.documentId &&
    audit.parentEntityType === "Receipt" && audit.parentEntityId === envelope.candidate.receiptId &&
    audit.action === IDENTITY_AUDIT[envelope.state] && audit.source === "USER" && id(audit.userId) &&
    (envelope.state !== "CONFIRMED" || audit.userId === envelope.confirmedIdentity?.confirmation.confirmedByUserId) &&
    same(audit.afterData, payload(envelope));
}
function scopeMatches(value: IdentityPayload, context: IdentityContext) {
  return value.candidate.companyId === context.companyId && value.candidate.receiptId === context.receiptId &&
    value.candidate.documentId === context.documentId;
}
function fresh(value: IdentityPayload, context: IdentityContext) {
  return value.candidate.obligation.entityId === context.obligationEntityId &&
    value.evidence.bindingRevision === context.bindingRevision && value.evidence.sourceFileHash === context.sourceFileHash &&
    value.evidenceDigest === context.verifiedEvidenceDigest;
}
export function readCurrentConfirmedDocumentIdentity(metadata: unknown, context: IdentityContext, audit: IdentityAuditRecord | null): ReadResult {
  const parsed = parseDocumentIdentityEnvelope(metadata);
  if (!parsed.ok) return parsed;
  const value = parsed.envelope;
  if (!scopeMatches(value, context)) return { ok: false, code: "SCOPE_MISMATCH" };
  if (!auditMatches(value, audit)) return { ok: false, code: "AUDIT_MISMATCH" };
  if (value.state !== "CONFIRMED") return { ok: false, code: "NOT_CONFIRMED" };
  if (!fresh(value, context)) return { ok: false, code: "STALE_EVIDENCE" };
  return { ok: true, identity: structuredClone(value.confirmedIdentity!) };
}

type Command = { kind: "PROPOSE"; candidate: IdentityCandidate; evidence: IdentityEvidence }
  | { kind: "CONFIRM" } | { kind: "INVALIDATE"; reason: string };
export type IdentityTransitionPlan = { metadataBefore: Record<string, unknown> | null; audit: IdentityAuditDraft };

/** Pure plan only. Future caller must authorize access, hold the company lock,
 * re-read revisions, and persist audit+metadata atomically. No booking fields are
 * accepted or returned; duplicate reevaluation belongs to future orchestration.
 */
export function planDocumentIdentityTransition(args: {
  metadata: unknown; previousAudit: IdentityAuditRecord | null; context: IdentityContext;
  expectedRevision: number; expectedEvidenceDigest: string | null;
  actorUserId: number; requestId: string; occurredAt: string; command: Command;
}): IdentityTransitionPlan {
  if (!id(args.actorUserId) || !text(args.requestId) || !Number.isFinite(Date.parse(args.occurredAt))) throw new Error("INVALID_IDENTITY_ACTOR_OR_REQUEST");
  const parsed = parseDocumentIdentityEnvelope(args.metadata);
  if (!parsed.ok && parsed.code !== "ABSENT") throw new Error(parsed.code);
  const previous = parsed.ok ? parsed.envelope : null;
  if (previous && (!scopeMatches(previous, args.context) || !auditMatches(previous, args.previousAudit))) throw new Error("IDENTITY_SCOPE_OR_AUDIT_MISMATCH");
  if (args.expectedRevision !== (previous?.revision ?? 0) || args.expectedEvidenceDigest !== (previous?.evidenceDigest ?? null)) throw new Error("IDENTITY_REVISION_CONFLICT");
  const command = args.command;
  let next: IdentityPayload;
  if (command.kind === "PROPOSE") {
    if (previous?.state === "CONFIRMED") throw new Error("IDENTITY_REQUIRES_INVALIDATION");
    next = { envelopeVersion: ENVELOPE_VERSION, revision: (previous?.revision ?? 0) + 1, state: "PROPOSED",
      candidate: structuredClone(command.candidate), evidence: structuredClone(command.evidence),
      evidenceDigest: documentIdentityEvidenceDigest(command.candidate, command.evidence), confirmedIdentity: null };
    if (!validPayload(next) || !scopeMatches(next, args.context) ||
      next.candidate.obligation.entityId !== args.context.obligationEntityId || next.evidence.bindingRevision !== args.context.bindingRevision ||
      next.evidence.sourceFileHash !== args.context.sourceFileHash) throw new Error("INVALID_IDENTITY_PROPOSAL");
  } else {
    if (!previous) throw new Error("IDENTITY_STATE_CONFLICT");
    if (command.kind === "CONFIRM") {
      if (previous.state !== "PROPOSED") throw new Error("IDENTITY_STATE_CONFLICT");
      if (!fresh(previous, args.context)) throw new Error("STALE_EVIDENCE");
      next = { ...payload(previous), revision: previous.revision + 1, state: "CONFIRMED",
        confirmedIdentity: { ...structuredClone(previous.candidate), confirmation: { state: "CONFIRMED", confirmedByUserId: args.actorUserId } } };
    } else {
      if (previous.state !== "CONFIRMED" || !text(command.reason)) throw new Error("IDENTITY_STATE_CONFLICT");
      next = { ...payload(previous), revision: previous.revision + 1, state: "INVALIDATED", confirmedIdentity: null };
    }
  }
  return structuredClone({ metadataBefore: args.metadata as Record<string, unknown> | null,
    audit: { companyId: args.context.companyId, userId: args.actorUserId, entityType: "AiDetectedDocument", entityId: args.context.documentId,
      parentEntityType: "Receipt", parentEntityId: args.context.receiptId, action: IDENTITY_AUDIT[next.state], source: "USER",
      beforeData: previous ? payload(previous) : null, afterData: next,
      metadata: { requestId: args.requestId, occurredAt: args.occurredAt, previousAuditEventId: previous?.lastAuditEventId ?? null,
        reason: command.kind === "INVALIDATE" ? command.reason : null } } });
}

/** Attach the actual audit ID only after a future transaction writes this exact
 * audit draft. This function itself performs no writes. A rollback must cover both.
 */
export function attachDocumentIdentityAudit(plan: IdentityTransitionPlan, audit: IdentityAuditRecord): Record<string, unknown> {
  const { id: auditId, ...draft } = audit;
  if (!id(auditId) || !same(draft, plan.audit)) throw new Error("IDENTITY_AUDIT_MISMATCH");
  const envelope: IdentityEnvelope = { ...structuredClone(plan.audit.afterData), lastAuditEventId: auditId,
    confirmationAuditEventId: plan.audit.afterData.state === "CONFIRMED" ? auditId : null };
  return { ...structuredClone(plan.metadataBefore ?? {}), [ENVELOPE_KEY]: envelope };
}
