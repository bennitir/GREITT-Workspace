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
  if (!decision) return;
  const existing = await tx.documentFinancialEvent.findFirst({
    where: { documentId: document.id, role: "PRIMARY" },
  });
  if (existing) return;

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
  const event = await tx.financialEvent.create({
    data: {
      companyId,
      eventType: decision.eventType,
      status: "OPEN",
      title: [nonEmpty(document.merchantName), decision.externalReference].filter(Boolean).join(" · ") || null,
      eventDate: document.date ?? null,
      ...(temporal.periodStart && temporal.periodEnd
        ? { periodStart: temporal.periodStart, periodEnd: temporal.periodEnd }
        : {}),
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
    },
  });
  await tx.documentFinancialEvent.create({
    data: { receiptId, documentId: document.id, eventId: event.id, role: "PRIMARY", source: "REVIEWED_DOCUMENT" },
  });
  if (decision.counterpartyId !== null) {
    const key = { eventId: event.id, entityId: decision.counterpartyId, role: "COUNTERPARTY" };
    await tx.financialEventEntity.upsert({
      where: { eventId_entityId_role: key }, update: {}, create: key,
    });
  }
}
