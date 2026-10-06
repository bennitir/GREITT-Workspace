import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  decideReviewedFinancialEvent as decide,
  findReviewedLiabilityAccount,
  invalidateReviewedFinancialDerivationsForContentChange,
  materializeReviewedFinancialDocument,
  type ReviewedFinancialDocument,
} from "./financial-event-materialization";

const invoice = { entity: { id: 1, entityType: "INVOICE", identifierValue: " INV-1 " } };
const credit = { entity: { id: 2, entityType: "CREDIT_INVOICE", identifierValue: " CR-1 " } };
const organization = { entity: { id: 3, entityType: "ORGANIZATION" } };
const base: ReviewedFinancialDocument = {
  id: 10, documentRole: "BOOKABLE", classificationSource: "SYSTEM",
  documentType: "ACCOUNTING_DOCUMENT", totalAmount: 100, entityLinks: [invoice],
};

test("accounting document requires exactly one INVOICE link", () => {
  assert.deepEqual(decide(base), { eventType: "CHARGE", amount: 100, externalReference: "INV-1", counterpartyId: null });
  assert.equal(decide({ ...base, entityLinks: [] }), null);
  assert.equal(decide({ ...base, entityLinks: [invoice, invoice] }), null);
  assert.equal(decide({ ...base, totalAmount: -100 })?.amount, 100);
  assert.equal(decide({ ...base, entityLinks: [{ entity: { ...invoice.entity, identifierValue: " " } }] })?.externalReference, null);
});

test("credit reference uses canonical entity then receipt number", () => {
  const doc = { ...base, documentType: "CREDIT_NOTE", receiptNumber: " R-1 " };
  assert.equal(decide({ ...doc, entityLinks: [credit] })?.externalReference, "CR-1");
  assert.equal(decide({ ...doc, entityLinks: [] })?.externalReference, "R-1");
  assert.equal(decide({ ...doc, entityLinks: [credit, { entity: { ...credit.entity, id: 4 } }] })?.externalReference, "R-1");
  assert.equal(decide({ ...doc, entityLinks: [], receiptNumber: null })?.eventType, "CREDIT");
});

for (const amount of [100, -100]) {
  test(`credit amount ${amount} becomes negative`, () => {
    const result = decide({ ...base, documentType: "CREDIT_NOTE", totalAmount: amount, entityLinks: [credit] });
    assert.equal(result?.eventType, "CREDIT");
    assert.equal(result?.amount, -100);
  });
}

test("eligibility fails closed", () => {
  for (const totalAmount of [0, NaN, Infinity, -Infinity, null, undefined]) {
    assert.equal(decide({ ...base, totalAmount }), null);
  }
  assert.equal(decide({ ...base, documentRole: "SUPPORTING" }), null);
  assert.equal(decide({ ...base, classificationSource: "MANUAL" }), null);
  assert.equal(decide({ ...base, documentType: "OTHER" }), null);
  assert.equal(decide({ ...base, paymentSchedule: { installments: [{}] } }), null);
  assert.ok(decide({ ...base, paymentSchedule: { installments: [] } }));
});

test("counterparty requires one distinct organization, independent of link role", () => {
  assert.equal(decide({ ...base, entityLinks: [invoice, organization, organization] })?.counterpartyId, 3);
  assert.equal(decide({ ...base, entityLinks: [invoice, organization, { entity: { ...organization.entity, id: 4 } }] })?.counterpartyId, null);
});

test("liability lookup scopes company and types, accepts debit only for credits, rejects ambiguity", async () => {
  let where: unknown;
  let accounts = [{ id: 20 }];
  const tx = { account: { findMany: async (args: { where: unknown }) => { where = args.where; return accounts; } } } as unknown as Prisma.TransactionClient;
  const entries = [{ account: " L-1 ", debit: 100, credit: 0 }, { account: "L-2", debit: 1, credit: 1 }];
  assert.equal(await findReviewedLiabilityAccount(tx, 12, entries), null);
  assert.deepEqual(await findReviewedLiabilityAccount(tx, 12, entries, true), { id: 20 });
  assert.deepEqual(where, { companyId: 12, number: { in: ["L-1"] }, type: { in: ["ACCOUNTS_PAYABLE", "SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"] } });
  accounts = [{ id: 20 }, { id: 21 }];
  assert.equal(await findReviewedLiabilityAccount(tx, 12, entries, true), null);
});

