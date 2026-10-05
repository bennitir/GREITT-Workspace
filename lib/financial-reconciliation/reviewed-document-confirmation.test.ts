import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { confirmBankReviewedDocumentReconciliation as confirm } from "./reviewed-document-confirmation";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const input = { companyId: 2, userId: 9, bankTransactionId: 3, documentId: 175 };

function fixture() {
  const bank = {
    id: 3,
    bankAccountId: 1,
    bankAccount: { id: 1, companyId: 2 },
    amount: decimal(-29755),
    date: new Date("2026-08-24T00:00:00.000Z"),
    text: "HS Veitur hf.",
    reference: null,
    sourceRawData: JSON.stringify({ counterparty: "HS Veitur hf." }),
    status: "UNRECONCILED",
  };
  const document = {
    id: 175,
    receiptId: 175,
    reviewedAt: new Date("2026-08-01T12:00:00.000Z"),
    date: new Date("2026-07-31T00:00:00.000Z"),
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "PRIMARY",
    totalAmount: 29755,
    merchantName: "HS Veitur hf. / HS Orka",
    merchantKennitala: "5402690000",
    receiptNumber: "TR004900000",
    receipt: {
      companyId: 2,
      date: new Date("2026-07-31T00:00:00.000Z"),
      aiDate: null,
      merchantName: "HS Veitur hf. / HS Orka",
      merchantKennitala: "5402690000",
    },
    financialEventLinks: [] as Array<{ id: number; eventId: number }>,
  };
  let state = {
    bank,
    document,
    reconciliations: [] as any[],
    audits: [] as any[],
  };

  const db = {
    $transaction: async (work: (tx: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const pending = {
        bank: { ...state.bank, bankAccount: { ...state.bank.bankAccount } },
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
        bankTransaction: {
          findUnique: async ({ where }: any) => where.id === pending.bank.id ? { ...pending.bank } : null,
          update: async ({ where, data }: any) => {
            assert.equal(where.id, pending.bank.id);
            Object.assign(pending.bank, data);
            return { ...pending.bank };
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

test("manual reviewed-document confirmation creates canonical reconciliation, audit and learning fact", async () => {
  const f = fixture();
  const result = await confirm(input, f.db);

  assert.equal(result.idempotent, false);
  assert.equal(f.state.bank.status, "RECONCILED");
  assert.equal(f.state.reconciliations.length, 1);
  const reconciliation = f.state.reconciliations[0];
  assert.equal(reconciliation.reconciliationType, "BANK_TO_REVIEWED_DOCUMENT");
  assert.equal(reconciliation.status, "CONFIRMED");
  assert.equal(reconciliation.source, "MANUAL");
  assert.equal(reconciliation.confirmedByUserId, 9);
  assert.equal(reconciliation.participants.length, 2);
  assert.deepEqual(reconciliation.participants.map((participant: any) => [
    participant.sourceType,
    participant.sourceKey,
    participant.role,
  ]), [
    ["BANK_TRANSACTION", "3", "MONEY_MOVEMENT"],
    ["AI_DETECTED_DOCUMENT", "175", "EVIDENCE"],
  ]);
  assert.equal(reconciliation.metadata.learning.version, "reviewed-document-learning-v1");
  assert.equal(reconciliation.metadata.learning.amountRelation, "ABS_EQUAL");
  assert.equal(reconciliation.metadata.learning.bankDirection, "OUTFLOW");
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.state.audits[0].action, "CONFIRM_BANK_TO_REVIEWED_DOCUMENT");
});

test("repeating the same manual pair is idempotent", async () => {
  const f = fixture();
  const first = await confirm(input, f.db);
  const second = await confirm(input, f.db);
  assert.equal(second.idempotent, true);
  assert.equal(second.reconciliationId, first.reconciliationId);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.audits.length, 1);
});

test("manual confirmation fails closed for amount mismatch, primary event and cross-company data", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.document.totalAmount = 29754; },
    (f: ReturnType<typeof fixture>) => { f.state.document.financialEventLinks = [{ id: 1, eventId: 99 }]; },
    (f: ReturnType<typeof fixture>) => { f.state.document.receipt.companyId = 99; },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(confirm(input, f.db));
    assert.equal(f.state.bank.status, "UNRECONCILED");
    assert.equal(f.state.reconciliations.length, 0);
    assert.equal(f.state.audits.length, 0);
  }
});

test("a different confirmed owner blocks both the bank transaction and the reviewed document", async () => {
  for (const participant of [
    { sourceType: "BANK_TRANSACTION", sourceKey: "3", role: "MONEY_MOVEMENT" },
    { sourceType: "AI_DETECTED_DOCUMENT", sourceKey: "175", role: "EVIDENCE" },
  ]) {
    const f = fixture();
    f.state.reconciliations.push({
      id: 99,
      companyId: 2,
      reconciliationType: "OTHER_FLOW",
      status: "CONFIRMED",
      participants: [{ ...participant, matchedAmount: decimal(29755) }],
    });
    await assert.rejects(confirm(input, f.db));
    assert.equal(f.state.audits.length, 0);
  }
});
