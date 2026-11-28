/**
 * PostgreSQL integration acceptance for the *transaction-level* lifecycle
 * contract. Uses genuine separate DB sessions and the same advisory-lock,
 * conditional-claim and lifecycle policy primitives as receiptActions.ts.
 *
 * It does NOT invoke authenticated Next.js server actions or external storage.
 * Those still need separate end-to-end tests before Production.
 *
 * Write safety: accepts ONLY the dedicated local PostgreSQL 55432 test DB,
 * synthetic rows, explicit acknowledgement, and never DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../app/generated/prisma/client";
import { lockDocumentIdentityCompany } from "../receipts/document-instance-service";
import { assertUnpostedDocument, assertUnpostedReceipt } from "./bookkeeping-lifecycle-policy";

const testUrl = process.env.DOCUMENT_INSTANCE_TEST_DATABASE_URL?.trim() ?? "";
const writeAck = process.env.DOCUMENT_INSTANCE_TEST_DATABASE_ALLOW_WRITES;
const expected = {
  database: "gloggt_identity_tests",
  username: "gloggt_test_runner",
  host: "127.0.0.1",
  port: "55432",
};

function assertSafeTestTarget(): void {
  if (writeAck !== "YES_I_KNOW_THIS_IS_TEST") throw new Error("P2_TEST_DATABASE_WRITE_ACK_REQUIRED");
  let u: URL;
  try { u = new URL(testUrl); } catch { throw new Error("P2_TEST_DATABASE_URL_REQUIRED"); }
  if (!(["postgres:", "postgresql:"].includes(u.protocol)) ||
      decodeURIComponent(u.pathname).replace(/^\//, "") !== expected.database ||
      decodeURIComponent(u.username) !== expected.username ||
      u.hostname !== expected.host || u.port !== expected.port) {
    throw new Error("P2_REFUSES_NON_ISOLATED_LOCAL_TEST_DATABASE");
  }
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    try {
      const c = new URL(configured);
      if (c.host === u.host && c.pathname === u.pathname) throw new Error("P2_TEST_DATABASE_MUST_DIFFER_FROM_APP_DATABASE");
    } catch (error) {
      if (error instanceof Error && error.message === "P2_TEST_DATABASE_MUST_DIFFER_FROM_APP_DATABASE") throw error;
    }
  }
}

const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 15_000,
};

type Ctx = { client: PrismaClient; companyId: number; receiptId: number; documentId: number };
function newClient(): PrismaClient {
  assertSafeTestTarget();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
}

async function assertDatabaseIdentity(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRaw<Array<{ db: string; db_user: string; host: string; port: number }>>`
    SELECT current_database() AS db, current_user AS db_user,
           host(inet_server_addr()) AS host, inet_server_port()::integer AS port
  `;
  assert.deepEqual(rows[0], {
    db: expected.database, db_user: expected.username, host: expected.host, port: Number(expected.port),
  }, "P2 refuses to write to anything except the dedicated local PostgreSQL test database");
  const tables = await client.$queryRaw<Array<{ receipt: string | null; child: string | null }>>`
    SELECT to_regclass('"Receipt"')::text AS receipt,
           to_regclass('"AiDetectedDocument"')::text AS child
  `;
  assert.equal(tables[0]?.receipt, '"Receipt"');
  assert.equal(tables[0]?.child, '"AiDetectedDocument"');
}

async function withFixture(run: (ctx: Ctx) => Promise<void>): Promise<void> {
  const client = newClient();
  let companyId: number | null = null;
  let receiptId: number | null = null;
  try {
    await assertDatabaseIdentity(client);
    const tag = `p2-lifecycle-${randomUUID()}`;
    const company = await client.company.create({ data: {
      name: tag, kennitala: String(randomInt(1_000_000_000, 9_999_999_999)),
      address: "ONLY LOCAL TEST", phone: "0000000", email: `${tag}@example.invalid`, contact: "test",
    } });
    companyId = company.id;
    const receipt = await client.receipt.create({ data: {
      companyId: company.id, description: tag, amount: 100,
      date: new Date("2026-01-01T12:00:00.000Z"), status: "NEW",
    } });
    receiptId = receipt.id;
    const child = await client.aiDetectedDocument.create({ data: {
      receiptId: receipt.id, summary: tag, date: receipt.date,
      totalAmount: 100, contentRevision: 1, reviewedContentRevision: 1,
      reviewedAt: new Date("2026-01-01T12:00:00.000Z"),
    } });
    await run({ client, companyId: company.id, receiptId: receipt.id, documentId: child.id });
  } finally {
    // Only our newly-created fixture IDs are cleaned up. Never delete by name,
    // and never truncate real tables. No dependency on existing company data.
    try {
      if (receiptId !== null && companyId !== null) {
        await client.receipt.deleteMany({ where: { id: receiptId, companyId } });
      }
      if (companyId !== null) await client.company.delete({ where: { id: companyId } });
    } finally { await client.$disconnect(); }
  }
}

function entryRows(receiptId: number) {
  return [
    { receiptId, account: "4990", text: "P2 synthetic debit", debit: 100, credit: 0 },
    { receiptId, account: "2230", text: "P2 synthetic credit", debit: 0, credit: 100 },
  ];
}

/** These operations mirror only the relevant locked portions of the P1/P2
 * server actions, not the full business workflow (VAT/audit/authorization).
 */
