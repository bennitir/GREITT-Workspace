'use client';

import { useState } from 'react';
import FamilyTransferPanel from './FamilyTransferPanel';
import FamilyOverviewPanel from './FamilyOverviewPanel';
import FamilyLoanPaymentPanel from './FamilyLoanPaymentPanel';
import FamilyLoanRegistryPanel from './FamilyLoanRegistryPanel';
import FamilyLoanJournalPanel from './FamilyLoanJournalPanel';
import type { JournalSnapshot, JournalCreateInput, JournalMovementInput, JournalActionResult } from '@/lib/personal-finance/family-loan-journal-contract';
import type { FamilyLoanRegistryRow } from '@/lib/personal-finance/family-loan-registry';
import type { FamilyDraft, FamilyPerson } from '@/lib/personal-finance/transfer-split';
import type { SavedFamilyTransfer } from '@/lib/personal-finance/transfer-split-repository';

type Result = { ok: true; id: number } | { ok: false; message: string };

/** Extend the existing family tab; do not replace its saved gift/reimbursement flow. */
export default function FamilyFinanceWorkspacePanel({ companyId, bankAccountId, transaction, people, canEdit,
  blockReason, saved, savedTransfers, storageEnabled, saveAction, loanClaimReason, loanRegistry, loanRegistryTruncated, journalSnapshot, journalEnabled, createJournalAction, movementJournalAction }: {
  companyId: number;
  bankAccountId: number;
  transaction: { id: number; amount: string; date: string; text: string; bankStatus?: string | null };
  people: FamilyPerson[];
  canEdit: boolean;
  blockReason: string | null;
  loanClaimReason: string | null;
  loanRegistry: FamilyLoanRegistryRow[];
  loanRegistryTruncated: boolean;
  journalSnapshot: JournalSnapshot | null;
  journalEnabled: boolean;
  createJournalAction?: (input: JournalCreateInput) => Promise<JournalActionResult>;
  movementJournalAction?: (input: JournalMovementInput) => Promise<JournalActionResult>;
  saved?: SavedFamilyTransfer;
  savedTransfers?: SavedFamilyTransfer[];
  storageEnabled?: boolean;
  saveAction?: (input: FamilyDraft) => Promise<Result>;
}) {
  const [section, setSection] = useState<'overview' | 'transfer' | 'loan' | 'registry'>('overview');
  const button = (active: boolean) => `rounded px-3 py-2 text-sm font-semibold ${active ? 'bg-teal-800 text-white' : 'border bg-white text-slate-900'}`;
  return <section aria-label="Fjölskylduverkefni" data-testid="family-finance-workspace">
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Tegund fjölskyldufærslu">
      <button type="button" className={button(section === 'overview')} aria-pressed={section === 'overview'} onClick={() => setSection('overview')}>Yfirlit eftir barni</button>
      <button type="button" className={button(section === 'transfer')} aria-pressed={section === 'transfer'} onClick={() => setSection('transfer')}>Innkaup · endurgreiðsla / gjöf</button>
      <button type="button" className={button(section === 'loan')} aria-pressed={section === 'loan'} onClick={() => setSection('loan')}>Lán og bílalán</button>
      <button type="button" className={button(section === 'registry')} aria-pressed={section === 'registry'} onClick={() => setSection('registry')}>Skráð lán og eftirstöðvar</button>
    </div>
    <div hidden={section !== 'overview'}>
      <FamilyOverviewPanel people={people} savedTransfers={savedTransfers ?? []} storageEnabled={Boolean(storageEnabled)}
        journalSnapshot={journalSnapshot} bankAccountId={bankAccountId}
        loanRegistryCount={loanRegistry.length} loanRegistryTruncated={loanRegistryTruncated} />
    </div>
    {/* Keep each panel mounted per bank movement; drafts never move between bank IDs. */}
    <div hidden={section !== 'transfer'}>
      <FamilyTransferPanel transaction={transaction} people={people} canEdit={canEdit} blockReason={blockReason}
        saved={saved} storageEnabled={storageEnabled} saveAction={saveAction} />
    </div>
    <div hidden={section !== 'loan'}>
      <FamilyLoanPaymentPanel companyId={companyId} bankAccountId={bankAccountId} transaction={transaction}
        people={people} canEdit={canEdit} claimedReason={loanClaimReason} />
    </div>
    <div hidden={section !== 'registry'}>
      <FamilyLoanRegistryPanel loans={loanRegistry} truncated={loanRegistryTruncated} />
      <FamilyLoanJournalPanel key={transaction.id} people={people} snapshot={journalSnapshot} enabled={journalEnabled && canEdit}
        currentBank={transaction} createAction={createJournalAction} movementAction={movementJournalAction} />
    </div>
  </section>;
}
