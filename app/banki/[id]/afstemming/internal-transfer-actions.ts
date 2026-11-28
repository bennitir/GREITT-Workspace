"use server";

import { requireActiveCompanyReadAccess } from '@/lib/core/company-read-access';
import { prisma } from '@/lib/prisma';
import { isPossibleInternalTransfer, oppositeBankAmount, possibleTransferWindow,
  type InternalTransferReviewResult } from '@/lib/personal-finance/internal-transfer-evidence';

/** User-initiated, scoped, read-only investigation. No link, classification or booking is written. */
export async function inspectPossibleInternalTransfer(
  bankAccountId: number,
  transactionId: number,
): Promise<InternalTransferReviewResult> {
  if (![bankAccountId, transactionId].every(value => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  const { companyId, access } = await requireActiveCompanyReadAccess();
  if (!access.allowed || (access.role !== 'OWNER' && access.role !== 'ADMIN' && access.role !== 'BOOKKEEPER')) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }
  try {
    const source = await prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        bankAccountId,
        bankAccount: { companyId, isActive: true },
      },
      select: { id: true, bankAccountId: true, amount: true, date: true },
    });
    if (!source) return { ok: false, code: 'NOT_FOUND' };
    const sourceAmount = String(source.amount);
    const opposite = oppositeBankAmount(sourceAmount);
    const window = possibleTransferWindow(source.date);
    if (!opposite || !window) return { ok: false, code: 'INVALID_AMOUNT' };
    // A possible match is restricted to another active account in this SAME company.
    // No assumption that it belongs to the same person, or even represents one transfer.
    const rows = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: { not: bankAccountId },
        bankAccount: { companyId, isActive: true },
        date: { gte: window.from, lt: window.toExclusive },
        amount: opposite,
      },
      select: {
        id: true, bankAccountId: true, amount: true, date: true, text: true, status: true,
        bankAccount: { select: { name: true, accountNumber: true } },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 9,
    });
    const matches = rows.filter(row => isPossibleInternalTransfer(
      { bankAccountId, date: source.date, amount: sourceAmount },
      { bankAccountId: row.bankAccountId, date: row.date, amount: String(row.amount) },
    )).slice(0, 8).map(row => ({
      transactionId: row.id,
      bankAccountId: row.bankAccountId,
      bankAccountName: row.bankAccount.name,
      bankAccountNumber: row.bankAccount.accountNumber,
      date: row.date.toISOString(),
      amount: String(row.amount),
      text: row.text,
      status: row.status,
    }));
    return { ok: true, originId: transactionId, oppositeAmount: opposite, matches, truncated: rows.length > 8 };
  } catch {
    // Do not leak database connection metadata or account contents on failure.
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

/** Explicit, two-sided bank reconciliation. Never enabled by a browser flag. */
import { revalidatePath } from 'next/cache';
import { getRequestAuthContext } from '@/lib/core/request-context';
import { ownTransferAccountReady, ownTransferScopedStorageEnabled } from '@/lib/personal-finance/own-transfer-policy';
import { confirmOwnAccountTransfer, voidOwnAccountTransfer } from '@/lib/financial-reconciliation/own-account-transfer-service';
import { confirmBankAccountOwner, revokeBankAccountOwner } from '@/lib/financial-reconciliation/bank-account-owner-service';
import { resolveRegisteredBankOwner, commonRegisteredBankOwner,
  BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE,
  type RegisteredBankOwner, type BankOwnerAudit,
  type BankOwnerKind, type BankOwnerEvidenceKind,
} from '@/lib/personal-finance/bank-account-owner-policy';
import { registeredPrivatePersonCategory } from '@/lib/personal-finance/private-person-registry-policy';

export type OwnTransferActionResult =
  | { ok: true; id: number }
  | { ok: false; code: 'STORAGE_DISABLED' | 'NOT_AUTHORIZED' | 'INVALID_SELECTION' |
      'OWNERSHIP_NOT_ATTESTED' | 'ACCOUNT_NOT_DISTINCT' | 'AMOUNT_OR_DATE_MISMATCH' |
      'ALREADY_RECONCILED' | 'CLASSIFICATION_CONFLICT' | 'BANK_ACCOUNT_OWNER_UNVERIFIED' | 'REASON_REQUIRED' | 'NOT_FOUND' | 'UNAVAILABLE' };

function safeOwnTransferFailure(error: unknown): OwnTransferActionResult {
  const code = error instanceof Error ? error.message : '';
  const allowed = ['STORAGE_DISABLED','NOT_AUTHORIZED','INVALID_SELECTION','OWNERSHIP_NOT_ATTESTED',
    'ACCOUNT_NOT_DISTINCT','AMOUNT_OR_DATE_MISMATCH','ALREADY_RECONCILED',
    'CLASSIFICATION_CONFLICT','BANK_ACCOUNT_OWNER_UNVERIFIED','REASON_REQUIRED','NOT_FOUND'];
  return { ok: false, code: allowed.includes(code) ? code as Extract<OwnTransferActionResult, {ok:false}>['code'] : 'UNAVAILABLE' };
}

async function authorizedOwnTransferWrite() {
  const { companyId, access } = await requireActiveCompanyReadAccess();
  const { sessionUser, effectiveUser } = await getRequestAuthContext();
  if (!access.allowed || !access.canReconcileBookkeeping ||
      (access.role !== 'OWNER' && access.role !== 'ADMIN' && access.role !== 'BOOKKEEPER') ||
      !sessionUser || !effectiveUser || sessionUser.id !== effectiveUser.id) return null;
  return { companyId, userId: sessionUser.id };
}

function refreshOwnTransfer(bankAccountId: number) {
  revalidatePath(`/banki/${bankAccountId}/afstemming`);
  revalidatePath(`/banki/${bankAccountId}`);
  revalidatePath('/banki');
}

export async function confirmOwnTransferAction(
  bankAccountId: number, sourceId: number, targetId: number,
): Promise<OwnTransferActionResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (!ownTransferScopedStorageEnabled(process.env, { companyId: auth.companyId, bankAccountId, sourceId, targetId })) {
    return { ok: false, code: 'STORAGE_DISABLED' };
  }
  try {
    const result = await confirmOwnAccountTransfer({ ...auth, bankAccountId, sourceId, targetId,
      ownershipAttested: true }); // Explicit confirm-button click. The service rechecks both accounts.
    refreshOwnTransfer(bankAccountId);
    return { ok: true, id: result.id };
  } catch (error) { return safeOwnTransferFailure(error); }
}

