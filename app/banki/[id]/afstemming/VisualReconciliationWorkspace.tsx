'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import VisualDocumentPreview from './VisualDocumentPreview';
import FamilyFinanceWorkspacePanel from './FamilyFinanceWorkspacePanel';
import ReconciliationEvidenceChain from './ReconciliationEvidenceChain';
import { chainConfirmationsForBank } from '../../_lib/visual-evidence-chain';
import FamilyLoanDraftOnlyPanel from './FamilyLoanDraftOnlyPanel';
import FamilyOverviewPanel from './FamilyOverviewPanel';
import BankFlowReviewPanel from './BankFlowReviewPanel';
import type { SavedOwnTransfer } from '@/lib/financial-reconciliation/own-account-transfer-service';
import type { OwnTransferActionResult, BankAccountOwnerReviewResult } from './internal-transfer-actions';
import type { InternalTransferReviewResult } from '@/lib/personal-finance/internal-transfer-evidence';
import type { FamilyPerson } from '@/lib/personal-finance/transfer-split';
import type { SavedFamilyTransfer } from '@/lib/personal-finance/transfer-split-repository';
import type { FamilyDraft } from '@/lib/personal-finance/transfer-split';
import type { FamilyLoanRegistryRow } from '@/lib/personal-finance/family-loan-registry';
import type { JournalSnapshot, JournalCreateInput, JournalMovementInput, JournalActionResult } from '@/lib/personal-finance/family-loan-journal-contract';
import { filterVisualTransactions, formatVisualAmount, type VisualModel, type VisualDocumentHit } from '../../_lib/visual-reconciliation';
import type { VisualReconciliationText } from '../../_lib/i18n/visual-reconciliation-text';
import { compareSelectedVisualDocuments } from '../../_lib/visual-amounts';
import type { DocumentSetReadinessCode } from '@/lib/financial-reconciliation/document-set-service';
import type { SavedDocumentSet } from '@/lib/financial-reconciliation/document-set-service';
import type { ExistingConfirmedBankReconciliation } from '@/lib/financial-reconciliation/existing-confirmed-bank-documents';
import { indexConfirmedVisualDocumentLinks } from '@/lib/financial-reconciliation/visual-confirmed-document-links';
import { splitVisualWorkQueue } from '../../_lib/visual-work-queue';
import { visualMerchantAnchor, fallbackAnchorForBankQuery, rankVisualDocumentsForBank } from '../../_lib/visual-document-suggestions';

