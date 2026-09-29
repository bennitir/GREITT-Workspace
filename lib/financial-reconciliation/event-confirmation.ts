import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { buildBankFinancialEventCandidates } from "./event-candidates";

export type ConfirmBankFinancialEventInput = {
  companyId: number;
  userId: number;
  bankTransactionId: number;
  eventId: number;
};

const VERSION = "bank-to-financial-event-v1";

/** Internal service: caller must authorize userId to reconcile companyId.
 * Accepts IDs only, never a previously computed candidate or payment amount.
 */
export async function confirmBankFinancialEventPayment(
  input: ConfirmBankFinancialEventInput,
  client?: Pick<PrismaClient, "$transaction">,
) {
  if (Object.values(input).some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("INVALID_CONFIRMATION_ID");
  }
  const db = client ?? (await import("../prisma")).prisma;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const { companyId, userId, bankTransactionId, eventId } = input;
        const bank = await tx.bankTransaction.findUnique({
          where: { id: bankTransactionId }, include: { bankAccount: true },
        });
        const event = await tx.financialEvent.findUnique({ where: { id: eventId } });
        if (!bank || !event || bank.bankAccount.companyId !== companyId || event.companyId !== companyId) {
          throw new Error("PAIR_NOT_FOUND_IN_COMPANY");
        }
        // BankAccount has no currency field; this flow only accepts ISK events.
        const candidate = buildBankFinancialEventCandidates(bank.bankAccount,
          [{ ...bank, amount: bank.amount.toString() }],
          [{ ...event, amount: event.amount?.toString() ?? null }],
        )[0];
        if (!candidate || !event.amount) throw new Error("PAIR_NO_LONGER_VALID");

        const key = { eventId, bankTransactionId };
        const existingPayment = await tx.financialEventPayment.findUnique({
          where: { eventId_bankTransactionId: key },
        });
        if (bank.status === "RECONCILED" && existingPayment?.status !== "CONFIRMED") {
          throw new Error("BANK_TRANSACTION_ALREADY_RECONCILED");
        }
        if (existingPayment && !["PROPOSED", "CONFIRMED"].includes(existingPayment.status)) {
          throw new Error("PAYMENT_STATUS_NOT_CONFIRMABLE");
        }
        const amount = bank.amount.abs();
        if (existingPayment?.status === "CONFIRMED" &&
          (!existingPayment.amount.eq(amount) || existingPayment.currency !== event.currency)) {
          throw new Error("CONFIRMED_PAYMENT_MISMATCH");
        }
        const exclude = existingPayment ? { id: { not: existingPayment.id } } : {};
        const [bankPayments, eventPayments] = await Promise.all([
          tx.financialEventPayment.aggregate({
            where: { bankTransactionId, status: "CONFIRMED", ...exclude }, _sum: { amount: true },
          }),
          tx.financialEventPayment.aggregate({
            where: { eventId, status: "CONFIRMED", ...exclude }, _sum: { amount: true },
          }),
        ]);
        const bankTotal = (bankPayments._sum.amount ?? new Prisma.Decimal(0)).plus(amount);
        const eventTotal = (eventPayments._sum.amount ?? new Prisma.Decimal(0)).plus(amount);
        if (bankTotal.gt(bank.amount.abs())) throw new Error("BANK_PAYMENT_OVER_ALLOCATION");
        if (eventTotal.gt(event.amount.abs())) throw new Error("EVENT_PAYMENT_OVER_ALLOCATION");

        const participants = [
          { sourceType: "BANK_TRANSACTION", sourceKey: String(bankTransactionId), role: "MONEY_MOVEMENT", matchedAmount: amount },
          { sourceType: "FINANCIAL_EVENT", sourceKey: String(eventId), role: "OBLIGATION", matchedAmount: amount },
        ];
        const matches = await tx.financialReconciliation.findMany({
          where: {
            companyId, reconciliationType: "BANK_TO_FINANCIAL_EVENT",
            AND: participants.map(({ sourceType, sourceKey }) => ({
              participants: { some: { sourceType, sourceKey } },
            })),
          },
          include: { participants: true },
        });
        if (matches.length > 1) throw new Error("AMBIGUOUS_EXISTING_RECONCILIATION");
        const existingReconciliation = matches[0];
        if (existingReconciliation) {
          if (!["PROPOSED", "CONFIRMED"].includes(existingReconciliation.status)) {
            throw new Error("RECONCILIATION_STATUS_NOT_CONFIRMABLE");
          }
          if (existingReconciliation.participants.length !== 2 || !participants.every((expected) =>
            existingReconciliation.participants.some((actual) => actual.sourceType === expected.sourceType &&
              actual.sourceKey === expected.sourceKey && actual.role === expected.role &&
              (existingReconciliation.status !== "CONFIRMED" || actual.matchedAmount.eq(amount))))) {
            throw new Error("RECONCILIATION_PARTICIPANTS_MISMATCH");
          }
        }

        // Status alone is not authoritative: another flow may already own this
        // money movement. Only the validated exact-pair reconciliation is exempt.
        const confirmedBankReconciliations = await tx.financialReconciliation.findMany({
          where: {
            companyId,
            status: "CONFIRMED",
            participants: { some: {
              sourceType: "BANK_TRANSACTION", sourceKey: String(bankTransactionId), role: "MONEY_MOVEMENT",
            } },
          },
          select: { id: true },
        });
        if (confirmedBankReconciliations.some((reconciliation) => reconciliation.id !== existingReconciliation?.id)) {
          throw new Error("BANK_TRANSACTION_ALREADY_RECONCILED");
        }

        const bankStatusAfter = bankTotal.eq(bank.amount.abs()) ? "RECONCILED" : bank.status;
        const idempotent = existingPayment?.status === "CONFIRMED" &&
          existingReconciliation?.status === "CONFIRMED";
        if (idempotent && bank.status === bankStatusAfter) {
          return { paymentId: existingPayment.id, reconciliationId: existingReconciliation.id,
            bankTransactionId, eventId, amount: amount.toString(), bankTransactionStatus: bankStatusAfter, idempotent: true };
        }

        const confirmedAt = new Date();
        const metadata = {
          reason: candidate.reason, dateDistanceDays: candidate.dateDistanceDays,
          eventExternalReference: candidate.externalReference, bankReference: candidate.bankReference,
          evidence: candidate.evidence, reconciliationVersion: VERSION,
        };
        const paymentData = {
          amount, currency: event.currency, status: "CONFIRMED", confirmedAt,
          source: "USER", matchType: candidate.reason, metadata,
        };
        const payment = existingPayment?.status === "CONFIRMED" ? existingPayment :
          await tx.financialEventPayment.upsert({
            where: { eventId_bankTransactionId: key },
            create: { ...key, ...paymentData }, update: paymentData,
          });
        const reconciliationData = {
          status: "CONFIRMED", source: "MANUAL", confirmedByUserId: userId, confirmedAt, metadata,
        };
        const reconciliation = existingReconciliation?.status === "CONFIRMED" ? existingReconciliation :
          existingReconciliation ? await tx.financialReconciliation.update({
            where: { id: existingReconciliation.id },
            data: { ...reconciliationData, participants: { updateMany: { where: {}, data: { matchedAmount: amount } } } },
          }) : await tx.financialReconciliation.create({
            data: { companyId, reconciliationType: "BANK_TO_FINANCIAL_EVENT", ...reconciliationData,
              participants: { create: participants } },
          });
        if (bankStatusAfter !== bank.status) {
          await tx.bankTransaction.update({ where: { id: bankTransactionId }, data: { status: bankStatusAfter } });
        }
        await tx.auditEvent.create({
          data: {
            companyId, userId, entityType: "FinancialEventPayment", entityId: payment.id,
            action: "CONFIRM_BANK_TO_FINANCIAL_EVENT", source: "USER",
            parentEntityType: "FinancialReconciliation", parentEntityId: reconciliation.id,
            beforeData: { bankTransactionStatus: bank.status, paymentStatus: existingPayment?.status ?? null,
              reconciliationStatus: existingReconciliation?.status ?? null },
            afterData: { bankTransactionStatus: bankStatusAfter, paymentStatus: "CONFIRMED", reconciliationStatus: "CONFIRMED" },
            metadata: { ...metadata, bankTransactionId, eventId, paymentId: payment.id,
              reconciliationId: reconciliation.id, amount: amount.toString() },
          },
        });
        return { paymentId: payment.id, reconciliationId: reconciliation.id,
          bankTransactionId, eventId, amount: amount.toString(), bankTransactionStatus: bankStatusAfter, idempotent: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // Retry the entire read/validate/write transaction on serialization conflicts.
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2034", "P2002"].includes(error.code)) throw error;
    }
  }
}
