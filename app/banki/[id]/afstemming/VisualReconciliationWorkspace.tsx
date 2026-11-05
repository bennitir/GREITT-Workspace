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
import type { SavedDocumentSet } from '@/lib/financial-reconciliation/document-set-service';

/** Company-only visual workspace. Evidence and optional family actions are server-authorized. */
export default function VisualReconciliationWorkspace({ model, text: t, language, family, documentPreviewEnabled = true, documentSearchAction, documentSets = [], documentSetCanConfirm = false, documentSetConfirmAction, documentSetVoidAction }: {
  model: VisualModel; text: VisualReconciliationText; language: string;
  documentSets?: SavedDocumentSet[];
  documentSetCanConfirm?: boolean;
  documentSetConfirmAction?: (bankAccountId: number, bankTransactionId: number, documentIds: number[]) => Promise<{ ok: true; id: number; idempotent: boolean }>;
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
  const [groupReviewed, setGroupReviewed] = useState<Record<number, boolean>>({});
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [groupPending, startGroupAction] = useTransition();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(model.transactions[0]?.id ?? null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ receiptId: number; documentId: number | null } | null>(null);
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentResults, setDocumentResults] = useState<VisualDocumentHit[]>([]);
  // Every bank transaction keeps its own temporary selection while navigating the page.
  // Nothing is persisted; changing transactions must never display the previous draft as its match.
  const [comparisonByBank, setComparisonByBank] = useState<Record<number, VisualDocumentHit[]>>({});
  const rightScroll = useRef<HTMLDivElement>(null);
  const [documentSearchTerm, setDocumentSearchTerm] = useState<string | null>(null);
  const [documentSearchFailed, setDocumentSearchFailed] = useState(false);
  const [documentSearchPending, startDocumentSearch] = useTransition();
  const rows = filterVisualTransactions(model.transactions, query);
  const selected = rows.find(row => row.id === selectedId) ?? rows[0] ?? null;
  const comparison = selected ? comparisonByBank[selected.id] ?? [] : [];
  const savedGroup = selected ? documentSets.find(group => group.bankTransactionId === selected.id && group.status === 'CONFIRMED') : undefined;
  const voidHistory = selected ? documentSets.filter(group => group.bankTransactionId === selected.id && group.status === 'VOID') : [];
  const comparedAmounts = selected ? compareSelectedVisualDocuments(selected.amount, comparison.map(item => item.amount)) : null;
  const canSubmitGroup = Boolean(selected && comparison.length && comparison.every(item => item.documentId !== null) &&
    comparedAmounts?.remaining === '0' && !savedGroup && !selected.evidence.some(item => item.status === 'confirmed'));

  function confirmGroup() {
    if (!selected || !groupReviewed[selected.id] || !canSubmitGroup || !documentSetCanConfirm || !documentSetConfirmAction) return;
    const bankTransactionId = selected.id;
    const ids = comparison.map(item => item.documentId).filter((id): id is number => id !== null);
    setGroupMessage(null);
    startGroupAction(async () => {
      try {
        await documentSetConfirmAction(model.bankAccountId, bankTransactionId, ids);
        setGroupReviewed(previous => ({ ...previous, [bankTransactionId]: false }));
        setComparisonByBank(previous => ({ ...previous, [bankTransactionId]: [] }));
        router.refresh();
      } catch (error) {
        setGroupMessage(error instanceof Error ? error.message : t.groupSaveFailed);
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
  useEffect(() => {
    if (previewUrl) rightScroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [previewUrl]);
  const panel = 'min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white lg:flex lg:h-[calc(100dvh-18rem)] lg:min-h-[26rem] lg:flex-col';
  const heading = 'border-b border-emerald-100 p-4 text-base font-semibold lg:shrink-0';
  const rowStyle = 'mb-2 block w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700';
  function openDocument(receiptId: number, documentId: number | null) {
    if (Number.isSafeInteger(receiptId) && receiptId > 0) setPreview({ receiptId, documentId });
  }
  function toggleComparison(item: VisualDocumentHit) {
    if (!selected) return;
    const bankId = selected.id;
    const key = `${item.receiptId}:${item.documentId ?? 'legacy'}`;
    setGroupReviewed(old => ({ ...old, [bankId]: false }));
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
        <div className="max-h-[65vh] overflow-y-auto p-3 lg:min-h-0 lg:max-h-none lg:flex-1 lg:overscroll-contain" tabIndex={0}>
          {rows.map(row => <button key={row.id} type="button" aria-pressed={selected?.id === row.id}
            className={`${rowStyle} ${selected?.id === row.id ? 'border-teal-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}
            onClick={() => { setSelectedId(row.id); setSourceKey(null); setPreview(null); setVoidReason(''); setGroupMessage(null); }}>
            <small className="block">#{row.id} · {date(row.date)}</small>
            <strong className="block break-words">{row.text}</strong>
            <span className="block">{amount(row.amount)}</span>
            {row.evidence.some(item => item.status === 'confirmed') && <span data-testid={`confirmed-bank-${row.id}`} className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.confirmed}</span>}
            {documentSets.some(group => group.bankTransactionId === row.id && group.status === 'CONFIRMED') && <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.groupSaved}</span>}
          </button>)}
          {!rows.length && <p>{t.empty}</p>}
        </div>
      </section>
      <section className={panel} aria-label={t.bank}>
        <h2 className={heading}>{t.bank}</h2>
        <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabIndex={0}>{selected ? <>
          <h3 className="break-words font-semibold">{selected.text}</h3>
          <p className="my-4 break-words text-2xl font-bold">{amount(selected.amount)}</p>
          <dl><dt>{t.date}</dt><dd>{date(selected.date)}</dd><dt className="mt-3">BankTransaction</dt><dd>#{selected.id}</dd></dl>
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
              {!documentSetCanConfirm && <p className="mb-2 text-xs font-semibold text-amber-900">{t.groupStorageDisabled}</p>}
              {comparison.some(item => item.documentId === null) && <p className="mb-2 text-xs text-amber-900">{t.groupLegacyCannotConfirm}</p>}
              {selected.evidence.some(item => item.status === 'confirmed') && <p className="mb-2 text-xs text-amber-900">{t.groupExistingLink}</p>}
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={groupReviewed[selected.id] ?? false} disabled={!canSubmitGroup || !documentSetCanConfirm || groupPending}
                  onChange={event => setGroupReviewed(old => ({ ...old, [selected.id]: event.target.checked }))} />
                <span>{t.groupReviewedStatement}</span>
              </label>
              <button type="button" disabled={!canSubmitGroup || !groupReviewed[selected.id] || !documentSetCanConfirm || groupPending}
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
            <h3 className="font-semibold">{t.openDocument} #{preview?.documentId ?? preview?.receiptId}</h3>
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
          {selected?.evidence.map(item => <button key={item.key} type="button" aria-pressed={item.key === evidence?.key}
            className={`${rowStyle} ${item.key === evidence?.key ? 'border-teal-700 bg-emerald-50' : 'border-slate-200'}`}
            onClick={() => { setSourceKey(item.key); setPreview(null); }}>
            <span className={`inline-block rounded px-2 py-1 text-xs ${item.status === 'confirmed' ? 'bg-emerald-100' : 'bg-amber-100'}`}>{t[item.status]}</span>
            <strong className="mt-2 block break-words">{item.title || t[item.kind]}</strong>
            <small>{t[item.kind]} #{item.sourceId} · {amount(item.amount, item.currency)}</small>
          </button>)}
          {!selected?.evidence.length && <p>{t.noSources}</p>}
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
                <div className="max-h-[40vh] overflow-auto lg:max-h-none lg:overflow-visible">
                  {documentResults.map(item => {
                    const isSelected = comparison.some(row => row.receiptId === item.receiptId && row.documentId === item.documentId);
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
                      <button type="button" aria-pressed={isSelected}
                        className="mt-1 rounded-md border border-teal-700 px-2 py-1 text-xs font-semibold"
                        onClick={() => toggleComparison(item)}>
                        {isSelected ? t.archiveRemoveCompare : t.archiveAddCompare}
                      </button>
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
