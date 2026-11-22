import 'server-only';

import { Prisma } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { registeredPrivatePersonCategory } from '@/lib/personal-finance/private-person-registry-policy';
import {
  BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE, BANK_OWNER_VERSION,
  commonConfirmedBankAccountOwner, latestConfirmedBankAccountOwner,
  type BankOwnerAudit, type BankOwnerEvidenceKind, type BankOwnerKind,
} from '@/lib/personal-finance/bank-account-owner-policy';

function id(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID_SELECTION');
}

/** Only events for this tenant and BankAccount are authoritative. An invalid latest event blocks. */
async function latestOwner(tx: Prisma.TransactionClient, companyId: number, bankAccountId: number) {
  const row = await tx.auditEvent.findFirst({
    where: {
      companyId, entityType: 'BankAccount', entityId: bankAccountId,
      action: { in: [BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE] },
    },
    orderBy: { id: 'desc' },
    select: { id: true, companyId: true, entityType: true, entityId: true,
      action: true, source: true, userId: true, afterData: true },
  });
  return latestConfirmedBankAccountOwner(row ? [row as BankOwnerAudit] : [], companyId, bankAccountId);
}

/** Validate that an owner key resolves to a real canonical record within this tenant. */
async function requireCanonicalOwner(
  tx: Prisma.TransactionClient, companyId: number, ownerKind: BankOwnerKind, ownerId: number,
) {
  if (ownerKind === 'COMPANY') {
    if (ownerId !== companyId) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
    const company = await tx.company.findFirst({ where: { id: companyId, isActive: true }, select: { id: true } });
    if (!company) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
  } else {
    const person = await tx.insightEntity.findFirst({
      where: { id: ownerId, companyId, entityType: 'PERSON', status: 'ACTIVE' },
      select: { metadata: true },
    });
    if (!person || !registeredPrivatePersonCategory(person.metadata)) {
      throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
    }
  }
}

/**
 * Must be called INSIDE the same SERIALIZABLE transaction as bank transfer confirmation.
 * Lock account rows in stable order; the attest/revoke operations lock them as well.
 * History remains in the existing AuditEvent table: NO new Production schema.
 */
export async function assertCommonConfirmedBankAccountOwner(
  tx: Prisma.TransactionClient, companyId: number,
  sourceAccountId: number, targetAccountId: number,
) {
  [companyId, sourceAccountId, targetAccountId].forEach(id);
  if (sourceAccountId === targetAccountId) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
  const low = Math.min(sourceAccountId, targetAccountId);
  const high = Math.max(sourceAccountId, targetAccountId);
  const locked = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM public."BankAccount"
    WHERE id IN (${low}, ${high}) AND "companyId" = ${companyId} AND "isActive" = true
    ORDER BY id FOR UPDATE`;
  if (locked.length !== 2) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
  const [left, right] = await Promise.all([
    latestOwner(tx, companyId, sourceAccountId),
    latestOwner(tx, companyId, targetAccountId),
  ]);
  const match = commonConfirmedBankAccountOwner(left, right, companyId, sourceAccountId, targetAccountId);
  if (!match) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
  await requireCanonicalOwner(tx, companyId, match.ownerKind, match.ownerId);
  return match;
}

/**
 * Bank ownership registration is explicit, not inferred. Invoke only from a
 * separately authorized owner/admin server action with a recorded evidence choice.
 * This writes an AUDIT EVENT, not a bookkeeping entry or bank transaction.
 */
export async function confirmBankAccountOwner(input: {
  companyId: number; bankAccountId: number; userId: number;
  ownerKind: BankOwnerKind; ownerId: number;
  evidenceKind: BankOwnerEvidenceKind; ownershipAttested: boolean;
}) {
  [input.companyId, input.bankAccountId, input.userId, input.ownerId].forEach(id);
  if (!input.ownershipAttested ||
      !['COMPANY', 'PRIVATE_PERSON'].includes(input.ownerKind) ||
      !['NETBANK', 'BANK_STATEMENT'].includes(input.evidenceKind)) {
    throw new Error('OWNERSHIP_NOT_ATTESTED');
  }
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM public."BankAccount"
      WHERE id = ${input.bankAccountId} AND "companyId" = ${input.companyId}
        AND "isActive" = true FOR UPDATE`;
    if (rows.length !== 1) throw new Error('NOT_FOUND');
    await requireCanonicalOwner(tx, input.companyId, input.ownerKind, input.ownerId);
    const previous = await latestOwner(tx, input.companyId, input.bankAccountId);
    return tx.auditEvent.create({ data: {
      companyId: input.companyId, userId: input.userId,
      entityType: 'BankAccount', entityId: input.bankAccountId,
      action: BANK_OWNER_CONFIRM, source: 'USER',
      description: 'Eigandi bankareiknings staðfestur handvirkt gegn heimild.',
      beforeData: previous ? { ownerKind: previous.ownerKind, ownerId: previous.ownerId,
        evidenceAuditId: previous.auditId } : undefined,
      afterData: { version: BANK_OWNER_VERSION, ownerKind: input.ownerKind,
        ownerId: input.ownerId, evidenceKind: input.evidenceKind, ownershipAttested: true },
    }, select: { id: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Revoke by appending new evidence; never delete an earlier attestation. */
export async function revokeBankAccountOwner(input: {
  companyId: number; bankAccountId: number; userId: number; reason: string;
}) {
  [input.companyId, input.bankAccountId, input.userId].forEach(id);
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) throw new Error('REASON_REQUIRED');
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM public."BankAccount"
      WHERE id = ${input.bankAccountId} AND "companyId" = ${input.companyId}
      ORDER BY id FOR UPDATE`;
    if (rows.length !== 1) throw new Error('NOT_FOUND');
    const previous = await latestOwner(tx, input.companyId, input.bankAccountId);
    if (!previous) throw new Error('BANK_ACCOUNT_OWNER_UNVERIFIED');
    return tx.auditEvent.create({ data: {
      companyId: input.companyId, userId: input.userId,
      entityType: 'BankAccount', entityId: input.bankAccountId,
      action: BANK_OWNER_REVOKE, source: 'USER', description: reason,
      beforeData: { ownerKind: previous.ownerKind, ownerId: previous.ownerId, evidenceAuditId: previous.auditId },
      afterData: { version: BANK_OWNER_VERSION, revoked: true },
    }, select: { id: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
