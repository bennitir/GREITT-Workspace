import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { buildReviewedDocumentLearningObservation } from "./reviewed-document-learning";

export type ConfirmCardReviewedDocumentInput = {
  companyId: number;
  userId: number;
  paymentCardTransactionId: number;
  documentId: number;
};

const VERSION = "card-to-reviewed-document-v2";
const DAY_MS = 86_400_000;

function dayOrdinal(value: Date) {
  return Math.floor(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ) / DAY_MS);
}

function daysBetween(left: Date, right: Date) {
  return Math.abs(dayOrdinal(left) - dayOrdinal(right));
}

function normalizedDocumentType(value: string | null) {
  return String(value ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
}

/** Explicit human confirmation of one card purchase against one reviewed document. */
export async function confirmCardReviewedDocumentReconciliation(
  input: ConfirmCardReviewedDocumentInput,
  client?: Pick<PrismaClient, "$transaction">,
) {
  if (Object.values(input).some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("INVALID_CONFIRMATION_ID");
  }

  const db = client ?? (await import("../prisma")).prisma;

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const { companyId, userId, paymentCardTransactionId, documentId } = input;
        const [cardTransaction, document] = await Promise.all([
          tx.paymentCardTransaction.findUnique({
            where: { id: paymentCardTransactionId },
            include: { paymentCard: true },
          }),
          tx.aiDetectedDocument.findUnique({
            where: { id: documentId },
            include: {
              receipt: {
                select: {
                  companyId: true,
                },
              },
              financialEventLinks: {
                where: { role: "PRIMARY" },
                select: { id: true, eventId: true },
              },
            },
          }),
        ]);

        if (
          !cardTransaction ||
          !document ||
          cardTransaction.paymentCard.companyId !== companyId ||
          document.receipt.companyId !== companyId
        ) {
          throw new Error("PAIR_NOT_FOUND_IN_COMPANY");
        }
        if (!document.reviewedAt) throw new Error("DOCUMENT_NOT_REVIEWED");
        if (document.reviewedContentRevision !== document.contentRevision) {
          throw new Error("DOCUMENT_REVIEW_STALE");
        }
        if (document.duplicateMarkedAt) throw new Error("DOCUMENT_DUPLICATE_PENDING");
        if (document.disposedAt || document.disposition) throw new Error("DOCUMENT_ALREADY_DISPOSED");
        if (!document.date || !Number.isFinite(document.date.getTime())) {
          throw new Error("DOCUMENT_CANONICAL_DATE_REQUIRED");
        }
        if (!document.merchantName?.trim()) {
          throw new Error("DOCUMENT_CANONICAL_MERCHANT_REQUIRED");
        }
        if (document.totalAmount === null || !Number.isFinite(document.totalAmount) || document.totalAmount === 0) {
          throw new Error("DOCUMENT_AMOUNT_NOT_CONFIRMABLE");
        }
        const documentAmount = new Prisma.Decimal(document.totalAmount);
        if (cardTransaction.amount.isZero() || !cardTransaction.amount.abs().eq(documentAmount.abs())) {
          throw new Error("CARD_RECONCILIATION_REQUIRES_EXACT_AMOUNT");
        }
        if (document.financialEventLinks.length > 0) {
          throw new Error("DOCUMENT_HAS_PRIMARY_FINANCIAL_EVENT");
        }

        const amount = cardTransaction.amount.abs();
        const participants = [
          {
            sourceType: "PAYMENT_CARD_TRANSACTION",
            sourceKey: String(paymentCardTransactionId),
            role: "MONEY_MOVEMENT",
            matchedAmount: amount,
          },
          {
            sourceType: "AI_DETECTED_DOCUMENT",
            sourceKey: String(documentId),
            role: "EVIDENCE",
            matchedAmount: amount,
          },
        ];

        const exactPair = await tx.financialReconciliation.findMany({
          where: {
            companyId,
            reconciliationType: "CARD_TO_REVIEWED_DOCUMENT",
            AND: participants.map(({ sourceType, sourceKey }) => ({
              participants: { some: { sourceType, sourceKey } },
            })),
          },
          include: { participants: true },
        });
        if (exactPair.length > 1) throw new Error("AMBIGUOUS_EXISTING_RECONCILIATION");
        const existing = exactPair[0];

        if (existing && !["PROPOSED", "CONFIRMED"].includes(existing.status)) {
          throw new Error("RECONCILIATION_STATUS_NOT_CONFIRMABLE");
        }
        if (existing && (
          existing.participants.length !== 2 ||
          !participants.every((expected) => existing.participants.some((actual) =>
            actual.sourceType === expected.sourceType &&
            actual.sourceKey === expected.sourceKey &&
            actual.role === expected.role &&
            (existing.status !== "CONFIRMED" || actual.matchedAmount.eq(amount)),
          ))
        )) {
          throw new Error("RECONCILIATION_PARTICIPANTS_MISMATCH");
        }

        const [cardOwners, documentOwners] = await Promise.all([
          tx.financialReconciliation.findMany({
            where: {
              companyId,
              status: "CONFIRMED",
              participants: {
                some: {
                  sourceType: "PAYMENT_CARD_TRANSACTION",
                  sourceKey: String(paymentCardTransactionId),
                  role: "MONEY_MOVEMENT",
                },
              },
            },
            select: { id: true },
          }),
          tx.financialReconciliation.findMany({
            where: {
              companyId,
              status: "CONFIRMED",
              participants: {
                some: {
                  sourceType: "AI_DETECTED_DOCUMENT",
                  sourceKey: String(documentId),
                  role: "EVIDENCE",
                },
              },
            },
            select: { id: true },
          }),
        ]);

        if (cardOwners.some((item) => item.id !== existing?.id)) {
          throw new Error("PAYMENT_CARD_TRANSACTION_ALREADY_RECONCILED");
        }
        if (documentOwners.some((item) => item.id !== existing?.id)) {
          throw new Error("DOCUMENT_ALREADY_RECONCILED");
        }
        if (cardTransaction.status === "RECONCILED" && existing?.status !== "CONFIRMED") {
          throw new Error("PAYMENT_CARD_TRANSACTION_ALREADY_RECONCILED");
        }

        if (existing?.status === "CONFIRMED") {
          return {
            reconciliationId: existing.id,
            paymentCardTransactionId,
            documentId,
            amount: amount.toString(),
            paymentCardTransactionStatus: cardTransaction.status,
            idempotent: true,
          };
        }

        const effectiveDocumentDate = document.date;
        const dateDistanceDays = daysBetween(cardTransaction.date, effectiveDocumentDate);
        const documentMerchantName = document.merchantName;
        const learning = buildReviewedDocumentLearningObservation({
          bankText: cardTransaction.merchantText,
          bankSourceRawData: cardTransaction.sourceRawData,
          bankAmount: cardTransaction.amount.toString(),
          documentMerchantName,
          documentType: document.documentType,
          dateDistanceDays,
        });

        const confirmedAt = new Date();
        const metadata = {
          reconciliationVersion: VERSION,
          confirmationMode: "HUMAN_EXPLICIT_PAIR",
          amountRelation: "ABS_EQUAL",
          paymentCardTransactionId,
          paymentCardId: cardTransaction.paymentCardId,
          documentId,
          receiptId: document.receiptId,
          documentType: normalizedDocumentType(document.documentType),
          documentRole: document.documentRole,
          documentMerchantName,
          documentMerchantKennitala: document.merchantKennitala,
          documentReceiptNumber: document.receiptNumber,
          documentPageNumber: document.pageNumber,
          documentFingerprint: document.documentFingerprint,
          documentClassificationSource: document.classificationSource,
          canonicalFactScope: "AI_DETECTED_DOCUMENT",
          cardMerchantText: cardTransaction.merchantText,
          dateDistanceDays,
          learning,
        };

        const reconciliationData = {
          status: "CONFIRMED",
          source: "MANUAL",
          confirmedByUserId: userId,
          confirmedAt,
          metadata,
        };

        const reconciliation = existing
          ? await tx.financialReconciliation.update({
              where: { id: existing.id },
              data: {
                ...reconciliationData,
                participants: {
                  updateMany: {
                    where: {},
                    data: { matchedAmount: amount },
                  },
                },
              },
            })
          : await tx.financialReconciliation.create({
              data: {
                companyId,
                reconciliationType: "CARD_TO_REVIEWED_DOCUMENT",
                ...reconciliationData,
                participants: { create: participants },
              },
            });

        if (cardTransaction.status !== "RECONCILED") {
          await tx.paymentCardTransaction.update({
            where: { id: paymentCardTransactionId },
            data: { status: "RECONCILED" },
          });
        }

        await tx.auditEvent.create({
          data: {
            companyId,
            userId,
            entityType: "FinancialReconciliation",
            entityId: reconciliation.id,
            action: "CONFIRM_CARD_TO_REVIEWED_DOCUMENT",
            source: "USER",
            parentEntityType: "PAYMENT_CARD_TRANSACTION",
            parentEntityId: paymentCardTransactionId,
            beforeData: {
              paymentCardTransactionStatus: cardTransaction.status,
              reconciliationStatus: existing?.status ?? null,
            },
            afterData: {
              paymentCardTransactionStatus: "RECONCILED",
              reconciliationStatus: "CONFIRMED",
            },
            metadata,
          },
        });

        return {
          reconciliationId: reconciliation.id,
          paymentCardTransactionId,
          documentId,
          amount: amount.toString(),
          paymentCardTransactionStatus: "RECONCILED",
          idempotent: false,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2034", "P2002"].includes(error.code)
      ) throw error;
    }
  }
}
