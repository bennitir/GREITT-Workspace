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
  if (!access.allowed || (access.role !== 'OWNER' && access.role !== 'ADMIN')) {
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

export type OwnTransferActionResult =
  | { ok: true; id: number }
  | { ok: false; code: 'STORAGE_DISABLED' | 'NOT_AUTHORIZED' | 'INVALID_SELECTION' |
      'OWNERSHIP_NOT_ATTESTED' | 'ACCOUNT_NOT_DISTINCT' | 'AMOUNT_OR_DATE_MISMATCH' |
      'ALREADY_RECONCILED' | 'CLASSIFICATION_CONFLICT' | 'REASON_REQUIRED' | 'NOT_FOUND' | 'UNAVAILABLE' };

function safeOwnTransferFailure(error: unknown): OwnTransferActionResult {
  const code = error instanceof Error ? error.message : '';
  const allowed = ['STORAGE_DISABLED','NOT_AUTHORIZED','INVALID_SELECTION','OWNERSHIP_NOT_ATTESTED',
    'ACCOUNT_NOT_DISTINCT','AMOUNT_OR_DATE_MISMATCH','ALREADY_RECONCILED',
    'CLASSIFICATION_CONFLICT','REASON_REQUIRED','NOT_FOUND'];
  return { ok: false, code: allowed.includes(code) ? code as Extract<OwnTransferActionResult, {ok:false}>['code'] : 'UNAVAILABLE' };
}

async function authorizedOwnTransferWrite() {
  const { companyId, access } = await requireActiveCompanyReadAccess();
  const { sessionUser, effectiveUser } = await getRequestAuthContext();
  if (!access.allowed || !access.canReconcileBookkeeping ||
      (access.role !== 'OWNER' && access.role !== 'ADMIN') ||
      !sessionUser || !effectiveUser || sessionUser.id !== effectiveUser.id) return null;
  return { companyId, userId: sessionUser.id };
}

function refreshOwnTransfer(bankAccountId: number) {
  revalidatePath(`/banki/${bankAccountId}/afstemming`);
  revalidatePath(`/banki/${bankAccountId}`);
  revalidatePath('/banki');
}

export async function confirmOwnTransferAction(
  bankAccountId: number, sourceId: number, targetId: number, ownershipAttested: boolean,
): Promise<OwnTransferActionResult> {
  const auth = await authorizedOwnTransferWrite();
  if (!auth) return { ok: false, code: 'NOT_AUTHORIZED' };
  if (!ownTransferScopedStorageEnabled(process.env, { companyId: auth.companyId, bankAccountId, sourceId, targetId })) {
    return { ok: false, code: 'STORAGE_DISABLED' };
  }
  try {
    const result = await confirmOwnAccountTransfer({ ...auth, bankAccountId, sourceId, targetId, ownershipAttested });
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
