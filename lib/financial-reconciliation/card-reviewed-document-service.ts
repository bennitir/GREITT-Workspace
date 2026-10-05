import { prisma } from "../prisma";
import {
  buildCardReviewedDocumentCandidateGraph,
  type CardReviewedDocumentCandidate,
  type CardReviewedDocumentCandidateResolution,
} from "./card-reviewed-document-provider";
import {
  buildCardReviewedDocumentCoverageSnapshot,
  type CardCoverageDocument,
} from "./coverage-adapters";
import type { ReconciliationCoverageSnapshot } from "./coverage";
import {
  resolveCompanyReconciliationPolicy,
  type CompanyReconciliationPolicy,
} from "./company-policy";
import { buildReviewedDocumentLearningPatterns } from "./reviewed-document-learning";
import { materializeCanonicalReviewedDocuments } from "./reviewed-document-read-model";
import { buildReviewedDocumentMatchDiagnostics } from "./reviewed-document-match-diagnostics";
import {
  classificationExcludesDocumentCoverage,
  isFinancialSourceClassificationCode,
} from "./source-classification";
import { PAYMENT_CARD_TRANSACTION_SOURCE_TYPE } from "./source-classification-service";

export type CardReviewedDocumentCandidateResult =
  | {
      ok: false;
      code: "PAYMENT_CARD_NOT_FOUND" | "SOURCE_UNAVAILABLE";
      paymentCardId: number;
    }
  | {
      ok: true;
      paymentCardId: number;
      companyId: number;
      candidateCardTransactionCount: number;
      candidateCount: number;
      counts: {
        uniqueStrong: number;
        uniquePossible: number;
        ambiguous: number;
      };
      learnedPatternCount: number;
      coveragePolicy: CompanyReconciliationPolicy;
      coverage: ReconciliationCoverageSnapshot;
      diagnostics: ReturnType<typeof buildReviewedDocumentMatchDiagnostics>;
      resolutions: CardReviewedDocumentCandidateResolution[];
      candidates: CardReviewedDocumentCandidate[];
    };


