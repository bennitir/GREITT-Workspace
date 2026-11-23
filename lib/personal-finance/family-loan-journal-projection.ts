import { calculateFamilyLoanLedger, type FamilyLoanLedgerAccount, type FamilyLoanMovement } from './family-loan-ledger';
import type { JournalSnapshot } from './family-loan-journal-contract';
/** Check every company-scoped row, precision and chronological balance before presenting. */
export function assembleJournalSnapshot(companyId: number, rawAccounts: readonly FamilyLoanLedgerAccount[],
  rawMovements: readonly (Omit<FamilyLoanMovement,'amountIsk'> & { amountIsk: string })[]): JournalSnapshot {
  if (rawAccounts.length > 500 || rawMovements.length > 10000) throw Error('JOURNAL_HISTORY_LIMIT');
  const movements = rawMovements.map(r => ({ ...r, amountIsk: Number(r.amountIsk) }));
  const balances = calculateFamilyLoanLedger({ companyId, loans: rawAccounts, movements });
  return { accounts: [...rawAccounts], movements, balances, capped: false };
}
