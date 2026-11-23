/** GLÖGGT — read-only family overview. No database calls, inferred relatives,
 * bookkeeping postings or conversion between gifts and family debt.
 * Transfer splits are scoped to the CURRENT bank account. Loan balances are
 * company-scoped only when an authorized journal snapshot is available.
 */
import type { FamilyPerson } from './transfer-split';
import type { SavedFamilyTransfer } from './transfer-split-repository';
import type { JournalSnapshot } from './family-loan-journal-contract';

type TransferSummary = Pick<SavedFamilyTransfer, 'id' | 'bankTransactionId' | 'childPersonId' |
  'childName' | 'giftAmountIsk' | 'reimbursementAmountIsk' | 'totalAmountIsk'>;
type LedgerSummary = Pick<JournalSnapshot, 'accounts' | 'balances' | 'capped'>;
export type FamilyOverviewRow = {
  childPersonId: number;
  name: string;
  loanCount: number;
  outstandingIsk: string | null;
  advancedIsk: string | null;
  repaidIsk: string | null;
  giftIsk: string | null;
  reimbursementIsk: string | null;
  splitCount: number;
};
export type FamilyOverview = {
  rows: FamilyOverviewRow[];
  peopleCount: number;
  loanDataAvailable: boolean;
  splitDataAvailable: boolean;
  invalidSplitData: boolean;
  outstandingIsk: string | null;
  giftIsk: string | null;
  reimbursementIsk: string | null;
};

const validId = (n: number) => Number.isSafeInteger(n) && n > 0;
function parseWholeIsk(s: string): bigint | null {
  if (!/^\d+(?:\.0+)?$/.test(s)) return null;
  return BigInt(s.split('.')[0]);
}
function safeWhole(n: number): bigint | null {
  return Number.isSafeInteger(n) && n >= 0 ? BigInt(n) : null;
}

export function buildFamilyOverview(input: {
  people: readonly FamilyPerson[];
  transfers: readonly TransferSummary[];
  transfersAvailable: boolean;
  journal: LedgerSummary | null;
}): FamilyOverview {
  const names = new Map(input.people.filter(p => validId(p.id)).map(p => [p.id, p.name]));
  const rowMap = new Map<number, {
    childPersonId: number; name: string; loanCount: number;
    outstanding: bigint; advanced: bigint; repaid: bigint;
    gift: bigint; reimbursement: bigint; splitCount: number;
  }>();
  function row(id: number, fallback?: string) {
    if (!rowMap.has(id)) rowMap.set(id, { childPersonId: id,
      name: names.get(id) || fallback?.trim() || `Einstaklingur #${id}`,
      loanCount: 0, outstanding: BigInt(0), advanced: BigInt(0), repaid: BigInt(0),
      gift: BigInt(0), reimbursement: BigInt(0), splitCount: 0 });
    return rowMap.get(id)!;
  }
  const loanDataAvailable = input.journal !== null && input.journal.capped === false;
  if (loanDataAvailable) {
    const accounts = new Map(input.journal!.accounts.map(a => [a.id, a]));
    if (accounts.size !== input.journal!.accounts.length ||
        input.journal!.balances.length !== accounts.size) {
      throw Error('FAMILY_OVERVIEW_LEDGER_INCONSISTENT');
    }
    const seenBalances = new Set<number>();
    for (const balance of input.journal!.balances) {
      const account = accounts.get(balance.loanId);
      const outstanding = safeWhole(balance.outstandingIsk);
      const advanced = safeWhole(balance.totalAdvancedIsk);
      const repaid = safeWhole(balance.totalRepaidIsk);
      if (seenBalances.has(balance.loanId) || !account || !validId(account.childPersonId) || outstanding === null ||
          advanced === null || repaid === null || advanced - repaid !== outstanding) {
        throw Error('FAMILY_OVERVIEW_LEDGER_INCONSISTENT');
      }
      seenBalances.add(balance.loanId);
      const item = row(account.childPersonId);
      item.loanCount++;
      item.outstanding += outstanding;
      item.advanced += advanced;
      item.repaid += repaid;
    }
  }
  const seenIds = new Set<number>();
  const seenTransactions = new Set<number>();
  let invalidSplitData = false;
  for (const split of input.transfers) {
    const gift = parseWholeIsk(split.giftAmountIsk);
    const reimbursement = parseWholeIsk(split.reimbursementAmountIsk);
    const total = parseWholeIsk(split.totalAmountIsk);
    if (!validId(split.id) || seenIds.has(split.id) || !validId(split.bankTransactionId) ||
        seenTransactions.has(split.bankTransactionId) || !validId(split.childPersonId) ||
        gift === null || reimbursement === null || total === null || gift + reimbursement !== total) {
      invalidSplitData = true;
      break;
    }
    seenIds.add(split.id);
    seenTransactions.add(split.bankTransactionId);
  }
  const splitDataAvailable = input.transfersAvailable && !invalidSplitData;
  if (splitDataAvailable) {
    for (const split of input.transfers) {
      const item = row(split.childPersonId, split.childName);
      item.gift += parseWholeIsk(split.giftAmountIsk)!;
      item.reimbursement += parseWholeIsk(split.reimbursementAmountIsk)!;
      item.splitCount++;
    }
  }
  const rows = [...rowMap.values()]
    .sort((a,b) => a.name.localeCompare(b.name,'is') || a.childPersonId-b.childPersonId)
    .map(item => ({ childPersonId: item.childPersonId, name: item.name,
      loanCount: item.loanCount,
      outstandingIsk: loanDataAvailable ? item.outstanding.toString() : null,
      advancedIsk: loanDataAvailable ? item.advanced.toString() : null,
      repaidIsk: loanDataAvailable ? item.repaid.toString() : null,
      giftIsk: splitDataAvailable ? item.gift.toString() : null,
      reimbursementIsk: splitDataAvailable ? item.reimbursement.toString() : null,
      splitCount: item.splitCount }));
  const sum = (field: 'outstanding' | 'gift' | 'reimbursement') =>
    [...rowMap.values()].reduce((acc,r) => acc + r[field], BigInt(0)).toString();
  return { rows, peopleCount: names.size, loanDataAvailable, splitDataAvailable,
    invalidSplitData, outstandingIsk: loanDataAvailable ? sum('outstanding') : null,
    giftIsk: splitDataAvailable ? sum('gift') : null,
    reimbursementIsk: splitDataAvailable ? sum('reimbursement') : null };
}
