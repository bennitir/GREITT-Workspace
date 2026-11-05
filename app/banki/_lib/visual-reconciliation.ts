import type { BankBookingReconciliationResult } from '@/lib/financial-reconciliation/service';
import type { ReviewedDocumentCandidateResult, ConfirmedBankReviewedDocumentLinkResult } from '@/lib/financial-reconciliation/reviewed-document-service';
import type { BankFinancialEventCandidateProjection, ConfirmedBankFinancialEventLink } from '@/lib/financial-reconciliation/event-service';
import type { FinancialEventSourceDocumentContext } from '@/lib/financial-reconciliation/document-context';

type Scope = { companyId: number; bankAccountId: number };
type Layer<T> = ({ ok: true } & Scope & T) | { ok: false };
export type VisualInput = Scope & {
  reconciliation: Extract<BankBookingReconciliationResult, { ok: true }>;
  documents: ReviewedDocumentCandidateResult;
  confirmedDocuments: ConfirmedBankReviewedDocumentLinkResult;
  events: Layer<{ candidates: BankFinancialEventCandidateProjection[] }>;
  confirmedEvents: Layer<{ links: ConfirmedBankFinancialEventLink[] }>;
};
export type VisualEvidence = {
  key: string;
  kind: 'document' | 'booking' | 'event';
  status: 'candidate' | 'confirmed' | 'recorded';
  sourceId: number;
  receiptId: number | null;
  title: string;
  amount: string | null;
  currency: string;
  date: string | null;
  reference: string | null;
  confirmationId: number | null;
  sourceDocuments?: {
    receiptId: number;
    documentId: number | null;
    documentType: string | null;
    documentRole: string | null;
    bookingEntryIds: number[];
  }[];
};
/** An archive search hit is not a candidate match or a confirmed reconciliation. */
export type VisualDocumentHit = {
  receiptId: number;
  documentId: number | null;
  title: string;
  reference: string | null;
  amount: string | null;
  date: string | null;
  voucherNumber: number | null;
};
export type VisualTransaction = { id: number; date: string; text: string; amount: string; evidence: VisualEvidence[] };
export type VisualModel = Scope & { transactions: VisualTransaction[]; incomplete: boolean };
const iso = (d: Date | null) => d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
function sourceDocuments(documents: readonly FinancialEventSourceDocumentContext[]) {
  return documents.map(d => ({ receiptId: d.receiptId, documentId: d.documentId,
    documentType: d.documentType, documentRole: d.documentRole,
    bookingEntryIds: d.bookingEntries.map(entry => entry.id) }));
}

/** V03 presentation projection, scoped to the existing company read services.
 * No new matching, payment calculations or writes. Family/group projections
 * are deliberately deferred to their separate integration step.
 */
export function buildVisualReconciliation(input: VisualInput, visibleIds?: ReadonlySet<number>): VisualModel {
  const layers = [input.reconciliation, input.documents, input.confirmedDocuments, input.events, input.confirmedEvents];
  if (![input.companyId, input.bankAccountId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('VISUAL_SCOPE_INVALID');
  for (const layer of layers) {
    if (layer.ok && (layer.companyId !== input.companyId || layer.bankAccountId !== input.bankAccountId)) throw new Error('VISUAL_SCOPE_MISMATCH');
  }
  const transactions: VisualTransaction[] = input.reconciliation.transactions
    .filter(row => !visibleIds || visibleIds.has(row.id))
    .map(row => ({ id: row.id, date: iso(row.date) ?? '', text: row.text, amount: String(row.amount), evidence: [] }));
  const byId = new Map(transactions.map(row => [row.id, row]));
  function add(id: number, evidence: VisualEvidence) {
    const row = byId.get(id);
    if (!row) return;
    const old = row.evidence.findIndex(e => e.key === evidence.key);
    if (old < 0) row.evidence.push(evidence);
    else if (evidence.status === 'confirmed') row.evidence[old] = evidence;
  }
  for (const resolution of input.reconciliation.resolutions) {
    for (const c of [...resolution.strongCandidates, ...resolution.possibleCandidates]) {
      add(c.bankTransactionId, { key: 'booking:' + c.receiptEntryId, kind: 'booking', status: 'recorded',
        sourceId: c.receiptEntryId, receiptId: c.receiptId, title: c.description || c.entryText,
        amount: String(c.bookingAmount), currency: 'ISK', date: null,
        reference: c.voucherNumber === null ? null : String(c.voucherNumber), confirmationId: null });
    }
  }
  if (input.documents.ok) for (const c of input.documents.candidates) {
    add(c.bankTransactionId, { key: 'document:' + c.documentId, kind: 'document', status: 'candidate',
      sourceId: c.documentId, receiptId: c.receiptId, title: c.merchantName || '', amount: c.documentAmount,
      currency: 'ISK', date: iso(c.documentDate), reference: c.receiptNumber, confirmationId: null });
  }
  if (input.events.ok) for (const c of input.events.candidates) {
    add(c.bankTransactionId, { key: 'event:' + c.eventId, kind: 'event', status: 'candidate',
      sourceId: c.eventId, receiptId: null, title: c.externalReference || '', amount: c.eventAmount,
      currency: 'ISK', date: iso(c.eventDate), reference: c.externalReference, confirmationId: null,
      sourceDocuments: sourceDocuments(c.sourceDocuments ?? []) });
  }
  if (input.confirmedDocuments.ok) for (const c of input.confirmedDocuments.links) {
    add(c.bankTransactionId, { key: 'document:' + c.documentId, kind: 'document', status: 'confirmed',
      sourceId: c.documentId, receiptId: c.receiptId, title: c.merchantName || '',
      amount: c.totalAmount === null ? null : String(c.totalAmount), currency: 'ISK',
      date: iso(c.documentDate), reference: null, confirmationId: c.reconciliationId });
  }
  if (input.confirmedEvents.ok) for (const c of input.confirmedEvents.links) {
    add(c.bankTransactionId, { key: 'confirmed-event:' + c.reconciliationId + ':' + c.paymentId,
      kind: 'event', status: 'confirmed', sourceId: c.eventId, receiptId: null,
      title: c.externalReference || '', amount: c.amount, currency: c.currency, date: iso(c.eventDate),
      reference: c.externalReference, confirmationId: c.reconciliationId,
      sourceDocuments: sourceDocuments(c.sourceDocuments ?? []) });
  }
  for (const row of transactions) row.evidence.sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed') || a.key.localeCompare(b.key));
  return { companyId: input.companyId, bankAccountId: input.bankAccountId, transactions, incomplete: layers.some(layer => !layer.ok) };
}

export function filterVisualTransactions(rows: readonly VisualTransaction[], query: string) {
  const q = query.trim().toLocaleLowerCase();
  return rows.filter(row => !q || [row.id, row.text, row.amount,
    ...row.evidence.flatMap(e => [e.title, e.reference, e.sourceId, e.receiptId])].join(' ').toLocaleLowerCase().includes(q));
}

/** Keep decimal precision; this formatter does not sum evidence amounts. */
export function formatVisualAmount(value: string, currency: string, language: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value + ' ' + currency;
  const group = language === 'en' ? ',' : language === 'pl' ? '\u00a0' : '.';
  const decimal = language === 'en' ? '.' : ',';
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return match[1] + integer + (match[3] ? decimal + match[3] : '') + ' ' + (currency === 'ISK' && language === 'is' ? 'kr.' : currency);
}