test("materialization creates one primary event and counterparty", async () => {
  const events: unknown[] = [];
  const links: unknown[] = [];
  const counterparties: unknown[] = [];
  const tx = {
    documentFinancialEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: unknown }) => { links.push(data); },
    },
    financialEvent: {
      create: async ({ data }: { data: unknown }) => { events.push(data); return { id: 30 }; },
    },
    financialEventEntity: { upsert: async (args: unknown) => { counterparties.push(args); } },
  } as unknown as Prisma.TransactionClient;
  const params = { companyId: 12, receiptId: 11, document: { ...base, entityLinks: [invoice, organization] } };
  await materializeReviewedFinancialDocument(tx, params);
  assert.equal(events.length, 1);
  assert.deepEqual(links, [{ receiptId: 11, documentId: 10, eventId: 30, role: "PRIMARY", source: "REVIEWED_DOCUMENT" }]);
  assert.equal(counterparties.length, 1);
  assert.deepEqual(events[0], {
    companyId: 12, eventType: "CHARGE", status: "OPEN", title: "INV-1", eventDate: null,
    periodStart: null, periodEnd: null, amount: 100, currency: "ISK", externalReference: "INV-1", liabilityAccountId: null,
    metadata: { source: "REVIEWED_DOCUMENT", sourceDocumentId: 10, documentType: "ACCOUNTING_DOCUMENT" },
  });
});

