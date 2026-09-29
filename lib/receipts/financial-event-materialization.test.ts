import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  decideReviewedFinancialEvent as decide,
  findReviewedLiabilityAccount,
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

test("materialization creates one primary event and idempotent counterparty; preserves existing events", async () => {
  let existing: unknown = null;
  const events: unknown[] = [];
  const links: unknown[] = [];
  const counterparties: unknown[] = [];
  const tx = {
    documentFinancialEvent: {
      findFirst: async () => existing,
      create: async ({ data }: { data: unknown }) => { links.push(data); existing = data; },
    },
    financialEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); return { id: 30 }; } },
    financialEventEntity: { upsert: async (args: unknown) => { counterparties.push(args); } },
  } as unknown as Prisma.TransactionClient;
  const params = { companyId: 12, receiptId: 11, document: { ...base, entityLinks: [invoice, organization] } };
  await materializeReviewedFinancialDocument(tx, params);
  await materializeReviewedFinancialDocument(tx, params);
  assert.equal(events.length, 1);
  assert.deepEqual(links, [{ receiptId: 11, documentId: 10, eventId: 30, role: "PRIMARY", source: "REVIEWED_DOCUMENT" }]);
  assert.equal(counterparties.length, 1);
  assert.deepEqual(events[0], {
    companyId: 12, eventType: "CHARGE", status: "OPEN", title: "INV-1", eventDate: null,
    amount: 100, currency: "ISK", externalReference: "INV-1", liabilityAccountId: null,
    metadata: { source: "REVIEWED_DOCUMENT", sourceDocumentId: 10, documentType: "ACCOUNTING_DOCUMENT" },
  });
  existing = { eventId: 99, event: { eventType: "ANNUAL_ASSESSMENT" } };
  await materializeReviewedFinancialDocument(tx, params);
  assert.equal(events.length, 1);
});