export async function voidOwnTransferAction(
  bankAccountId: number, reconciliationId: number, reason: string,
): Promise<OwnTransferActionResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (!ownTransferAccountReady(process.env, { companyId: auth.companyId, bankAccountId })) {
    return { ok: false, code: 'STORAGE_DISABLED' };
  }
  try {
    const result = await voidOwnAccountTransfer({ ...auth, bankAccountId, reconciliationId, reason });
    refreshOwnTransfer(bankAccountId);
    return { ok: true, id: result.id };
  } catch (error) { return safeOwnTransferFailure(error); }
}



/** UI projection is a scoped, read-only snapshot. The write service revalidates inside SERIALIZABLE. */
export type BankAccountOwnerReviewResult =
  | { ok: true;
      source: RegisteredBankOwner | null;
      target: RegisteredBankOwner | null;
      sameOwner: boolean }
  | { ok: false; code: 'NOT_AUTHORIZED' | 'INVALID_SELECTION' | 'NOT_FOUND' | 'UNAVAILABLE' };

export async function reviewBankAccountOwnersAction(
  sourceBankAccountId: number, targetBankAccountId: number,
): Promise<BankAccountOwnerReviewResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (![sourceBankAccountId, targetBankAccountId].every(value => Number.isSafeInteger(value) && value > 0) ||
      sourceBankAccountId === targetBankAccountId) return { ok: false, code: 'INVALID_SELECTION' };
  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { id: { in: [sourceBankAccountId, targetBankAccountId] }, companyId: auth.companyId, isActive: true },
      select: { id: true },
    });
    if (accounts.length !== 2) return { ok: false, code: 'NOT_FOUND' };
    const latest = (bankAccountId: number) => prisma.auditEvent.findFirst({
      where: { companyId: auth.companyId, entityType: 'BankAccount', entityId: bankAccountId,
        action: { in: [BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE] } },
      orderBy: { id: 'desc' },
      select: { id: true, companyId: true, entityType: true, entityId: true,
        action: true, source: true, userId: true, afterData: true },
    });
    const [company, sourceEvent, targetEvent] = await Promise.all([
      prisma.company.findFirst({ where: { id: auth.companyId, isActive: true }, select: { id: true } }),
      latest(sourceBankAccountId), latest(targetBankAccountId),
    ]);
    if (!company) return { ok: false, code: 'NOT_FOUND' };
    const verified = (event: typeof sourceEvent, accountId: number) =>
      resolveRegisteredBankOwner(event as BankOwnerAudit | null, auth.companyId, accountId);
    let source = verified(sourceEvent, sourceBankAccountId);
    let target = verified(targetEvent, targetBankAccountId);
    // Resolve a specifically recorded private owner, without loading an owner picker.
    const personIds = [source, target]
      .filter(owner => owner?.ownerKind === 'PRIVATE_PERSON')
      .map(owner => owner!.ownerId);
    if (personIds.length) {
      const people = await prisma.insightEntity.findMany({
        where: { id: { in: personIds }, companyId: auth.companyId, entityType: 'PERSON', status: 'ACTIVE' },
        select: { id: true, metadata: true },
      });
      const allowed = new Set(people.filter(p => registeredPrivatePersonCategory(p.metadata) !== null).map(p => p.id));
      if (source?.ownerKind === 'PRIVATE_PERSON' && !allowed.has(source.ownerId)) source = null;
      if (target?.ownerKind === 'PRIVATE_PERSON' && !allowed.has(target.ownerId)) target = null;
    }
    return { ok: true, source, target,
      sameOwner: commonRegisteredBankOwner(source, target, auth.companyId,
        sourceBankAccountId, targetBankAccountId) !== null };
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

