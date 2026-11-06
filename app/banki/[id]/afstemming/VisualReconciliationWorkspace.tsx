'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FamilyTransferPanel from './FamilyTransferPanel';
import type { FamilyPerson } from '@/lib/personal-finance/transfer-split';
import type { SavedFamilyTransfer } from '@/lib/personal-finance/transfer-split-repository';
import type { FamilyDraft } from '@/lib/personal-finance/transfer-split';
import { filterVisualTransactions, formatVisualAmount, type VisualModel, type VisualDocumentHit } from '../../_lib/visual-reconciliation';
import type { VisualReconciliationText } from '../../_lib/i18n/visual-reconciliation-text';
import { compareSelectedVisualDocuments } from '../../_lib/visual-amounts';
import type { DocumentSetReadinessCode } from '@/lib/financial-reconciliation/document-set-service';
import type { SavedDocumentSet } from '@/lib/financial-reconciliation/document-set-service';
import type { ExistingConfirmedBankReconciliation } from '@/lib/financial-reconciliation/existing-confirmed-bank-documents';
import { indexConfirmedVisualDocumentLinks } from '@/lib/financial-reconciliation/visual-confirmed-document-links';
import { splitVisualWorkQueue } from '../../_lib/visual-work-queue';

/** Company-only visual workspace. Evidence and optional family actions are server-authorized. */
export default function VisualReconciliationWorkspace({ model, text: t, language, family, documentPreviewEnabled = true, documentSearchAction, documentSets = [], existingConfirmedReconciliations = [], historicalEvidenceUnavailable = false, documentSetCanConfirm = false, documentSetLockReason, documentSetConfirmAction, documentSetVoidAction }: {
  model: VisualModel; text: VisualReconciliationText; language: string;
  documentSets?: SavedDocumentSet[];
  existingConfirmedReconciliations?: ExistingConfirmedBankReconciliation[];
  historicalEvidenceUnavailable?: boolean;
  documentSetCanConfirm?: boolean;
  documentSetLockReason?: string;
  documentSetConfirmAction?: (bankAccountId: number, bankTransactionId: number, documentIds: number[]) => Promise<
    { ok: true; id: number; idempotent: boolean } |
    { ok: false; reason: DocumentSetReadinessCode | 'INVALID_SELECTION' | 'UNAVAILABLE' | 'STORAGE_DISABLED' }>;
  documentSetVoidAction?: (bankAccountId: number, reconciliationId: number, reason: string) => Promise<{ ok: true; id: number }>;
  documentPreviewEnabled?: boolean;
  documentSearchAction?: (bankAccountId: number, query: string) => Promise<
    { ok: true; documents: VisualDocumentHit[] } | { ok: false }
  >;
  family?: {
    enabled: boolean;
    canEdit: boolean;
    people: FamilyPerson[];
    blocks: Record<number, string | null>;
    saved?: SavedFamilyTransfer[];
    storageEnabled?: boolean;
    saveAction?: (input: FamilyDraft) => Promise<{ ok: true; id: number } | { ok: false; message: string }>;
  };
}) {
  const router = useRouter();
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [groupPending, startGroupAction] = useTransition();
  const [query, setQuery] = useState('');
  // The next unfinished transaction is the default work item. Existing reconciliations
  // remain accessible in a collapsed history section, never removed from the source data.
  const confirmedBankIds = new Set<number>([
    ...existingConfirmedReconciliations.map(row => row.bankTransactionId),
    ...documentSets.filter(row => row.status === 'CONFIRMED').map(row => row.bankTransactionId),
  ]);
  const initialQueue = splitVisualWorkQueue(model.transactions, confirmedBankIds);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialQueue.pending[0]?.id ?? initialQueue.completed[0]?.id ?? null,
  );
  const [showCompleted, setShowCompleted] = useState(initialQueue.pending.length === 0);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ receiptId: number; documentId: number | null } | null>(null);
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentResults, setDocumentResults] = useState<VisualDocumentHit[]>([]);
  // Every bank transaction keeps its own temporary selection while navigating the page.
  // Nothing is persisted; changing transactions must never display the previous draft as its match.
  const [comparisonByBank, setComparisonByBank] = useState<Record<number, VisualDocumentHit[]>>({});
  const rightScroll = useRef<HTMLDivElement>(null);
  const transactionScroll = useRef<HTMLDivElement>(null);
  const [documentSearchTerm, setDocumentSearchTerm] = useState<string | null>(null);
  const [documentSearchFailed, setDocumentSearchFailed] = useState(false);
  const [documentSearchPending, startDocumentSearch] = useTransition();
  const rows = filterVisualTransactions(model.transactions, query);
  const queue = splitVisualWorkQueue(rows, confirmedBankIds);
  // Searching must also find completed transactions, even if history is folded away.
  const revealCompleted = showCompleted || query.trim().length > 0;
  const visibleRows = revealCompleted ? [...queue.pending, ...queue.completed] : queue.pending;
  const selected = visibleRows.find(row => row.id === selectedId) ?? visibleRows[0] ?? null;
  const comparison = selected ? comparisonByBank[selected.id] ?? [] : [];
  const savedGroup = selected ? documentSets.find(group => group.bankTransactionId === selected.id && group.status === 'CONFIRMED') : undefined;
  const existingConfirmed = selected ? existingConfirmedReconciliations.filter(row => row.bankTransactionId === selected.id) : [];
  const voidHistory = selected ? documentSets.filter(group => group.bankTransactionId === selected.id && group.status === 'VOID') : [];
  // Same canonical confirmation index controls the bank, source and archive views.
  const confirmedDocumentLinks = indexConfirmedVisualDocumentLinks(existingConfirmedReconciliations, documentSets);
  const comparedAmounts = selected ? compareSelectedVisualDocuments(selected.amount, comparison.map(item => item.amount)) : null;
  // A missing confirmed link in the projection does NOT mean the actual bank
  // movement is unreconciled: legacy matching may already have closed it.
  const canSubmitGroup = Boolean(selected && selected.bankStatus === 'UNRECONCILED' && comparison.length &&
    comparison.every(item => item.documentId !== null && !confirmedDocumentLinks.has(item.documentId)) &&
    !historicalEvidenceUnavailable && comparedAmounts?.remaining === '0' &&
    !savedGroup && existingConfirmed.length === 0 && !selected.evidence.some(item => item.status === 'confirmed'));

  function confirmationFailureMessage(reason: DocumentSetReadinessCode | 'INVALID_SELECTION' | 'UNAVAILABLE' | 'STORAGE_DISABLED'): string {
    switch (reason) {
      case 'BANK_NOT_FOUND': return t.groupInspectBankMissing;
      case 'BANK_ALREADY_RECONCILED':
      case 'EXISTING_LINK': return t.groupInspectAlreadyReconciled;
      case 'PAYMENT_LINK':
      case 'BANK_ALLOCATED': return t.groupInspectOtherClaim;
      case 'DOCUMENT_NOT_FOUND': return t.groupInspectDocumentMissing;
      case 'DOCUMENT_ALREADY_LINKED': return t.groupInspectDocumentLinked;
      case 'DOCUMENT_NEEDS_REVIEW': return t.groupInspectNeedsReview;
      case 'AMOUNT_MISMATCH': return t.groupInspectAmountMismatch;
      case 'STORAGE_DISABLED': return t.groupStorageDisabled;
      case 'UNAVAILABLE': return t.groupSaveFailed;
      case 'INVALID_SELECTION': return t.groupLegacyCannotConfirm;
      default: return t.groupSaveFailed;
    }
  }

  function confirmGroup() {
    if (!selected || !canSubmitGroup || !documentSetCanConfirm || !documentSetConfirmAction) return;
    const bankTransactionId = selected.id;
    const ids = comparison.map(item => item.documentId).filter((id): id is number => id !== null);
    setGroupMessage(null);
    startGroupAction(async () => {
      try {
        // Exactly one intentional click. The server checks every condition again
        // inside a SERIALIZABLE transaction before any link or audit is written.
        const result = await documentSetConfirmAction(model.bankAccountId, bankTransactionId, ids);
        if (!result.ok) {
          setGroupMessage(confirmationFailureMessage(result.reason));
          return;
        }
        setComparisonByBank(previous => ({ ...previous, [bankTransactionId]: [] }));
        setPreview(null);
        setSourceKey(null);
        transactionScroll.current?.scrollTo({ top: 0 });
        router.refresh();
      } catch (error) {
        setGroupMessage(t.groupSaveFailed);
      }
    });
  }

  function voidGroup() {
    if (!savedGroup || !documentSetCanConfirm || !documentSetVoidAction || voidReason.trim().length < 8) return;
    const groupId = savedGroup.id;
    setGroupMessage(null);
    startGroupAction(async () => {
      try {
        await documentSetVoidAction(model.bankAccountId, groupId, voidReason.trim());
        setVoidReason('');
        router.refresh();
      } catch (error) {
        setGroupMessage(error instanceof Error ? error.message : t.groupVoidFailed);
      }
    });
  }

  const evidence = selected?.evidence.find(row => row.key === sourceKey) ?? selected?.evidence[0] ?? null;
  const amount = (value: string | null, currency = 'ISK') => value === null ? t.unknown : formatVisualAmount(value, currency, language);
  // Use the same UTC calendar date on the server and in every browser.
  // Intl dateStyle may differ between Node and the user's browser, causing hydration errors.
  const date = (value: string | null) => {
    if (!value) return t.unknown;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return t.unknown;
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${parsed.getUTCFullYear()}`;
  };
  // Keep the full document page for its own tab, but embed only the actual file.
  // The file endpoint independently verifies the active company and user access.
  // Synthetic/preview-only data must never open the live document endpoint.
  const previewUrl = documentPreviewEnabled && preview
    ? `/fylgiskjol/${preview.receiptId}/frumskjal${preview.documentId === null ? '' : `?document=${preview.documentId}`}`
    : null;
  const embeddedFileUrl = previewUrl && preview
    ? `/fylgiskjol/${preview.receiptId}/frumskjal/skra`
    : null;
  // Open the proven original automatically on bank selection, but never infer
  // an original from a mere merchant/amount search match. Closing stays closed.
  const firstExistingOriginal = existingConfirmed.flatMap(group => group.documents)
    .find(doc => !doc.sourceMissing && doc.receiptId !== null && doc.receiptId > 0);
  const firstSavedOriginal = savedGroup?.documents.find(doc => doc.receiptId > 0);
  const autoReceiptId = firstExistingOriginal?.receiptId ?? firstSavedOriginal?.receiptId ?? null;
  const autoDocumentId = firstExistingOriginal?.documentId ?? firstSavedOriginal?.documentId ?? null;
  useEffect(() => {
    if (!documentPreviewEnabled || autoReceiptId === null || autoDocumentId === null) return;
    setPreview(current => current ?? { receiptId: autoReceiptId, documentId: autoDocumentId });
  }, [documentPreviewEnabled, selected?.id, autoReceiptId, autoDocumentId]);
  useEffect(() => {
    if (previewUrl) rightScroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [previewUrl]);
  const panel = 'min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white lg:flex lg:h-[calc(100dvh-18rem)] lg:min-h-[26rem] lg:flex-col';
  const heading = 'border-b border-emerald-100 p-4 text-base font-semibold lg:shrink-0';
  const rowStyle = 'mb-2 block w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700';
  function transactionButton(row: VisualModel['transactions'][number]) {
    return <button key={row.id} type="button" aria-pressed={selected?.id === row.id}
      className={`${rowStyle} ${selected?.id === row.id ? 'border-teal-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      onClick={() => { setSelectedId(row.id); setSourceKey(null); setPreview(null); setVoidReason(''); setGroupMessage(null); }}>
      <small className="block">#{row.id} · {date(row.date)}</small>
      <strong className="block break-words">{row.text}</strong>
      <span className="block">{amount(row.amount)}</span>
      {row.bankStatus === 'RECONCILED' && <span className="mt-2 inline-block rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-900">{t.bankAlreadyReconciledBadge}</span>}
      {existingConfirmedReconciliations.some(item => item.bankTransactionId === row.id) && <span className="ml-1 mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{t.existingConfirmedBadge} #{existingConfirmedReconciliations.find(item => item.bankTransactionId === row.id)?.id}</span>}
      {row.evidence.some(item => item.status === 'confirmed') && <span data-testid={`confirmed-bank-${row.id}`} className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.confirmed}</span>}
      {documentSets.some(group => group.bankTransactionId === row.id && group.status === 'CONFIRMED') && <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.groupSaved}</span>}
    </button>;
  }
  function openDocument(receiptId: number, documentId: number | null) {
    if (Number.isSafeInteger(receiptId) && receiptId > 0) setPreview({ receiptId, documentId });
  }
  function toggleComparison(item: VisualDocumentHit) {
    if (!selected) return;
    const bankId = selected.id;
    const key = `${item.receiptId}:${item.documentId ?? 'legacy'}`;
    const wasSelected = (comparisonByBank[bankId] ?? []).some(row =>
      `${row.receiptId}:${row.documentId ?? 'legacy'}` === key);
    // Previously confirmed documents may be removed from a stale draft but
    // cannot be added as if they were fresh/unlinked documents.
    if (!wasSelected && item.documentId !== null && confirmedDocumentLinks.has(item.documentId)) return;
    setGroupMessage(null);
    setComparisonByBank(previous => {
      const old = previous[bankId] ?? [];
      const next = old.some(row => `${row.receiptId}:${row.documentId ?? 'legacy'}` === key)
        ? old.filter(row => `${row.receiptId}:${row.documentId ?? 'legacy'}` !== key)
        : [...old, item];
      return { ...previous, [bankId]: next };
    });
  }
  function searchArchive() {
    if (!documentSearchAction || !documentPreviewEnabled || documentQuery.trim().length < 2) return;
    const term = documentQuery.trim();
    setDocumentSearchTerm(term);
    setDocumentSearchFailed(false);
    startDocumentSearch(async () => {
      try {
        const result = await documentSearchAction(model.bankAccountId, term);
        if (!result.ok) {
          setDocumentResults([]);
          setDocumentSearchFailed(true);
          return;
        }
        setDocumentResults(result.documents);
      } catch {
        setDocumentResults([]);
        setDocumentSearchFailed(true);
      }
    });
  }

  return <section aria-label={t.title} className="mx-auto my-4 max-w-[1600px] rounded-2xl border border-emerald-100 bg-[#f2f6f3] p-4 text-[#173a3d] sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm">
        {documentSetCanConfirm ? t.groupStorageReady : family?.enabled && family.storageEnabled ? t.familyEnabled : t.readonly}
      </span>
    </header>
    <p className="my-3 text-sm">{family?.enabled ? t.familyNotice : t.notice}</p>
    {model.incomplete && <p role="status" className="rounded-lg bg-amber-100 p-3">{t.incomplete}</p>}
    <label className="my-4 block text-sm font-semibold">{t.search}
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setPreview(null); setSourceKey(null); }}
        className="mt-2 w-full rounded-lg border border-emerald-200 bg-white p-3" />
    </label>
    <p aria-live="polite" className="mb-3 text-sm">{rows.length} / {model.transactions.length}</p>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(200px,.8fr)_minmax(240px,1fr)_minmax(300px,1.2fr)]">
      <section className={panel} aria-label={t.transactions}>
        <h2 className={heading}>{t.transactions}</h2>
        <div ref={transactionScroll} className="max-h-[65vh] overflow-y-auto p-3 lg:min-h-0 lg:max-h-none lg:flex-1 lg:overscroll-contain" tabIndex={0}>
          <p className="mb-2 text-xs font-semibold text-slate-600" data-testid="pending-transaction-count">
            {t.pendingTransactions} ({queue.pending.length})
          </p>
          {queue.pending.map(row => transactionButton(row))}
          {!queue.pending.length && <p className="mb-3 text-sm text-slate-600">{t.noPendingTransactions}</p>}
          {queue.completed.length > 0 && <section className="mt-3 border-t border-slate-200 pt-3" data-testid="completed-transactions">
            {query.trim().length > 0 ? <p className="mb-2 text-xs font-semibold text-slate-600">
              {t.completedTransactions} ({queue.completed.length})
            </p> : <button type="button" aria-expanded={showCompleted} aria-controls="visual-completed-transactions"
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm font-semibold"
              onClick={() => {
                if (showCompleted) {
                  // Closing history must not leave the right pane on a different,
                  // now-hidden bank transaction's original document.
                  setSelectedId(queue.pending[0]?.id ?? null);
                  setPreview(null);
                  setSourceKey(null);
                  setGroupMessage(null);
                }
                setShowCompleted(old => !old);
              }}>
              <span>{showCompleted ? t.hideCompleted : t.showCompleted} ({queue.completed.length})</span>
              <span aria-hidden="true">{showCompleted ? '▴' : '▾'}</span>
            </button>}
            {revealCompleted && <div id="visual-completed-transactions">
              {queue.completed.map(row => transactionButton(row))}
            </div>}
          </section>}
          {!rows.length && <p>{t.empty}</p>}
        </div>
      </section>
      <section className={panel} aria-label={t.bank}>
        <h2 className={heading}>{t.bank}</h2>
        <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabIndex={0}>{selected ? <>
          <h3 className="break-words font-semibold">{selected.text}</h3>
          <p className="my-4 break-words text-2xl font-bold">{amount(selected.amount)}</p>
          <dl><dt>{t.date}</dt><dd>{date(selected.date)}</dd><dt className="mt-3">BankTransaction</dt><dd>#{selected.id}</dd></dl>
          <p className="mt-3 text-sm"><strong>{t.bankStatusLabel}:</strong> {selected.bankStatus === 'RECONCILED'
            ? t.bankAlreadyReconciledBadge : selected.bankStatus === 'UNRECONCILED' ? t.bankUnreconciledBadge : t.bankStatusUnknown}</p>
          {existingConfirmed.map(group => <section key={group.id} data-testid={`existing-reconciliation-${group.id}`}
            className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
            <h4 className="font-bold text-emerald-950">{t.existingConfirmedTitle} #{group.id}</h4>
            <p className="mt-1 text-xs text-emerald-900">{t.existingConfirmedDescription}</p>
            <p className="mt-2 text-xs">{t.existingConfirmedAt}: {date(group.confirmedAt)}
              {group.confirmedByUserId !== null ? ` · ${t.groupConfirmedBy} #${group.confirmedByUserId}` : ''}</p>
            {group.documents.length ? <ul className="mt-3 space-y-2">
              {group.documents.map(document => <li key={document.documentId}
                className="rounded border border-emerald-200 bg-white p-2">
                <strong className="block break-words">{document.merchantName || t.document} #{document.documentId}</strong>
                <p>#{document.documentId}{document.amount !== null ? ` · ${amount(document.amount)}` : ''}</p>
                {document.sourceMissing ? <p className="mt-1 text-amber-800">{t.existingDocumentUnavailable}</p>
                  : documentPreviewEnabled && document.receiptId !== null && <button type="button"
                    className="mt-1 font-semibold underline" onClick={() => openDocument(document.receiptId!, document.documentId)}>{t.openDocument}</button>}
              </li>)}
            </ul> : <p className="mt-2 text-amber-900">{t.existingNoDocument}</p>}
          </section>)}
          {historicalEvidenceUnavailable && selected.bankStatus === 'RECONCILED' && <p role="status"
            className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">{t.existingEvidenceUnavailable}</p>}
          {selected.bankStatus === 'RECONCILED' && <aside role="status" data-testid="legacy-bank-reconciled"
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">{existingConfirmed.length || savedGroup ? t.bankAlreadyReconciledWithLink : t.bankAlreadyReconciledNotice}</p>
            <a className="mt-2 inline-block underline"
              href={`/banki/${model.bankAccountId}/afstemming?view=all#transaction-${selected.id}`}>{t.standard}</a>
          </aside>}
          {selected.bankStatus !== 'RECONCILED' && selected.bankStatus !== 'UNRECONCILED' &&
            <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.bankStatusUnverifiedNotice}</p>}
          {savedGroup && <section className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 p-3" data-testid="confirmed-document-set">
            <h4 className="font-bold text-emerald-900">{t.groupSaved} #{savedGroup.id}</h4>
            <p className="mt-1 text-sm">{t.groupConfirmedBy} #{savedGroup.confirmedByUserId ?? '?'} · {savedGroup.confirmedAt ? date(savedGroup.confirmedAt) : t.unknown}</p>
            <ul className="my-3 space-y-2">
              {savedGroup.documents.map(doc => <li key={doc.documentId} className="rounded border border-emerald-200 bg-white p-2 text-sm">
                <strong className="block break-words">{doc.title}</strong>
                <span>#{doc.documentId} · {amount(doc.amount)}</span>
                {doc.changedSinceConfirmation && <p role="status" className="mt-2 rounded bg-amber-100 p-2 text-xs font-semibold text-amber-900">{t.groupDocumentChanged}</p>}
                {doc.sourceMissing && <p role="status" className="mt-2 rounded bg-amber-100 p-2 text-xs font-semibold text-amber-900">{t.groupDocumentMissing}</p>}
                {documentPreviewEnabled && !doc.sourceMissing && doc.receiptId > 0 && <button type="button" className="ml-3 underline" onClick={() => openDocument(doc.receiptId, doc.documentId)}>{t.openDocument}</button>}
              </li>)}
            </ul>
            <p className="text-xs">{t.groupNoPosting}</p>
            {documentSetCanConfirm && documentSetVoidAction && <div className="mt-3 border-t border-emerald-200 pt-3">
              <label className="block text-sm font-semibold">{t.groupVoidReason}
                <input value={voidReason} onChange={event => setVoidReason(event.target.value)} maxLength={500}
                  className="mt-1 block w-full rounded border border-emerald-200 bg-white p-2" />
              </label>
              <button type="button" disabled={groupPending || voidReason.trim().length < 8}
                className="mt-2 rounded border border-red-700 px-3 py-2 text-sm font-semibold text-red-900 disabled:opacity-50" onClick={voidGroup}>
                {t.groupVoidButton}
              </button>
            </div>}
          </section>}
          {voidHistory.length > 0 && <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="document-set-history">
            <h4 className="font-semibold">{t.groupHistoryTitle} ({voidHistory.length})</h4>
            <div className="mt-2 space-y-2">
              {voidHistory.map(group => <article key={group.id} className="rounded border border-amber-200 bg-white p-2 text-sm">
                <strong>{t.groupVoidedStatus} #{group.id}</strong>
                <p>{t.groupConfirmedBy} #{group.confirmedByUserId ?? '?'} · {date(group.confirmedAt)}</p>
                <p>{t.groupVoidedAt}: {date(group.voidedAt)}</p>
                <p>{t.groupVoidReasonLabel}: {group.voidReason || t.unknown}</p>
                <p>{t.document}: {group.documentIds.join(', ')}</p>
              </article>)}
            </div>
          </section>}
          {selected && comparison.length > 0 && <section className="mt-5 rounded-lg border border-teal-200 bg-emerald-50 p-3" aria-label={t.archiveCompareTitle} data-testid="visual-draft-comparison">
            <h4 className="font-semibold">{t.archiveCompareTitle} ({comparison.length})</h4>
            <p className="my-2 text-xs text-slate-700">{t.archiveCompareHelp}</p>
            <div className="space-y-2">
              {comparison.map(item => <div key={`${item.receiptId}:${item.documentId ?? 'legacy'}`} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
                <strong className="block break-words">{item.title}</strong>
                <p className="my-1">#{item.documentId ?? item.receiptId} · {date(item.date)} · {amount(item.amount)}</p>
                {item.documentId !== null && confirmedDocumentLinks.has(item.documentId) &&
                  <p className="my-1 text-xs font-semibold text-emerald-900">{t.alreadyLinked}: {confirmedDocumentLinks.get(item.documentId)?.map(link => `${t.reconciliation} #${link.reconciliationId}`).join(' / ')}</p>}
                <div className="flex flex-wrap gap-2">
                  {documentPreviewEnabled && <button type="button" className="rounded border border-teal-700 px-2 py-1 text-xs font-semibold" onClick={() => openDocument(item.receiptId, item.documentId)}>{t.openDocument}</button>}
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => toggleComparison(item)}>{t.archiveRemoveCompare}</button>
                </div>
              </div>)}
            </div>
            {comparedAmounts ? <dl className="mt-3 border-t border-teal-200 pt-3 text-sm">
              <div className="flex justify-between gap-2"><dt>{t.archiveCompareTotal}</dt><dd className="font-semibold tabular-nums">{amount(comparedAmounts.total)}</dd></div>
              <div className="mt-1 flex justify-between gap-2"><dt>{t.archiveCompareDifference}</dt><dd className="font-semibold tabular-nums">{amount(comparedAmounts.remaining)}</dd></div>
            </dl> : <p className="mt-3 text-xs text-amber-900">{t.archiveCompareAmountUnknown}</p>}
            <p className="mt-2 text-xs text-slate-700">{t.archiveCompareNotConfirmed}</p>
            {!savedGroup && <div className="mt-3 border-t border-teal-200 pt-3">
              <h5 className="font-semibold">{t.groupConfirmTitle}</h5>
              <p className="my-2 text-xs">{t.groupConfirmHelp}</p>
              {!documentSetCanConfirm && <p className="mb-2 text-xs font-semibold text-amber-900">{t.groupStorageDisabled}
                {documentSetLockReason && documentSetLockReason !== 'READY' && <span className="mt-1 block font-normal">{t.groupLockReasonLabel}: <code>{documentSetLockReason}</code></span>}
              </p>}
              {comparison.some(item => item.documentId === null) && <p className="mb-2 text-xs text-amber-900">{t.groupLegacyCannotConfirm}</p>}
              {selected.evidence.some(item => item.status === 'confirmed') && <p className="mb-2 text-xs text-amber-900">{t.groupExistingLink}</p>}
              {selected.bankStatus !== 'UNRECONCILED' && <p className="mb-2 text-xs font-semibold text-amber-900">{t.bankStatusBlocksNewSet}</p>}
              <button type="button" disabled={!canSubmitGroup || !documentSetCanConfirm || groupPending}
                className="mt-3 rounded bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={confirmGroup}>
                {groupPending ? t.groupSaving : t.groupConfirmButton}
              </button>
            </div>}

          </section>}
          {groupMessage && <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-900">{groupMessage}</p>}
          <div data-testid="confirmed-reconciliations" className="mt-4 space-y-2">
            {selected.evidence.filter(item => item.status === 'confirmed').map(item => <button key={item.key} type="button"
              className="block text-left text-sm font-semibold underline" onClick={() => { setSourceKey(item.key); setPreview(null); }}>
              {t.confirmed} #{item.confirmationId} · {t[item.kind]} #{item.sourceId}
            </button>)}
          </div>
          {family?.enabled && <FamilyTransferPanel key={selected.id} transaction={selected} people={family.people} canEdit={family.canEdit}
            saved={family.saved?.find(row=>row.bankTransactionId===selected.id)}
            storageEnabled={family.storageEnabled}
            saveAction={family.saveAction}
            blockReason={selected.evidence.some(item=>item.status==='confirmed')
              ? 'Færslan hefur staðfesta afstemmingu. Fjölskylduskipting er lokuð; fyrirliggjandi afstemming helst óbreytt. Yfirfara þarf tengslin sérstaklega í hefðbundnu afstemmingunni.'
              : family.blocks[selected.id] === undefined ? 'Ekki tókst að staðfesta að færslan sé gjaldgeng fyrir fjölskylduskiptingu.' : family.blocks[selected.id]} />}
        </> : <p>{t.empty}</p>}</div>
      </section>
      <section className={panel} aria-label={t.sources}>
        <h2 className={heading}>{t.sources}</h2>
        {/* A single independently scrolling body for evidence, archive search and document preview. */}
        <div ref={rightScroll} className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabIndex={0}>
        {previewUrl && <section data-testid="document-preview" className="border-t border-emerald-100 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t.openDocument} #{preview?.documentId ?? preview?.receiptId}
              {preview?.documentId !== null && preview?.documentId !== undefined && confirmedDocumentLinks.has(preview.documentId) &&
                <span className="ml-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{t.alreadyLinked}</span>}
            </h3>
            <button type="button" className="underline" onClick={() => setPreview(null)}>{t.close}</button>
          </div>
          <p className="my-2 text-sm">{t.security}</p>
          <a className="text-sm font-semibold underline" href={previewUrl} target="_blank" rel="noopener noreferrer">{t.openDocument} ↗</a>
          <iframe
            title={t.openDocument}
            src={embeddedFileUrl ?? undefined}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="mt-3 h-[58vh] min-h-[360px] w-full rounded border bg-white"
          />
        </section>}
        <div className="max-h-[45vh] overflow-auto p-3 lg:max-h-none lg:overflow-visible">
          {(existingConfirmed.length > 0 || savedGroup) && <section data-testid="linked-sources-confirmed" className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
            <h3 className="font-bold text-emerald-950">{t.confirmedSourcesTitle}</h3>
            {existingConfirmed.map(group => <article key={`existing-${group.id}`} className="mt-2 rounded-md border border-emerald-200 bg-white p-2">
              <p className="font-semibold">{t.existingConfirmedTitle} #{group.id}</p>
              <p className="text-xs">{t.existingConfirmedAt}: {date(group.confirmedAt)}{group.confirmedByUserId !== null ? ` · ${t.groupConfirmedBy} #${group.confirmedByUserId}` : ''}</p>
              {group.documents.map(doc => <div key={doc.documentId} className="mt-2 border-t border-emerald-100 pt-2">
                <p className="font-semibold">{t.document} #{doc.documentId} · {t.alreadyLinked}</p>
                {doc.merchantName && <p>{doc.merchantName}</p>}
                {doc.amount !== null && <p>{amount(doc.amount)}</p>}
                {doc.sourceMissing ? <p className="text-amber-900">{t.existingDocumentUnavailable}</p>
                  : documentPreviewEnabled && doc.receiptId !== null && <button type="button" className="font-semibold underline" onClick={() => openDocument(doc.receiptId!, doc.documentId)}>{t.openDocument}</button>}
              </div>)}
              {!group.documents.length && <p className="text-amber-900">{t.existingNoDocument}</p>}
            </article>)}
            {savedGroup && <article className="mt-2 rounded-md border border-emerald-200 bg-white p-2">
              <p className="font-semibold">{t.groupSaved} #{savedGroup.id}</p>
              {savedGroup.documents.map(doc => <div key={doc.documentId} className="mt-2 border-t border-emerald-100 pt-2">
                <p>{t.document} #{doc.documentId} · {t.alreadyLinked}</p>
                {documentPreviewEnabled && doc.receiptId > 0 && <button type="button" className="underline" onClick={() => openDocument(doc.receiptId, doc.documentId)}>{t.openDocument}</button>}
              </div>)}
            </article>}
          </section>}
          {selected?.evidence.map(item => {
            const confirmedForDocument = item.kind === 'document' ? confirmedDocumentLinks.get(item.sourceId) ?? [] : [];
            return <button key={item.key} type="button" aria-pressed={item.key === evidence?.key}
              className={`${rowStyle} ${item.key === evidence?.key ? 'border-teal-700 bg-emerald-50' : 'border-slate-200'}`}
              onClick={() => { setSourceKey(item.key); setPreview(null); }}>
              <span className={`inline-block rounded px-2 py-1 text-xs ${item.status === 'confirmed' || confirmedForDocument.length ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {confirmedForDocument.length ? t.alreadyLinked : t[item.status]}
              </span>
              <strong className="mt-2 block break-words">{item.title || t[item.kind]}</strong>
              <small>{t[item.kind]} #{item.sourceId} · {amount(item.amount, item.currency)}</small>
              {confirmedForDocument.length > 0 && <small className="mt-1 block">
                {confirmedForDocument.map(link => `${t.reconciliation} #${link.reconciliationId} · ${t.bankTransactionShort} #${link.bankTransactionId}`).join(' / ')}
              </small>}
            </button>;
          })}
          {!selected?.evidence.length && !existingConfirmed.length && !savedGroup && <p>{t.noSources}</p>}
          {evidence && <article className="mt-4 border-t pt-4">
            <h3 className="font-semibold">{t[evidence.kind]} #{evidence.sourceId}</h3>
            <dl className="my-3 space-y-1">
              <dt>{t.amount}</dt><dd>{amount(evidence.amount, evidence.currency)}</dd>
              <dt>{t.date}</dt><dd>{date(evidence.date)}</dd>
              <dt>{t.reference}</dt><dd>{evidence.reference ?? t.unknown}</dd>
              {evidence.confirmationId !== null && <><dt>{t.reconciliation}</dt><dd>#{evidence.confirmationId}</dd></>}
            </dl>
            {documentPreviewEnabled && evidence.receiptId !== null && <button type="button" className="rounded border border-teal-700 px-3 py-2" data-testid="evidence-document"
              onClick={() => openDocument(evidence.receiptId!, evidence.kind === 'document' ? evidence.sourceId : null)}>{t.openDocument}</button>}
            {documentPreviewEnabled && evidence.kind === 'event' && !!evidence.sourceDocuments?.length && <section className="mt-3">
              <h4 className="font-semibold">{t.sourceDocuments}</h4>
              {evidence.sourceDocuments.map(document => <button type="button" key={`${document.receiptId}:${document.documentId}`} className="my-2 block text-left underline"
                onClick={() => openDocument(document.receiptId, document.documentId)}>
                {t.openDocument} #{document.documentId ?? document.receiptId} · {document.documentType ?? t.document}
              </button>)}
            </section>}
            {evidence.receiptId === null && !evidence.sourceDocuments?.length && <p className="text-sm">{t.missingDocument}</p>}
          </article>}
        </div>
        {documentPreviewEnabled && documentSearchAction && <section className="border-t border-emerald-100 p-3" aria-label={t.archiveSearchTitle}>
          <h3 className="font-semibold">{t.archiveSearchTitle}</h3>
          <p className="mt-1 text-sm text-slate-600">{t.archiveSearchHelp}</p>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); searchArchive(); }}>
            <label className="min-w-[170px] flex-1 text-sm">
              <span className="sr-only">{t.archiveSearchLabel}</span>
              <input type="search" aria-label={t.archiveSearchLabel} value={documentQuery}
                onChange={event => setDocumentQuery(event.target.value)} maxLength={100}
                placeholder={t.archiveSearchPlaceholder} className="w-full rounded-lg border border-emerald-200 bg-white p-2" />
            </label>
            <button type="submit" disabled={documentSearchPending || documentQuery.trim().length < 2}
              className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {documentSearchPending ? t.archiveSearching : t.archiveSearchButton}
            </button>
          </form>

          {documentSearchTerm !== null && <div className="mt-3" aria-live="polite">
            {documentSearchPending ? <p className="text-sm">{t.archiveSearching}</p>
              : documentSearchFailed ? <p role="alert" className="text-sm text-red-800">{t.archiveSearchFailed}</p>
              : <>
                <p className="mb-2 text-sm font-semibold">{t.archiveResults}: {documentResults.length} · “{documentSearchTerm}”</p>
                <p className="mb-2 text-xs text-slate-600">{t.archiveNotLinked}</p>
                {historicalEvidenceUnavailable && <p role="status" className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">{t.existingEvidenceUnavailable}</p>}
                <div className="max-h-[40vh] overflow-auto lg:max-h-none lg:overflow-visible">
                  {documentResults.map(item => {
                    const isSelected = comparison.some(row => row.receiptId === item.receiptId && row.documentId === item.documentId);
                    const alreadyLinked = item.documentId === null ? [] : confirmedDocumentLinks.get(item.documentId) ?? [];
                    return <div key={`${item.receiptId}:${item.documentId ?? 'legacy'}`}
                      className="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                      <button type="button" aria-pressed={preview?.receiptId === item.receiptId && preview.documentId === item.documentId}
                        className="block w-full rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-teal-700"
                        onClick={() => openDocument(item.receiptId, item.documentId)}>
                        <strong className="block break-words">{item.title}</strong>
                        <small className="block">#{item.documentId ?? item.receiptId} · {date(item.date)} · {amount(item.amount)}</small>
                        {item.reference && <small className="block break-all">{t.reference}: {item.reference}</small>}
                        {item.voucherNumber !== null && <small className="block">{t.archiveVoucher}: {item.voucherNumber}</small>}
                      </button>
                      {alreadyLinked.length > 0 && <div data-testid={`archive-confirmed-${item.documentId}`} className="mt-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">
                        {t.alreadyLinked}: {alreadyLinked.map(link => `${t.reconciliation} #${link.reconciliationId} · ${t.bankTransactionShort} #${link.bankTransactionId}`).join(' / ')}
                        {alreadyLinked.some(link => link.bankTransactionId !== selected?.id) && <p className="mt-1 text-amber-900">{t.linkedToAnotherBank}</p>}
                      </div>}
                      {alreadyLinked.length === 0 ? <button type="button" aria-pressed={isSelected}
                        className="mt-1 rounded-md border border-teal-700 px-2 py-1 text-xs font-semibold"
                        onClick={() => toggleComparison(item)}>
                        {isSelected ? t.archiveRemoveCompare : t.archiveAddCompare}
                      </button> : isSelected && <button type="button" className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs"
                        onClick={() => toggleComparison(item)}>{t.archiveRemoveCompare}</button>}
                    </div>;
                  })}
                  {!documentResults.length && <p className="text-sm">{t.archiveNoResults}</p>}
                </div>
              </>}
          </div>}
        </section>}

        </div>
      </section>
    </div>
  </section>;
}
