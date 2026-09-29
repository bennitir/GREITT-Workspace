import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../app/generated/prisma/client";
import { confirmBankFinancialEventPayment as confirm } from "./event-confirmation";
import { buildBankFinancialEventCandidates } from "./event-candidates";

const decimal = (value: string | number) => new Prisma.Decimal(value);
const input = { companyId: 2, userId: 9, bankTransactionId: 3, eventId: 4 };

// Transactional in-memory double: only the delegates used by this core exist.
// Any allocation write or event update therefore fails the test immediately.
function fixture() {
  const bank = { id: 3, bankAccountId: 1, bankAccount: { id: 1, companyId: 2 },
    amount: decimal(-36027), date: new Date("2026-01-12Z"), reference: "INV-1", status: "UNRECONCILED" };
  const event = { id: 4, companyId: 2, amount: decimal(36027), eventDate: new Date("2026-01-01Z"),
    eventType: "CHARGE", currency: "ISK", externalReference: "INV-1", status: "OPEN" };
  let state = { bank, event, payments: [] as any[], reconciliations: [] as any[], audits: [] as any[] };
  let transactions = 0;
  let conflictOnce = false;
  const db = {
    $transaction: async (work: (tx: any) => Promise<unknown>, options: unknown) => {
      transactions++;
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      const pending = { ...state, bank: { ...state.bank }, event: { ...state.event },
        payments: state.payments.map((p) => ({ ...p })), audits: [...state.audits],
        reconciliations: state.reconciliations.map((r) => ({ ...r, participants: r.participants.map((p: any) => ({ ...p })) })) };
      const result = await work({
        bankTransaction: {
          findUnique: async ({ where }: any) => where.id === pending.bank.id ? { ...pending.bank } : null,
          update: async ({ data }: any) => Object.assign(pending.bank, data),
        },
        financialEvent: { findUnique: async ({ where }: any) => where.id === pending.event.id ? { ...pending.event } : null },
        financialEventPayment: {
          findUnique: async ({ where: { eventId_bankTransactionId: key } }: any) =>
            pending.payments.find((p) => p.eventId === key.eventId && p.bankTransactionId === key.bankTransactionId) ?? null,
          aggregate: async ({ where }: any) => ({ _sum: { amount: pending.payments
            .filter((p) => p.status === where.status && p.id !== where.id?.not &&
              (where.eventId === undefined || p.eventId === where.eventId) &&
              (where.bankTransactionId === undefined || p.bankTransactionId === where.bankTransactionId))
            .reduce((sum, p) => sum.plus(p.amount), decimal(0)) } }),
          upsert: async ({ where: { eventId_bankTransactionId: key }, create, update }: any) => {
            const existing = pending.payments.find((p) => p.eventId === key.eventId && p.bankTransactionId === key.bankTransactionId);
            if (existing) return Object.assign(existing, update);
            const created = { id: 10, ...create };
            pending.payments.push(created);
            return created;
          },
        },
        financialReconciliation: {
          findMany: async ({ where }: any) => pending.reconciliations.filter((r) =>
            r.companyId === where.companyId &&
            (where.reconciliationType === undefined || r.reconciliationType === where.reconciliationType) &&
            (where.status === undefined || r.status === where.status) &&
            (!where.participants || r.participants.some((p: any) =>
              Object.entries(where.participants.some).every(([key, value]) => p[key] === value))) &&
            (!where.AND || where.AND.every(({ participants: { some } }: any) => r.participants.some((p: any) =>
              p.sourceType === some.sourceType && p.sourceKey === some.sourceKey)))),
          create: async ({ data: { participants, ...data } }: any) => {
            const created = { id: 20, ...data, participants: participants.create };
            pending.reconciliations.push(created);
            return created;
          },
          update: async ({ where, data: { participants, ...data } }: any) => {
            const existing = pending.reconciliations.find((r) => r.id === where.id);
            Object.assign(existing, data);
            existing.participants.forEach((p: any) => Object.assign(p, participants.updateMany.data));
            return existing;
          },
        },
        auditEvent: { create: async ({ data }: any) => { pending.audits.push(data); } },
      });
      if (conflictOnce) {
        conflictOnce = false;
        throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
      }
      state = pending;
      return result;
    },
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { db, get state() { return state; }, get transactions() { return transactions; },
    conflict: () => { conflictOnce = true; } };
}

for (const [eventType, eventAmount, bankAmount, day, reason] of [
  ["CHARGE", 36027, -36027, 12, "EXACT_EVENT_AMOUNT_EXTENDED_DATE"],
  ["CREDIT", -11427, 11427, 4, "EXACT_EVENT_AMOUNT_NEAR_DATE"],
] as const) {
  test(`${eventType} confirms positive payment, canonical reconciliation and audit without allocations or event mutation`, async () => {
    const f = fixture();
    Object.assign(f.state.event, { eventType, amount: decimal(eventAmount) });
    Object.assign(f.state.bank, { amount: decimal(bankAmount), date: new Date(Date.UTC(2026, 0, day)) });
    const result = await confirm(input, f.db);
    assert.equal(result.idempotent, false);
    assert.equal(f.state.bank.status, "RECONCILED");
    assert.equal(f.state.event.status, "OPEN");
    const payment = f.state.payments[0];
    assert.ok(payment.amount.eq(Math.abs(bankAmount)));
    assert.equal(payment.status, "CONFIRMED");
    assert.equal(payment.currency, "ISK");
    assert.equal(payment.source, "USER");
    assert.equal(payment.matchType, reason);
    assert.ok(payment.confirmedAt instanceof Date);
    assert.deepEqual(payment.metadata.evidence, ["EXACT_EVENT_REFERENCE"]);
    const reconciliation = f.state.reconciliations[0];
    assert.equal(reconciliation.reconciliationType, "BANK_TO_FINANCIAL_EVENT");
    assert.equal(reconciliation.status, "CONFIRMED");
    assert.equal(reconciliation.source, "MANUAL");
    assert.equal(reconciliation.confirmedByUserId, 9);
    assert.deepEqual(reconciliation.participants, [
      { sourceType: "BANK_TRANSACTION", sourceKey: "3", role: "MONEY_MOVEMENT", matchedAmount: decimal(Math.abs(bankAmount)) },
      { sourceType: "FINANCIAL_EVENT", sourceKey: "4", role: "OBLIGATION", matchedAmount: decimal(Math.abs(bankAmount)) },
    ]);
    const audit = f.state.audits[0];
    assert.equal(audit.companyId, 2);
    assert.equal(audit.userId, 9);
    assert.equal(audit.beforeData.bankTransactionStatus, "UNRECONCILED");
    assert.equal(audit.afterData.bankTransactionStatus, "RECONCILED");
    assert.deepEqual(audit.metadata, {
      bankTransactionId: 3, eventId: 4, paymentId: 10, reconciliationId: 20,
      amount: String(Math.abs(bankAmount)), reason, dateDistanceDays: day - 1,
      eventExternalReference: "INV-1", bankReference: "INV-1", evidence: ["EXACT_EVENT_REFERENCE"],
      reconciliationVersion: "bank-to-financial-event-v1",
    });
  });
}

test("cross-company, sign, date, currency and missing data fail closed", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.state.bank.bankAccount.companyId = 99; },
    (f: ReturnType<typeof fixture>) => { f.state.event.companyId = 99; },
    (f: ReturnType<typeof fixture>) => { f.state.bank.amount = decimal(36027); },
    (f: ReturnType<typeof fixture>) => { f.state.bank.date = new Date("2026-02-02Z"); },
    (f: ReturnType<typeof fixture>) => { f.state.event.currency = "EUR"; },
    (f: ReturnType<typeof fixture>) => { f.state.event.eventType = "ANNUAL_ASSESSMENT"; },
    (f: ReturnType<typeof fixture>) => { Object.assign(f.state.event, { amount: null }); },
    (f: ReturnType<typeof fixture>) => { Object.assign(f.state.event, { eventDate: null }); },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(confirm(input, f.db));
    assert.equal(f.state.payments.length + f.state.reconciliations.length + f.state.audits.length, 0);
    assert.equal(f.state.bank.status, "UNRECONCILED");
  }
});

