import { prisma } from "../prisma";
import { buildBankFinancialEventCandidates } from "./event-candidates";

export type ConfirmedBankFinancialEventLink = {
  bankTransactionId: number;
  eventId: number;
  reconciliationId: number;
  paymentId: number;
  eventType: string;
  amount: string;
  currency: string;
  eventDate: Date | null;
  externalReference: string | null;
  confirmedAt: Date | null;
};

/** Internal read-only service. The caller must authorize access to companyId. */
export async function getBankFinancialEventCandidates(bankAccountId: number, companyId: number) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId },
    select: { id: true, companyId: true },
  });
  if (!bankAccount) {
    return { ok: false as const, code: "BANK_ACCOUNT_NOT_FOUND" as const, bankAccountId };
  }
  const [transactions, events] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bankAccountId: bankAccount.id },
      select: { id: true, bankAccountId: true, amount: true, date: true, reference: true },
      orderBy: { id: "asc" },
    }),
    prisma.financialEvent.findMany({
      where: {
        companyId: bankAccount.companyId,
        eventType: { in: ["CHARGE", "CREDIT"] },
        amount: { not: null },
        eventDate: { not: null },
        currency: "ISK",
      },
      select: {
        id: true, companyId: true, eventType: true, amount: true,
        eventDate: true, externalReference: true, currency: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  // No status filtering: OPEN does not establish an unpaid balance.
  return {
    ok: true as const,
    kind: "BANK_TO_FINANCIAL_EVENT" as const,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    candidates: buildBankFinancialEventCandidates(
      bankAccount,
      transactions.map((bank) => ({ ...bank, amount: bank.amount.toString() })),
      events.map((event) => ({ ...event, amount: event.amount?.toString() ?? null })),
    ),
  };
}

/**
 * Read-only projection of confirmed bank-to-FinancialEvent links.
 * A payment is surfaced only when the exact canonical reconciliation is also
 * confirmed and structurally valid. Malformed/duplicate reconciliation data
 * therefore fails closed in the UI instead of being presented as confirmed.
 */
export async function getConfirmedBankFinancialEventLinks(
  bankAccountId: number,
  companyId: number,
) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId },
    select: { id: true, companyId: true },
  });

  if (!bankAccount) {
    return {
      ok: false as const,
      code: "BANK_ACCOUNT_NOT_FOUND" as const,
      bankAccountId,
    };
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: { bankAccountId: bankAccount.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (transactions.length === 0) {
    return {
      ok: true as const,
      kind: "CONFIRMED_BANK_TO_FINANCIAL_EVENT" as const,
      bankAccountId: bankAccount.id,
      companyId: bankAccount.companyId,
      links: [] as ConfirmedBankFinancialEventLink[],
    };
  }

  const transactionIds = transactions.map(({ id }) => id);
  const transactionIdSet = new Set(transactionIds);
  const transactionKeys = transactionIds.map(String);

  const [payments, reconciliations] = await Promise.all([
    prisma.financialEventPayment.findMany({
      where: {
        status: "CONFIRMED",
        bankTransactionId: { in: transactionIds },
        event: { companyId: bankAccount.companyId },
      },
      select: {
        id: true,
        bankTransactionId: true,
        eventId: true,
        amount: true,
        currency: true,
        confirmedAt: true,
        event: {
          select: {
            eventType: true,
            eventDate: true,
            externalReference: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.financialReconciliation.findMany({
      where: {
        companyId: bankAccount.companyId,
        reconciliationType: "BANK_TO_FINANCIAL_EVENT",
        status: "CONFIRMED",
        participants: {
          some: {
            sourceType: "BANK_TRANSACTION",
            sourceKey: { in: transactionKeys },
            role: "MONEY_MOVEMENT",
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
      orderBy: { id: "asc" },
    }),
  ]);

  const reconciliationByPair = new Map<
    string,
    { id: number; confirmedAt: Date | null } | null
  >();

  for (const reconciliation of reconciliations) {
    if (reconciliation.participants.length !== 2) {
      continue;
    }

    const bankParticipant = reconciliation.participants.find(
      (participant) =>
        participant.sourceType === "BANK_TRANSACTION" &&
        participant.role === "MONEY_MOVEMENT",
    );
    const eventParticipant = reconciliation.participants.find(
      (participant) =>
        participant.sourceType === "FINANCIAL_EVENT" &&
        participant.role === "OBLIGATION",
    );

    if (!bankParticipant || !eventParticipant) {
      continue;
    }

    const bankTransactionId = Number(bankParticipant.sourceKey);
    const eventId = Number(eventParticipant.sourceKey);

    if (
      !Number.isSafeInteger(bankTransactionId) ||
      !Number.isSafeInteger(eventId) ||
      !transactionIdSet.has(bankTransactionId)
    ) {
      continue;
    }

    const pairKey = `${bankTransactionId}:${eventId}`;
    if (reconciliationByPair.has(pairKey)) {
      // Duplicate canonical confirmations are malformed. Omit the pair rather
      // than presenting an ambiguous record as confirmed.
      reconciliationByPair.set(pairKey, null);
      continue;
    }

    reconciliationByPair.set(pairKey, {
      id: reconciliation.id,
      confirmedAt: reconciliation.confirmedAt,
    });
  }

  const links: ConfirmedBankFinancialEventLink[] = [];

  for (const payment of payments) {
    const pairKey = `${payment.bankTransactionId}:${payment.eventId}`;
    const reconciliation = reconciliationByPair.get(pairKey);
    if (!reconciliation) {
      continue;
    }

    links.push({
      bankTransactionId: payment.bankTransactionId,
      eventId: payment.eventId,
      reconciliationId: reconciliation.id,
      paymentId: payment.id,
      eventType: payment.event.eventType,
      amount: payment.amount.toString(),
      currency: payment.currency,
      eventDate: payment.event.eventDate,
      externalReference: payment.event.externalReference,
      confirmedAt: reconciliation.confirmedAt ?? payment.confirmedAt,
    });
  }

  return {
    ok: true as const,
    kind: "CONFIRMED_BANK_TO_FINANCIAL_EVENT" as const,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    links,
  };
}
