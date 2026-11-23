import type { VisualTransaction } from './visual-reconciliation';
import type { ExistingConfirmedBankReconciliation } from '@/lib/financial-reconciliation/existing-confirmed-bank-documents';
import type { SavedDocumentSet } from '@/lib/financial-reconciliation/document-set-service';

type DocumentRef = { receiptId: number | null; documentId: number | null };
export type ChainConfirmation = { id: number; documents: DocumentRef[] };
/** Reuse the page's authorized read results, including missing historical sources.
 * Participant identity comes from documentIds; a snapshot is not proof of a live receipt link.
 */
export function chainConfirmationsForBank(bankId: number,
  existing: readonly ExistingConfirmedBankReconciliation[], saved: readonly SavedDocumentSet[]): ChainConfirmation[] {
  const groups = new Map<number, Map<number, DocumentRef>>();
  function add(id: number, documentId: number, receiptId: number | null) {
    const documents = groups.get(id) ?? new Map<number, DocumentRef>();
    const old = documents.get(documentId);
    // Do not replace a known current source with an unavailable snapshot.
    if (!old || old.receiptId === null) documents.set(documentId, { documentId, receiptId });
    groups.set(id, documents);
  }
  for (const group of existing) if (group.bankTransactionId === bankId) {
    for (const doc of group.documents) add(group.id, doc.documentId, doc.sourceMissing ? null : doc.receiptId);
  }
  for (const group of saved) if (group.bankTransactionId === bankId && group.status === 'CONFIRMED') {
    for (const id of group.documentIds) {
      const doc = group.documents.find(row => row.documentId === id);
      add(group.id, id, doc && !doc.sourceMissing && doc.receiptId > 0 ? doc.receiptId : null);
    }
  }
  return [...groups].map(([id, documents]) => ({ id, documents: [...documents.values()] }));
}
export type ChainRelation = {
  from: string; to: string;
  kind: 'suggestion' | 'preview' | 'recorded' | 'source' | 'confirmed';
  confirmationId: number | null;
};

/** Presentation only: scoped, already-loaded evidence; no inferred links or totals. */
export function buildEvidenceChain(bank: VisualTransaction, selected: DocumentRef[],
  preview: DocumentRef | null, confirmations: ChainConfirmation[] = []) {
  const nodes = new Set<string>([`BankTransaction #${bank.id}`]);
  const relations = new Map<string, ChainRelation>();
  const bankKey = `BankTransaction #${bank.id}`;
  function link(from: string, to: string, kind: ChainRelation['kind'], confirmationId: number | null = null) {
    nodes.add(from); nodes.add(to);
    relations.set(`${from}|${to}|${kind}|${confirmationId}`, { from, to, kind, confirmationId });
  }
  function document(ref: DocumentRef) {
    const receipt = ref.receiptId === null ? null : `Receipt #${ref.receiptId}`;
    const doc = ref.documentId === null ? null : `AiDetectedDocument #${ref.documentId}`;
    if (receipt) nodes.add(receipt);
    if (doc) nodes.add(doc);
    if (receipt && doc) link(doc, receipt, 'source');
    return doc ?? receipt;
  }
  for (const ref of selected) {
    const key = document(ref);
    if (key) link(bankKey, key, 'suggestion');
  }
  if (preview) {
    const key = document(preview);
    if (key) link(bankKey, key, 'preview');
  }
  for (const item of bank.evidence) {
    let key: string | null;
    if (item.kind === 'document') key = document({ receiptId: item.receiptId, documentId: item.sourceId });
    else {
      key = `${item.kind === 'booking' ? 'ReceiptEntry' : 'FinancialEvent'} #${item.sourceId}`;
      nodes.add(key);
      if (item.kind === 'booking' && item.receiptId !== null) link(key, `Receipt #${item.receiptId}`, 'source');
    }
    const payment = item.kind === 'event' && item.status === 'confirmed' && item.confirmationId !== null && item.paymentId !== undefined
      ? `FinancialEventPayment #${item.paymentId}` : null;
    if (payment && key) link(payment, key, 'source');
    if (key) link(bankKey, payment ?? key,
      item.status === 'confirmed' && item.confirmationId !== null ? 'confirmed' : item.kind === 'booking' ? 'recorded' : 'suggestion',
      item.status === 'confirmed' ? item.confirmationId : null);
    for (const source of item.sourceDocuments ?? []) {
      const sourceKey = document(source);
      if (key && sourceKey) link(key, sourceKey, 'source');
      // event-service loads document.bookingEntries (AiDetectedDocumentEntry),
      // a different namespace from the ReceiptEntry candidates above.
      if (source.documentId !== null) for (const id of source.bookingEntryIds) {
        link(`AiDetectedDocumentEntry #${id}`, `AiDetectedDocument #${source.documentId}`, 'source');
      }
    }
  }
  for (const confirmation of confirmations) for (const ref of confirmation.documents) {
    const key = document(ref);
    if (key) link(bankKey, key, 'confirmed', confirmation.id);
  }
  const confirmedTargets = new Set([...relations.values()].filter(row => row.kind === 'confirmed').map(row => row.to));
  return { nodes: [...nodes], relations: [...relations.values()].filter(row =>
    !(row.kind === 'suggestion' && row.from === bankKey && confirmedTargets.has(row.to))) };
}