test("old candidate is not trusted after amount changes", async () => {
  const f = fixture();
  assert.equal(buildBankFinancialEventCandidates(f.state.bank.bankAccount,
    [{ ...f.state.bank, amount: "-36027" }], [{ ...f.state.event, amount: "36027" }]).length, 1);
  f.state.event.amount = decimal(36028);
  await assert.rejects(confirm(input, f.db), /PAIR_NO_LONGER_VALID/);
});

test("duplicate retry is idempotent and excludes its own payment from totals", async () => {
  const f = fixture();
  const first = await confirm(input, f.db);
  const second = await confirm(input, f.db);
  assert.equal(second.idempotent, true);
  assert.equal(second.paymentId, first.paymentId);
  assert.equal(second.reconciliationId, first.reconciliationId);
  assert.equal(f.state.payments.length, 1);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.audits.length, 1);
});

test("PROPOSED payment and reconciliation are reused; REJECTED/VOID are never revived", async () => {
  const f = fixture();
  await confirm(input, f.db);
  f.state.payments[0].status = "PROPOSED";
  f.state.reconciliations[0].status = "PROPOSED";
  f.state.bank.status = "UNRECONCILED";
  await confirm(input, f.db);
  assert.equal(f.state.payments.length, 1);
  assert.equal(f.state.reconciliations.length, 1);
  for (const status of ["REJECTED", "VOID"]) {
    f.state.bank.status = "UNRECONCILED";
    f.state.payments[0].status = status;
    await assert.rejects(confirm(input, f.db), /PAYMENT_STATUS_NOT_CONFIRMABLE/);
  }
  f.state.payments[0].status = "CONFIRMED";
  f.state.reconciliations[0].status = "VOID";
  await assert.rejects(confirm(input, f.db), /RECONCILIATION_STATUS_NOT_CONFIRMABLE/);
});

