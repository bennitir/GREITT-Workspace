'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveCompanyReadAccess } from '@/lib/core/company-read-access';
import { getRequestAuthContext } from '@/lib/core/request-context';
import {
  confirmVisualDocumentSet, voidVisualDocumentSet, documentSetStorageEnabled,
  canonicalDocumentIds,
} from '@/lib/financial-reconciliation/document-set-service';

async function authorizeVisualConfirmation() {
  const { companyId, access } = await requireActiveCompanyReadAccess();
  const { sessionUser, effectiveUser } = await getRequestAuthContext();
  // In "Prófa sem notandi", never silently persist as the impersonated user.
  if (!access.canReconcileBookkeeping || !sessionUser || !effectiveUser || sessionUser.id !== effectiveUser.id) {
    throw new Error('SAMSTAEDA_EKKI_HEIMILD');
  }
  if (!documentSetStorageEnabled()) throw new Error('SAMSTAEDA_VISTUN_OHEIMIL');
  return { companyId, userId: sessionUser.id };
}

function refreshBank(bankAccountId: number) {
  revalidatePath(`/banki/${bankAccountId}/afstemming`);
  revalidatePath(`/banki/${bankAccountId}`);
  revalidatePath('/banki');
}

/** Server never trusts the browser's company id, amount or document labels. */
export async function confirmSelectedVisualDocuments(bankAccountId: number, bankTransactionId: number, documentIds: number[]) {
  const { companyId, userId } = await authorizeVisualConfirmation();
  const result = await confirmVisualDocumentSet({
    companyId, userId, bankAccountId, bankTransactionId,
    documentIds: canonicalDocumentIds(documentIds),
  });
  refreshBank(bankAccountId);
  return { ok: true as const, id: result.id, idempotent: result.idempotent };
}

export async function voidSelectedVisualDocuments(bankAccountId: number, reconciliationId: number, reason: string) {
  const { companyId, userId } = await authorizeVisualConfirmation();
  const result = await voidVisualDocumentSet({ companyId, userId, bankAccountId, reconciliationId, reason });
  refreshBank(bankAccountId);
  return { ok: true as const, id: result.id };
}
