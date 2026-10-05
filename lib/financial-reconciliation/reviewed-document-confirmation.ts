import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import {
  buildReviewedDocumentLearningObservation,
} from "./reviewed-document-learning";

export type ConfirmBankReviewedDocumentInput = {
  companyId: number;
  userId: number;
  bankTransactionId: number;
  documentId: number;
};

const VERSION = "bank-to-reviewed-document-v1";
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

/**
 * Explicit human confirmation between one bank movement and one reviewed
 * document. The reviewed document is evidence only: this action never creates
 * a FinancialEvent and never books the receipt.
 *
 * The confirmed reconciliation itself is the durable training fact. A compact
 * company-specific learning snapshot is stored in metadata so later candidate
 * generation can learn repeated bank-party -> document-party patterns without
 * introducing a second shadow truth store.
 */
export async function confirmBankReviewedDocumentReconciliation(
  input: ConfirmBankReviewedDocumentInput,
  client?: Pick<PrismaClient, "$transaction">,
) {
  if (Object.values(input).some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("INVALID_CONFIRMATION_ID");
  }

  const db = client ?? (await import("../prisma")).prisma;

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const { companyId, userId, bankTransactionId, documentId } = input;

        const [bank, document] = await Promise.all([
          tx.bankTransaction.findUnique({
            where: { id: bankTransactionId },
            include: { bankAccount: true },
          }),
          tx.aiDetectedDocument.findUnique({
            where: { id: documentId },
            include: {
              receipt: {
                select: {
                  companyId: true,
                  date: true,
                  aiDate: true,
                  merchantName: true,
                  merchantKennitala: true,
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
          !bank ||
          !document ||
          bank.bankAccount.companyId !== companyId ||
          document.receipt.companyId !== companyId
        ) {
          throw new Error("PAIR_NOT_FOUND_IN_COMPANY");
        }
        if (!document.reviewedAt) throw new Error("DOCUMENT_NOT_REVIEWED");
        if (document.totalAmount === null || !Number.isFinite(document.totalAmount) || document.totalAmount === 0) {
          throw new Error("DOCUMENT_AMOUNT_NOT_CONFIRMABLE");
        }
        const documentAmount = new Prisma.Decimal(document.totalAmount);
        if (bank.amount.isZero() || !bank.amount.abs().eq(documentAmount.abs())) {
          throw new Error("MANUAL_RECONCILIATION_REQUIRES_EXACT_AMOUNT");
        }
        if (document.financialEventLinks.length > 0) {
          throw new Error("DOCUMENT_HAS_PRIMARY_FINANCIAL_EVENT");
        }

        const amount = bank.amount.abs();
        const participants = [
          {
            sourceType: "BANK_TRANSACTION",
            sourceKey: String(bankTransactionId),
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
            reconciliationType: "BANK_TO_REVIEWED_DOCUMENT",
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

        const [bankOwners, documentOwners] = await Promise.all([
          tx.financialReconciliation.findMany({
            where: {
              companyId,
              status: "CONFIRMED",
              participants: {
                some: {
                  sourceType: "BANK_TRANSACTION",
                  sourceKey: String(bankTransactionId),
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

        if (bankOwners.some((item) => item.id !== existing?.id)) {
          throw new Error("BANK_TRANSACTION_ALREADY_RECONCILED");
        }
        if (documentOwners.some((item) => item.id !== existing?.id)) {
          throw new Error("DOCUMENT_ALREADY_RECONCILED");
        }
        if (bank.status === "RECONCILED" && existing?.status !== "CONFIRMED") {
          throw new Error("BANK_TRANSACTION_ALREADY_RECONCILED");
        }

        if (existing?.status === "CONFIRMED") {
          return {
            reconciliationId: existing.id,
            bankTransactionId,
            documentId,
            amount: amount.toString(),
            bankTransactionStatus: bank.status,
            idempotent: true,
          };
        }

        const effectiveDocumentDate =
          document.date ?? document.receipt.aiDate ?? document.receipt.date;
        const dateDistanceDays = effectiveDocumentDate
          ? daysBetween(bank.date, effectiveDocumentDate)
          : null;
        const documentMerchantName =
          document.merchantName ?? document.receipt.merchantName;
        const learning = dateDistanceDays === null
          ? null
          : buildReviewedDocumentLearningObservation({
              bankText: bank.text,
              bankSourceRawData: bank.sourceRawData,
              bankAmount: bank.amount.toString(),
              documentMerchantName,
              documentType: document.documentType,
              dateDistanceDays,
            });

        const confirmedAt = new Date();
        const metadata = {
          reconciliationVersion: VERSION,
          confirmationMode: "HUMAN_EXPLICIT_PAIR",
          amountRelation: "ABS_EQUAL",
          bankTransactionId,
          documentId,
          receiptId: document.receiptId,
          documentType: normalizedDocumentType(document.documentType),
          documentRole: document.documentRole,
          documentMerchantName,
          documentMerchantKennitala:
            document.merchantKennitala ?? document.receipt.merchantKennitala,
          documentReceiptNumber: document.receiptNumber,
          bankReference: bank.reference,
          bankText: bank.text,
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
              include: { participants: true },
            })
          : await tx.financialReconciliation.create({
              data: {
                companyId,
                reconciliationType: "BANK_TO_REVIEWED_DOCUMENT",
                ...reconciliationData,
                participants: { create: participants },
              },
              include: { participants: true },
            });

        if (bank.status !== "RECONCILED") {
          await tx.bankTransaction.update({
            where: { id: bankTransactionId },
            data: { status: "RECONCILED" },
          });
        }

        await tx.auditEvent.create({
          data: {
            companyId,
            userId,
            entityType: "FinancialReconciliation",
            entityId: reconciliation.id,
            action: "CONFIRM_BANK_TO_REVIEWED_DOCUMENT",
            source: "USER",
            parentEntityType: "BANK_TRANSACTION",
            parentEntityId: bankTransactionId,
            beforeData: {
              bankTransactionStatus: bank.status,
              reconciliationStatus: existing?.status ?? null,
            },
            afterData: {
              bankTransactionStatus: "RECONCILED",
              reconciliationStatus: "CONFIRMED",
            },
            metadata,
          },
        });

        return {
          reconciliationId: reconciliation.id,
          bankTransactionId,
          documentId,
          amount: amount.toString(),
          bankTransactionStatus: "RECONCILED",
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
