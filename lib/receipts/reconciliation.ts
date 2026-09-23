import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import {
  reconcileDocumentFromKnownFacts,
  type ReceiptKnowledgeBlocker,
  type ReceiptKnowledgeReconciliationResult,
} from "@/lib/insight/reconciliation";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function dedupeBlockers(blockers: ReceiptKnowledgeBlocker[]) {
  return [...new Set(blockers)];
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
  const receipt = await prisma.receipt.findUnique({
    where: { id: input.receiptId },
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

  const activeAccounts = new Map(
    receipt.company.accounts.map((account) => [account.number, account]),
  );

  const decisions = receipt.aiDetectedDocuments.map((document) => ({
    document,
    decision: reconcileDocumentFromKnownFacts({
      companyId: receipt.companyId,
      document,
      activeAccounts,
    }),
  }));

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
    for (const { document, decision } of decisions) {
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