async function postChild(tx: Prisma.TransactionClient, ctx: Ctx): Promise<void> {
  const parent = await tx.receipt.findFirst({
    where: { id: ctx.receiptId, companyId: ctx.companyId },
    select: { status: true, voucherNumber: true },
  });
  if (!parent || parent.status === "APPROVED" || parent.voucherNumber !== null) {
    throw new Error("P2_PARENT_ALREADY_POSTED");
  }
  const updated = await tx.aiDetectedDocument.updateMany({
    where: {
      id: ctx.documentId, receiptId: ctx.receiptId,
      contentRevision: 1, reviewedContentRevision: 1,
      reviewedAt: { not: null }, approvedAt: null, voucherNumber: null,
      disposedAt: null, disposition: null, duplicateMarkedAt: null, needsAttentionAt: null,
    },
    data: { approvedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error("P2_STALE_OR_MISSING_CHILD");
  await tx.receiptEntry.createMany({ data: entryRows(ctx.receiptId) });
}

async function deleteParent(tx: Prisma.TransactionClient, ctx: Ctx): Promise<void> {
  const parent = await tx.receipt.findFirst({
    where: { id: ctx.receiptId, companyId: ctx.companyId },
    include: { aiDetectedDocuments: { select: { approvedAt: true, voucherNumber: true } },
      _count: { select: { entries: true } } },
  });
  if (!parent) throw new Error("P2_MISSING_PARENT");
  assertUnpostedReceipt(parent);
  const removed = await tx.receipt.deleteMany({
    where: { id: ctx.receiptId, companyId: ctx.companyId,
      status: { not: "APPROVED" }, voucherNumber: null, updatedAt: parent.updatedAt },
  });
  if (removed.count !== 1) throw new Error("P2_STALE_PARENT");
}

async function deleteChild(tx: Prisma.TransactionClient, ctx: Ctx): Promise<void> {
  const child = await tx.aiDetectedDocument.findFirst({
    where: { id: ctx.documentId, receiptId: ctx.receiptId, receipt: { companyId: ctx.companyId } },
    select: { approvedAt: true, voucherNumber: true, contentRevision: true, reviewedAt: true },
  });
  if (!child) throw new Error("P2_MISSING_CHILD");
  assertUnpostedDocument(child);
  const removed = await tx.aiDetectedDocument.deleteMany({ where: {
    id: ctx.documentId, receiptId: ctx.receiptId, contentRevision: child.contentRevision,
    reviewedAt: child.reviewedAt, approvedAt: null, voucherNumber: null,
    receipt: { companyId: ctx.companyId, status: { not: "APPROVED" }, voucherNumber: null },
  } });
  if (removed.count !== 1) throw new Error("P2_STALE_CHILD");
}

async function manualPost(tx: Prisma.TransactionClient, ctx: Ctx): Promise<void> {
  const parent = await tx.receipt.findFirst({ where: { id: ctx.receiptId, companyId: ctx.companyId } });
  if (!parent || parent.status === "APPROVED") throw new Error("P2_MANUAL_ALREADY_POSTED");
  const childBooked = await tx.aiDetectedDocument.count({ where: {
    receiptId: ctx.receiptId, OR: [ { approvedAt: { not: null } }, { voucherNumber: { not: null } } ],
  } });
  if (childBooked || await tx.receiptEntry.count({ where: { receiptId: ctx.receiptId } })) throw new Error("P2_EXISTING_POSTING");
  const updated = await tx.receipt.updateMany({
    where: { id: ctx.receiptId, companyId: ctx.companyId, status: { not: "APPROVED" } },
    data: { status: "APPROVED" },
  });
  if (updated.count !== 1) throw new Error("P2_MANUAL_CLAIM_FAILED");
  await tx.receiptEntry.createMany({ data: entryRows(ctx.receiptId) });
}

async function race(ctx: Ctx, first: (tx: Prisma.TransactionClient) => Promise<void>,
  second: (tx: Prisma.TransactionClient) => Promise<void>): Promise<PromiseSettledResult<void>> {
  const other = newClient();
  let ready!: () => void;
  let release!: () => void;
  const firstReady = new Promise<void>(resolve => { ready = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  try {
    const left = ctx.client.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, ctx.companyId);
      await first(tx);
      ready();
      await hold;
    }, options);
    await Promise.race([firstReady, left.then(
      () => { throw new Error("P2_FIRST_TRANSACTION_FINISHED_PREMATURELY"); },
      e => { throw e; },
    )]);
    const right = other.$transaction(async tx => {
      await lockDocumentIdentityCompany(tx, ctx.companyId);
      await second(tx);
    }, options);
    // Both transactions are now independently scheduled. The first still owns
    // the xact advisory lock until released; the second must see its commit.
    await new Promise(resolve => setTimeout(resolve, 60));
    release();
    await left;
    return await Promise.allSettled([right]).then(results => results[0]);
  } finally {
    release?.();
    await other.$disconnect();
  }
}

test("P2 local test environment points only to synthetic PostgreSQL", () => {
  assertSafeTestTarget();
});

test("P2 source contract checks parent AFTER the company lock in child booking", () => {
  const source = readFileSync(new URL("../../app/actions/receiptActions.ts", import.meta.url), "utf8");
  const begin = source.indexOf("export async function approveDetectedDocument(");
  const end = source.indexOf("export async function approveAiSuggestion(", begin);
  assert.ok(begin > 0 && end > begin);
  const section = source.slice(begin, end);
  const lock = section.indexOf("await lockDocumentIdentityCompany(tx, document.receipt.companyId)");
  const parent = section.indexOf("const lockedParentReceipt = await tx.receipt.findFirst(");
  const claim = section.indexOf("const postingClaim = await tx.aiDetectedDocument.updateMany(");
  assert.ok(lock >= 0 && parent > lock && claim > parent);
  assert.match(section.slice(parent, claim), /lockedParentReceipt\.status === "APPROVED"/);
});

test("P2 real DB: committed child booking prevents parent deletion and preserves ledger", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, tx => postChild(tx, ctx), tx => deleteParent(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 2);
    assert.ok(await ctx.client.receipt.findUnique({ where: { id: ctx.receiptId } }));
  });
});

