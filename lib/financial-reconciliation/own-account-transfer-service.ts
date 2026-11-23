import 'server-only';

import { Prisma } from '@/app/generated/prisma/client';
import { Client } from 'pg';
import { prismaPgConnectionOptions } from '@/lib/core/verified-database-tls';
import { prisma } from '@/lib/prisma';
import { assertVerifiedBankAllocationContract } from '@/lib/financial-reconciliation/bank-allocation-contract';
import { assertCommonConfirmedBankAccountOwner } from '@/lib/financial-reconciliation/bank-account-owner-service';
import { ownTransferSelectionStatus, ownTransferStorageEnabled, ownTransferAccountReady, ownTransferScopedStorageEnabled } from '@/lib/personal-finance/own-transfer-policy';

const TYPE = 'BANK_TO_BANK_OWN_TRANSFER';
const VERSION = 'bank-own-transfer-v1';
const SOURCE = 'BANK_TRANSACTION';
const ROLE = 'MONEY_MOVEMENT';

export type SavedOwnTransfer = {
  id: number;
  bankTransactionId: number;
  oppositeTransactionId: number;
  oppositeBankAccountName: string;
  oppositeBankAccountNumber: string | null;
  amount: string;
  confirmedAt: string;
  confirmedByUserId: number | null;
};

function positive(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_SELECTION');
}

function requireStorageForPair(companyId: number, bankAccountId: number, sourceId: number, targetId: number) {
  if (!ownTransferScopedStorageEnabled(process.env, { companyId, bankAccountId, sourceId, targetId })) {
    throw new Error('STORAGE_DISABLED');
  }
}

/**
 * Separate, read-only TLS handshake using the SAME vetted pg configuration as
 * the PrismaPg adapter. pg_stat_ssl only describes the PostgreSQL backend; it
 * may be false for the pooler -> database hop even when Node -> pooler TLS is
 * verified. This does not prove the internal pooler -> PostgreSQL transport.
 *
 * Fail closed. No environment settings, SSL validation flags or DB state change.
 */
async function requireProductionTls(tx: Prisma.TransactionClient) {
  if (ownTransferStorageEnabled()) return; // isolated loopback V03 only
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? ''); }
  catch { throw new Error('UNAVAILABLE'); }
  const isPooler = /^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$/.test(url.hostname);
  let client: Client | undefined;
  try {
    const connection = prismaPgConnectionOptions();
    client = new Client({
      ...connection, connectionTimeoutMillis: 8000, query_timeout: 8000,
      options: '-c default_transaction_read_only=on',
      application_name: 'gloggt-own-transfer-tls-verification',
    });
    await client.connect();
    const socket = (client as Client & {connection?: {stream?: {encrypted?: boolean; authorized?: boolean}}}).connection?.stream;
    if (socket?.encrypted !== true || socket?.authorized !== true) throw new Error('UNAVAILABLE');
    // Direct connections can additionally prove the SAME backend uses TLS.
    // Do not reject a valid external TLS link because of an unencrypted
    // internal Supavisor/Pooler -> PostgreSQL hop.
    if (!isPooler) {
      const result = await tx.$queryRaw<Array<{ ssl: boolean }>>`
        SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()`;
      if (result.length !== 1 || result[0]?.ssl !== true) throw new Error('UNAVAILABLE');
    }
  } catch {
    throw new Error('UNAVAILABLE');
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
}

