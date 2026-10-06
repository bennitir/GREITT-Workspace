import type { Prisma } from "@/app/generated/prisma/client";
import {
  extractSourceDocumentTemporalContext,
} from "@/lib/financial-reconciliation/source-document-temporal";

export const MATERIALIZATION_REJECTION = {
  DOCUMENT_ROLE_INELIGIBLE: "DOCUMENT_ROLE_INELIGIBLE",
  MANUAL_CLASSIFICATION_EXCLUDED: "MANUAL_CLASSIFICATION_EXCLUDED",
  DOCUMENT_AMOUNT_INVALID: "DOCUMENT_AMOUNT_INVALID",
  PAYMENT_SCHEDULE_SEPARATE_FLOW: "PAYMENT_SCHEDULE_SEPARATE_FLOW",
  INVOICE_LINK_COUNT_NOT_ONE: "INVOICE_LINK_COUNT_NOT_ONE",
  DOCUMENT_TYPE_UNSUPPORTED: "DOCUMENT_TYPE_UNSUPPORTED",
} as const;
export type MaterializationRejection = typeof MATERIALIZATION_REJECTION[keyof typeof MATERIALIZATION_REJECTION];
const D = MATERIALIZATION_REJECTION;

export const REVIEW_CONTENT_LOCK = {
  DOCUMENT_CONFIRMED_RECONCILIATION: "DOCUMENT_CONFIRMED_RECONCILIATION",
  EVENT_CONFIRMED_PAYMENT: "EVENT_CONFIRMED_PAYMENT",
  EVENT_CONFIRMED_ALLOCATION: "EVENT_CONFIRMED_ALLOCATION",
  EVENT_CONFIRMED_RECONCILIATION: "EVENT_CONFIRMED_RECONCILIATION",
  EVENT_PAID_SCHEDULE: "EVENT_PAID_SCHEDULE",
} as const;
export type ReviewContentLockReason = typeof REVIEW_CONTENT_LOCK[keyof typeof REVIEW_CONTENT_LOCK];

type ReviewContentLock = { reason: ReviewContentLockReason; eventId: number | null };

async function findFinancialEventContentLock(
  tx: Prisma.TransactionClient,
  companyId: number,
  eventId: number,
): Promise<ReviewContentLock | null> {
  const confirmedAllocation = await tx.financialEventPaymentAllocation.findFirst({
    where: {
      status: "CONFIRMED",
      payment: { eventId },
    },
    select: { id: true },
  });
  if (confirmedAllocation) {
    return { reason: REVIEW_CONTENT_LOCK.EVENT_CONFIRMED_ALLOCATION, eventId };
  }

  const confirmedPayment = await tx.financialEventPayment.findFirst({
    where: { eventId, status: "CONFIRMED" },
    select: { id: true },
  });
  if (confirmedPayment) {
    return { reason: REVIEW_CONTENT_LOCK.EVENT_CONFIRMED_PAYMENT, eventId };
  }

  const paidSchedule = await tx.financialEventScheduleItem.findFirst({
    where: {
      eventId,
      OR: [
        { paidAmount: { gt: 0 } },
        { status: { in: ["PARTIALLY_PAID", "PAID"] } },
      ],
    },
    select: { id: true },
  });
  if (paidSchedule) {
    return { reason: REVIEW_CONTENT_LOCK.EVENT_PAID_SCHEDULE, eventId };
  }

  const confirmedReconciliation = await tx.financialReconciliationParticipant.findFirst({
    where: {
      sourceType: "FINANCIAL_EVENT",
      sourceKey: String(eventId),
      role: "OBLIGATION",
      reconciliation: { companyId, status: "CONFIRMED" },
    },
    select: { id: true },
  });
  if (confirmedReconciliation) {
    return { reason: REVIEW_CONTENT_LOCK.EVENT_CONFIRMED_RECONCILIATION, eventId };
  }

  return null;
}

export async function findReviewedDocumentContentLock(
  tx: Prisma.TransactionClient,
  companyId: number,
  documentId: number,
): Promise<ReviewContentLock | null> {
  const confirmedDocumentReconciliation = await tx.financialReconciliationParticipant.findFirst({
    where: {
      sourceType: "AI_DETECTED_DOCUMENT",
      sourceKey: String(documentId),
      role: "EVIDENCE",
      reconciliation: { companyId, status: "CONFIRMED" },
    },
    select: { id: true },
  });
  if (confirmedDocumentReconciliation) {
    return { reason: REVIEW_CONTENT_LOCK.DOCUMENT_CONFIRMED_RECONCILIATION, eventId: null };
  }

  const primaryLinks = await tx.documentFinancialEvent.findMany({
    where: { documentId, role: { in: ["PRIMARY", "STALE_PRIMARY"] } },
    select: { eventId: true },
    orderBy: { eventId: "asc" },
  });

  for (const link of primaryLinks) {
    const lock = await findFinancialEventContentLock(tx, companyId, link.eventId);
    if (lock) return lock;
  }

  return null;
}

