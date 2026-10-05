import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { resolveCompanyReconciliationPolicy } from "./company-policy";
import {
  classificationExcludesDocumentCoverage,
  isFinancialSourceClassificationCode,
  validateFinancialSourceClassificationTransition,
  type FinancialSourceClassificationCode,
} from "./source-classification";

export const BANK_TRANSACTION_SOURCE_TYPE = "BANK_TRANSACTION";
export const PAYMENT_CARD_TRANSACTION_SOURCE_TYPE = "PAYMENT_CARD_TRANSACTION";

export type BankTransactionClassificationProjection = {
  id: number;
  bankTransactionId: number;
  classification: FinancialSourceClassificationCode;
  reason: string | null;
  confirmedByUserId: number | null;
  confirmedAt: Date;
};

function parseSourceKey(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getBankTransactionClassifications(input: {
  companyId: number;
  bankAccountId: number;
  prisma: PrismaClient;
}): Promise<BankTransactionClassificationProjection[]> {
  const transactions = await input.prisma.bankTransaction.findMany({
    where: {
      bankAccountId: input.bankAccountId,
      bankAccount: { companyId: input.companyId },
    },
    select: { id: true },
  });
  if (!transactions.length) return [];

  const transactionIds = new Set(transactions.map((item) => item.id));
  const rows = await input.prisma.financialSourceClassification.findMany({
    where: {
      companyId: input.companyId,
      sourceType: BANK_TRANSACTION_SOURCE_TYPE,
      sourceKey: { in: [...transactionIds].map(String) },
    },
    select: {
      id: true,
      sourceKey: true,
      classification: true,
      reason: true,
      confirmedByUserId: true,
      confirmedAt: true,
    },
  });

  return rows.flatMap((row) => {
    const bankTransactionId = parseSourceKey(row.sourceKey);
    if (
      bankTransactionId === null ||
      !transactionIds.has(bankTransactionId) ||
      !isFinancialSourceClassificationCode(row.classification)
    ) return [];

    return [{
      id: row.id,
      bankTransactionId,
      classification: row.classification,
      reason: row.reason,
      confirmedByUserId: row.confirmedByUserId,
      confirmedAt: row.confirmedAt,
    }];
  });
}

export async function setBankTransactionClassification(input: {
  companyId: number;
  userId: number;
  bankTransactionId: number;
  classification: FinancialSourceClassificationCode;
  reason?: string | null;
  prisma: PrismaClient;
}) {
  if (!isFinancialSourceClassificationCode(input.classification)) {
    throw new Error("INVALID_FINANCIAL_SOURCE_CLASSIFICATION");
  }

  return input.prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: {
        id: true,
        status: true,
        bankAccountId: true,
        bankAccount: {
          select: {
            companyId: true,
            company: {
              select: {
                taxIdentityType: true,
                personalBusinessUse: true,
                reconciliationCoverageOverride: true,
              },
            },
          },
        },
      },
    });

    if (!transaction || transaction.bankAccount.companyId !== input.companyId) {
      throw new Error("BANK_TRANSACTION_NOT_FOUND");
    }

    const policy = resolveCompanyReconciliationPolicy(transaction.bankAccount.company);
    const sourceKey = String(transaction.id);
    const confirmedReconciliation = classificationExcludesDocumentCoverage(input.classification)
      ? await tx.financialReconciliationParticipant.findFirst({
          where: {
            sourceType: BANK_TRANSACTION_SOURCE_TYPE,
            sourceKey,
            reconciliation: {
              companyId: input.companyId,
              status: "CONFIRMED",
            },
          },
          select: { id: true },
        })
      : null;

    const validationError = validateFinancialSourceClassificationTransition({
      classification: input.classification,
      allowsPersonalTransactionExclusion: policy.allowsPersonalTransactionExclusion,
      hasConfirmedReconciliation:
        transaction.status === "RECONCILED" || Boolean(confirmedReconciliation),
    });
    if (validationError) throw new Error(validationError);

    const existing = await tx.financialSourceClassification.findUnique({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: BANK_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
    });

    const confirmedAt = new Date();
    const reason = input.reason?.trim() || null;

    if (
      existing &&
      existing.classification === input.classification &&
      (existing.reason ?? null) === reason
    ) {
      return {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        classification: input.classification,
        recordId: existing.id,
        idempotent: true,
      };
    }

    const record = await tx.financialSourceClassification.upsert({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: BANK_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
      create: {
        companyId: input.companyId,
        sourceType: BANK_TRANSACTION_SOURCE_TYPE,
        sourceKey,
        classification: input.classification,
        source: "USER_CONFIRMED",
        reason,
        confirmedByUserId: input.userId,
        confirmedAt,
        metadata: {
          bankAccountId: transaction.bankAccountId,
          policyContext: policy.context,
        },
      },
      update: {
        classification: input.classification,
        source: "USER_CONFIRMED",
        reason,
        confirmedByUserId: input.userId,
        confirmedAt,
        metadata: {
          bankAccountId: transaction.bankAccountId,
          policyContext: policy.context,
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        entityType: "BankTransaction",
        entityId: transaction.id,
        action: existing ? "CHANGE_FINANCIAL_SOURCE_CLASSIFICATION" : "SET_FINANCIAL_SOURCE_CLASSIFICATION",
        parentEntityType: "BankAccount",
        parentEntityId: transaction.bankAccountId,
        source: "USER",
        description: `Bankafærsla flokkuð sem ${input.classification}.`,
        beforeData: existing
          ? {
              classification: existing.classification,
              reason: existing.reason,
            }
          : Prisma.JsonNull,
        afterData: {
          classification: input.classification,
          reason,
        },
        metadata: {
          sourceType: BANK_TRANSACTION_SOURCE_TYPE,
          sourceKey,
          classificationRecordId: record.id,
          policyContext: policy.context,
        },
      },
    });

    return {
      bankTransactionId: transaction.id,
      bankAccountId: transaction.bankAccountId,
      classification: input.classification,
      recordId: record.id,
      idempotent: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function clearBankTransactionClassification(input: {
  companyId: number;
  userId: number;
  bankTransactionId: number;
  prisma: PrismaClient;
}) {
  return input.prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: {
        id: true,
        bankAccountId: true,
        bankAccount: { select: { companyId: true } },
      },
    });
    if (!transaction || transaction.bankAccount.companyId !== input.companyId) {
      throw new Error("BANK_TRANSACTION_NOT_FOUND");
    }

    const sourceKey = String(transaction.id);
    const existing = await tx.financialSourceClassification.findUnique({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: BANK_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
    });

    if (!existing) {
      return {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        cleared: false,
      };
    }

    await tx.financialSourceClassification.delete({ where: { id: existing.id } });
    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        entityType: "BankTransaction",
        entityId: transaction.id,
        action: "CLEAR_FINANCIAL_SOURCE_CLASSIFICATION",
        parentEntityType: "BankAccount",
        parentEntityId: transaction.bankAccountId,
        source: "USER",
        description: "Flokkun bankafærslu afturkölluð.",
        beforeData: {
          classification: existing.classification,
          reason: existing.reason,
        },
        afterData: Prisma.JsonNull,
        metadata: {
          sourceType: BANK_TRANSACTION_SOURCE_TYPE,
          sourceKey,
          classificationRecordId: existing.id,
        },
      },
    });

    return {
      bankTransactionId: transaction.id,
      bankAccountId: transaction.bankAccountId,
      cleared: true,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}


