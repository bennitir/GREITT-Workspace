import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../../app/generated/prisma/client";
import { buildPrismaBankDiagnosticSnapshot, toDiagnosticReadDb } from "./diagnostics-prisma";
import { loadBankDiagnosticSource, type DiagnosticReadDb } from "./diagnostics-source";
import { buildBankDiagnosticSnapshotFromSource } from "./diagnostics-service";

const metadata = { companyId: 7, bankAccountId: 8, snapshotId: "adapter-synthetic", capturedAt: "2026-01-02T00:00:00Z" };
function fake(options: { beginFailure?: boolean; modeFailure?: boolean; completionFailure?: boolean;
  readFailure?: boolean; missingAccount?: boolean; secondaryRead?: boolean } = {}) {
  const trace: string[] = [];
  let transactionCount = 0, writeCount = 0, rootCount = 0;
  let isolation: unknown;
  const write = () => { writeCount++; throw new Error("write forbidden"); };
  const owner = { id: 8, companyId: 7 };
  const rows: Record<keyof DiagnosticReadDb, unknown> = {
    bankAccount: options.missingAccount ? null : { ...owner, ledgerAccount: null },
    bankTransaction: [{ id: 1, bankAccountId: 8, bankAccount: owner, amount: "-100", date: new Date(metadata.capturedAt),
      reference: null, text: "Synthetic", status: "RECONCILED" }],
    receiptEntry: [], financialEvent: [], aiDetectedDocument: [], documentFinancialEvent: [], financialEventPayment: [],
    financialReconciliation: options.secondaryRead ? [{ id: 60, companyId: 7, reconciliationType: "OTHER", status: "CONFIRMED",
      participants: [{ sourceType: "BANK_TRANSACTION", sourceKey: "2", role: "MONEY_MOVEMENT", matchedAmount: "100" }] }] : [],
  };
  const queryArgs: { model: string; args: unknown }[] = [];
  const txObject: Record<string, unknown> = {
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      trace.push("read-only");
      assert.deepEqual([...strings], ["SET TRANSACTION READ ONLY"]);
      assert.deepEqual([...strings.raw], ["SET TRANSACTION READ ONLY"]);
      assert.deepEqual(values, []);
      if (options.modeFailure) throw new Error("mode failed");
      return 0;
    },
    $executeRawUnsafe: write, $queryRaw: write, $transaction: write,
  };
  for (const model of Object.keys(rows) as (keyof DiagnosticReadDb)[]) {
    const method = model === "bankAccount" ? "findFirst" : "findMany";
    const delegate = {
      [method]: async function(this: unknown, args: { where: Record<string, unknown> }): Promise<unknown> {
        assert.equal(this, delegate); // Every wrapper calls the original transaction delegate.
        assert.equal(trace[0], "begin"); assert.equal(trace[1], "read-only");
        trace.push(model); queryArgs.push({ model, args });
        if (model === "receiptEntry" && options.readFailure) throw new Error("source unavailable");
        if (model === "bankTransaction" && args.where.id) return [];
        return rows[model];
      },
      create: write, update: write, delete: write, upsert: write,
    };
    txObject[model] = delegate;
  }
  const tx = txObject as unknown as Prisma.TransactionClient;
  const root = new Proxy({
    async $transaction(work: (tx: Prisma.TransactionClient) => Promise<unknown>, settings: unknown) {
      transactionCount++; isolation = settings; trace.push("begin");
      if (options.beginFailure) throw new Error("begin/isolation failed");
      const result = await work(tx);
      trace.push("complete");
      if (options.completionFailure) throw new Error("completion failed");
      return result;
    },
  }, { get(target, key) {
    if (key === "$transaction") return target.$transaction;
    rootCount++; throw new Error("root delegate forbidden");
  } }) as unknown as Pick<PrismaClient, "$transaction">;
  return { root, tx, trace, queryArgs, stats: () => ({ transactionCount, writeCount, rootCount, isolation }) };
}