export async function assertReviewedFinancialEventRefreshAllowed(
  tx: Prisma.TransactionClient,
  companyId: number,
  eventId: number,
) {
  const lock = await findFinancialEventContentLock(tx, companyId, eventId);
  if (lock) {
    throw new Error(`REVIEWED_FINANCIAL_EVENT_LOCKED|${lock.reason}|${eventId}`);
  }
}

export async function invalidateReviewedFinancialDerivationsForContentChange(
  tx: Prisma.TransactionClient,
  params: { companyId: number; documentId: number },
) {
  const { companyId, documentId } = params;
  const lock = await findReviewedDocumentContentLock(tx, companyId, documentId);
  if (lock) {
    throw new Error(
      `REVIEW_CONTENT_LOCKED|${lock.reason}|${lock.eventId ?? ""}`,
    );
  }

  const links = await tx.documentFinancialEvent.findMany({
    where: { documentId, role: { in: ["PRIMARY", "STALE_PRIMARY"] } },
    include: { event: { select: { id: true, metadata: true } } },
    orderBy: { eventId: "asc" },
  });

  for (const link of links) {
    await tx.financialEventScheduleItem.deleteMany({
      where: { eventId: link.eventId },
    });
    await tx.financialEventEntity.deleteMany({
      where: { eventId: link.eventId, role: "COUNTERPARTY" },
    });

    const previousMetadata =
      link.event.metadata &&
      typeof link.event.metadata === "object" &&
      !Array.isArray(link.event.metadata)
        ? (link.event.metadata as Prisma.InputJsonObject)
        : {};

    await tx.financialEvent.update({
      where: { id: link.eventId },
      data: {
        title: null,
        eventDate: null,
        periodStart: null,
        periodEnd: null,
        amount: null,
        externalReference: null,
        liabilityAccountId: null,
        metadata: {
          ...previousMetadata,
          source: "REVIEWED_DOCUMENT",
          sourceDocumentId: documentId,
          stale: true,
          staleReason: "SOURCE_CONTENT_CHANGED",
        },
      },
    });

    if (link.role !== "STALE_PRIMARY") {
      await tx.documentFinancialEvent.update({
        where: { id: link.id },
        data: { role: "STALE_PRIMARY" },
      });
    }
  }

  return { primaryEventIds: links.map((link) => link.eventId) };
}

type BookingEntry = { account: string; text?: string | null; debit: number; credit: number };
type Entity = { id: number; entityType: string; identifierValue?: string | null };

export type ReviewedFinancialDocument = {
  id: number;
  documentRole: string | null;
  classificationSource: string | null;
  documentType: string | null;
  totalAmount?: number | null;
  receiptNumber?: string | null;
  summary?: string | null;
  merchantName?: string | null;
  date?: Date | null;
  paymentSchedule?: unknown;
  bookingEntries?: BookingEntry[];
  entityLinks: Array<{ entity: Entity }>;
};

const nonEmpty = (value?: string | null) => value?.trim() || null;

type MaterializationDecision = { eventType: "CHARGE" | "CREDIT"; amount: number; externalReference: string | null; counterpartyId: number | null };
export function evaluateReviewedFinancialDocument(document: ReviewedFinancialDocument): {
  decision: MaterializationDecision | null; reason: MaterializationRejection | null;
} {
  if (document.documentRole !== "BOOKABLE") return { decision: null, reason: D.DOCUMENT_ROLE_INELIGIBLE };
  if (document.classificationSource === "MANUAL") return { decision: null, reason: D.MANUAL_CLASSIFICATION_EXCLUDED };
  if (typeof document.totalAmount !== "number" || !Number.isFinite(document.totalAmount) || Math.abs(document.totalAmount) === 0)
    return { decision: null, reason: D.DOCUMENT_AMOUNT_INVALID };

  const schedule = document.paymentSchedule;
  if (schedule && typeof schedule === "object" && !Array.isArray(schedule) &&
    "installments" in schedule && Array.isArray(schedule.installments) &&
    schedule.installments.length > 0) return { decision: null, reason: D.PAYMENT_SCHEDULE_SEPARATE_FLOW };

  let eventType: "CHARGE" | "CREDIT";
  let externalReference: string | null;
  if (document.documentType === "ACCOUNTING_DOCUMENT") {
    const invoices = document.entityLinks.filter(({ entity }) => entity.entityType === "INVOICE");
    if (invoices.length !== 1) return { decision: null, reason: D.INVOICE_LINK_COUNT_NOT_ONE };
    eventType = "CHARGE";
    externalReference = nonEmpty(invoices[0].entity.identifierValue);
  } else if (document.documentType === "CREDIT_NOTE") {
    const credits = new Map(document.entityLinks
      .filter(({ entity }) => entity.entityType === "CREDIT_INVOICE" && nonEmpty(entity.identifierValue))
      .map(({ entity }) => [entity.id, entity]));
    eventType = "CREDIT";
    externalReference = credits.size === 1
      ? nonEmpty([...credits.values()][0].identifierValue)
      : nonEmpty(document.receiptNumber);
  } else return { decision: null, reason: D.DOCUMENT_TYPE_UNSUPPORTED };

  const organizations = new Set(document.entityLinks
    .filter(({ entity }) => entity.entityType === "ORGANIZATION")
    .map(({ entity }) => entity.id));

  return { reason: null, decision: {
    eventType,
    amount: (eventType === "CREDIT" ? -1 : 1) * Math.abs(document.totalAmount),
    externalReference,
    counterpartyId: organizations.size === 1 ? [...organizations][0] : null,
  } };
}