test("P2 real DB: parent deleted first cannot be posted afterwards", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, tx => deleteParent(tx, ctx), tx => postChild(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.receipt.count({ where: { id: ctx.receiptId } }), 0);
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 0);
  });
});

test("P2 real DB: manual parent posting prevents child posting for same source", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, tx => manualPost(tx, ctx), tx => postChild(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 2);
    const parent = await ctx.client.receipt.findUniqueOrThrow({ where: { id: ctx.receiptId } });
    const child = await ctx.client.aiDetectedDocument.findUniqueOrThrow({ where: { id: ctx.documentId } });
    assert.equal(parent.status, "APPROVED");
    assert.equal(child.approvedAt, null);
  });
});

test("P2 real DB: manual parent posting prevents parent deletion and keeps lines", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, tx => manualPost(tx, ctx), tx => deleteParent(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 2);
  });
});

test("P2 real DB: content revision changed first refuses stale reviewed posting", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, async tx => {
      const count = await tx.aiDetectedDocument.updateMany({
        where: { id: ctx.documentId, receiptId: ctx.receiptId, contentRevision: 1,
          reviewedContentRevision: 1, approvedAt: null },
        data: { contentRevision: { increment: 1 }, reviewedContentRevision: null, reviewedAt: null },
      });
      assert.equal(count.count, 1);
    }, tx => postChild(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 0);
    const child = await ctx.client.aiDetectedDocument.findUniqueOrThrow({ where: { id: ctx.documentId } });
    assert.equal(child.contentRevision, 2);
    assert.equal(child.approvedAt, null);
  });
});

test("P2 real DB: deleted child cannot later be claimed for posting", async () => {
  await withFixture(async ctx => {
    const result = await race(ctx, tx => deleteChild(tx, ctx), tx => postChild(tx, ctx));
    assert.equal(result.status, "rejected");
    assert.equal(await ctx.client.aiDetectedDocument.count({ where: { id: ctx.documentId } }), 0);
    assert.equal(await ctx.client.receiptEntry.count({ where: { receiptId: ctx.receiptId } }), 0);
  });
});