test("one RepeatableRead transaction sets constant tagged READ ONLY before every application read", async () => {
  const f = fake(); const result = await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root });
  assert.equal(result.ok, true);
  assert.deepEqual(f.stats(), { transactionCount: 1, writeCount: 0, rootCount: 0, isolation: { isolationLevel: "RepeatableRead" } });
  assert.deepEqual(f.trace.slice(0, 3), ["begin", "read-only", "bankAccount"]);
  assert.equal(f.trace.at(-1), "complete");
  assert.equal(f.queryArgs.length, 8);
  assert.deepEqual((f.queryArgs[0].args as { where: unknown }).where, { id: 8, companyId: 7 });
  assert.deepEqual((f.queryArgs[1].args as { where: unknown }).where, { bankAccountId: 8 });
  if (result.ok) {
    assert.equal(result.snapshot.source.readConsistency, "REPEATABLE_READ");
    assert.equal(result.snapshot.snapshotId, metadata.snapshotId);
    assert.equal(result.snapshot.capturedAt, metadata.capturedAt);
    assert.equal(result.snapshot.total.transactionCount, 1);
  }
});

test("narrow wrappers expose only required read operations, never full Prisma delegates", () => {
  const f = fake(); const db = toDiagnosticReadDb(f.tx);
  assert.deepEqual(Object.keys(db).sort(), ["aiDetectedDocument", "bankAccount", "bankTransaction", "documentFinancialEvent",
    "financialEvent", "financialEventPayment", "financialReconciliation", "receiptEntry"].sort());
  for (const [model, delegate] of Object.entries(db)) {
    assert.deepEqual(Object.keys(delegate), [model === "bankAccount" ? "findFirst" : "findMany"]);
    assert.notEqual(delegate, f.tx[model as keyof DiagnosticReadDb]);
  }
  assert.equal(f.stats().writeCount, 0);
});

test("secondary bank resolution uses the same transaction without root reads", async () => {
  const f = fake({ secondaryRead: true });
  const result = await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root });
  assert.equal(result.ok, true);
  assert.equal(f.queryArgs.filter(q => q.model === "bankTransaction").length, 2);
  assert.equal(f.stats().transactionCount, 1); assert.equal(f.stats().rootCount, 0);
});

for (const failure of ["beginFailure", "modeFailure", "completionFailure"] as const) {
  test(`${failure} returns adapter failure without snapshot or fallback`, async () => {
    const f = fake({ [failure]: true });
    assert.deepEqual(await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root }),
      { ok: false, code: "DIAGNOSTIC_TRANSACTION_FAILED" });
    assert.equal(f.stats().transactionCount, 1); assert.equal(f.stats().rootCount, 0);
    assert.equal(f.stats().writeCount, 0);
    if (failure !== "completionFailure") assert.equal(f.queryArgs.length, 0);
  });
}

test("source read failure can retain PARTIAL inside successfully completed transaction", async () => {
  const f = fake({ readFailure: true });
  const result = await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.completeness, "PARTIAL");
    assert.equal(result.snapshot.source.readConsistency, "REPEATABLE_READ");
    assert.ok(result.snapshot.source.issues.some(i => i.code === "SOURCE_UNAVAILABLE"));
    assert.equal(result.snapshot.total.transactionCount, 1);
  }
  assert.equal(f.trace.at(-1), "complete");
});

test("ownership failure stays a loader failure and produces no snapshot", async () => {
  const f = fake({ missingAccount: true });
  assert.deepEqual(await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root }), { ok: false, code: "BANK_ACCOUNT_NOT_FOUND" });
  assert.equal(f.queryArgs.length, 1);
});

test("direct loader stays UNCOORDINATED and adapter changes only readConsistency metadata", async () => {
  const direct = fake(); direct.trace.push("begin", "read-only");
  const loaded = await loadBankDiagnosticSource({ ...metadata, db: toDiagnosticReadDb(direct.tx) });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.source.readConsistency, "UNCOORDINATED");
  const expected = buildBankDiagnosticSnapshotFromSource(loaded.source);
  const f = fake(); const result = await buildPrismaBankDiagnosticSnapshot({ ...metadata, prisma: f.root });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.snapshot, { ...expected, source: { ...expected.source, readConsistency: "REPEATABLE_READ" } });
});
