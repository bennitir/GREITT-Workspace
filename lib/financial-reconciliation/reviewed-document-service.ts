import { prisma } from "../prisma";
import {
  buildReviewedDocumentCandidateGraph,
  type ReviewedDocumentCandidate,
  type ReviewedDocumentCandidateInput,
  type ReviewedDocumentCandidateResolution,
} from "./reviewed-document-provider";
import {
  buildReviewedDocumentLearningPatterns,
} from "./reviewed-document-learning";
import { materializeCanonicalReviewedDocuments } from "./reviewed-document-read-model";
import { buildReviewedDocumentMatchDiagnostics } from "./reviewed-document-match-diagnostics";

export type ReviewedDocumentCandidateResult =
  | {
      ok: false;
      code: "BANK_ACCOUNT_NOT_FOUND" | "SOURCE_UNAVAILABLE";
      bankAccountId: number;
    }
  | {
      ok: true;
      bankAccountId: number;
      companyId: number;
      candidateBankTransactionCount: number;
      candidateCount: number;
      counts: {
        uniqueStrong: number;
        uniquePossible: number;
        ambiguous: number;
        accountingDocument: number;
        paymentNotice: number;
        paymentConfirmation: number;
        learnedPattern: number;
      };
      learnedPatternCount: number;
      diagnostics: ReturnType<typeof buildReviewedDocumentMatchDiagnostics>;
      resolutions: ReviewedDocumentCandidateResolution[];
      candidates: ReviewedDocumentCandidate[];
    };


/**
 * Read-only bridge from authoritative bank transactions to reviewed documents.
 *
 * This is intentionally independent of FinancialEvent materialization. It can
 * surface a reviewed document that existing booking/event candidate layers do
 * not yet see, but it never writes a reconciliation, event or booking.
 */