export type PaymentCardTransactionClassificationProjection = {
  id: number;
  paymentCardTransactionId: number;
  classification: FinancialSourceClassificationCode;
  reason: string | null;
  confirmedByUserId: number | null;
  confirmedAt: Date;
};

export async function getPaymentCardTransactionClassifications(input: {
  companyId: number;
  paymentCardId: number;
  prisma: PrismaClient;
}): Promise<PaymentCardTransactionClassificationProjection[]> {
  const transactions = await input.prisma.paymentCardTransaction.findMany({
    where: {
      paymentCardId: input.paymentCardId,
      paymentCard: { companyId: input.companyId, isActive: true },
    },
    select: { id: true },
  });
  if (!transactions.length) return [];

  const transactionIds = new Set(transactions.map((item) => item.id));
  const rows = await input.prisma.financialSourceClassification.findMany({
    where: {
      companyId: input.companyId,
      sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
      sourceKey: { in: [...transactionIds].map(String) },
    },
    select: {
      id: true,
      sourceKey: true,
      classification: true,
      reason: true,
      confirmedByUserId: true,
      confirmedAt: true,
    },
  });

  return rows.flatMap((row) => {
    const paymentCardTransactionId = parseSourceKey(row.sourceKey);
    if (
      paymentCardTransactionId === null ||
      !transactionIds.has(paymentCardTransactionId) ||
      !isFinancialSourceClassificationCode(row.classification)
    ) return [];

    return [{
      id: row.id,
      paymentCardTransactionId,
      classification: row.classification,
      reason: row.reason,
      confirmedByUserId: row.confirmedByUserId,
      confirmedAt: row.confirmedAt,
    }];
  });
}

