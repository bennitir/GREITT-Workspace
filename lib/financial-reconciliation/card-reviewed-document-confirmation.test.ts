import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { confirmCardReviewedDocumentReconciliation as confirm } from "./card-reviewed-document-confirmation";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const input = { companyId: 2, userId: 9, paymentCardTransactionId: 501, documentId: 601 };

function fixture() {
  const cardTransaction = {
    id: 501,
    paymentCardId: 7,
    paymentCard: { id: 7, companyId: 2 },
    amount: decimal(-7815),
    date: new Date("2026-03-09T00:00:00.000Z"),
    merchantText: "OLIS MJODD",
    sourceRawData: JSON.stringify({ merchantText: "OLIS MJODD" }),
    status: "UNRECONCILED",
  };
  const document = {
    id: 601,
    receiptId: 601,
    reviewedAt: new Date("2026-03-10T12:00:00.000Z"),
    date: new Date("2026-03-09T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "PRIMARY",
    totalAmount: 7815,
    merchantName: "Olís",
    merchantKennitala: null,
    receiptNumber: null,
    pageNumber: 4,
    documentFingerprint: "fingerprint-601",
    classificationSource: "RECEIPT_ANALYSIS",
    duplicateMarkedAt: null as Date | null,
    disposedAt: null as Date | null,
    disposition: null as string | null,
    receipt: {
      companyId: 2,
      date: new Date("2026-03-09T00:00:00.000Z"),
      aiDate: null,
      merchantName: "Olís",
      merchantKennitala: null,
    },
    financialEventLinks: [] as Array<{ id: number; eventId: number }>,
  };
  let state = {
    cardTransaction,
    document,
    reconciliations: [] as any[],
    audits: [] as any[],
  };

  const db = {
    $transaction: async (work: (tx: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const pending = {
        cardTransaction: {
          ...state.cardTransaction,
          paymentCard: { ...state.cardTransaction.paymentCard },
        },
        document: {
          ...state.document,
          receipt: { ...state.document.receipt },
          financialEventLinks: state.document.financialEventLinks.map((link) => ({ ...link })),
        },
        reconciliations: state.reconciliations.map((reconciliation) => ({
          ...reconciliation,
          participants: reconciliation.participants.map((participant: any) => ({ ...participant })),
        })),
        audits: state.audits.map((audit) => ({ ...audit })),
      };

      const tx = {
        paymentCardTransaction: {
          findUnique: async ({ where }: any) => where.id === pending.cardTransaction.id
            ? { ...pending.cardTransaction, paymentCard: { ...pending.cardTransaction.paymentCard } }
            : null,
          update: async ({ where, data }: any) => {
            assert.equal(where.id, pending.cardTransaction.id);
            Object.assign(pending.cardTransaction, data);
            return { ...pending.cardTransaction };
          },
        },
        aiDetectedDocument: {
          findUnique: async ({ where }: any) => where.id === pending.document.id ? {
            ...pending.document,
            receipt: { ...pending.document.receipt },
            financialEventLinks: pending.document.financialEventLinks.map((link) => ({ ...link })),
          } : null,
        },
        financialReconciliation: {
          findMany: async ({ where }: any) => pending.reconciliations.filter((reconciliation) => {
            if (where.companyId !== undefined && reconciliation.companyId !== where.companyId) return false;
            if (where.reconciliationType !== undefined && reconciliation.reconciliationType !== where.reconciliationType) return false;
            if (where.status !== undefined && reconciliation.status !== where.status) return false;
            if (where.AND && !where.AND.every(({ participants: { some } }: any) =>
              reconciliation.participants.some((participant: any) =>
                participant.sourceType === some.sourceType && participant.sourceKey === some.sourceKey))) return false;
            if (where.participants?.some) {
              const some = where.participants.some;
              if (!reconciliation.participants.some((participant: any) =>
                Object.entries(some).every(([key, value]) => participant[key] === value))) return false;
            }
            return true;
          }),
          create: async ({ data: { participants, ...data } }: any) => {
            const created = { id: 20, ...data, participants: participants.create };
            pending.reconciliations.push(created);
            return created;
          },
          update: async ({ where, data: { participants, ...data } }: any) => {
            const existing = pending.reconciliations.find((item) => item.id === where.id);
            Object.assign(existing, data);
            if (participants?.updateMany?.data) {
              existing.participants.forEach((participant: any) =>
                Object.assign(participant, participants.updateMany.data));
            }
            return existing;
          },
        },
        auditEvent: {
          create: async ({ data }: any) => {
            pending.audits.push(data);
            return { id: pending.audits.length, ...data };
          },
        },
      };

      const result = await work(tx);
      state = pending;
      return result;
    },
  } as unknown as Pick<PrismaClient, "$transaction">;

  return { db, get state() { return state; } };
}

test("card/document confirmation creates canonical reconciliation, audit and learning fact", async () => {
  const f = fixture();
  const result = await confirm(input, f.db);

  assert.equal(result.idempotent, false);
  assert.equal(f.state.cardTransaction.status, "RECONCILED");
  assert.equal(f.state.reconciliations.length, 1);
  const reconciliation = f.state.reconciliations[0];
  assert.equal(reconciliation.reconciliationType, "CARD_TO_REVIEWED_DOCUMENT");
  assert.equal(reconciliation.status, "CONFIRMED");
  assert.equal(reconciliation.source, "MANUAL");
  assert.deepEqual(reconciliation.participants.map((participant: any) => [
    participant.sourceType,
    participant.sourceKey,
    participant.role,
  ]), [
    ["PAYMENT_CARD_TRANSACTION", "501", "MONEY_MOVEMENT"],
    ["AI_DETECTED_DOCUMENT", "601", "EVIDENCE"],
  ]);
  assert.equal(reconciliation.metadata.reconciliationVersion, "card-to-reviewed-document-v2");
  assert.equal(reconciliation.metadata.canonicalFactScope, "AI_DETECTED_DOCUMENT");
  assert.equal(reconciliation.metadata.documentPageNumber, 4);
  assert.equal(reconciliation.metadata.documentFingerprint, "fingerprint-601");
  assert.equal(reconciliation.metadata.learning.version, "reviewed-document-learning-v1");
  assert.equal(reconciliation.metadata.learning.bankDirection, "OUTFLOW");
  assert.equal(f.state.audits[0].action, "CONFIRM_CARD_TO_REVIEWED_DOCUMENT");
});

test("repeating the same card/document pair is idempotent", async () => {
  const f = fixture();
  const first = await confirm(input, f.db);
  const second = await confirm(input, f.db);
  assert.equal(second.idempotent, true);
  assert.equal(second.reconciliationId, first.reconciliationId);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.audits.length, 1);
});

test("confirmation fails closed for stale or non-canonical document state", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.document.totalAmount = 7814; },
    (f: ReturnType<typeof fixture>) => { f.state.document.financialEventLinks = [{ id: 1, eventId: 99 }]; },
    (f: ReturnType<typeof fixture>) => { f.state.document.receipt.companyId = 99; },
    (f: ReturnType<typeof fixture>) => { f.state.document.duplicateMarkedAt = new Date("2026-03-11T00:00:00Z"); },
    (f: ReturnType<typeof fixture>) => { f.state.document.disposition = "DUPLICATE_RESOLVED"; },
    (f: ReturnType<typeof fixture>) => { f.state.document.date = null as unknown as Date; },
    (f: ReturnType<typeof fixture>) => { f.state.document.merchantName = null as unknown as string; },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(confirm(input, f.db));
    assert.equal(f.state.cardTransaction.status, "UNRECONCILED");
    assert.equal(f.state.reconciliations.length, 0);
    assert.equal(f.state.audits.length, 0);
  }
});

test("another confirmed owner blocks card transaction or document", async () => {
  for (const participant of [
    { sourceType: "PAYMENT_CARD_TRANSACTION", sourceKey: "501", role: "MONEY_MOVEMENT" },
    { sourceType: "AI_DETECTED_DOCUMENT", sourceKey: "601", role: "EVIDENCE" },
  ]) {
    const f = fixture();
    f.state.reconciliations.push({
      id: 99,
      companyId: 2,
      reconciliationType: "OTHER_FLOW",
      status: "CONFIRMED",
      participants: [{ ...participant, matchedAmount: decimal(7815) }],
    });
    await assert.rejects(confirm(input, f.db));
    assert.equal(f.state.audits.length, 0);
  }
});

test("explicit manual confirmation can use a reviewed document type the automatic provider does not recognize", async () => {
  const f = fixture();
  f.state.document.documentType = "INVOICE";

  const result = await confirm(input, f.db);

  assert.equal(result.idempotent, false);
  assert.equal(f.state.cardTransaction.status, "RECONCILED");
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.reconciliations[0].metadata.documentType, "INVOICE");
  assert.equal(f.state.audits.length, 1);
});
