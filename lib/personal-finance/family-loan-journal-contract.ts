import type { FamilyLoanLedgerAccount, FamilyLoanMovement, FamilyLoanLedgerBalance, FamilyLoanMovementKind } from './family-loan-ledger';

export type JournalSnapshot = { accounts: FamilyLoanLedgerAccount[]; movements: FamilyLoanMovement[];
  balances: FamilyLoanLedgerBalance[]; capped: boolean };
export type JournalCreateInput = { parentPersonId: number; childPersonId: number; title: string;
  linkedInnsynLoanId: number | null; vehicleEntityId: number | null; requestId: string };
export type JournalMovementInput = { loanId: number; kind: FamilyLoanMovementKind;
  amountIsk: number; effectiveDate: string; note: string; reversalOfId: number | null;
  bankTransactionId: number | null; requestId: string };
export type JournalActionResult = { ok: true; id: number } | { ok: false; message: string };

const id = (n: number) => Number.isSafeInteger(n) && n > 0;
const uuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === date;
}
export function checkJournalCreate(input: JournalCreateInput): void {
  if (!input || !id(input.parentPersonId) || !id(input.childPersonId) ||
      input.parentPersonId === input.childPersonId || typeof input.title !== 'string' ||
      !input.title.trim() || input.title.length > 160 ||
      (input.linkedInnsynLoanId !== null && !id(input.linkedInnsynLoanId)) ||
      (input.vehicleEntityId !== null && !id(input.vehicleEntityId)) ||
      typeof input.requestId !== 'string' || !uuid(input.requestId)) throw Error('INVALID_JOURNAL_LOAN');
}
export function checkJournalMovement(input: JournalMovementInput): void {
  if (!input || !id(input.loanId) ||
      !(['OPENING_BALANCE','ADVANCE','REPAYMENT','REVERSAL'] as string[]).includes(input.kind) ||
      !Number.isSafeInteger(input.amountIsk) || input.amountIsk <= 0 ||
      !validDate(input.effectiveDate) || typeof input.note !== 'string' ||
      !input.note.trim() || input.note.length > 240 || !uuid(input.requestId) ||
      (input.bankTransactionId !== null && !id(input.bankTransactionId)) ||
      (input.kind === 'REVERSAL' ? !id(input.reversalOfId ?? 0) : input.reversalOfId !== null) ||
      (input.kind === 'OPENING_BALANCE' && input.bankTransactionId !== null))
    throw Error('INVALID_JOURNAL_MOVEMENT');
}
