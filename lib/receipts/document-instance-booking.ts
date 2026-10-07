import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { extractTextPagesFromPdfBuffer } from "@/lib/core/pdf-text";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import {
  attachDocumentIdentityAudit,
  parseDocumentIdentityEnvelope,
  planDocumentIdentityTransition,
  readCurrentConfirmedDocumentIdentity,
  type IdentityAuditRecord,
  type IdentityCandidate,
  type IdentityContext,
  type IdentityEvidence,
} from "./document-instance-envelope";
import { createGloggtDocumentInstanceEvidenceVerifier } from "./document-instance-evidence-runtime";
import {
  createDocumentInstanceOriginalArtifactLoader,
  createPrismaSupabaseOriginalArtifactDependencies,
} from "./document-instance-original-artifact";
import {
  createPrismaDocumentInstanceDependencies,
  createPrismaIdentityTransaction,
} from "./document-instance-prisma";
import {
  confirmDocumentInstanceIdentity,
  lockDocumentIdentityCompany,
  type IdentityServiceDependencies,
  type IdentityServiceDocument,
} from "./document-instance-service";
import type { DuplicateDocumentFacts } from "./document-duplicate-reasons";
import {
  findReviewedInstallmentEvidence,
  reviewedCanonicalTextDigest,
} from "./document-instance-reviewed-evidence";

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function normalizeReference(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

function normalizeLabel(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("is-IS")
        .replace(/[.:#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function metadataConfirmsObligationReference(
  metadata: unknown,
  receiptNumber: string,
) {
  const root = object(metadata);
  const canonicalExtraction = object(root?.canonicalExtraction);
  const loanInfo = object(canonicalExtraction?.loanInfo);
  if (!loanInfo) return false;

  const expected = normalizeReference(receiptNumber);
  if (!expected) return false;

  const collectionNumber = normalizeReference(loanInfo.collectionLetterNumber);
  const collectionLabel = normalizeLabel(loanInfo.collectionLetterNumberSourceLabel);
  if (
    collectionNumber === expected &&
    (collectionLabel.includes("innheimtubref") ||
      collectionLabel.includes("collection letter"))
  ) {
    return true;
  }

  const loanNumber = normalizeReference(loanInfo.loanNumber);
  const loanLabel = normalizeLabel(loanInfo.loanNumberSourceLabel);
  return (
    loanNumber === expected &&
    (loanLabel === "lan" ||
      loanLabel.includes("lansnumer") ||
      loanLabel.includes("numer lans") ||
      loanLabel.includes("loan number"))
  );
}

function findPrintedInstallmentEvidence(pageText: string) {
  const normalized = pageText.normalize("NFKC").replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(Gjaldagi)\s*[:#-]?\s*(\d{1,5})\s*(?:af|\/)\s*(\d{1,6})\b/iu,
    /\b(Afborgun(?:arnumer|arnúmer|arnr\.?| numer| númer| nr\.?)?)\s*[:#-]?\s*(\d{1,5})\s*(?:af|\/)\s*(\d{1,6})\b/iu,
    /\b(Installment)\s*[:#-]?\s*(\d{1,5})\s*(?:of|\/)\s*(\d{1,6})\b/iu,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const sequence = Number(match[2]);
    const total = Number(match[3]);
    if (
      !Number.isSafeInteger(sequence) ||
      !Number.isSafeInteger(total) ||
      sequence < 1 ||
      total < 1 ||
      sequence > total
    ) {
      continue;
    }
    return {
      fieldLabel: match[1],
      sequenceText: String(sequence),
      totalText: String(total),
      verbatimText: match[0],
    };
  }

  return null;
}

function pageContainsReference(pageText: string, receiptNumber: string) {
  const reference = normalizeReference(receiptNumber);
  return Boolean(reference) && normalizeReference(pageText).includes(reference);
}

function pageConfirmsObligationReference(
  pageText: string,
  receiptNumber: string,
) {
  const normalizedPage = normalizeLabel(pageText);
  const normalizedValue = normalizeLabel(receiptNumber);
  if (!normalizedPage || !normalizedValue) return false;
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const label =
    "(?:innheimtubref(?:s)?(?: numer| nr)?|collection letter(?: number| no)?|" +
    "lansnumer|lan numer|numer lans|loan(?: number| no)?|" +
    "krafa(?: numer| nr)?|krofunumer|claim(?: number| no)?)";
  return new RegExp(`\\b${label}\\s+${escaped}\\b`, "iu").test(normalizedPage);
}

function loanIdentifierMatchesRepeatedReference(
  identifierValue: unknown,
  receiptNumber: string,
) {
  if (!text(identifierValue)) return false;
  const identifier = identifierValue
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "");
  const reference = receiptNumber
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!reference) return false;

  // Exact identity is allowed, but the important legacy case is a printed
  // collection/obligation reference that is the suffix of an already-confirmed
  // canonical loan number, e.g. 338379 -> 0142-338379. Requiring the literal
  // separator avoids treating an arbitrary numeric suffix as a loan binding.
  return identifier === reference || identifier.endsWith(`-${reference}`);
}

/**
 * Legacy bootstrap for documents that were booked before canonical LOAN links
 * existed. The old document is linked to the CURRENT document's already
 * confirmed obligation only when all of these are true:
 *
 *  - the current document has exactly one ACTIVE, CONFIRMED loan entity with a
 *    confirmed LIABILITY_PRINCIPAL account,
 *  - that canonical loan number explicitly contains the repeated printed
 *    reference as an exact value or "-reference" suffix,
 *  - the old original artifact itself prints that number under a loan/collection
 *    label, and
 *  - the old original artifact contains a valid printed installment sequence.
 *
 * This is evidence-backed migration of a missing historical relation, not an
 * inference from amount/date/merchant. If any condition is absent we do nothing
 * and the legacy duplicate guard remains blocking.
 */
async function bootstrapLegacyLoanBindingsForRepeatedReference(input: {
  companyId: number;
  currentDocumentId: number;
  candidateDocumentIds: number[];
  receiptNumber: string;
  actorUserId: number;
}) {
  if (input.candidateDocumentIds.length === 0) return;

  const current = await prisma.aiDetectedDocument.findFirst({
    where: {
      id: input.currentDocumentId,
      receipt: { companyId: input.companyId },
    },
    select: {
      entityLinks: {
        where: { role: "LOAN" },
        orderBy: { id: "asc" },
        select: {
          entityId: true,
          entity: {
            select: {
              id: true,
              companyId: true,
              entityType: true,
              status: true,
              identifierType: true,
              identifierValue: true,
              relationshipStatus: true,
              accountLinks: {
                where: {
                  role: "LIABILITY_PRINCIPAL",
                  status: "CONFIRMED",
                  account: {
                    companyId: input.companyId,
                    isActive: true,
                  },
                },
                select: { id: true },
                take: 2,
              },
            },
          },
        },
      },
    },
  });

  const eligibleBindings =
    current?.entityLinks.filter((link) => {
      const entity = link.entity;
      return (
        entity.companyId === input.companyId &&
        entity.entityType === "LOAN" &&
        entity.status === "ACTIVE" &&
        entity.relationshipStatus === "CONFIRMED" &&
        entity.identifierType === "LOAN_NUMBER" &&
        entity.accountLinks.length === 1 &&
        loanIdentifierMatchesRepeatedReference(
          entity.identifierValue,
          input.receiptNumber,
        )
      );
    }) ?? [];

  if (eligibleBindings.length !== 1) return;
  const loanEntityId = eligibleBindings[0].entityId;

  const candidates = await prisma.aiDetectedDocument.findMany({
    where: {
      id: { in: input.candidateDocumentIds },
      receiptNumber: input.receiptNumber,
      approvedAt: { not: null },
      receipt: { companyId: input.companyId },
    },
    select: {
      id: true,
      receiptId: true,
      pageNumber: true,
      summary: true,
      reviewedAt: true,
      extractionMetadata: true,
      receipt: {
        select: { fileHash: true },
      },
      entityLinks: {
        where: { role: "LOAN" },
        select: {
          entityId: true,
          entity: {
            select: {
              companyId: true,
              entityType: true,
              status: true,
              relationshipStatus: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const artifactLoader = createDocumentInstanceOriginalArtifactLoader(
    createPrismaSupabaseOriginalArtifactDependencies({
      prisma,
      storage: supabaseAdmin.storage,
    }),
  );

  for (const candidate of candidates) {
    // Never overwrite or compete with an existing active confirmed obligation
    // binding. A legacy row with conflicting canonical knowledge stays blocked.
    const activeConfirmedLoanLinks = candidate.entityLinks.filter((link) =>
      link.entity.companyId === input.companyId &&
      link.entity.entityType === "LOAN" &&
      link.entity.status === "ACTIVE" &&
      link.entity.relationshipStatus === "CONFIRMED"
    );
    if (activeConfirmedLoanLinks.length > 0) continue;
    if (!positiveId(candidate.pageNumber) || !text(candidate.receipt.fileHash)) {
      continue;
    }

    const artifact = await artifactLoader({
      companyId: input.companyId,
      receiptId: candidate.receiptId,
      documentId: candidate.id,
      extractionMetadata: candidate.extractionMetadata,
      sourceFileHash: candidate.receipt.fileHash,
      binding: null,
    });
    if (!artifact?.immutable) continue;

    let sourceProvesInstance = false;
    try {
      const pages = await extractTextPagesFromPdfBuffer(artifact.bytes);
      const pageText = pages[candidate.pageNumber - 1];
      sourceProvesInstance = Boolean(
        text(pageText) &&
          pageContainsReference(pageText, input.receiptNumber) &&
          pageConfirmsObligationReference(pageText, input.receiptNumber) &&
          findPrintedInstallmentEvidence(pageText),
      );
    } catch {
      sourceProvesInstance = false;
    }

    // Some bank-produced PDFs have an unusable embedded text layer even though
    // GLÖGGT already read and the user reviewed the canonical document summary.
    // Reuse that reviewed source only when it independently states both the
    // obligation reference and printed installment sequence. The immutable
    // original artifact was still hash-authenticated above.
    if (
      !sourceProvesInstance &&
      candidate.reviewedAt &&
      text(candidate.summary) &&
      findReviewedInstallmentEvidence(
        candidate.summary,
        input.receiptNumber,
      )
    ) {
      sourceProvesInstance = true;
    }
    if (!sourceProvesInstance) continue;

    await prisma.$transaction(async (tx) => {
      await lockDocumentIdentityCompany(tx, input.companyId);

      const locked = await tx.aiDetectedDocument.findFirst({
        where: {
          id: candidate.id,
          receiptId: candidate.receiptId,
          receiptNumber: input.receiptNumber,
          approvedAt: { not: null },
          receipt: { companyId: input.companyId },
        },
        select: {
          id: true,
          receiptId: true,
          entityLinks: {
            where: { role: "LOAN" },
            select: {
              entityId: true,
              entity: {
                select: {
                  companyId: true,
                  entityType: true,
                  status: true,
                  relationshipStatus: true,
                },
              },
            },
          },
        },
      });
      if (!locked) return;

      const conflicting = locked.entityLinks.some((link) =>
        link.entityId !== loanEntityId &&
        link.entity.companyId === input.companyId &&
        link.entity.entityType === "LOAN" &&
        link.entity.status === "ACTIVE" &&
        link.entity.relationshipStatus === "CONFIRMED"
      );
      if (conflicting) return;

      const existing = await tx.documentEntityLink.findUnique({
        where: {
          documentId_entityId_role: {
            documentId: locked.id,
            entityId: loanEntityId,
            role: "LOAN",
          },
        },
        select: { id: true },
      });
      if (existing) return;

      const confirmedAt = new Date();
      await tx.documentEntityLink.create({
        data: {
          receiptId: locked.receiptId,
          documentId: locked.id,
          entityId: loanEntityId,
          role: "LOAN",
          confidence: 1,
          source: "SYSTEM",
          confirmedAt,
          confirmedBy: input.actorUserId,
        },
      });

      await tx.auditEvent.create({
        data: {
          companyId: input.companyId,
          userId: input.actorUserId,
          entityType: "AiDetectedDocument",
          entityId: locked.id,
          parentEntityType: "Receipt",
          parentEntityId: locked.receiptId,
          action: "BOOTSTRAP_LEGACY_LOAN_BINDING",
          source: "SYSTEM",
          description:
            "Legacy bókað lánaskjal tengt við þegar staðfesta skuldbindingu út frá frumskjali og staðfestu lánsnúmeri.",
          afterData: {
            loanEntityId,
            role: "LOAN",
            receiptNumber: input.receiptNumber,
            confirmedAt: confirmedAt.toISOString(),
            reason: "DOCUMENT_INSTANCE_LEGACY_BINDING_BOOTSTRAP",
          },
          metadata: {
            triggerDocumentId: input.currentDocumentId,
            candidateDocumentId: locked.id,
          },
        },
      });
    });
  }
}

type BookingIdentityPreparationResult =
  | { status: "CONFIRMED" }
  | { status: "NOT_APPLICABLE" }
  | { status: "UNAVAILABLE"; reason: string };

type DocumentInstanceIdentityExecution =
  | {
      kind: "EXISTING_PROPOSAL";
      revision: number;
      evidenceDigest: string;
    }
  | {
      kind: "NEW_PROPOSAL";
      candidate: IdentityCandidate;
      evidence: IdentityEvidence;
    };

async function proposeAndConfirmDocumentInstanceIdentity(
  input: {
    companyId: number;
    documentId: number;
    actorUserId: number;
    execution: DocumentInstanceIdentityExecution;
  },
  dependencies: IdentityServiceDependencies,
): Promise<BookingIdentityPreparationResult> {
  let proposalRevision: number;
  let proposalDigest: string;

  if (input.execution.kind === "EXISTING_PROPOSAL") {
    proposalRevision = input.execution.revision;
    proposalDigest = input.execution.evidenceDigest;
  } else {
    const { candidate, evidence } = input.execution;
    const proposal = await prisma.$transaction(async (tx) => {
      await lockDocumentIdentityCompany(tx, input.companyId);
      const adapter = createPrismaIdentityTransaction(tx);
      if (!(await adapter.authorizeCompany(input.actorUserId, input.companyId))) {
        throw new Error("IDENTITY_FORBIDDEN");
      }

      const locked = await adapter.readDocument(input.companyId, input.documentId);
      if (
        !locked?.binding?.confirmed ||
        locked.binding.entityId !== candidate.obligation.entityId ||
        locked.binding.revision !== evidence.bindingRevision ||
        locked.sourceFileHash !== evidence.sourceFileHash
      ) {
        throw new Error("IDENTITY_BINDING_CHANGED");
      }

      const existing = parseDocumentIdentityEnvelope(locked.extractionMetadata);
      if (existing.ok) {
        if (existing.envelope.state === "CONFIRMED") {
          return {
            state: "CONFIRMED" as const,
            revision: existing.envelope.revision,
            evidenceDigest: existing.envelope.evidenceDigest,
          };
        }
        if (existing.envelope.state === "PROPOSED") {
          return {
            state: "PROPOSED" as const,
            revision: existing.envelope.revision,
            evidenceDigest: existing.envelope.evidenceDigest,
          };
        }
        throw new Error("IDENTITY_NOT_PROPOSABLE");
      }
      if (existing.code !== "ABSENT") throw new Error(existing.code);

      const context: IdentityContext = {
        companyId: locked.companyId,
        receiptId: locked.receiptId,
        documentId: locked.documentId,
        obligationEntityId: locked.binding.entityId,
        bindingRevision: locked.binding.revision,
        sourceFileHash: locked.sourceFileHash,
        verifiedEvidenceDigest: null,
      };
      const requestId = `BOOKING_INSTANCE_PROPOSE:${input.documentId}:${randomUUID()}`;
      const plan = planDocumentIdentityTransition({
        metadata: locked.extractionMetadata,
        previousAudit: null,
        context,
        expectedRevision: 0,
        expectedEvidenceDigest: null,
        actorUserId: input.actorUserId,
        requestId,
        occurredAt: new Date().toISOString(),
        command: { kind: "PROPOSE", candidate, evidence },
      });

      const createdAudit = await tx.auditEvent.create({
        data: {
          companyId: plan.audit.companyId,
          userId: plan.audit.userId,
          entityType: plan.audit.entityType,
          entityId: plan.audit.entityId,
          parentEntityType: plan.audit.parentEntityType,
          parentEntityId: plan.audit.parentEntityId,
          action: plan.audit.action,
          source: plan.audit.source,
          beforeData:
            plan.audit.beforeData === null
              ? Prisma.JsonNull
              : (plan.audit.beforeData as unknown as Prisma.InputJsonObject),
          afterData: plan.audit.afterData as unknown as Prisma.InputJsonObject,
          metadata: plan.audit.metadata as unknown as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      const audit: IdentityAuditRecord = {
        id: createdAudit.id,
        ...plan.audit,
      };
      const nextMetadata = attachDocumentIdentityAudit(plan, audit);

      await tx.aiDetectedDocument.update({
        where: { id: input.documentId },
        data: {
          extractionMetadata: nextMetadata as Prisma.InputJsonObject,
        },
      });

      const parsed = parseDocumentIdentityEnvelope(nextMetadata);
      if (!parsed.ok || parsed.envelope.state !== "PROPOSED") {
        throw new Error("IDENTITY_PROPOSAL_PERSISTENCE_MISMATCH");
      }
      return {
        state: "PROPOSED" as const,
        revision: parsed.envelope.revision,
        evidenceDigest: parsed.envelope.evidenceDigest,
      };
    });

    if (proposal.state === "CONFIRMED") {
      return { status: "CONFIRMED" };
    }
    proposalRevision = proposal.revision;
    proposalDigest = proposal.evidenceDigest;
  }

  await confirmDocumentInstanceIdentity(
    {
      companyId: input.companyId,
      documentId: input.documentId,
      requestId: `BOOKING_INSTANCE_CONFIRM:${input.documentId}:${randomUUID()}`,
      expectedRevision: proposalRevision,
      expectedEvidenceDigest: proposalDigest,
    },
    dependencies,
  );

  return { status: "CONFIRMED" };
}

type DocumentInstanceIdentityDiscoveryResult =
  | {
      status: "DISCOVERED";
      candidate: IdentityCandidate;
      evidence: IdentityEvidence;
    }
  | { status: "UNAVAILABLE"; reason: string };

async function discoverLoanInstallmentDocumentInstanceIdentity(input: {
  companyId: number;
  receiptId: number;
  documentId: number;
  pageNumber: number;
  receiptNumber: string;
  summary: string | null;
  reviewedAt: Date | null;
  extractionMetadata: unknown;
  serviceDocument: IdentityServiceDocument;
  obligationEntityId: number;
  bindingRevision: string;
  sourceFileHash: string;
}): Promise<DocumentInstanceIdentityDiscoveryResult> {
  const artifactLoader = createDocumentInstanceOriginalArtifactLoader(
    createPrismaSupabaseOriginalArtifactDependencies({
      prisma,
      storage: supabaseAdmin.storage,
    }),
  );
  const artifact = await artifactLoader(input.serviceDocument);
  if (!artifact?.immutable) {
    return { status: "UNAVAILABLE", reason: "ORIGINAL_ARTIFACT_UNAVAILABLE" };
  }

  let originalPageText = "";
  try {
    const pages = await extractTextPagesFromPdfBuffer(artifact.bytes);
    originalPageText = pages[input.pageNumber - 1] ?? "";
  } catch {
    originalPageText = "";
  }

  const originalInstance =
    text(originalPageText) &&
    pageContainsReference(originalPageText, input.receiptNumber) &&
    (metadataConfirmsObligationReference(
      input.extractionMetadata,
      input.receiptNumber,
    ) ||
      pageConfirmsObligationReference(originalPageText, input.receiptNumber))
      ? findPrintedInstallmentEvidence(originalPageText)
      : null;

  const reviewedInstance =
    !originalInstance && input.reviewedAt && text(input.summary)
      ? findReviewedInstallmentEvidence(input.summary, input.receiptNumber)
      : null;

  if (!originalInstance && !reviewedInstance) {
    if (
      text(originalPageText) &&
      pageContainsReference(originalPageText, input.receiptNumber)
    ) {
      return {
        status: "UNAVAILABLE",
        reason: "INSTALLMENT_SEQUENCE_NOT_FOUND",
      };
    }
    return {
      status: "UNAVAILABLE",
      reason: "TRUSTED_INSTANCE_EVIDENCE_NOT_FOUND",
    };
  }

  const instance = originalInstance ?? reviewedInstance!;
  const usingReviewedCanonicalText = !originalInstance;

  const candidate: IdentityCandidate = {
    version: "document-instance-identity-v1",
    companyId: input.companyId,
    receiptId: input.receiptId,
    documentId: input.documentId,
    obligation: {
      companyId: input.companyId,
      entityId: input.obligationEntityId,
    },
    reference: {
      role: "OBLIGATION_REFERENCE",
      value: input.receiptNumber,
    },
    instance: {
      kind: "PRINTED_INSTALLMENT_SEQUENCE",
      sequenceText: instance.sequenceText,
      totalText: instance.totalText,
      provenance: usingReviewedCanonicalText
        ? {
            origin: "REVIEWED_CANONICAL_TEXT",
            sourceField: "summary",
            receiptId: input.receiptId,
            documentId: input.documentId,
            pageNumber: input.pageNumber,
            fieldLabel: instance.fieldLabel,
          }
        : {
            origin: "ORIGINAL_DOCUMENT",
            receiptId: input.receiptId,
            documentId: input.documentId,
            pageNumber: input.pageNumber,
            fieldLabel: instance.fieldLabel,
          },
    },
  };

  const evidence: IdentityEvidence = {
    sourceFileHash: input.sourceFileHash,
    verbatimText: instance.verbatimText,
    bindingRevision: input.bindingRevision,
    ...(usingReviewedCanonicalText &&
    input.reviewedAt &&
    typeof input.summary === "string" &&
    input.summary.trim().length > 0
      ? {
          reviewedTextDigest: reviewedCanonicalTextDigest(input.summary),
          reviewedAt: input.reviewedAt.toISOString(),
        }
      : {}),
  };

  return { status: "DISCOVERED", candidate, evidence };
}

async function prepareOneLoanDocumentInstanceIdentity(input: {
  companyId: number;
  documentId: number;
  actorUserId: number;
}): Promise<BookingIdentityPreparationResult> {
  const row = await prisma.aiDetectedDocument.findFirst({
    where: {
      id: input.documentId,
      receipt: { companyId: input.companyId },
    },
    select: {
      id: true,
      receiptId: true,
      pageNumber: true,
      receiptNumber: true,
      summary: true,
      reviewedAt: true,
      extractionMetadata: true,
    },
  });

  if (!row || !text(row.receiptNumber) || !positiveId(row.pageNumber)) {
    return { status: "NOT_APPLICABLE" };
  }
  const receiptNumber = row.receiptNumber.trim();
  const pageNumber = row.pageNumber;

  const dependencies = createPrismaDocumentInstanceDependencies({
    prisma,
    authenticatedUserId: async () => input.actorUserId,
    verifyEvidence: createGloggtDocumentInstanceEvidenceVerifier(),
  });

  const serviceDocument = await dependencies.readForEvidence(
    input.companyId,
    input.documentId,
  );
  const binding = serviceDocument?.binding;
  const sourceFileHash = serviceDocument?.sourceFileHash;
  if (
    !serviceDocument ||
    !binding?.confirmed ||
    !positiveId(binding.entityId) ||
    !text(binding.revision) ||
    !text(sourceFileHash)
  ) {
    return { status: "NOT_APPLICABLE" };
  }

  const parsedExisting = parseDocumentIdentityEnvelope(
    serviceDocument.extractionMetadata,
  );
  if (parsedExisting.ok && parsedExisting.envelope.state === "CONFIRMED") {
    return { status: "CONFIRMED" };
  }
  if (
    parsedExisting.ok &&
    parsedExisting.envelope.state !== "PROPOSED"
  ) {
    return { status: "UNAVAILABLE", reason: "IDENTITY_NOT_PROPOSABLE" };
  }
  if (!parsedExisting.ok && parsedExisting.code !== "ABSENT") {
    return { status: "UNAVAILABLE", reason: parsedExisting.code };
  }

  if (parsedExisting.ok) {
    return proposeAndConfirmDocumentInstanceIdentity(
      {
        companyId: input.companyId,
        documentId: input.documentId,
        actorUserId: input.actorUserId,
        execution: {
          kind: "EXISTING_PROPOSAL",
          revision: parsedExisting.envelope.revision,
          evidenceDigest: parsedExisting.envelope.evidenceDigest,
        },
      },
      dependencies,
    );
  }

  const discovery = await discoverLoanInstallmentDocumentInstanceIdentity({
    companyId: input.companyId,
    receiptId: row.receiptId,
    documentId: row.id,
    pageNumber,
    receiptNumber,
    summary: row.summary,
    reviewedAt: row.reviewedAt,
    extractionMetadata: row.extractionMetadata,
    serviceDocument,
    obligationEntityId: binding.entityId,
    bindingRevision: binding.revision,
    sourceFileHash,
  });

  if (discovery.status === "UNAVAILABLE") {
    return discovery;
  }

  return proposeAndConfirmDocumentInstanceIdentity(
    {
      companyId: input.companyId,
      documentId: input.documentId,
      actorUserId: input.actorUserId,
      execution: {
        kind: "NEW_PROPOSAL",
        candidate: discovery.candidate,
        evidence: discovery.evidence,
      },
    },
    dependencies,
  );
}

/**
 * Booking bootstrap for a legacy repeated obligation reference.
 *
 * Nothing is relaxed merely because a document is loan-shaped. We only try the
 * identity path when there is already an approved document with the exact same
 * receiptNumber in the same company. If trusted original-artifact evidence or a
 * confirmed loan binding is missing, the legacy duplicate guard remains intact.
 */
export async function prepareReceiptNumberDocumentInstancesForBooking(input: {
  companyId: number;
  documentId: number;
  receiptNumber: string;
  actorUserId: number;
}) {
  const candidates = await prisma.aiDetectedDocument.findMany({
    where: {
      id: { not: input.documentId },
      receiptNumber: input.receiptNumber,
      approvedAt: { not: null },
      receipt: { companyId: input.companyId },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (candidates.length === 0) return;

  // Older already-booked documents can predate canonical DocumentEntityLink
  // creation. Before identity confirmation, migrate ONLY evidence-backed missing
  // historical bindings to the current document's already-confirmed obligation.
  // This is what lets 16/480 and 17/480 share 338379 without weakening the
  // ordinary invoice-number duplicate guard.
  await bootstrapLegacyLoanBindingsForRepeatedReference({
    companyId: input.companyId,
    currentDocumentId: input.documentId,
    candidateDocumentIds: candidates.map((item) => item.id),
    receiptNumber: input.receiptNumber,
    actorUserId: input.actorUserId,
  });

  for (const documentId of [input.documentId, ...candidates.map((item) => item.id)]) {
    try {
      await prepareOneLoanDocumentInstanceIdentity({
        companyId: input.companyId,
        documentId,
        actorUserId: input.actorUserId,
      });
    } catch (error) {
      // Fail closed: identity preparation is an optional way to prove that a
      // repeated obligation reference represents a distinct instance. Any
      // failure simply leaves the legacy duplicate reason blocking.
      console.warn(
        `[GLÖGGT document-instance] Identity preparation failed for document ${documentId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export async function readDuplicateIdentityState(
  tx: Prisma.TransactionClient,
  companyId: number,
  documentId: number,
): Promise<DuplicateDocumentFacts["identity"]> {
  const adapter = createPrismaIdentityTransaction(tx);
  const document = await adapter.readDocument(companyId, documentId);
  if (!document) return null;

  const parsed = parseDocumentIdentityEnvelope(document.extractionMetadata);
  if (!parsed.ok) return null;
  if (parsed.envelope.state === "PROPOSED") {
    return { state: "PROPOSED", value: parsed.envelope.candidate };
  }
  if (parsed.envelope.state === "INVALIDATED") {
    return { state: "INVALIDATED", value: parsed.envelope.candidate };
  }

  const binding = document.binding;
  if (
    !binding?.confirmed ||
    !positiveId(binding.entityId) ||
    !text(binding.revision)
  ) {
    return { state: "STALE", value: parsed.envelope.confirmedIdentity };
  }

  const audit = await adapter.readAudit(
    companyId,
    parsed.envelope.lastAuditEventId,
  );
  const context: IdentityContext = {
    companyId: document.companyId,
    receiptId: document.receiptId,
    documentId: document.documentId,
    obligationEntityId: binding.entityId,
    bindingRevision: binding.revision,
    sourceFileHash: document.sourceFileHash,
    // The CONFIRMED transition already reverified the immutable original
    // artifact. Under the shared company lock we now validate that the audited
    // envelope, source hash and binding revision are still current.
    verifiedEvidenceDigest: parsed.envelope.evidenceDigest,
  };
  const current = readCurrentConfirmedDocumentIdentity(
    document.extractionMetadata,
    context,
    audit,
  );
  if (!current.ok) {
    return { state: "STALE", value: parsed.envelope.confirmedIdentity };
  }
  return { state: "CURRENT_CONFIRMED", value: current.identity };
}