test("re-review refreshes the same stale event id instead of creating a second event", async () => {
  const updates: any[] = [];
  const linkUpdates: any[] = [];
  let createCount = 0;
  const tx = {
    documentFinancialEvent: {
      findFirst: async () => ({
        id: 7, receiptId: 11, documentId: 10, eventId: 99,
        role: "STALE_PRIMARY", source: "REVIEWED_DOCUMENT", event: { id: 99 },
      }),
      update: async (args: any) => { linkUpdates.push(args); return {}; },
      create: async () => { throw new Error("must not create a second link"); },
    },
    financialEventPaymentAllocation: { findFirst: async () => null },
    financialEventPayment: { findFirst: async () => null },
    financialEventScheduleItem: {
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
    financialReconciliationParticipant: { findFirst: async () => null },
    financialEventEntity: {
      deleteMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
    },
    financialEvent: {
      create: async () => { createCount += 1; return { id: 100 }; },
      update: async (args: any) => { updates.push(args); return { id: 99 }; },
    },
  } as unknown as Prisma.TransactionClient;

  await materializeReviewedFinancialDocument(tx, {
    companyId: 12, receiptId: 11,
    document: { ...base, date: new Date("2026-02-01T12:00:00.000Z"), totalAmount: 250, entityLinks: [invoice] },
  });

  assert.equal(createCount, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, 99);
  assert.equal(updates[0].data.amount, 250);
  assert.equal(updates[0].data.eventDate.toISOString(), "2026-02-01T12:00:00.000Z");
  assert.deepEqual(linkUpdates, [{ where: { id: 7 }, data: { role: "PRIMARY", source: "REVIEWED_DOCUMENT" } }]);
});

test("content invalidation stales unlocked derived event and preserves its id", async () => {
  const eventUpdates: any[] = [];
  const linkUpdates: any[] = [];
  let scheduleDeletes = 0;
  const link = {
    id: 7, eventId: 99, role: "PRIMARY",
    event: { id: 99, metadata: { source: "REVIEWED_DOCUMENT", keep: "audit-context" } },
  };
  let participantCalls = 0;
  const tx = {
    financialReconciliationParticipant: {
      findFirst: async () => { participantCalls += 1; return null; },
    },
    documentFinancialEvent: {
      findMany: async () => [link],
      update: async (args: any) => { linkUpdates.push(args); return {}; },
    },
    financialEventPaymentAllocation: { findFirst: async () => null },
    financialEventPayment: { findFirst: async () => null },
    financialEventScheduleItem: {
      findFirst: async () => null,
      deleteMany: async () => { scheduleDeletes += 1; return { count: 2 }; },
    },
    financialEventEntity: { deleteMany: async () => ({ count: 1 }) },
    financialEvent: {
      update: async (args: any) => { eventUpdates.push(args); return { id: 99 }; },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await invalidateReviewedFinancialDerivationsForContentChange(tx, {
    companyId: 12, documentId: 10,
  });

  assert.deepEqual(result, { primaryEventIds: [99] });
  assert.equal(participantCalls, 2, "document and event reconciliation locks are both checked");
  assert.equal(scheduleDeletes, 1);
  assert.equal(eventUpdates[0].where.id, 99);
  assert.equal(eventUpdates[0].data.amount, null);
  assert.equal(eventUpdates[0].data.eventDate, null);
  assert.equal(eventUpdates[0].data.metadata.stale, true);
  assert.equal(eventUpdates[0].data.metadata.keep, "audit-context");
  assert.deepEqual(linkUpdates, [{ where: { id: 7 }, data: { role: "STALE_PRIMARY" } }]);
});

test("confirmed event payment blocks re-review refresh", async () => {
  const tx = {
    documentFinancialEvent: {
      findFirst: async () => ({
        id: 7, eventId: 99, role: "STALE_PRIMARY", source: "REVIEWED_DOCUMENT", event: { id: 99 },
      }),
    },
    financialEventPaymentAllocation: { findFirst: async () => null },
    financialEventPayment: { findFirst: async () => ({ id: 2 }) },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    materializeReviewedFinancialDocument(tx, {
      companyId: 12, receiptId: 11, document: { ...base, entityLinks: [invoice] },
    }),
    /REVIEWED_FINANCIAL_EVENT_LOCKED\|EVENT_CONFIRMED_PAYMENT\|99/,
  );
});

test("confirmed direct document reconciliation blocks content invalidation", async () => {
  const tx = {
    financialReconciliationParticipant: { findFirst: async () => ({ id: 1 }) },
    documentFinancialEvent: { findMany: async () => { throw new Error("must fail before event reads"); } },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    invalidateReviewedFinancialDerivationsForContentChange(tx, { companyId: 12, documentId: 10 }),
    /REVIEW_CONTENT_LOCKED\|DOCUMENT_CONFIRMED_RECONCILIATION/,
  );
});

test("materialization persists deterministic period and payment terms from reviewed source text", async () => {
  const events: any[] = [];
  const tx = {
    documentFinancialEvent: {
      findFirst: async () => null,
      create: async () => ({}),
    },
    financialEvent: {
      create: async ({ data }: any) => {
        events.push(data);
        return { id: 31 };
      },
    },
    financialEventEntity: { upsert: async () => ({}) },
  } as unknown as Prisma.TransactionClient;

  await materializeReviewedFinancialDocument(tx, {
    companyId: 12,
    receiptId: 11,
    document: {
      ...base,
      date: new Date("2026-07-29T00:00:00.000Z"),
      summary:
        "Kílómetragjald júlí 2026. Gjalddagi 01.08.2026, eindagi 17.08.2026.",
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].periodStart.toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(events[0].periodEnd.toISOString(), "2026-07-31T12:00:00.000Z");
  assert.deepEqual(events[0].metadata.paymentTerms, {
    dueDate: "2026-08-01T12:00:00.000Z",
    finalDueDate: "2026-08-17T12:00:00.000Z",
  });
});
