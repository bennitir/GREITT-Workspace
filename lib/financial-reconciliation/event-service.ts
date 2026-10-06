import { prisma } from "../prisma";
import { DOCUMENT_OBLIGATION_FLOW_KIND } from "./flow-kind";
import {
  buildBankFinancialEventCandidates,
  type BankFinancialEventCandidate,
} from "./event-candidates";
import type {
  FinancialEventSourceDocumentContext,
} from "./document-context";
import {
  collectSourceDocumentTemporalContext,
} from "./source-document-temporal";

export type BankFinancialEventCandidateProjection =
  BankFinancialEventCandidate & {
    primaryReceiptIds: number[];
    sourceDocuments: FinancialEventSourceDocumentContext[];
  };

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
  primaryReceiptIds: number[];
  sourceDocuments: FinancialEventSourceDocumentContext[];
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
        documentLinks: {
          where: { role: { in: ["PRIMARY", "STALE_PRIMARY"] } },
          select: {
            receiptId: true,
            role: true,
            source: true,
            receipt: {
              select: { status: true },
            },
            document: {
              select: {
                id: true,
                date: true,
                summary: true,
                contentRevision: true,
                reviewedAt: true,
                reviewedContentRevision: true,
                approvedAt: true,
                documentType: true,
                documentRole: true,
                bookingEntries: {
                  select: {
                    id: true,
                    account: true,
                    text: true,
                    debit: true,
                    credit: true,
                  },
                  orderBy: { id: "asc" },
                },
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const sourceDocumentsByEventId = new Map(
    events.map((event) => [
      event.id,
      event.documentLinks
        .map((link) => ({
          receiptId: link.receiptId,
          receiptStatus: link.receipt.status,
          documentId: link.document?.id ?? null,
          reviewedAt: link.document?.reviewedAt ?? null,
          approvedAt: link.document?.approvedAt ?? null,
          documentType: link.document?.documentType ?? null,
          documentRole: link.document?.documentRole ?? null,
          bookingEntries: link.document?.bookingEntries ?? [],
        }))
        .sort(
          (a, b) =>
            a.receiptId - b.receiptId ||
            (a.documentId ?? Number.MAX_SAFE_INTEGER) -
              (b.documentId ?? Number.MAX_SAFE_INTEGER),
        ),
    ]),
  );

  const currentEvents = events.filter((event) =>
    event.documentLinks.every((link) => {
      if (link.role !== "PRIMARY") return false;
      if (link.source !== "REVIEWED_DOCUMENT") return true;
      return Boolean(
        link.document?.reviewedAt &&
        link.document.reviewedContentRevision === link.document.contentRevision,
      );
    }),
  );

  const candidates: BankFinancialEventCandidateProjection[] =
    buildBankFinancialEventCandidates(
      bankAccount,
      transactions.map((bank) => ({
        ...bank,
        amount: bank.amount.toString(),
      })),
      currentEvents.map((event) => {
        const temporal = collectSourceDocumentTemporalContext(
          event.documentLinks
            .filter(
              (link) =>
                link.role === "PRIMARY" &&
                link.source === "REVIEWED_DOCUMENT" &&
                link.document !== null,
            )
            .map((link) => ({
              documentDate: link.document?.date ?? null,
              summary: link.document?.summary ?? null,
              bookingEntries: link.document?.bookingEntries ?? [],
            })),
        );

        return {
          id: event.id,
          companyId: event.companyId,
          eventType: event.eventType,
          amount: event.amount?.toString() ?? null,
          eventDate: event.eventDate,
          externalReference: event.externalReference,
          currency: event.currency,
          primarySourceDocumentDates: temporal.documentDates,
          sourceDueDate: temporal.dueDate,
          sourceFinalDueDate: temporal.finalDueDate,
        };
      }),
    ).map((candidate) => {
      const sourceDocuments =
        sourceDocumentsByEventId.get(candidate.eventId) ?? [];

      return {
        ...candidate,
        primaryReceiptIds: [
          ...new Set(sourceDocuments.map((source) => source.receiptId)),
        ].sort((a, b) => a - b),
        sourceDocuments,
      };
    });

  // No status filtering: OPEN does not establish an unpaid balance.
  return {
    ok: true as const,
    kind: "BANK_TO_FINANCIAL_EVENT" as const,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    flowKind: DOCUMENT_OBLIGATION_FLOW_KIND,
    candidates,
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
      flowKind: DOCUMENT_OBLIGATION_FLOW_KIND,
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
            documentLinks: {
              where: { role: "PRIMARY" },
              select: {
                receiptId: true,
                receipt: {
                  select: { status: true },
                },
                document: {
                  select: {
                    id: true,
                    reviewedAt: true,
                    approvedAt: true,
                    documentType: true,
                    documentRole: true,
                    bookingEntries: {
                      select: {
                        id: true,
                        account: true,
                        text: true,
                        debit: true,
                        credit: true,
                      },
                      orderBy: { id: "asc" },
                    },
                  },
                },
              },
            },
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

    const sourceDocuments = payment.event.documentLinks
      .map((link) => ({
        receiptId: link.receiptId,
        receiptStatus: link.receipt.status,
        documentId: link.document?.id ?? null,
        reviewedAt: link.document?.reviewedAt ?? null,
        approvedAt: link.document?.approvedAt ?? null,
        documentType: link.document?.documentType ?? null,
        documentRole: link.document?.documentRole ?? null,
        bookingEntries: link.document?.bookingEntries ?? [],
      }))
      .sort(
        (a, b) =>
          a.receiptId - b.receiptId ||
          (a.documentId ?? Number.MAX_SAFE_INTEGER) -
            (b.documentId ?? Number.MAX_SAFE_INTEGER),
      );

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
      primaryReceiptIds: [
        ...new Set(sourceDocuments.map((source) => source.receiptId)),
      ].sort((a, b) => a - b),
      sourceDocuments,
    });
  }

  return {
    ok: true as const,
    kind: "CONFIRMED_BANK_TO_FINANCIAL_EVENT" as const,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    flowKind: DOCUMENT_OBLIGATION_FLOW_KIND,
    links,
  };
}