/** Company- and account-scoped, confirmed links only. No ownership inference from text. */
export async function getSavedOwnTransfers(companyId: number, bankAccountId: number): Promise<SavedOwnTransfer[]> {
  positive(companyId); positive(bankAccountId);
  const ownRows = await prisma.bankTransaction.findMany({
    where: { bankAccountId, bankAccount: { companyId, isActive: true } },
    select: { id: true },
  });
  if (!ownRows.length) return [];
  const ownIds = new Set(ownRows.map(row => row.id));
  const groups = await prisma.financialReconciliation.findMany({
    where: {
      companyId, reconciliationType: TYPE, status: 'CONFIRMED',
      participants: { some: { sourceType: SOURCE, sourceKey: { in: ownRows.map(row => String(row.id)) } } },
    },
    select: {
      id: true, confirmedAt: true, confirmedByUserId: true,
      participants: { select: { sourceType: true, role: true, sourceKey: true, matchedAmount: true } },
    },
    orderBy: { id: 'desc' },
  });
  const pairedIds = [...new Set(groups.flatMap(group => group.participants
    .filter(p => p.sourceType === SOURCE && p.role === ROLE).map(p => Number(p.sourceKey))
    .filter(id => Number.isSafeInteger(id) && id > 0)))];
  const paired = await prisma.bankTransaction.findMany({
    where: { id: { in: pairedIds }, bankAccount: { companyId, isActive: true } },
    select: { id: true, bankAccount: { select: { name: true, accountNumber: true } } },
  });
  const byId = new Map(paired.map(row => [row.id, row]));
  return groups.flatMap(group => {
    const parts = group.participants.filter(p => p.sourceType === SOURCE && p.role === ROLE);
    if (parts.length !== 2) return [];
    const ids = parts.map(p => Number(p.sourceKey));
    if (ids.some(id => !byId.has(id))) return [];
    return ids.flatMap((id, index) => {
      if (!ownIds.has(id)) return [];
      const opposite = byId.get(ids[1 - index]);
      if (!opposite) return [];
      return [{
        id: group.id, bankTransactionId: id, oppositeTransactionId: opposite.id,
        oppositeBankAccountName: opposite.bankAccount.name,
        oppositeBankAccountNumber: opposite.bankAccount.accountNumber,
        amount: parts[index].matchedAmount.toString(),
        confirmedAt: group.confirmedAt?.toISOString() ?? '',
        confirmedByUserId: group.confirmedByUserId,
      }];
    });
  });
}

/** Fail closed when another bookkeeping/family flow already owns EITHER movement. */
async function requireNoOtherClaims(tx: Prisma.TransactionClient, companyId: number, ids: number[], excludeId?: number) {
  const prior = await tx.financialReconciliationParticipant.findFirst({
    where: { sourceType: SOURCE, sourceKey: { in: ids.map(String) },
      reconciliation: { companyId, status: { not: 'VOID' }, ...(excludeId ? { id: { not: excludeId } } : {}) } },
    select: { id: true },
  });
  if (prior) throw new Error('ALREADY_RECONCILED');
  const payment = await tx.financialEventPayment.findFirst({
    where: { bankTransactionId: { in: ids } }, select: { id: true },
  });
  if (payment) throw new Error('ALREADY_RECONCILED');
  // Central DB claim table alone is insufficient: Production must prove the
  // versioned trigger/backfill contract before this single-pair write is allowed.
  // This stays fail-closed on the real Supabase DB; V03 is isolated.
  if (!ownTransferStorageEnabled()) await assertVerifiedBankAllocationContract(tx);
  const claimTable = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public."BankAllocationClaim"') IS NOT NULL AS present`;
  if (claimTable.length !== 1) throw new Error('UNAVAILABLE');
  // No central allocation-claim guard in Production means we cannot prove
  // exclusivity across independent reconciliation/family workflows. Fail closed.
  // Preserve the older isolated V03 test path; it has its own local controls.
  if (!claimTable[0].present && !ownTransferStorageEnabled()) {
    throw new Error('CLAIM_GUARD_MISSING');
  }
  if (claimTable[0].present) {
    const claims = await tx.$queryRaw<Array<{ bankTransactionId: number; kind: string }>>`
      SELECT "bankTransactionId", kind FROM public."BankAllocationClaim"
      WHERE "bankTransactionId" IN (${ids[0]}, ${ids[1]})`;
    // In V03 the ordinary-allocation trigger creates sticky ORDINARY claims
    // when our own reconciliation is first confirmed. Undo can VOID that SAME
    // reconciliation while preserving those claims; a later replacement remains
    // intentionally blocked by the sticky claim. FAMILY is never permitted.
    if (claims.some(row => !excludeId || row.kind !== 'ORDINARY')) throw new Error('ALREADY_RECONCILED');
  }
  const classifications = await tx.financialSourceClassification.findMany({
    where: { companyId, sourceType: SOURCE, sourceKey: { in: ids.map(String) } },
    select: { classification: true },
  });
  if (classifications.some(row => !['REVIEW', 'INTERNAL_TRANSFER'].includes(row.classification))) {
    throw new Error('CLASSIFICATION_CONFLICT');
  }
}