export function decideReviewedFinancialEvent(document: ReviewedFinancialDocument) {
  return evaluateReviewedFinancialDocument(document).decision;
}

export async function findReviewedLiabilityAccount(
  tx: Prisma.TransactionClient,
  companyId: number,
  entries: BookingEntry[] = [],
  includeDebit = false,
) {
  const numbers = [...new Set(entries
    .filter((entry) => (Number(entry.credit) > 0 && Number(entry.debit) === 0) ||
      (includeDebit && Number(entry.debit) > 0 && Number(entry.credit) === 0))
    .map((entry) => entry.account.trim()).filter(Boolean))];
  if (!numbers.length) return null;
  const accounts = await tx.account.findMany({
    where: {
      companyId,
      number: { in: numbers },
      type: { in: ["ACCOUNTS_PAYABLE", "SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"] },
    },
    select: { id: true },
  });
  return accounts.length === 1 ? accounts[0] : null;
}

// Caller owns the transaction and locks the document through its review update.
export async function materializeReviewedFinancialDocument(
  tx: Prisma.TransactionClient,
  params: { companyId: number; receiptId: number; document: ReviewedFinancialDocument },
) {
  const { companyId, receiptId, document } = params;
  const decision = decideReviewedFinancialEvent(document);
  const existing = await tx.documentFinancialEvent.findFirst({
    where: {
      documentId: document.id,
      role: { in: ["PRIMARY", "STALE_PRIMARY"] },
    },
    include: { event: true },
    orderBy: { id: "asc" },
  });

  // If the reviewed source no longer materializes to a standalone event, keep
  // any previous event as stale lineage only. Content invalidation has already
  // removed it from PRIMARY ownership and cleared candidate-driving fields.
  if (!decision) return;

  const liabilityAccount = await findReviewedLiabilityAccount(
    tx, companyId, document.bookingEntries, decision.eventType === "CREDIT",
  );
  const temporal = extractSourceDocumentTemporalContext({
    documentDate: document.date ?? null,
    summary: document.summary ?? null,
    bookingEntries: document.bookingEntries ?? [],
  });
  const paymentTerms = temporal.dueDate || temporal.finalDueDate
    ? {
        dueDate: temporal.dueDate?.toISOString() ?? null,
        finalDueDate: temporal.finalDueDate?.toISOString() ?? null,
      }
    : null;

  const eventData = {
    companyId,
    eventType: decision.eventType,
    status: "OPEN",
    title: [nonEmpty(document.merchantName), decision.externalReference].filter(Boolean).join(" · ") || null,
    eventDate: document.date ?? null,
    periodStart: temporal.periodStart ?? null,
    periodEnd: temporal.periodEnd ?? null,
    amount: decision.amount,
    currency: "ISK",
    externalReference: decision.externalReference,
    liabilityAccountId: liabilityAccount?.id ?? null,
    metadata: {
      source: "REVIEWED_DOCUMENT",
      sourceDocumentId: document.id,
      documentType: document.documentType,
      ...(paymentTerms ? { paymentTerms } : {}),
    },
  };

  let event: { id: number };
  if (existing) {
    await assertReviewedFinancialEventRefreshAllowed(tx, companyId, existing.eventId);

    // A document may move from payment-schedule materialization back to a
    // regular reviewed financial event. Unconfirmed schedule rows are derived
    // state and are rebuilt/removed together with the source review.
    await tx.financialEventScheduleItem.deleteMany({
      where: { eventId: existing.eventId },
    });
    await tx.financialEventEntity.deleteMany({
      where: { eventId: existing.eventId, role: "COUNTERPARTY" },
    });
    event = await tx.financialEvent.update({
      where: { id: existing.eventId },
      data: eventData,
      select: { id: true },
    });
    if (existing.role !== "PRIMARY" || existing.source !== "REVIEWED_DOCUMENT") {
      await tx.documentFinancialEvent.update({
        where: { id: existing.id },
        data: { role: "PRIMARY", source: "REVIEWED_DOCUMENT" },
      });
    }
  } else {
    event = await tx.financialEvent.create({
      data: eventData,
      select: { id: true },
    });
    await tx.documentFinancialEvent.create({
      data: {
        receiptId,
        documentId: document.id,
        eventId: event.id,
        role: "PRIMARY",
        source: "REVIEWED_DOCUMENT",
      },
    });
  }

  if (decision.counterpartyId !== null) {
    const key = {
      eventId: event.id,
      entityId: decision.counterpartyId,
      role: "COUNTERPARTY",
    };
    await tx.financialEventEntity.upsert({
      where: { eventId_entityId_role: key },
      update: {},
      create: key,
    });
  }
}