export async function getReviewedDocumentCandidates(
  bankAccountId: number,
  companyId: number,
): Promise<ReviewedDocumentCandidateResult> {
  if (![bankAccountId, companyId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, code: "BANK_ACCOUNT_NOT_FOUND", bankAccountId };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;

      const account = await tx.bankAccount.findFirst({
        where: { id: bankAccountId, companyId },
        select: { id: true, companyId: true },
      });
      if (!account) {
        return { ok: false as const, code: "BANK_ACCOUNT_NOT_FOUND" as const, bankAccountId };
      }

      const transactions = await tx.bankTransaction.findMany({
        where: {
          bankAccountId: account.id,
          status: { not: "RECONCILED" },
        },
        select: {
          id: true,
          bankAccountId: true,
          date: true,
          text: true,
          amount: true,
          reference: true,
          sourceRawData: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });

      const documents = await tx.aiDetectedDocument.findMany({
        where: {
          reviewedAt: { not: null },
          totalAmount: { not: null },
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
      const unavailableDocumentIds = new Set(
        confirmedDocumentParticipants
          .map((participant) => Number(participant.sourceKey))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      );

      const confirmedLearningReconciliations = await tx.financialReconciliation.findMany({
        where: {
          companyId,
          reconciliationType: "BANK_TO_REVIEWED_DOCUMENT",
          status: "CONFIRMED",
          source: "MANUAL",
        },
        select: { metadata: true },
        orderBy: [{ id: "asc" }],
      });
      const learningPatterns = buildReviewedDocumentLearningPatterns(
        confirmedLearningReconciliations.map((item) => item.metadata),
      );

      // Bank and card reconciliation now consume the exact same canonical
      // reviewed-document read model. Receipt is only a container/navigation
      // anchor; parent merchant/date facts never leak into sibling documents.
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
      const providerDocuments: ReviewedDocumentCandidateInput[] = canonicalDocuments.filter(
        (document) => !unavailableDocumentIds.has(document.documentId),
      );

      const resolutions = buildReviewedDocumentCandidateGraph(
        transactions.map((transaction) => ({
          id: transaction.id,
          bankAccountId: transaction.bankAccountId,
          date: transaction.date,
          text: transaction.text,
          amount: transaction.amount.toString(),
          reference: transaction.reference,
          sourceRawData: transaction.sourceRawData,
        })),
        providerDocuments,
        learningPatterns,
      );

      const candidates = resolutions.flatMap((resolution) => resolution.candidates);
      const diagnostics = buildReviewedDocumentMatchDiagnostics({
        sources: transactions.map((transaction) => ({
          sourceId: transaction.id,
          date: transaction.date,
          amount: transaction.amount.toString(),
          partyText: transaction.text,
        })),
        documents: canonicalDocuments.map((document) => ({
          ...document,
          blockedByConfirmedReconciliation: unavailableDocumentIds.has(document.documentId),
        })),
        resolutions: resolutions.map((resolution) => ({
          sourceId: resolution.bankTransactionId,
          state: resolution.state,
          candidateDocumentIds: resolution.candidates.map((candidate) => candidate.documentId),
        })),
        partyMode: "EXACT",
      });
      const counts = {
        uniqueStrong: resolutions.filter((resolution) => resolution.state === "UNIQUE_STRONG").length,
        uniquePossible: resolutions.filter((resolution) => resolution.state === "UNIQUE_POSSIBLE").length,
        ambiguous: resolutions.filter((resolution) => resolution.state === "AMBIGUOUS").length,
        accountingDocument: candidates.filter((candidate) =>
          candidate.evidenceKind === "ACCOUNTING_DOCUMENT_EVIDENCE").length,
        paymentNotice: candidates.filter((candidate) =>
          candidate.evidenceKind === "PAYMENT_NOTICE_EVIDENCE").length,
        paymentConfirmation: candidates.filter((candidate) =>
          candidate.evidenceKind === "PAYMENT_CONFIRMATION_EVIDENCE").length,
        learnedPattern: candidates.filter((candidate) =>
          candidate.identityEvidence === "LEARNED_COMPANY_PATTERN").length,
      };

      return {
        ok: true as const,
        bankAccountId: account.id,
        companyId: account.companyId,
        candidateBankTransactionCount: resolutions.length,
        candidateCount: candidates.length,
        counts,
        learnedPatternCount: learningPatterns.length,
        diagnostics,
        resolutions,
        candidates,
      };
    }, { isolationLevel: "RepeatableRead" });
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE", bankAccountId };
  }
}

export type ConfirmedBankReviewedDocumentLink = {
  reconciliationId: number;
  bankTransactionId: number;
  documentId: number;
  receiptId: number;
  documentType: string | null;
  merchantName: string | null;
  totalAmount: number | null;
  documentDate: Date | null;
  confirmedAt: Date | null;
};

export type ConfirmedBankReviewedDocumentLinkResult =
  | { ok: false; code: "BANK_ACCOUNT_NOT_FOUND" | "SOURCE_UNAVAILABLE"; bankAccountId: number }
  | { ok: true; bankAccountId: number; companyId: number; links: ConfirmedBankReviewedDocumentLink[] };

export async function getConfirmedBankReviewedDocumentLinks(
  bankAccountId: number,
  companyId: number,
): Promise<ConfirmedBankReviewedDocumentLinkResult> {
  if (![bankAccountId, companyId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, code: "BANK_ACCOUNT_NOT_FOUND", bankAccountId };
  }

  try {
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, companyId },
      select: { id: true, companyId: true },
    });
    if (!account) return { ok: false, code: "BANK_ACCOUNT_NOT_FOUND", bankAccountId };

    const bankTransactionKeys = (await prisma.bankTransaction.findMany({
      where: { bankAccountId },
      select: { id: true },
    })).map((item) => String(item.id));
    if (bankTransactionKeys.length === 0) {
      return { ok: true, bankAccountId, companyId, links: [] };
    }

    const reconciliations = await prisma.financialReconciliation.findMany({
      where: {
        companyId,
        reconciliationType: "BANK_TO_REVIEWED_DOCUMENT",
        status: "CONFIRMED",
        participants: {
          some: {
            sourceType: "BANK_TRANSACTION",
            role: "MONEY_MOVEMENT",
            sourceKey: { in: bankTransactionKeys },
          },
        },
      },
      select: {
        id: true,
        confirmedAt: true,
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

    const projected = reconciliations.flatMap((reconciliation) => {
      const bankParticipant = reconciliation.participants.find((participant) =>
        participant.sourceType === "BANK_TRANSACTION" && participant.role === "MONEY_MOVEMENT",
      );
      const documentParticipant = reconciliation.participants.find((participant) =>
        participant.sourceType === "AI_DETECTED_DOCUMENT" && participant.role === "EVIDENCE",
      );
      const bankTransactionId = Number(bankParticipant?.sourceKey);
      const documentId = Number(documentParticipant?.sourceKey);
      if (!Number.isSafeInteger(bankTransactionId) || !Number.isSafeInteger(documentId)) return [];
      return [{ reconciliationId: reconciliation.id, bankTransactionId, documentId, confirmedAt: reconciliation.confirmedAt }];
    });

    const documentIds = [...new Set(projected.map((item) => item.documentId))];
    const documents = documentIds.length
      ? await prisma.aiDetectedDocument.findMany({
          where: { id: { in: documentIds }, receipt: { companyId } },
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
            financialEventLinks: { select: { role: true, eventId: true } },
          },
        })
      : [];
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
    const documentsById = new Map(canonicalDocuments.map((document) => [document.documentId, document]));

    return {
      ok: true,
      bankAccountId,
      companyId,
      links: projected.flatMap((item) => {
        const document = documentsById.get(item.documentId);
        if (!document) return [];
        return [{
          reconciliationId: item.reconciliationId,
          bankTransactionId: item.bankTransactionId,
          documentId: item.documentId,
          receiptId: document.receiptId,
          documentType: document.documentType,
          merchantName: document.merchantName,
          totalAmount: Number(document.totalAmount),
          documentDate: document.effectiveDate,
          confirmedAt: item.confirmedAt,
        }];
      }),
    };
  } catch {
    return { ok: false, code: "SOURCE_UNAVAILABLE", bankAccountId };
  }
}