function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedNetwork(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalCardPaymentContext(
  extractionMetadata: unknown,
  card: { network: string | null; lastFour: string | null },
): { method: string | null; scope: CardCoverageDocument["scope"] } {
  const metadata = jsonRecord(extractionMetadata);
  const extraction = jsonRecord(metadata?.canonicalExtraction);
  const paymentInfo = jsonRecord(extraction?.paymentInfo);
  const method = String(paymentInfo?.method ?? "").trim().toUpperCase() || null;

  if (!method) return { method: null, scope: "UNKNOWN" };
  if (method !== "CARD") return { method, scope: "EXCLUDED" };

  const documentLastFour = String(paymentInfo?.lastFour ?? "").replace(/\D/g, "").slice(-4);
  const cardLastFour = String(card.lastFour ?? "").replace(/\D/g, "").slice(-4);
  const documentNetwork = normalizedNetwork(paymentInfo?.network);
  const cardNetwork = normalizedNetwork(card.network);

  if (cardLastFour && documentLastFour) {
    if (cardLastFour !== documentLastFour) return { method, scope: "EXCLUDED" };
    if (cardNetwork && documentNetwork && cardNetwork !== documentNetwork) {
      return { method, scope: "EXCLUDED" };
    }
    return { method, scope: "IN_SCOPE" };
  }

  // A network such as VISA alone is not a unique card identity. Keep it
  // UNKNOWN rather than assigning the document to a specific card.
  if (cardNetwork && documentNetwork && cardNetwork !== documentNetwork) {
    return { method, scope: "EXCLUDED" };
  }
  return { method, scope: "UNKNOWN" };
}

/**
 * Read-only PaymentCardTransaction -> reviewed-document candidate bridge.
 *
 * PaymentCard remains its own truth source; nothing here books a receipt or
 * treats a card as a BankAccount. Confirmation is a separate explicit action.
 * Coverage mode is resolved from explicit Company policy. Unconfirmed company
 * context safely remains INFORMATIONAL; mixed-use/personal context is never
 * inferred from card transactions or kennitala here.
 */
export async function getCardReviewedDocumentCandidates(
  paymentCardId: number,
  companyId: number,
): Promise<CardReviewedDocumentCandidateResult> {
  if (![paymentCardId, companyId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, code: "PAYMENT_CARD_NOT_FOUND", paymentCardId };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;

      const card = await tx.paymentCard.findFirst({
        where: { id: paymentCardId, companyId, isActive: true },
        select: {
          id: true,
          companyId: true,
          network: true,
          lastFour: true,
          company: {
            select: {
              taxIdentityType: true,
              personalBusinessUse: true,
              reconciliationCoverageOverride: true,
            },
          },
        },
      });
      if (!card) {
        return { ok: false as const, code: "PAYMENT_CARD_NOT_FOUND" as const, paymentCardId };
      }

      const coveragePolicy = resolveCompanyReconciliationPolicy(card.company);

      const transactions = await tx.paymentCardTransaction.findMany({
        where: { paymentCardId: card.id },
        select: {
          id: true,
          paymentCardId: true,
          date: true,
          merchantText: true,
          amount: true,
          sourceRawData: true,
          status: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });

      const transactionIds = transactions.map((transaction) => transaction.id);

      // Interactive Prisma transactions backed by @prisma/adapter-pg use one
      // checked-out pg client. Do not issue concurrent tx.* queries on that
      // client: pg queues this today but warns that overlapping client.query()
      // calls are deprecated. Keep transaction-scoped reads deliberately
      // sequential; these are read-only queries and deterministic ordering is
      // more important here than a tiny amount of parallelism.
      const confirmedDocumentParticipants = await tx.financialReconciliationParticipant.findMany({
        where: {
          sourceType: "AI_DETECTED_DOCUMENT",
          role: "EVIDENCE",
          reconciliation: {
            companyId,
            status: "CONFIRMED",
          },
        },
        select: { sourceKey: true },
      });

      const confirmedCardReconciliations = await tx.financialReconciliation.findMany({
        where: {
          companyId,
          reconciliationType: "CARD_TO_REVIEWED_DOCUMENT",
          status: "CONFIRMED",
        },
        select: {
          source: true,
          metadata: true,
          participants: {
            select: {
              sourceType: true,
              sourceKey: true,
              role: true,
            },
          },
        },
        orderBy: [{ id: "asc" }],
      });

      const classificationRows = transactionIds.length
        ? await tx.financialSourceClassification.findMany({
            where: {
              companyId,
              sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
              sourceKey: { in: transactionIds.map(String) },
            },
            select: { sourceKey: true, classification: true },
          })
        : [];

      const classificationByTransactionId = new Map<number, string>();
      for (const row of classificationRows) {
        const transactionId = Number(row.sourceKey);
        if (
          Number.isSafeInteger(transactionId) &&
          transactionId > 0 &&
          isFinancialSourceClassificationCode(row.classification)
        ) {
          classificationByTransactionId.set(transactionId, row.classification);
        }
      }

      const unavailableDocumentIds = new Set(
        confirmedDocumentParticipants
          .map((participant) => Number(participant.sourceKey))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      );
      const confirmedCardTransactionIds = new Set<number>();
      const confirmedCardDocumentIds = new Set<number>();
      for (const reconciliation of confirmedCardReconciliations) {
        for (const participant of reconciliation.participants) {
          const id = Number(participant.sourceKey);
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          if (participant.sourceType === "PAYMENT_CARD_TRANSACTION" && participant.role === "MONEY_MOVEMENT") {
            confirmedCardTransactionIds.add(id);
          }
          if (participant.sourceType === "AI_DETECTED_DOCUMENT" && participant.role === "EVIDENCE") {
            confirmedCardDocumentIds.add(id);
          }
        }
      }

      const documents = await tx.aiDetectedDocument.findMany({
        where: {
          reviewedAt: { not: null },
          totalAmount: { not: null },
          duplicateMarkedAt: null,
          disposedAt: null,
          disposition: null,
          receipt: { companyId },
        },
        select: {
          id: true,
          receiptId: true,
          reviewedAt: true,
          date: true,
          documentType: true,
          documentRole: true,
          totalAmount: true,
          receiptNumber: true,
          merchantName: true,
          merchantKennitala: true,
          receipt: {
            select: {
              date: true,
              aiDate: true,
              merchantName: true,
              merchantKennitala: true,
              _count: { select: { aiDetectedDocuments: true } },
            },
          },
          pageNumber: true,
          documentFingerprint: true,
          classificationSource: true,
          extractionMetadata: true,
          duplicateMarkedAt: true,
          disposedAt: true,
          disposition: true,
          entityLinks: {
            select: {
              role: true,
              entity: {
                select: {
                  id: true,
                  entityType: true,
                  name: true,
                  identifierType: true,
                  identifierValue: true,
                },
              },
            },
          },
          financialEventLinks: {
            select: { role: true, eventId: true },
          },
        },
        orderBy: [{ id: "asc" }],
      });

      const learningPatterns = buildReviewedDocumentLearningPatterns(
        confirmedCardReconciliations
          .filter((item) => item.source === "MANUAL")
          .map((item) => item.metadata),
      );

      const canonicalDocuments = materializeCanonicalReviewedDocuments(
        documents.map((document) => ({
          ...document,
          container: {
            detectedDocumentCount: document.receipt._count.aiDetectedDocuments,
            date: document.receipt.date,
            aiDate: document.receipt.aiDate,
            merchantName: document.receipt.merchantName,
            merchantKennitala: document.receipt.merchantKennitala,
          },
        })),
      );
      const providerDocuments = canonicalDocuments.filter((document) =>
        !unavailableDocumentIds.has(document.documentId),
      );

      const candidateTransactions = transactions.filter((transaction) => {
        const classification = classificationByTransactionId.get(transaction.id);
        return transaction.status !== "RECONCILED" &&
          !confirmedCardTransactionIds.has(transaction.id) &&
          !classificationExcludesDocumentCoverage(
            isFinancialSourceClassificationCode(classification) ? classification : null,
          );
      });
      const resolutions = buildCardReviewedDocumentCandidateGraph(
        candidateTransactions.map((transaction) => ({
          id: transaction.id,
          paymentCardId: transaction.paymentCardId,
          date: transaction.date,
          merchantText: transaction.merchantText,
          amount: transaction.amount.toString(),
          sourceRawData: transaction.sourceRawData,
        })),
        providerDocuments,
        learningPatterns,
      );
      const candidates = resolutions.flatMap((resolution) => resolution.candidates);
      const diagnostics = buildReviewedDocumentMatchDiagnostics({
        sources: candidateTransactions.map((transaction) => ({
          sourceId: transaction.id,
          date: transaction.date,
          amount: transaction.amount.toString(),
          partyText: transaction.merchantText,
        })),
        documents: canonicalDocuments.map((document) => ({
          ...document,
          blockedByConfirmedReconciliation: unavailableDocumentIds.has(document.documentId),
        })),
        resolutions: resolutions.map((resolution) => ({
          sourceId: resolution.paymentCardTransactionId,
          state: resolution.state,
          candidateDocumentIds: resolution.candidates.map((candidate) => candidate.documentId),
        })),
        partyMode: "CONTAINMENT",
      });

      const candidateDocumentIds = new Set(candidates.map((candidate) => candidate.documentId));
      const coverageDocuments: CardCoverageDocument[] = documents.flatMap((document) => {
        const paymentContext = canonicalCardPaymentContext(document.extractionMetadata, card);
        const confirmedForThisCardFlow = confirmedCardDocumentIds.has(document.id);
        const discoveredForThisCardFlow = candidateDocumentIds.has(document.id);

        // Coverage compares card rows with reviewed documents that are already
        // known to be card-paid or are actually present in this card's
        // candidate/confirmed graph. Other company documents are not a target
        // denominator for this specific card.
        if (!confirmedForThisCardFlow && !discoveredForThisCardFlow && paymentContext.method !== "CARD") {
          return [];
        }

        const ownedByOtherFlow =
          unavailableDocumentIds.has(document.id) && !confirmedForThisCardFlow;
        const hasPrimaryFinancialEvent = document.financialEventLinks.some((link) => link.role === "PRIMARY");
        return [{
          id: document.id,
          amount: document.totalAmount,
          scope: ownedByOtherFlow || hasPrimaryFinancialEvent
            ? "EXCLUDED" as const
            : paymentContext.scope,
        }];
      });
      const coverage = buildCardReviewedDocumentCoverageSnapshot({
        mode: coveragePolicy.mode,
        transactions: transactions.map((transaction) => ({
          id: transaction.id,
          amount: transaction.amount.toString(),
          status: transaction.status,
        })),
        documents: coverageDocuments,
        resolutions,
        confirmedTransactionIds: [...confirmedCardTransactionIds],
        confirmedDocumentIds: [...confirmedCardDocumentIds],
        classifications: [...classificationByTransactionId.entries()].flatMap(
          ([paymentCardTransactionId, classification]) =>
            isFinancialSourceClassificationCode(classification)
              ? [{ paymentCardTransactionId, classification }]
              : [],
        ),
      });

      return {
        ok: true as const,
        paymentCardId: card.id,
        companyId: card.companyId,
        candidateCardTransactionCount: resolutions.length,
        candidateCount: candidates.length,
        counts: {
          uniqueStrong: resolutions.filter((resolution) => resolution.state === "UNIQUE_STRONG").length,
          uniquePossible: resolutions.filter((resolution) => resolution.state === "UNIQUE_POSSIBLE").length,
          ambiguous: resolutions.filter((resolution) => resolution.state === "AMBIGUOUS").length,
        },
        learnedPatternCount: learningPatterns.length,
        coveragePolicy,
        coverage,
        diagnostics,
        resolutions,
        candidates,
      };
    }, { isolationLevel: "RepeatableRead" });
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE", paymentCardId };
  }
}