/** Operator confirms the chosen pair; recorded owners and both movements are rechecked in SERIALIZABLE. */
export async function confirmOwnAccountTransfer(input: {
  companyId: number; userId: number; bankAccountId: number; sourceId: number; targetId: number; ownershipAttested: boolean;
}) {
  requireStorageForPair(input.companyId, input.bankAccountId, input.sourceId, input.targetId);
  [input.companyId, input.userId, input.bankAccountId, input.sourceId, input.targetId].forEach(positive);
  if (!input.ownershipAttested) throw new Error('OWNERSHIP_NOT_ATTESTED');
  if (input.sourceId === input.targetId) throw new Error('INVALID_SELECTION');

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await requireProductionTls(tx);
        // Lock both rows in stable order. Database, not the browser, decides if they are still free.
        const low = Math.min(input.sourceId, input.targetId);
        const high = Math.max(input.sourceId, input.targetId);
        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT "id" FROM public."BankTransaction"
          WHERE "id" IN (${low}, ${high}) ORDER BY "id" FOR UPDATE`;
        if (locked.length !== 2) throw new Error('NOT_FOUND');
        const rows = await tx.bankTransaction.findMany({
          where: { id: { in: [low, high] }, bankAccount: { companyId: input.companyId, isActive: true } },
          select: { id: true, bankAccountId: true, date: true, amount: true, status: true },
        });
        if (rows.length !== 2) throw new Error('NOT_FOUND');
        const source = rows.find(row => row.id === input.sourceId)!;
        const target = rows.find(row => row.id === input.targetId)!;
        if (source.bankAccountId !== input.bankAccountId) throw new Error('NOT_FOUND');
        const status = ownTransferSelectionStatus({
          sourceId: source.id, targetId: target.id,
          sourceAccountId: source.bankAccountId, targetAccountId: target.bankAccountId,
          sourceDate: source.date, targetDate: target.date,
          sourceAmount: source.amount.toString(), targetAmount: target.amount.toString(),
          sourceStatus: source.status, targetStatus: target.status, ownershipAttested: input.ownershipAttested,
        });
        if (status) throw new Error(status);
        // Both registered, active accounts must have the same owner. Company
        // registration by the bookkeeper is authoritative unless a newer owner
        // record overrides or revokes it; always recheck inside the transaction.
        const accountOwner = await assertCommonConfirmedBankAccountOwner(
          tx, input.companyId, source.bankAccountId, target.bankAccountId,
        );
        await requireNoOtherClaims(tx, input.companyId, [low, high]);

        const now = new Date();
        const amount = source.amount.abs();
        const created = await tx.financialReconciliation.create({
          data: {
            companyId: input.companyId, reconciliationType: TYPE,
            status: 'CONFIRMED', source: 'MANUAL', confirmedByUserId: input.userId, confirmedAt: now,
            metadata: { version: VERSION, ownership: 'REGISTERED_ACCOUNT_OWNER',
              bankTransactionIds: [source.id, target.id],
              bankAccountIds: [source.bankAccountId, target.bankAccountId],
              verifiedAccountOwner: { ownerKind: accountOwner.ownerKind,
                ownerId: accountOwner.ownerId, basis: accountOwner.basis,
                evidenceAuditIds: accountOwner.evidenceAuditIds },
              bankAmounts: [source.amount.toString(), target.amount.toString()],
              note: 'Eigin millifærsla staðfest af bókara; hvorki gjald, tekjur, lán né gjöf.' },
            participants: { create: [source, target].map(row => ({
              sourceType: SOURCE, sourceKey: String(row.id), role: ROLE, matchedAmount: amount,
              metadata: { bankAccountId: row.bankAccountId, bankAmount: row.amount.toString() },
            })) },
          }, select: { id: true },
        });
        for (const row of [source, target]) {
          const updated = await tx.bankTransaction.updateMany({
            where: { id: row.id, bankAccountId: row.bankAccountId, status: 'UNRECONCILED' },
            data: { status: 'RECONCILED' },
          });
          if (updated.count !== 1) throw new Error('ALREADY_RECONCILED');
        }
        await tx.auditEvent.create({ data: {
          companyId: input.companyId, userId: input.userId,
          entityType: 'FinancialReconciliation', entityId: created.id,
          action: 'CONFIRM_BANK_TO_BANK_OWN_TRANSFER', source: 'USER',
          parentEntityType: SOURCE, parentEntityId: source.id,
          beforeData: { status: 'UNRECONCILED', bankTransactionIds: [source.id, target.id] },
          afterData: { status: 'CONFIRMED', bankTransactionIds: [source.id, target.id] },
          metadata: { version: VERSION, amount: amount.toString(), pairConfirmedByOperator: true, registrationBasis: accountOwner.basis },
        } });
        return { id: created.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
    }
  }
}

/** Undo is never deletion. Restore BOTH original bank statuses, audit the reason, keep VOID history. */
export async function voidOwnAccountTransfer(input: {
  companyId: number; userId: number; bankAccountId: number; reconciliationId: number; reason: string;
}) {
  if (!ownTransferAccountReady(process.env, { companyId: input.companyId, bankAccountId: input.bankAccountId })) {
    throw new Error('STORAGE_DISABLED');
  }
  [input.companyId, input.userId, input.bankAccountId, input.reconciliationId].forEach(positive);
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) throw new Error('REASON_REQUIRED');
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await requireProductionTls(tx);
        const group = await tx.financialReconciliation.findFirst({
          where: { id: input.reconciliationId, companyId: input.companyId, reconciliationType: TYPE, status: 'CONFIRMED' },
          include: { participants: true },
        });
        if (!group) throw new Error('NOT_FOUND');
        const parts = group.participants.filter(p => p.sourceType === SOURCE && p.role === ROLE);
        if (parts.length !== 2) throw new Error('UNAVAILABLE');
        const ids = parts.map(p => Number(p.sourceKey));
        requireStorageForPair(input.companyId, input.bankAccountId, ids[0], ids[1]);
        if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || ids[0] === ids[1]) throw new Error('UNAVAILABLE');
        const low = Math.min(...ids), high = Math.max(...ids);
        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT "id" FROM public."BankTransaction"
          WHERE "id" IN (${low}, ${high}) ORDER BY "id" FOR UPDATE`;
        if (locked.length !== 2) throw new Error('NOT_FOUND');
        const rows = await tx.bankTransaction.findMany({
          where: { id: { in: ids }, bankAccount: { companyId: input.companyId, isActive: true } },
          select: { id: true, bankAccountId: true, status: true },
        });
        if (rows.length !== 2 || !rows.some(row => row.bankAccountId === input.bankAccountId) ||
            rows.some(row => row.status !== 'RECONCILED')) throw new Error('ALREADY_RECONCILED');
        await requireNoOtherClaims(tx, input.companyId, ids, group.id);
        const changed = await tx.financialReconciliation.updateMany({
          where: { id: group.id, companyId: input.companyId, status: 'CONFIRMED' }, data: { status: 'VOID' },
        });
        if (changed.count !== 1) throw new Error('ALREADY_RECONCILED');
        for (const row of rows) {
          const updated = await tx.bankTransaction.updateMany({
            where: { id: row.id, bankAccountId: row.bankAccountId, status: 'RECONCILED' },
            data: { status: 'UNRECONCILED' },
          });
          if (updated.count !== 1) throw new Error('ALREADY_RECONCILED');
        }
        await tx.auditEvent.create({ data: {
          companyId: input.companyId, userId: input.userId,
          entityType: 'FinancialReconciliation', entityId: group.id,
          action: 'VOID_BANK_TO_BANK_OWN_TRANSFER', source: 'USER',
          parentEntityType: SOURCE, parentEntityId: rows.find(row => row.bankAccountId === input.bankAccountId)!.id,
          description: reason,
          beforeData: { status: 'CONFIRMED', bankTransactionIds: ids },
          afterData: { status: 'VOID', bankTransactionIds: ids },
          metadata: { version: VERSION, reason },
        } });
        return { id: group.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
    }
  }
}