/** Explicit, logged bank-account ownership, NOT a transfer confirmation. */
export async function confirmBankAccountOwnerAction(
  bankAccountId: number, ownerKind: BankOwnerKind, ownerId: number,
  evidenceKind: BankOwnerEvidenceKind, ownershipAttested: boolean,
): Promise<OwnTransferActionResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (!ownTransferAccountReady(process.env, { companyId: auth.companyId, bankAccountId })) {
    return { ok: false, code: 'STORAGE_DISABLED' };
  }
  try {
    const event = await confirmBankAccountOwner({ ...auth, bankAccountId,
      ownerKind, ownerId, evidenceKind, ownershipAttested });
    refreshOwnTransfer(bankAccountId);
    return { ok: true, id: event.id };
  } catch (error) { return safeOwnTransferFailure(error); }
}

/** Future UI entry point: revoke evidence, preserving the original audit event. */
export async function revokeBankAccountOwnerAction(
  bankAccountId: number, reason: string,
): Promise<OwnTransferActionResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (!ownTransferAccountReady(process.env, { companyId: auth.companyId, bankAccountId })) {
    return { ok: false, code: 'STORAGE_DISABLED' };
  }
  try {
    const event = await revokeBankAccountOwner({ ...auth, bankAccountId, reason });
    refreshOwnTransfer(bankAccountId);
    return { ok: true, id: event.id };
  } catch (error) { return safeOwnTransferFailure(error); }
}
