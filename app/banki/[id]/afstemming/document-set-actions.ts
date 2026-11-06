'use server';

import { revalidatePath } from 'next/cache';
import type { DocumentSetReadinessCode } from '@/lib/financial-reconciliation/document-set-service';
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
  return { companyId, userId: sessionUser.id };
}

function refreshBank(bankAccountId: number) {
  revalidatePath(`/banki/${bankAccountId}/afstemming`);
  revalidatePath(`/banki/${bankAccountId}`);
  revalidatePath('/banki');
}

/** Error details are restricted to known business outcomes, not internal DB errors. */
function safeConfirmationFailure(error: unknown): DocumentSetReadinessCode | 'INVALID_SELECTION' | 'UNAVAILABLE' {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'SAMSTAEDA_BANKI_EKKI_FUNDINN': return 'BANK_NOT_FOUND';
    case 'SAMSTAEDA_BANKI_THEGAR_STADFESTUR':
    case 'SAMSTAEDA_BANKI_THEGAR_AFGREIDDUR':
    case 'SAMSTAEDA_BANKI_BREYTTIST': return 'BANK_ALREADY_RECONCILED';
    case 'SAMSTAEDA_BANKI_THEGAR_GREIDSLA': return 'PAYMENT_LINK';
    case 'SAMSTAEDA_BANKI_THEGAR_UTHLUTADUR': return 'BANK_ALLOCATED';
    case 'SAMSTAEDA_SKJAL_EKKI_FUNDID': return 'DOCUMENT_NOT_FOUND';
    case 'SAMSTAEDA_SKJAL_THEGAR_TENGT': return 'DOCUMENT_ALREADY_LINKED';
    case 'SAMSTAEDA_SKJAL_THARF_YFIRFERD': return 'DOCUMENT_NEEDS_REVIEW';
    case 'SAMSTAEDA_FJARHAEDIR_STEMMA_EKKI':
    case 'SAMSTAEDA_OGILD_FJARHAED': return 'AMOUNT_MISMATCH';
    case 'SAMSTAEDA_FJOLDI_SKJALA':
    case 'SAMSTAEDA_TVITEKIN_SKJOL':
    case 'SAMSTAEDA_OGILT_AUDKENNI': return 'INVALID_SELECTION';
    default: return 'UNAVAILABLE';
  }
}

/** One-click explicit human confirmation; all decisive validation is server-side.
 * Return only safe status codes; never expose database exceptions to the browser.
 */
export async function confirmSelectedVisualDocuments(bankAccountId: number, bankTransactionId: number, documentIds: number[]) {
  const { companyId, userId } = await authorizeVisualConfirmation();
  if (!documentSetStorageEnabled(process.env, { companyId, bankAccountId })) {
    return { ok: false as const, reason: 'STORAGE_DISABLED' as const };
  }
  try {
    const result = await confirmVisualDocumentSet({
      companyId, userId, bankAccountId, bankTransactionId,
      documentIds: canonicalDocumentIds(documentIds),
    });
    refreshBank(bankAccountId);
    return { ok: true as const, id: result.id, idempotent: result.idempotent };
  } catch (error) {
    return { ok: false as const, reason: safeConfirmationFailure(error) };
  }
}

export async function voidSelectedVisualDocuments(bankAccountId: number, reconciliationId: number, reason: string) {
  const { companyId, userId } = await authorizeVisualConfirmation();
  if (!documentSetStorageEnabled(process.env, { companyId, bankAccountId })) throw new Error('SAMSTAEDA_VISTUN_OHEIMIL');
  const result = await voidVisualDocumentSet({ companyId, userId, bankAccountId, reconciliationId, reason });
  refreshBank(bankAccountId);
  return { ok: true as const, id: result.id };
}
