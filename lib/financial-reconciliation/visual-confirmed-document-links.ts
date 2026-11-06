/**
 * Read-only index of canonical, already confirmed document-to-bank links.
 * Never derive a link from an amount, vendor name or receipt number.
 * The inputs have already passed the company + account authorization checks.
 */
import type { ExistingConfirmedBankReconciliation } from './existing-confirmed-bank-documents';
import type { SavedDocumentSet } from './document-set-service';

export type ConfirmedVisualDocumentLink = {
  bankTransactionId: number;
  reconciliationId: number;
  origin: 'existing' | 'documentSet';
};

export function indexConfirmedVisualDocumentLinks(
  existing: readonly ExistingConfirmedBankReconciliation[],
  savedSets: readonly SavedDocumentSet[],
): Map<number, ConfirmedVisualDocumentLink[]> {
  const byDocument = new Map<number, ConfirmedVisualDocumentLink[]>();
  const add = (documentId: number, link: ConfirmedVisualDocumentLink) => {
    if (!Number.isSafeInteger(documentId) || documentId <= 0) return;
    if (!Number.isSafeInteger(link.reconciliationId) || link.reconciliationId <= 0 ||
        !Number.isSafeInteger(link.bankTransactionId) || link.bankTransactionId <= 0) return;
    const links = byDocument.get(documentId) ?? [];
    if (!links.some(row => row.bankTransactionId === link.bankTransactionId && row.reconciliationId === link.reconciliationId)) {
      links.push(link);
      byDocument.set(documentId, links);
    }
  };
  for (const group of existing) for (const document of group.documents) {
    // Even an unavailable source remains a historically confirmed participant.
    add(document.documentId, { origin: 'existing', bankTransactionId: group.bankTransactionId, reconciliationId: group.id });
  }
  for (const group of savedSets) {
    if (group.status !== 'CONFIRMED') continue;
    for (const documentId of group.documentIds) {
      add(documentId, { origin: 'documentSet', bankTransactionId: group.bankTransactionId, reconciliationId: group.id });
    }
  }
  return byDocument;
}