test("RECONCILED bank requires an already CONFIRMED payment for the exact pair", async () => {
  for (const payment of [null,
    { eventId: 4, bankTransactionId: 3, status: "PROPOSED" },
    { eventId: 99, bankTransactionId: 3, status: "CONFIRMED" },
  ]) {
    const f = fixture();
    f.state.bank.status = "RECONCILED";
    if (payment) f.state.payments.push({ id: 11, amount: decimal(36027), ...payment });
    await assert.rejects(confirm(input, f.db), /BANK_TRANSACTION_ALREADY_RECONCILED/);
    assert.equal(f.state.payments.length, payment ? 1 : 0);
    assert.equal(f.state.reconciliations.length, 0);
    assert.equal(f.state.audits.length, 0);
  }
});

test("another CONFIRMED reconciliation blocks even with stale bank status or same-pair payment", async () => {
  for (const legacyPayment of [false, true]) {
    for (const reconciliationType of ["BANK_TO_BOOKING", "BANK_TO_FINANCIAL_EVENT"]) {
      const f = fixture();
      if (legacyPayment) {
        await confirm(input, f.db);
        f.state.reconciliations = [];
        f.state.audits = [];
      }
      f.state.reconciliations.push({ id: 99, companyId: 2, reconciliationType, status: "CONFIRMED",
        participants: [
          { sourceType: "BANK_TRANSACTION", sourceKey: "3", role: "MONEY_MOVEMENT", matchedAmount: decimal(36027) },
          { sourceType: reconciliationType === "BANK_TO_BOOKING" ? "RECEIPT_ENTRY" : "FINANCIAL_EVENT",
            sourceKey: "99", role: "OBLIGATION", matchedAmount: decimal(36027) },
        ] });
      await assert.rejects(confirm(input, f.db), /BANK_TRANSACTION_ALREADY_RECONCILED/);
      assert.equal(f.state.payments.length, legacyPayment ? 1 : 0);
      assert.equal(f.state.reconciliations.length, 1);
      assert.equal(f.state.audits.length, 0);
    }
  }
});

test("legacy CONFIRMED payment with RECONCILED bank completes canonical reconciliation once", async () => {
  const f = fixture();
  await confirm(input, f.db);
  const payment = { ...f.state.payments[0] };
  f.state.reconciliations = [];
  f.state.audits = [];
  const completed = await confirm(input, f.db);
  assert.equal(completed.paymentId, payment.id);
  assert.deepEqual(f.state.payments, [payment]);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.reconciliations[0].participants.length, 2);
  assert.equal(f.state.audits.length, 1);
  assert.equal((await confirm(input, f.db)).idempotent, true);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.audits.length, 1);
});

test("other CONFIRMED bank or event payments prevent over-allocation", async () => {
  for (const key of [{ eventId: 99, bankTransactionId: 3 }, { eventId: 4, bankTransactionId: 99 }]) {
    const f = fixture();
    f.state.payments.push({ id: 11, ...key, status: "CONFIRMED", amount: decimal("0.01") });
    await assert.rejects(confirm(input, f.db), /OVER_ALLOCATION/);
    assert.equal(f.state.payments.length, 1);
    assert.equal(f.state.bank.status, "UNRECONCILED");
    assert.equal(f.state.reconciliations.length, 0);
  }
});

test("ambiguity with another event does not prohibit an explicit pair", async () => {
  const f = fixture();
  const candidateEvent = { ...f.state.event, amount: "36027" };
  assert.equal(buildBankFinancialEventCandidates(f.state.bank.bankAccount,
    [{ ...f.state.bank, amount: "-36027" }], [candidateEvent, { ...candidateEvent, id: 99 }]).length, 2);
  assert.equal((await confirm(input, f.db)).eventId, 4);
});

test("serialization conflict rolls back and retries the full transaction", async () => {
  const f = fixture(); f.conflict();
  await confirm(input, f.db);
  assert.equal(f.transactions, 2);
  assert.equal(f.state.payments.length, 1);
  assert.equal(f.state.reconciliations.length, 1);
  assert.equal(f.state.audits.length, 1);
});

test("malformed or duplicate reconciliations fail closed", async () => {
  for (const duplicate of [false, true]) {
    const f = fixture(); await confirm(input, f.db);
    if (duplicate) f.state.reconciliations.push({ ...f.state.reconciliations[0], id: 21 });
    else f.state.reconciliations[0].participants.push({ sourceType: "OTHER", sourceKey: "1", role: "OTHER", matchedAmount: decimal(1) });
    await assert.rejects(confirm(input, f.db), /RECONCILIATION/);
    assert.equal(f.state.audits.length, 1);
  }
});