/** Company-only visual workspace. Evidence and optional family actions are server-authorized. */
export default function VisualReconciliationWorkspace({ model, text: t, language, family, transferReview, documentPreviewEnabled = true, documentSearchAction, documentSets = [], existingConfirmedReconciliations = [], historicalEvidenceUnavailable = false, documentSetCanConfirm = false, documentSetLockReason, documentSetInspectAction, documentSetConfirmAction, documentSetVoidAction }: {
  model: VisualModel; text: VisualReconciliationText; language: string;
  documentSets?: SavedDocumentSet[];
  existingConfirmedReconciliations?: ExistingConfirmedBankReconciliation[];
  historicalEvidenceUnavailable?: boolean;
  documentSetCanConfirm?: boolean;
  documentSetLockReason?: string;
  documentSetInspectAction?: (bankAccountId: number, bankTransactionId: number, documentIds: number[]) => Promise<
    { ok: true; reason: DocumentSetReadinessCode } |
    { ok: false; reason: 'INVALID_SELECTION' | 'UNAVAILABLE' }>;
  documentSetConfirmAction?: (bankAccountId: number, bankTransactionId: number, documentIds: number[]) => Promise<
    { ok: true; id: number; idempotent: boolean } |
    { ok: false; reason: DocumentSetReadinessCode | 'INVALID_SELECTION' | 'UNAVAILABLE' | 'STORAGE_DISABLED' }>;
  documentSetVoidAction?: (bankAccountId: number, reconciliationId: number, reason: string) => Promise<{ ok: true; id: number }>;
  documentPreviewEnabled?: boolean;
  documentSearchAction?: (bankAccountId: number, query: string) => Promise<
    { ok: true; documents: VisualDocumentHit[] } | { ok: false }
  >;
  transferReview?: {
    bankAccountName: string;
    bankAccountNumber: string | null;
    inspectAction: (bankAccountId: number, transactionId: number) => Promise<InternalTransferReviewResult>;
    confirmEnabled: boolean;
    saved: SavedOwnTransfer[];
    confirmAction: (bankAccountId: number, sourceId: number, targetId: number) => Promise<OwnTransferActionResult>;
    voidAction: (bankAccountId: number, reconciliationId: number, reason: string) => Promise<OwnTransferActionResult>;
    ownerReviewAction: (sourceId: number, targetId: number) => Promise<BankAccountOwnerReviewResult>;
  };
  family?: {
    enabled: boolean;
    draftOnly?: boolean; // Owner-only, in-memory arithmetic; never grants access to family records.
    canEdit: boolean;
    people: FamilyPerson[];
    loanRegistry?: FamilyLoanRegistryRow[]; // Forskoðun kann að sleppa þessari lesyfirlitsviðbót.
    loanRegistryTruncated?: boolean;
    journalSnapshot?: JournalSnapshot | null;
    journalEnabled?: boolean;
    createJournalAction?: (input: JournalCreateInput) => Promise<JournalActionResult>;
    movementJournalAction?: (input: JournalMovementInput) => Promise<JournalActionResult>;
    blocks: Record<number, string | null>;
    saved?: SavedFamilyTransfer[];
    storageEnabled?: boolean;
    saveAction?: (input: FamilyDraft) => Promise<{ ok: true; id: number } | { ok: false; message: string }>;
  };
}) {
  const router = useRouter();
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [copyReviewStatus, setCopyReviewStatus] = useState<'copied' | 'failed' | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [groupPending, startGroupAction] = useTransition();
  const [inspectionPending, startInspection] = useTransition();
  const [inspectionResult, setInspectionResult] = useState<{
    selectionKey: string; reason: DocumentSetReadinessCode | 'INVALID_SELECTION' | 'UNAVAILABLE';
  } | null>(null);
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
  // Selection is per bank movement: drafts never jump between transactions.
  const [workModeByBank, setWorkModeByBank] = useState<Record<number, 'documents' | 'family'>>({});
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ receiptId: number; documentId: number | null } | null>(null);
  // An automatic preview is only a visual suggestion, not a document selection.
  const [suggestedPreview, setSuggestedPreview] = useState<{ bankId: number; receiptId: number; documentId: number | null } | null>(null);
  // Never reopen a suggestion after the person explicitly closes the preview for this bank movement.
  const closedSuggestionPreviews = useRef(new Set<number>());
  const [documentQuery, setDocumentQuery] = useState('');
  const [documentResults, setDocumentResults] = useState<VisualDocumentHit[]>([]);
  // Every bank transaction keeps its own temporary selection while navigating the page.
  // Nothing is persisted; changing transactions must never display the previous draft as its match.
  const [comparisonByBank, setComparisonByBank] = useState<Record<number, VisualDocumentHit[]>>({});
  const middleScroll = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const transactionScroll = useRef<HTMLDivElement>(null);
  const [documentSearchTerm, setDocumentSearchTerm] = useState<string | null>(null);
  const [documentSearchFailed, setDocumentSearchFailed] = useState(false);
  const [documentSearchBroadenedTo, setDocumentSearchBroadenedTo] = useState<string | null>(null);
  const [suggestedDocuments, setSuggestedDocuments] = useState<{ bankAccountId: number; bankId: number; anchor: string; documents: VisualDocumentHit[]; failed: boolean } | null>(null);
  // Read-only search results are cached per bank account and transaction. This avoids
  // repeating the archive lookup when the user moves between nearby bank movements.
  const suggestionCache = useRef(new Map<string, { documents: VisualDocumentHit[]; failed: boolean }>());
  const [suggestionRefresh, setSuggestionRefresh] = useState(0);
  const [suggestionsPending, startSuggestionsSearch] = useTransition();
  const [documentSearchPending, startDocumentSearch] = useTransition();
  const rows = filterVisualTransactions(model.transactions, query);
  const queue = splitVisualWorkQueue(rows, confirmedBankIds);
  // A draft exists only in this browser session. These counts never claim that
  // a document is booked, confirmed, or that the full account has been reviewed.
  const draftRows = queue.pending.filter(row => (comparisonByBank[row.id]?.length ?? 0) > 0);
  const balancedDraftCount = draftRows.filter(row =>
    compareSelectedVisualDocuments(row.amount, comparisonByBank[row.id].map(item => item.amount))?.remaining === '0',
  ).length;
  const pendingIndex = queue.pending.findIndex(row => row.id === selectedId);
  const nextPendingId = queue.pending.length
    ? queue.pending[pendingIndex < 0 ? 0 : (pendingIndex + 1) % queue.pending.length].id
    : null;
  // Searching must also find completed transactions, even if history is folded away.
  const revealCompleted = showCompleted || query.trim().length > 0;
  const visibleRows = revealCompleted ? [...queue.pending, ...queue.completed] : queue.pending;
  const selected = visibleRows.find(row => row.id === selectedId) ?? visibleRows[0] ?? null;
  const comparison = selected ? comparisonByBank[selected.id] ?? [] : [];
  const savedFamily = selected && family?.enabled
    ? family.saved?.find(row => row.bankTransactionId === selected.id) : undefined;
  // A saved family explanation is immediately visible again on a fresh page load.
  const workMode = selected && family?.enabled
    ? (workModeByBank[selected.id] ?? (savedFamily ? 'family' : 'documents')) : 'documents';
  const savedGroup = selected ? documentSets.find(group => group.bankTransactionId === selected.id && group.status === 'CONFIRMED') : undefined;
  const existingConfirmed = selected ? existingConfirmedReconciliations.filter(row => row.bankTransactionId === selected.id) : [];
  const voidHistory = selected ? documentSets.filter(group => group.bankTransactionId === selected.id && group.status === 'VOID') : [];
  const suggestionAlreadyConfirmed = Boolean(selected && (selected.bankStatus === 'RECONCILED' ||
    savedGroup || existingConfirmed.length > 0 || selected.evidence.some(item => item.status === 'confirmed')));
  const visibleSuggestions = !suggestionAlreadyConfirmed && selected?.id === suggestedDocuments?.bankId &&
    model.bankAccountId === suggestedDocuments?.bankAccountId ? suggestedDocuments : null;
  const suggestedRanked = selected && visibleSuggestions ? rankVisualDocumentsForBank(selected, visibleSuggestions.documents).slice(0, 8) : [];
  const topSuggestion = selected?.bankStatus === 'UNRECONCILED' && !suggestionAlreadyConfirmed
    ? suggestedRanked.find(({ item }) => Number.isSafeInteger(item.receiptId) && item.receiptId > 0)?.item ?? null
    : null;
  const previewIsSuggestion = Boolean(selected && suggestedPreview && preview &&
    suggestedPreview.bankId === selected.id && preview.receiptId === suggestedPreview.receiptId &&
    preview.documentId === suggestedPreview.documentId);
  // Same canonical confirmation index controls the bank, source and archive views.
  const confirmedDocumentLinks = indexConfirmedVisualDocumentLinks(existingConfirmedReconciliations, documentSets);
  const comparedAmounts = selected ? compareSelectedVisualDocuments(selected.amount, comparison.map(item => item.amount)) : null;
  // A missing confirmed link in the projection does NOT mean the actual bank
  // movement is unreconciled: legacy matching may already have closed it.
  const inspectionSelectionKey = selected ? `${selected.id}:${comparison.map(item => item.documentId ?? 'legacy').join(',')}` : '';
  const currentInspection = inspectionResult?.selectionKey === inspectionSelectionKey ? inspectionResult.reason : null;
  const canSubmitGroup = Boolean(selected && selected.bankStatus === 'UNRECONCILED' && comparison.length &&
    comparison.every(item => item.documentId !== null && !confirmedDocumentLinks.has(item.documentId)) &&
    !historicalEvidenceUnavailable && !savedFamily && comparedAmounts?.remaining === '0' &&
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

  function inspectGroup() {
    if (!selected || !comparison.length || comparison.some(item => item.documentId === null) ||
        !documentSetInspectAction || inspectionPending) return;
    const bankId = selected.id;
    const selectionKey = inspectionSelectionKey;
    const ids = comparison.map(item => item.documentId).filter((id): id is number => id !== null);
    startInspection(async () => {
      try {
        const response = await documentSetInspectAction(model.bankAccountId, bankId, ids);
        setInspectionResult({ selectionKey, reason: response.reason });
      } catch {
        setInspectionResult({ selectionKey, reason: 'UNAVAILABLE' });
      }
    });
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
        setSuggestedPreview(null);
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
  // The first ranked authorized document is opened for visual review only.
  // Never run this for already reconciled movements or override a manually opened
  // document. Closing a suggested preview stays closed for this bank movement.
  const topSuggestionReceiptId = topSuggestion?.receiptId ?? null;
  const topSuggestionDocumentId = topSuggestion?.documentId ?? null;
  useEffect(() => {
    if (!documentPreviewEnabled || !selected || topSuggestionReceiptId === null ||
        !Number.isSafeInteger(topSuggestionReceiptId) || topSuggestionReceiptId <= 0 ||
        preview !== null || sourceKey !== null || closedSuggestionPreviews.current.has(selected.id)) return;
    setPreview({ receiptId: topSuggestionReceiptId, documentId: topSuggestionDocumentId });
    setSuggestedPreview({ bankId: selected.id, receiptId: topSuggestionReceiptId, documentId: topSuggestionDocumentId });
  }, [documentPreviewEnabled, selected?.id, topSuggestionReceiptId, topSuggestionDocumentId, preview, sourceKey]);
  useEffect(() => {
    if (previewUrl) rightScroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [previewUrl]);
  const panel = 'min-w-0 overflow-hidden rounded-xl border border-emerald-100 bg-white lg:flex lg:h-[calc(100dvh-18rem)] lg:min-h-[26rem] lg:flex-col';
  const heading = 'border-b border-emerald-100 p-4 text-base font-semibold lg:shrink-0';
  const rowStyle = 'mb-2 block w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700';
  function selectTransaction(bankId: number) {
    setSelectedId(bankId);
    setCopyReviewStatus(null);
    setSourceKey(null);
    setPreview(null);
    setSuggestedPreview(null);
    setVoidReason('');
    setGroupMessage(null);
    setDocumentSearchTerm(null);
    setDocumentSearchBroadenedTo(null);
    setDocumentQuery('');
    setDocumentResults([]);
    setDocumentSearchFailed(false);
    middleScroll.current?.scrollTo({ top: 0 });
    rightScroll.current?.scrollTo({ top: 0 });
  }
  function transactionButton(row: VisualModel['transactions'][number]) {
    const draft = comparisonByBank[row.id] ?? [];
    const draftBalanced = draft.length > 0 &&
      compareSelectedVisualDocuments(row.amount, draft.map(item => item.amount))?.remaining === '0';
    return <button key={row.id} type="button" aria-pressed={selected?.id === row.id}
      className={`${rowStyle} ${selected?.id === row.id ? 'border-teal-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      onClick={() => selectTransaction(row.id)}>
      <small className="block">#{row.id} · {date(row.date)}</small>
      <strong className="block break-words">{row.text}</strong>
      <span className="block">{amount(row.amount)}</span>
      {draft.length > 0 && <span data-testid={`visual-draft-bank-${row.id}`}
        className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
        {t.progressDraftBadge} ({draft.length}){draftBalanced ? ` · ${t.progressBalancedBadge}` : ''}
      </span>}
      {row.bankStatus === 'RECONCILED' && <span className="mt-2 inline-block rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-900">{t.bankAlreadyReconciledBadge}</span>}
      {existingConfirmedReconciliations.some(item => item.bankTransactionId === row.id) && <span className="ml-1 mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{t.existingConfirmedBadge} #{existingConfirmedReconciliations.find(item => item.bankTransactionId === row.id)?.id}</span>}
      {row.evidence.some(item => item.status === 'confirmed') && <span data-testid={`confirmed-bank-${row.id}`} className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.confirmed}</span>}
      {documentSets.some(group => group.bankTransactionId === row.id && group.status === 'CONFIRMED') && <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs">{t.groupSaved}</span>}
    </button>;
  }
  function openDocument(receiptId: number, documentId: number | null) {
    if (!Number.isSafeInteger(receiptId) || receiptId <= 0) return;
    setSuggestedPreview(null);
    setPreview({ receiptId, documentId });
  }
  function closePreview() {
    if (selected) closedSuggestionPreviews.current.add(selected.id);
    setSuggestedPreview(null);
    setPreview(null);
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
    if (!wasSelected && comparison.length === 0) middleScroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setComparisonByBank(previous => {
      const old = previous[bankId] ?? [];
      const next = old.some(row => `${row.receiptId}:${row.documentId ?? 'legacy'}` === key)
        ? old.filter(row => `${row.receiptId}:${row.documentId ?? 'legacy'}` !== key)
        : [...old, item];
      return { ...previous, [bankId]: next };
    });
  }
  // The selected bank movement itself starts the shortlist lookup. It is a
  // debounced, company-authorized READ only, not an automatic link or selection.
  // Cleanups prevent a slow response for the previous bank movement from replacing
  // the shortlist of the newly selected movement.
  const suggestionBankId = selected?.id ?? null;
  const suggestionBankText = selected?.text ?? '';
  useEffect(() => {
    if (suggestionBankId === null || suggestionAlreadyConfirmed ||
        !documentSearchAction || !documentPreviewEnabled) return;
    const anchor = visualMerchantAnchor(suggestionBankText);
    if (!anchor) return;
    const accountId = model.bankAccountId;
    const cacheKey = `${accountId}:${suggestionBankId}:${anchor}`;
    const cached = suggestionCache.current.get(cacheKey);
    if (cached) {
      setSuggestedDocuments({ bankAccountId: accountId, bankId: suggestionBankId, anchor, ...cached });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setSuggestedDocuments({ bankAccountId: accountId, bankId: suggestionBankId, anchor, documents: [], failed: false });
      startSuggestionsSearch(async () => {
        let outcome: { documents: VisualDocumentHit[]; failed: boolean };
        try {
          const result = await documentSearchAction(model.bankAccountId, anchor);
          outcome = { documents: result.ok ? result.documents : [], failed: !result.ok };
        } catch {
          outcome = { documents: [], failed: true };
        }
        if (cancelled) return;
        suggestionCache.current.set(cacheKey, outcome);
        // Keep this temporary cache small; it never leaves the browser session.
        if (suggestionCache.current.size > 20) {
          const oldest = suggestionCache.current.keys().next().value;
          if (oldest) suggestionCache.current.delete(oldest);
        }
        setSuggestedDocuments({ bankAccountId: accountId, bankId: suggestionBankId, anchor, ...outcome });
      });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [suggestionBankId, suggestionBankText, suggestionAlreadyConfirmed, model.bankAccountId,
      documentSearchAction, documentPreviewEnabled, suggestionRefresh]);

  function suggestDocuments() {
    if (!selected || !documentSearchAction || !documentPreviewEnabled || suggestionsPending) return;
    const anchor = visualMerchantAnchor(selected.text);
    if (!anchor) return;
    // Optional manual retry. Normal use does not require clicking the title.
    suggestionCache.current.delete(`${model.bankAccountId}:${selected.id}:${anchor}`);
    setSuggestionRefresh(value => value + 1);
  }
  function searchArchive() {
    if (!documentSearchAction || !documentPreviewEnabled || documentQuery.trim().length < 2) return;
    const term = documentQuery.trim();
    setDocumentSearchTerm(term);
    setDocumentSearchBroadenedTo(null);
    setDocumentSearchFailed(false);
    const selectedBankText = selected?.text ?? '';
    const selectedBank = selected;
    startDocumentSearch(async () => {
      try {
        const result = await documentSearchAction(model.bankAccountId, term);
        if (!result.ok) {
          setDocumentResults([]);
          setDocumentSearchFailed(true);
          return;
        }
        // If a longer phrase (e.g. "Sjóvá-Almennar líftrygging") does not exist
        // verbatim in the archive, try the vendor word from the selected bank
        // movement, and explicitly tell the user that the search was widened.
        const fallback = result.documents.length === 0 ? fallbackAnchorForBankQuery(selectedBankText, term) : null;
        if (fallback) {
          const broader = await documentSearchAction(model.bankAccountId, fallback);
          if (broader.ok) {
            setDocumentResults(selectedBank ? rankVisualDocumentsForBank(selectedBank, broader.documents).map(row => row.item) : broader.documents);
            setDocumentSearchBroadenedTo(fallback);
            return;
          }
        }
        setDocumentResults(selectedBank ? rankVisualDocumentsForBank(selectedBank, result.documents).map(row => row.item) : result.documents);
      } catch {
        setDocumentResults([]);
        setDocumentSearchFailed(true);
      }
    });
  }

  // A deliberate, read-only handoff note. Draft comparisons are never described
  // as persisted, confirmed or booked, even when their amounts balance.
  async function copySelectedReviewNote() {
    if (!selected) return;
    const lines = [
      'GLÖGGT — yfirlit yfir bankahreyfingu',
      'SKRIFVARIÐ AFRIT: Þetta er hvorki bókun né staðfesting á afstemmingu.',
      `Bankareikningur #${model.bankAccountId} · Bankhreyfing #${selected.id}`,
      `Dagsetning: ${date(selected.date)}`,
      `Texti: ${selected.text}`,
      `Fjárhæð: ${amount(selected.amount)}`,
      `Staða bankahreyfingar: ${selected.bankStatus}`,
      `Heimildagögn ófullkomin: ${model.incomplete || historicalEvidenceUnavailable ? 'Já' : 'Ekki merkt ófullkomin í þessari sýn'}`,
      '',
      'Staðfestar skjalatengingar sem eru sýnilegar hér:',
      ...(savedGroup ? [
        `- Staðfest skjalasafn #${savedGroup.id}: ${savedGroup.documents.map(doc => `skjal #${doc.documentId ?? doc.receiptId}`).join(', ') || 'engin skjöl birt'}`,
      ] : []),
      ...existingConfirmed.map(group =>
        `- Eldri afstemming #${group.id}: ${group.documents.map(doc => `skjal #${doc.documentId}`).join(', ') || 'engin skjöl birt'}`),
      ...(!savedGroup && existingConfirmed.length === 0 ? ['- Engin staðfest skjalatenging sýnileg í þessu yfirliti.'] : []),
      '',
      `Óvistuð pörunardrög (${comparison.length}):`,
      ...(comparison.length ? comparison.map(item =>
        `- ${item.title} | skjal #${item.documentId ?? item.receiptId} | ${date(item.date)} | ${amount(item.amount)}`
      ) : ['- Engin drög valin.']),
      'Athugið: Óvistuð drög eru aðeins í þessari vafralotu. Jafnar fjárhæðir staðfesta ekki tengingu.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyReviewStatus('copied');
    } catch {
      setCopyReviewStatus('failed');
    }
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
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setPreview(null); setSuggestedPreview(null); setSourceKey(null); }}
        className="mt-2 w-full rounded-lg border border-emerald-200 bg-white p-3" />
    </label>
    <p aria-live="polite" className="mb-3 text-sm">{rows.length} / {model.transactions.length}</p>
    <section data-testid="visual-work-progress" aria-label={t.progressTitle}
      className="mb-4 rounded-xl border border-emerald-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{t.progressTitle}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded bg-slate-100 px-3 py-2 font-semibold">{t.progressPending}: {queue.pending.length}</span>
            <span className="rounded bg-amber-100 px-3 py-2 font-semibold">{t.progressDrafts}: {draftRows.length}</span>
            <span className="rounded bg-emerald-100 px-3 py-2 font-semibold">{t.progressBalanced}: {balancedDraftCount}</span>
          </div>
        </div>
        <button type="button" data-testid="visual-next-pending" disabled={nextPendingId === null}
          className="rounded-lg border border-teal-700 bg-teal-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() => { if (nextPendingId !== null) selectTransaction(nextPendingId); }}>
          {t.progressNext}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-600">{t.progressNotice}</p>
    </section>
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
                  setSuggestedPreview(null);
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
        <div ref={middleScroll} className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabIndex={0}>{selected ? <>
          <h3 className="break-words font-semibold">
            {documentPreviewEnabled && documentSearchAction ? <button type="button"
              data-testid="suggest-documents-from-bank" onClick={suggestDocuments} disabled={suggestionsPending}
              title={t.suggestClickHint} className="break-words text-left underline decoration-dotted underline-offset-4 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">
              {selected.text}
            </button> : selected.text}
          </h3>
          {documentPreviewEnabled && documentSearchAction && <p className="mt-1 text-xs text-slate-600">{t.suggestClickHint}</p>}
          <p className="my-4 break-words text-2xl font-bold">{amount(selected.amount)}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><div><dt className="text-slate-600">{t.date}</dt><dd>{date(selected.date)}</dd></div><div><dt className="text-slate-600">BankTransaction</dt><dd>#{selected.id}</dd></div></dl>
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm" data-testid="bank-status-summary"><strong>{t.bankStatusLabel}:</strong> {selected.bankStatus === 'RECONCILED'
            ? t.bankAlreadyReconciledBadge : selected.bankStatus === 'UNRECONCILED' ? t.bankUnreconciledBadge : t.bankStatusUnknown}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3" data-testid="visual-copy-review-note">
            <button type="button" className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50"
              onClick={() => { void copySelectedReviewNote(); }}>
              Afrita yfirlit færslu
            </button>
            <p role="status" aria-live="polite" className="text-xs text-slate-700">
              {copyReviewStatus === 'copied' ? 'Yfirlit afritað á klippiborðið.' :
                copyReviewStatus === 'failed' ? 'Ekki tókst að afrita. Athugaðu heimild vafrans fyrir klippiborðið.' :
                'Skrifvarið yfirlit; óvistuð drög eru skýrt aðgreind frá staðfestingum.'}
            </p>
          </div>
          {transferReview && <BankFlowReviewPanel key={`bank-flow:${selected.id}`}
            language={language} bankAccountId={model.bankAccountId}
            bankAccountName={transferReview.bankAccountName}
            bankAccountNumber={transferReview.bankAccountNumber}
            bankTransactionId={selected.id} bankAmount={selected.amount} bankDate={selected.date}
            bankText={selected.text} inspectAction={transferReview.inspectAction}
            saved={transferReview.saved.find(link => link.bankTransactionId === selected.id)}
            confirmEnabled={transferReview.confirmEnabled}
            confirmAction={transferReview.confirmAction} voidAction={transferReview.voidAction}
            ownerReviewAction={transferReview.ownerReviewAction}
            onBeginOwnTransferReview={() => {
              // Keep a manually chosen document, but close a mere automatic suggestion:
              // evidence for an own-account transfer consists of the two bank movements.
              if (!selected) return;
              closedSuggestionPreviews.current.add(selected.id);
              if (previewIsSuggestion) {
                setPreview(null);
                setSuggestedPreview(null);
              }
            }} />}
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
          {family?.draftOnly && !family.enabled && (
            <div className="mt-4 rounded-lg border border-teal-300 bg-teal-50/30 p-3" data-testid="family-overview-readonly-entry">
              <p className="font-semibold text-teal-950">Fjölskylda · lesyfirlit</p>
              <a href="/banki/fjolskylda" className="mt-2 inline-block rounded border border-teal-700 bg-white px-3 py-2 text-sm font-semibold text-teal-800 underline underline-offset-2">Opna sjálfstætt fjölskylduyfirlit</a>
              <FamilyOverviewPanel previewOnly people={[]} savedTransfers={[]} storageEnabled={false}
                journalSnapshot={null} loanRegistryCount={0} loanRegistryTruncated={false}
                bankAccountId={model.bankAccountId} />
            </div>
          )}
          {family?.draftOnly && !family.enabled && (
            <details className="mt-4 rounded-lg border border-teal-200 bg-teal-50/30" data-testid="family-draft-only-section">
              <summary className="cursor-pointer p-3 text-sm font-semibold text-teal-950">
                Fjölskylduviðauki í þróun · skoða óvistuð reiknidrög
              </summary>
              <div className="border-t border-teal-200 p-3">
                <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                  Fyrst skal athuga hvort greiðslan sé millifærsla milli reikninga.
                  Óþekktur viðtakandi má ekki sjálfkrafa teljast lán eða gjöf.
                </p>
                <FamilyLoanDraftOnlyPanel key={selected.id} bankAmount={selected.amount} bankTransactionId={selected.id} bankStatus={selected.bankStatus} />
              </div>
            </details>
          )}
          {family?.enabled && <nav aria-label={t.workModeLabel} data-testid="visual-work-mode"
            className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-teal-200 bg-white p-2 sm:grid-cols-2">
            <button type="button" aria-pressed={workMode === 'documents'}
              data-testid="visual-mode-documents"
              className={`rounded-md px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-800 ${workMode === 'documents' ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-800'}`}
              onClick={() => setWorkModeByBank(previous => ({...previous, [selected.id]: 'documents'}))}>
              {t.workModeDocuments}
            </button>
            <button type="button" aria-pressed={workMode === 'family'}
              data-testid="visual-mode-family"
              className={`rounded-md px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-800 ${workMode === 'family' ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-800'}`}
              onClick={() => setWorkModeByBank(previous => ({...previous, [selected.id]: 'family'}))}>
              {t.workModeFamily}{savedFamily ? ` · ${t.workModeSaved}` : ''}
            </button>
          </nav>}
          {family?.enabled && <div hidden={workMode !== 'family'}>
            <FamilyFinanceWorkspacePanel
            key={selected.id} companyId={model.companyId} bankAccountId={model.bankAccountId}
            loanRegistry={family.loanRegistry ?? []} loanRegistryTruncated={family.loanRegistryTruncated ?? false}
            journalSnapshot={family.journalSnapshot ?? null} journalEnabled={family.journalEnabled ?? false}
            createJournalAction={family.createJournalAction} movementJournalAction={family.movementJournalAction}
            transaction={selected} people={family.people} canEdit={family.canEdit}
            saved={savedFamily} savedTransfers={family.saved ?? []} storageEnabled={family.storageEnabled} saveAction={family.saveAction}
            loanClaimReason={savedFamily || savedGroup || existingConfirmed.length > 0 || selected.bankStatus !== 'UNRECONCILED' || selected.evidence.some(item => item.status === 'confirmed')
              ? t.workModeAlreadyLinked : null}
            blockReason={selected.bankStatus !== 'UNRECONCILED' || savedGroup || existingConfirmed.length > 0 || selected.evidence.some(item => item.status === 'confirmed')
              ? t.workModeAlreadyLinked
              : family.blocks[selected.id] === undefined ? t.workModeEligibilityUnknown : family.blocks[selected.id]} />
          </div>}
          {workMode === 'documents' && <>
          {savedFamily && <p role="status" data-testid="saved-family-prevents-document-set"
            className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm font-semibold">
            {t.workModeSavedBlocksDocuments}
          </p>}
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
          {selected && <ReconciliationEvidenceChain key={selected.id} bank={selected} selected={comparison} preview={preview}
            incomplete={model.incomplete || historicalEvidenceUnavailable}
            confirmations={chainConfirmationsForBank(selected.id, existingConfirmedReconciliations, documentSets)} />}
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
            <div className="max-h-[22vh] space-y-2 overflow-y-auto overscroll-contain pr-1" tabIndex={0} data-testid="visual-selected-documents-scroll">
              {comparison.map(item => <div key={`${item.receiptId}:${item.documentId ?? 'legacy'}`} className="rounded-md border border-slate-200 bg-white p-2 text-sm">
                <strong className="block break-words">{item.title}</strong>
                <p className="my-1">#{item.documentId ?? item.receiptId} · {date(item.date)} · {amount(item.amount)}</p>
                <p className="text-xs text-slate-600">Receipt #{item.receiptId}{item.documentId !== null ? ` · AiDetectedDocument #${item.documentId}` : ''}</p>
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
              {documentSetInspectAction && <div className="mb-3 rounded border border-teal-200 bg-white p-2">
                <button type="button" data-testid="visual-document-set-inspect"
                  disabled={inspectionPending || comparison.some(item => item.documentId === null)}
                  className="rounded border border-teal-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  onClick={inspectGroup}>
                  {inspectionPending ? t.groupInspectPending : t.groupInspectButton}
                </button>
                {currentInspection && <p role="status" data-testid="visual-document-set-inspection-result"
                  className={`mt-2 text-sm font-semibold ${currentInspection === 'READY' ? 'text-emerald-800' : 'text-amber-900'}`}>
                  {currentInspection === 'READY' ? t.groupInspectReady : confirmationFailureMessage(currentInspection)}
                </p>}
              </div>}
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
          {visibleSuggestions && <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm" data-testid="visual-suggested-documents" aria-live="polite">
            <h4 className="font-semibold">{t.suggestTitle}</h4>
            <p className="mt-1 text-xs text-slate-700">{t.suggestSearchFor}: {visibleSuggestions.anchor}. {t.suggestNotProof}</p>
            {suggestionsPending ? <p className="mt-2">{t.archiveSearching}</p> : visibleSuggestions.failed ?
              <p role="alert" className="mt-2 text-red-800">{t.archiveSearchFailed}</p> : <>
                <div className="mt-2 max-h-[30vh] overflow-y-auto overscroll-contain pr-1" tabIndex={0} aria-label={t.suggestTitle} data-testid="visual-suggestions-scroll">
                {suggestedRanked.map(({ item, sameAmount, closeDate }) => {
                  const linked = item.documentId !== null && confirmedDocumentLinks.has(item.documentId);
                  const isSelected = comparison.some(row => row.receiptId === item.receiptId && row.documentId === item.documentId);
                  return <article key={`${item.receiptId}:${item.documentId ?? 'legacy'}`} className="mt-2 rounded border border-emerald-100 bg-white p-2">
                    <strong className="block break-words">{item.title}</strong>
                    <p className="text-xs">#{item.documentId ?? item.receiptId} · {date(item.date)} · {amount(item.amount)}</p>
                    <div className="my-1 flex flex-wrap gap-1 text-xs">
                      {sameAmount && <span className="rounded bg-emerald-100 px-2 py-0.5">{t.suggestSameAmount}</span>}
                      {closeDate && <span className="rounded bg-slate-100 px-2 py-0.5">{t.suggestNearDate}</span>}
                      {linked && <span className="rounded bg-amber-100 px-2 py-0.5">{t.alreadyLinked}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button type="button" className="rounded border border-teal-700 px-2 py-1 text-xs font-semibold"
                        onClick={() => openDocument(item.receiptId, item.documentId)}>{t.openDocument}</button>
                      {!linked && <button type="button" className="rounded border border-teal-700 px-2 py-1 text-xs"
                        onClick={() => toggleComparison(item)}>{isSelected ? t.archiveRemoveCompare : t.archiveAddCompare}</button>}
                    </div>
                  </article>;
                })}
                {suggestedRanked.length === 0 && <p className="mt-2">{t.archiveNoResults}</p>}
                </div>
              </>}
          </section>}
          </>}
          <div data-testid="confirmed-reconciliations" className="mt-4 space-y-2">
            {selected.evidence.filter(item => item.status === 'confirmed').map(item => <button key={item.key} type="button"
              className="block text-left text-sm font-semibold underline" onClick={() => { if (selected) closedSuggestionPreviews.current.add(selected.id); setSourceKey(item.key); setPreview(null); setSuggestedPreview(null); }}>
              {t.confirmed} #{item.confirmationId} · {t[item.kind]} #{item.sourceId}
            </button>)}
          </div>
        </> : <p>{t.empty}</p>}</div>
      </section>
      <section className={panel} aria-label={t.sources}>
        <h2 className={heading}>{t.sources}</h2>
        {/* A single independently scrolling body for evidence, archive search and document preview. */}
        <div ref={rightScroll} className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabIndex={0}>
        {previewUrl && <section data-testid="document-preview" className="border-t border-emerald-100 p-3">
          <p className="mb-2 text-xs text-slate-600">Receipt #{preview?.receiptId}{preview?.documentId != null ? ` · AiDetectedDocument #${preview.documentId}` : ''}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t.openDocument} #{preview?.documentId ?? preview?.receiptId}
              {preview?.documentId !== null && preview?.documentId !== undefined && confirmedDocumentLinks.has(preview.documentId) &&
                <span className="ml-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{t.alreadyLinked}</span>}
            </h3>
            <button type="button" className="underline" onClick={closePreview}>{t.close}</button>
          </div>
          {previewIsSuggestion && <p role="status" data-testid="preview-unconfirmed-suggestion"
            className="my-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {t.suggestPreviewOnly}
          </p>}
          <p className="my-2 text-sm">{t.security}</p>
          <a className="text-sm font-semibold underline" href={previewUrl} target="_blank" rel="noopener noreferrer">{t.openDocument} ↗</a>
          {embeddedFileUrl && <VisualDocumentPreview
            key={previewUrl}
            url={embeddedFileUrl}
            title={t.openDocument}
            language={language}
          />}
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
              onClick={() => { if (selected) closedSuggestionPreviews.current.add(selected.id); setSourceKey(item.key); setPreview(null); setSuggestedPreview(null); }}>
              <span className={`inline-block rounded px-2 py-1 text-xs ${item.status === 'confirmed' || confirmedForDocument.length ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {confirmedForDocument.length ? t.alreadyLinked : t[item.status]}
              </span>
              <strong className="mt-2 block break-words">{item.title || t[item.kind]}</strong>
              <small>{t[item.kind]} #{item.sourceId} · {amount(item.amount, item.currency)}</small>
              <small className="mt-1 block text-slate-600">
                {item.kind === 'document' ? 'AiDetectedDocument' : item.kind === 'booking' ? 'ReceiptEntry' : 'FinancialEvent'} #{item.sourceId}
                {item.receiptId !== null ? ` · Receipt #${item.receiptId}` : ''}
                {item.paymentId !== undefined ? ` · FinancialEventPayment #${item.paymentId}` : ''}
              </small>
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
                {documentSearchBroadenedTo && <p role="status" className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{t.suggestBroadenedSearch}: “{documentSearchBroadenedTo}”. {t.suggestNotProof}</p>}
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