export async function setPaymentCardTransactionClassification(input: {
  companyId: number;
  userId: number;
  paymentCardTransactionId: number;
  classification: FinancialSourceClassificationCode;
  reason?: string | null;
  prisma: PrismaClient;
}) {
  if (!isFinancialSourceClassificationCode(input.classification)) {
    throw new Error("INVALID_FINANCIAL_SOURCE_CLASSIFICATION");
  }

  return input.prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentCardTransaction.findUnique({
      where: { id: input.paymentCardTransactionId },
      select: {
        id: true,
        status: true,
        paymentCardId: true,
        paymentCard: {
          select: {
            companyId: true,
            isActive: true,
            company: {
              select: {
                taxIdentityType: true,
                personalBusinessUse: true,
                reconciliationCoverageOverride: true,
              },
            },
          },
        },
      },
    });

    if (
      !transaction ||
      !transaction.paymentCard.isActive ||
      transaction.paymentCard.companyId !== input.companyId
    ) {
      throw new Error("PAYMENT_CARD_TRANSACTION_NOT_FOUND");
    }

    const policy = resolveCompanyReconciliationPolicy(transaction.paymentCard.company);
    const sourceKey = String(transaction.id);
    const confirmedReconciliation = classificationExcludesDocumentCoverage(input.classification)
      ? await tx.financialReconciliationParticipant.findFirst({
          where: {
            sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
            sourceKey,
            reconciliation: {
              companyId: input.companyId,
              status: "CONFIRMED",
            },
          },
          select: { id: true },
        })
      : null;

    const validationError = validateFinancialSourceClassificationTransition({
      classification: input.classification,
      allowsPersonalTransactionExclusion: policy.allowsPersonalTransactionExclusion,
      hasConfirmedReconciliation:
        transaction.status === "RECONCILED" || Boolean(confirmedReconciliation),
    });
    if (validationError) throw new Error(validationError);

    const existing = await tx.financialSourceClassification.findUnique({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
    });

    const confirmedAt = new Date();
    const reason = input.reason?.trim() || null;
    if (
      existing &&
      existing.classification === input.classification &&
      (existing.reason ?? null) === reason
    ) {
      return {
        paymentCardTransactionId: transaction.id,
        paymentCardId: transaction.paymentCardId,
        classification: input.classification,
        recordId: existing.id,
        idempotent: true,
      };
    }

    const record = await tx.financialSourceClassification.upsert({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
      create: {
        companyId: input.companyId,
        sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
        sourceKey,
        classification: input.classification,
        source: "USER_CONFIRMED",
        reason,
        confirmedByUserId: input.userId,
        confirmedAt,
        metadata: {
          paymentCardId: transaction.paymentCardId,
          policyContext: policy.context,
        },
      },
      update: {
        classification: input.classification,
        source: "USER_CONFIRMED",
        reason,
        confirmedByUserId: input.userId,
        confirmedAt,
        metadata: {
          paymentCardId: transaction.paymentCardId,
          policyContext: policy.context,
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        entityType: "PaymentCardTransaction",
        entityId: transaction.id,
        action: existing
          ? "CHANGE_FINANCIAL_SOURCE_CLASSIFICATION"
          : "SET_FINANCIAL_SOURCE_CLASSIFICATION",
        parentEntityType: "PaymentCard",
        parentEntityId: transaction.paymentCardId,
        source: "USER",
        description: `Kortafærsla flokkuð sem ${input.classification}.`,
        beforeData: existing
          ? { classification: existing.classification, reason: existing.reason }
          : Prisma.JsonNull,
        afterData: { classification: input.classification, reason },
        metadata: {
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey,
          classificationRecordId: record.id,
          policyContext: policy.context,
        },
      },
    });

    return {
      paymentCardTransactionId: transaction.id,
      paymentCardId: transaction.paymentCardId,
      classification: input.classification,
      recordId: record.id,
      idempotent: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setPaymentCardTransactionClassifications(input: {
  companyId: number;
  userId: number;
  paymentCardId: number;
  paymentCardTransactionIds: number[];
  classification: FinancialSourceClassificationCode;
  reason?: string | null;
  prisma: PrismaClient;
}) {
  if (!isFinancialSourceClassificationCode(input.classification)) {
    throw new Error("INVALID_FINANCIAL_SOURCE_CLASSIFICATION");
  }

  const transactionIds = [...new Set(input.paymentCardTransactionIds)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
  if (!transactionIds.length || transactionIds.length > 200) {
    throw new Error("INVALID_FINANCIAL_SOURCE_CLASSIFICATION_SELECTION");
  }

  return input.prisma.$transaction(async (tx) => {
    const card = await tx.paymentCard.findFirst({
      where: {
        id: input.paymentCardId,
        companyId: input.companyId,
        isActive: true,
      },
      select: {
        id: true,
        company: {
          select: {
            taxIdentityType: true,
            personalBusinessUse: true,
            reconciliationCoverageOverride: true,
          },
        },
      },
    });
    if (!card) throw new Error("PAYMENT_CARD_NOT_FOUND");

    const transactions = await tx.paymentCardTransaction.findMany({
      where: {
        id: { in: transactionIds },
        paymentCardId: input.paymentCardId,
      },
      select: { id: true, status: true },
    });
    if (transactions.length !== transactionIds.length) {
      throw new Error("PAYMENT_CARD_TRANSACTION_NOT_FOUND");
    }

    const policy = resolveCompanyReconciliationPolicy(card.company);
    const sourceKeys = transactionIds.map(String);
    const confirmedKeys = classificationExcludesDocumentCoverage(input.classification)
      ? new Set(
          (await tx.financialReconciliationParticipant.findMany({
            where: {
              sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
              sourceKey: { in: sourceKeys },
              reconciliation: {
                companyId: input.companyId,
                status: "CONFIRMED",
              },
            },
            select: { sourceKey: true },
          })).map((item) => item.sourceKey),
        )
      : new Set<string>();

    for (const transaction of transactions) {
      const validationError = validateFinancialSourceClassificationTransition({
        classification: input.classification,
        allowsPersonalTransactionExclusion: policy.allowsPersonalTransactionExclusion,
        hasConfirmedReconciliation:
          transaction.status === "RECONCILED" || confirmedKeys.has(String(transaction.id)),
      });
      if (validationError) throw new Error(validationError);
    }

    const existingRows = await tx.financialSourceClassification.findMany({
      where: {
        companyId: input.companyId,
        sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
        sourceKey: { in: sourceKeys },
      },
      select: {
        id: true,
        sourceKey: true,
        classification: true,
        reason: true,
      },
    });
    const existingByKey = new Map(existingRows.map((row) => [row.sourceKey, row] as const));
    const reason = input.reason?.trim() || null;
    const changedTransactions = transactions.filter((transaction) => {
      const existing = existingByKey.get(String(transaction.id));
      return !existing || existing.classification !== input.classification || (existing.reason ?? null) !== reason;
    });

    if (!changedTransactions.length) {
      return { paymentCardId: input.paymentCardId, selected: transactions.length, changed: 0 };
    }

    const confirmedAt = new Date();
    const metadata = {
      paymentCardId: input.paymentCardId,
      policyContext: policy.context,
      bulk: true,
    };
    const changedKeys = new Set(changedTransactions.map((transaction) => String(transaction.id)));
    const existingChangedIds = existingRows
      .filter((row) => changedKeys.has(row.sourceKey))
      .map((row) => row.id);
    const missingTransactions = changedTransactions.filter(
      (transaction) => !existingByKey.has(String(transaction.id)),
    );

    if (existingChangedIds.length) {
      await tx.financialSourceClassification.updateMany({
        where: { id: { in: existingChangedIds } },
        data: {
          classification: input.classification,
          source: "USER_CONFIRMED",
          reason,
          confirmedByUserId: input.userId,
          confirmedAt,
          metadata,
        },
      });
    }

    if (missingTransactions.length) {
      await tx.financialSourceClassification.createMany({
        data: missingTransactions.map((transaction) => ({
          companyId: input.companyId,
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey: String(transaction.id),
          classification: input.classification,
          source: "USER_CONFIRMED",
          reason,
          confirmedByUserId: input.userId,
          confirmedAt,
          metadata,
        })),
      });
    }

    await tx.auditEvent.createMany({
      data: changedTransactions.map((transaction) => {
        const existing = existingByKey.get(String(transaction.id));
        return {
          companyId: input.companyId,
          userId: input.userId,
          entityType: "PaymentCardTransaction",
          entityId: transaction.id,
          action: existing
            ? "CHANGE_FINANCIAL_SOURCE_CLASSIFICATION"
            : "SET_FINANCIAL_SOURCE_CLASSIFICATION",
          parentEntityType: "PaymentCard",
          parentEntityId: input.paymentCardId,
          source: "USER",
          description: `Kortafærsla flokkuð sem ${input.classification} í fjöldaaðgerð.`,
          beforeData: existing
            ? { classification: existing.classification, reason: existing.reason }
            : Prisma.JsonNull,
          afterData: { classification: input.classification, reason },
          metadata: {
            sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
            sourceKey: String(transaction.id),
            policyContext: policy.context,
            bulk: true,
          },
        };
      }),
    });

    return {
      paymentCardId: input.paymentCardId,
      selected: transactions.length,
      changed: changedTransactions.length,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });
}

export async function clearPaymentCardTransactionClassification(input: {
  companyId: number;
  userId: number;
  paymentCardTransactionId: number;
  prisma: PrismaClient;
}) {
  return input.prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentCardTransaction.findUnique({
      where: { id: input.paymentCardTransactionId },
      select: {
        id: true,
        paymentCardId: true,
        paymentCard: { select: { companyId: true, isActive: true } },
      },
    });
    if (
      !transaction ||
      !transaction.paymentCard.isActive ||
      transaction.paymentCard.companyId !== input.companyId
    ) {
      throw new Error("PAYMENT_CARD_TRANSACTION_NOT_FOUND");
    }

    const sourceKey = String(transaction.id);
    const existing = await tx.financialSourceClassification.findUnique({
      where: {
        companyId_sourceType_sourceKey: {
          companyId: input.companyId,
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey,
        },
      },
    });

    if (!existing) {
      return {
        paymentCardTransactionId: transaction.id,
        paymentCardId: transaction.paymentCardId,
        cleared: false,
      };
    }

    await tx.financialSourceClassification.delete({ where: { id: existing.id } });
    await tx.auditEvent.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        entityType: "PaymentCardTransaction",
        entityId: transaction.id,
        action: "CLEAR_FINANCIAL_SOURCE_CLASSIFICATION",
        parentEntityType: "PaymentCard",
        parentEntityId: transaction.paymentCardId,
        source: "USER",
        description: "Flokkun kortafærslu afturkölluð.",
        beforeData: {
          classification: existing.classification,
          reason: existing.reason,
        },
        afterData: Prisma.JsonNull,
        metadata: {
          sourceType: PAYMENT_CARD_TRANSACTION_SOURCE_TYPE,
          sourceKey,
          classificationRecordId: existing.id,
        },
      },
    });

    return {
      paymentCardTransactionId: transaction.id,
      paymentCardId: transaction.paymentCardId,
      cleared: true,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
