import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { canonicalizeInsightIdentifier } from "@/lib/insight/entity-identity";
import {
  inspectCanonicalReceiptKnowledge,
  reconcileDocumentFromKnownFacts,
  type ReceiptKnowledgeBlocker,
  type ReceiptKnowledgeReconciliationResult,
  type ReconciliationDocument,
  type ReconciliationEntityKnowledge,
} from "@/lib/insight/reconciliation";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function dedupeBlockers(blockers: ReceiptKnowledgeBlocker[]) {
  return [...new Set(blockers)];
}


function sameCanonicalIdentifier(
  entity: ReconciliationEntityKnowledge["entity"],
  input: { entityType: string; identifierType: string; identifierValue: string },
) {
  const wanted = canonicalizeInsightIdentifier(input);
  const candidate = canonicalizeInsightIdentifier({
    entityType: entity.entityType,
    identifierType: entity.identifierType,
    identifierValue: entity.identifierValue,
  });

  return (
    wanted.strength === "STRONG" &&
    candidate.strength === "STRONG" &&
    wanted.entityType === candidate.entityType &&
    wanted.identifierType === candidate.identifierType &&
    wanted.identifierValue === candidate.identifierValue
  );
}

async function findKnownEntityByStrongIdentifier(input: {
  companyId: number;
  entityType: string;
  identifierType: string;
  identifierValue: string;
}): Promise<ReconciliationEntityKnowledge["entity"] | null> {
  const wanted = canonicalizeInsightIdentifier(input);
  if (wanted.strength !== "STRONG" || !wanted.identifierType || !wanted.identifierValue) {
    return null;
  }

  const candidates = await prisma.insightEntity.findMany({
    where: {
      companyId: input.companyId,
      entityType: wanted.entityType,
      status: "ACTIVE",
      identifierValue: { not: null },
    },
    select: {
      id: true,
      entityType: true,
      identifierType: true,
      identifierValue: true,
      relationshipStatus: true,
      accountLinks: {
        where: { status: "CONFIRMED" },
        select: {
          role: true,
          status: true,
          account: {
            select: {
              number: true,
              companyId: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  const matches = candidates.filter((candidate) =>
    sameCanonicalIdentifier(candidate, input),
  );
  if (matches.length === 0) return null;

  // Fail closed: eitt CONFIRMED entity hefur forgang yfir eldri óstaðfest
  // semantic duplicates. Ef fleiri en eitt CONFIRMED entity bera sama sterka
  // auðkennið veljum við ekkert sjálfkrafa.
  const confirmed = matches.filter(
    (candidate) => candidate.relationshipStatus === "CONFIRMED",
  );
  if (confirmed.length === 1) return confirmed[0];
  if (confirmed.length > 1) return null;

  return matches.length === 1 ? matches[0] : null;
}

async function hydrateCanonicalEntityLinks(
  companyId: number,
  document: ReconciliationDocument,
): Promise<ReconciliationDocument> {
  const canonical = inspectCanonicalReceiptKnowledge(document.extractionMetadata);
  const entityLinks = [...document.entityLinks];

  for (const policy of canonical.insurancePolicies) {
    const identifier = {
      entityType: "INSURANCE_POLICY",
      identifierType: "POLICY_NUMBER",
      identifierValue: policy.policyNumber,
    };

    const alreadyLinked = entityLinks.some(
      (link) =>
        link.role === "INSURANCE_POLICY" &&
        sameCanonicalIdentifier(link.entity, identifier),
    );
    if (alreadyLinked) continue;

    const entity = await findKnownEntityByStrongIdentifier({
      companyId,
      ...identifier,
    });
    if (entity) {
      entityLinks.push({ role: "INSURANCE_POLICY", entity });
    }
  }

  const rawLoanNumber =
    canonical.loanInfo && typeof canonical.loanInfo.loanNumber === "string"
      ? canonical.loanInfo.loanNumber.trim()
      : "";
  if (rawLoanNumber) {
    const identifier = {
      entityType: "LOAN",
      identifierType: "LOAN_NUMBER",
      identifierValue: rawLoanNumber,
    };
    const alreadyLinked = entityLinks.some(
      (link) => link.role === "LOAN" && sameCanonicalIdentifier(link.entity, identifier),
    );

    if (!alreadyLinked) {
      const entity = await findKnownEntityByStrongIdentifier({
        companyId,
        ...identifier,
      });
      if (entity) {
        entityLinks.push({ role: "LOAN", entity });
      }
    }
  }

  return { ...document, entityLinks };
}

type LoadedReconciliationReceipt = NonNullable<
  Awaited<ReturnType<typeof loadReceiptForReconciliation>>
>;

async function loadReceiptForReconciliation(receiptId: number) {
  return prisma.receipt.findUnique({
    where: { id: receiptId },
    select: {
      id: true,
      companyId: true,
      aiDetectedDocuments: {
        where: {
          approvedAt: null,
          voucherNumber: null,
          disposedAt: null,
          disposition: null,
          duplicateMarkedAt: null,
        },
        select: {
          id: true,
          documentRole: true,
          summary: true,
          totalAmount: true,
          environmentReviewRequired: true,
          environmentConfirmedAt: true,
          extractionMetadata: true,
          entityLinks: {
            select: {
              role: true,
              entity: {
                select: {
                  id: true,
                  entityType: true,
                  identifierType: true,
                  identifierValue: true,
                  relationshipStatus: true,
                  accountLinks: {
                    where: { status: "CONFIRMED" },
                    select: {
                      role: true,
                      status: true,
                      account: {
                        select: {
                          number: true,
                          companyId: true,
                          isActive: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      company: {
        select: {
          accounts: {
            where: { isActive: true },
            select: {
              number: true,
              companyId: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

async function buildReconciliationDecisions(receipt: LoadedReconciliationReceipt) {
  const activeAccounts = new Map(
    receipt.company.accounts.map((account) => [account.number, account]),
  );

  return Promise.all(
    receipt.aiDetectedDocuments.map(async (document) => {
      const hydratedDocument = await hydrateCanonicalEntityLinks(
        receipt.companyId,
        document,
      );
      return {
        document,
        hydratedDocument,
        decision: reconcileDocumentFromKnownFacts({
          companyId: receipt.companyId,
          document: hydratedDocument,
          activeAccounts,
        }),
      };
    }),
  );
}

export async function previewReceiptReconciliationFromKnownFacts(receiptId: number) {
  const receipt = await loadReceiptForReconciliation(receiptId);
  if (!receipt) throw new Error("Fylgiskjal fannst ekki.");

  const decisions = await buildReconciliationDecisions(receipt);
  return decisions.map(({ document, hydratedDocument, decision }) => ({
    documentId: document.id,
    status: decision.status,
    reason: decision.reason,
    blockers: decision.blockers,
    canPromoteToBookable: decision.canPromoteToBookable,
    bookingEntries: decision.bookingEntries,
    appliedKnowledge: decision.appliedKnowledge,
    hydratedEntityLinkCount:
      hydratedDocument.entityLinks.length - document.entityLinks.length,
  }));
}

function stripKnownReviewSuffix(summary: string) {
  const normalized = summary.toLocaleLowerCase("is-IS");
  const isKnownMappingReview =
    normalized.includes("tryggingarskírteinum þurfa staðfest") ||
    normalized.includes("staðfestu skuldareikning lánsins") ||
    normalized.includes("lánshöfuðstóll fannst en lánsnúmer") ||
    normalized.includes("hefur ekki staðfesta tengingu við skuldareikning");

  if (!isKnownMappingReview) return summary.trimEnd();

  const marker = "\n\nGLÖGGT:";
  const index = summary.indexOf(marker);
  return index >= 0 ? summary.slice(0, index).trimEnd() : summary.trimEnd();
}

function mergeReconciliationMetadata(
  extractionMetadata: unknown,
  value: Record<string, unknown>,
): Prisma.InputJsonValue {
  const existing = asRecord(extractionMetadata) ?? {};
  return {
    ...existing,
    reconciliation: value,
  } as Prisma.InputJsonValue;
}

export async function reconcileReceiptFromKnownFacts(input: {
  receiptId: number;
  reason: string;
  userId?: number | null;
}): Promise<ReceiptKnowledgeReconciliationResult> {
  const receipt = await loadReceiptForReconciliation(input.receiptId);

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.aiDetectedDocuments.length === 0) {
    return {
      status: "NO_CHANGE",
      receiptId: receipt.id,
      documentIds: [],
      reconciledDocumentIds: [],
      blockers: ["NO_DOCUMENTS"],
      reason: "Engin óafgreidd greind skjöl eru til til endurútreiknings.",
      aiFallbackRecommended: true,
    };
  }

  const decisions = await buildReconciliationDecisions(receipt);

  const blockers = dedupeBlockers(
    decisions.flatMap(({ decision }) => decision.blockers),
  );
  const reconciled = decisions.filter(
    ({ decision }) => decision.status === "RECONCILED",
  );

  // Fail closed fyrir allt receipt: við uppfærum ekki hálfa fjölskjalagreiningu
  // ef önnur skjöl þurfa enn AI eða mannlega yfirferð.
  if (reconciled.length !== decisions.length) {
    const hasPendingKnowledgeConfirmation = blockers.some(
      (blocker) =>
        blocker === "UNCONFIRMED_ENTITY" ||
        blocker === "AMBIGUOUS_ENTITY" ||
        blocker === "MISSING_ACCOUNT_MAPPING",
    );

    return {
      status: "NEEDS_AI",
      receiptId: receipt.id,
      documentIds: decisions.map(({ document }) => document.id),
      reconciledDocumentIds: [],
      blockers,
      reason: decisions
        .filter(({ decision }) => decision.status !== "RECONCILED")
        .map(({ decision }) => decision.reason)
        .join(" | "),
      // Þegar notandi er enn að staðfesta fleiri entity/reikningstengingar má
      // ekki borga fyrir AI eftir hvert skref. Þegar slíkt gat er ekki eftir
      // má caller velja eitt AI fallback.
      aiFallbackRecommended: !hasPendingKnowledgeConfirmation,
    };
  }

  const reconciledAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const { document, hydratedDocument, decision } of decisions) {
      const originalLinkKeys = new Set(
        document.entityLinks.map((link) => `${link.role}:${link.entity.id}`),
      );
      const hydratedOnlyLinks = hydratedDocument.entityLinks.filter(
        (link) => !originalLinkKeys.has(`${link.role}:${link.entity.id}`),
      );

      // Sterkt canonical auðkenni má gera við vantaða document-link þegar
      // entity er þegar til. Við stofnum ekki ný entity hér og yfirskrifum
      // ekki notandatengingu sem kann að hafa orðið til samhliða.
      for (const link of hydratedOnlyLinks) {
        await tx.documentEntityLink.upsert({
          where: {
            documentId_entityId_role: {
              documentId: document.id,
              entityId: link.entity.id,
              role: link.role,
            },
          },
          update: {},
          create: {
            receiptId: receipt.id,
            documentId: document.id,
            entityId: link.entity.id,
            role: link.role,
            confidence: 1,
            source: "SYSTEM",
          },
        });
      }

      await tx.aiDetectedDocumentEntry.deleteMany({
        where: { documentId: document.id },
      });

      await tx.aiDetectedDocumentEntry.createMany({
        data: decision.bookingEntries.map((entry) => ({
          documentId: document.id,
          account: entry.account,
          text: entry.text,
          debit: entry.debit,
          credit: entry.credit,
        })),
      });

      const baseSummary = stripKnownReviewSuffix(document.summary);
      const reconciliationNote =
        "GLÖGGT: Bókun endurmetin úr canonical staðreyndum og staðfestri þekkingu án nýs AI-lesturs.";

      await tx.aiDetectedDocument.update({
        where: { id: document.id },
        data: {
          documentRole: decision.canPromoteToBookable
            ? "BOOKABLE"
            : document.documentRole,
          summary: `${baseSummary}\n\n${reconciliationNote}`,
          extractionMetadata: mergeReconciliationMetadata(
            document.extractionMetadata,
            {
              source: "KNOWN_FACTS",
              reason: input.reason,
              reconciledAt: reconciledAt.toISOString(),
              appliedKnowledge: decision.appliedKnowledge,
              bookingEntryCount: decision.bookingEntries.length,
              aiCalled: false,
            },
          ),
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: receipt.companyId,
        userId: input.userId ?? null,
        entityType: "Receipt",
        entityId: receipt.id,
        action: "RECONCILE_RECEIPT_FROM_KNOWN_FACTS",
        source: "SYSTEM",
        description:
          "Fylgiskjal endurmetið úr canonical staðreyndum og staðfestri þekkingu án nýs AI-kalls.",
        afterData: {
          documentIds: decisions.map(({ document }) => document.id),
          reason: input.reason,
          aiCalled: false,
        },
        metadata: {
          reconciliationVersion: "known-facts-v1",
          documentCount: decisions.length,
        },
      },
    });
  });

  return {
    status: "RECONCILED",
    receiptId: receipt.id,
    documentIds: decisions.map(({ document }) => document.id),
    reconciledDocumentIds: decisions.map(({ document }) => document.id),
    blockers: [],
    reason: "Öll óafgreidd skjöl voru endurmetin án AI.",
    aiFallbackRecommended: false,
  };
}
