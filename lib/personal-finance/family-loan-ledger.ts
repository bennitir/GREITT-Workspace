import { balanceEffect } from './unified-settlement.mjs';

/** GLÖGGT: deterministic family receivables ledger.
 * One family receivable is NOT the outstanding balance of any external lender.
 * There is no AI, database access, automatic booking or implicit gift conversion.
 */
export type FamilyLoanMovementKind = 'OPENING_BALANCE' | 'ADVANCE' | 'REPAYMENT' | 'REVERSAL';
export type FamilyLoanMovement = {
  id: number;
  companyId: number;
  loanId: number;
  kind: FamilyLoanMovementKind;
  amountIsk: number; // positive integer amount; REVERSAL negates its source movement
  effectiveDate: string; // YYYY-MM-DD
  bankTransactionId: number | null;
  reversalOfId: number | null;
  note: string;
  createdByUserId: number;
};
export type FamilyLoanLedgerAccount = {
  id: number;
  companyId: number;
  parentPersonId: number;
  childPersonId: number;
  title: string;
  linkedInnsynLoanId: number | null;
  vehicleEntityId: number | null;
};
export type FamilyLoanLedgerBalance = {
  loanId: number;
  childPersonId: number;
  title: string;
  outstandingIsk: number;
  totalAdvancedIsk: number;
  totalRepaidIsk: number;
  movementCount: number;
  asOfDate: string | null;
};
const validId = (n: number) => Number.isSafeInteger(n) && n > 0;
const validMoney = (n: number) => Number.isSafeInteger(n) && n > 0;
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function addSafe(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw Error('FAMILY_LEDGER_OVERFLOW');
  return n;
}
/** Validates the WHOLE company-scoped history, not just the current entry. */
export function calculateFamilyLoanLedger(input: {
  companyId: number;
  loans: readonly FamilyLoanLedgerAccount[];
  movements: readonly FamilyLoanMovement[];
  asOfDate?: string | null;
}): FamilyLoanLedgerBalance[] {
  if (!validId(input.companyId) ||
      (input.asOfDate != null && !validDate(input.asOfDate))) throw Error('FAMILY_LEDGER_INPUT_INVALID');
  const accounts = new Map<number, FamilyLoanLedgerAccount>();
  for (const loan of input.loans) {
    if (!validId(loan.id) || loan.companyId !== input.companyId || accounts.has(loan.id) ||
        !validId(loan.parentPersonId) || !validId(loan.childPersonId) ||
        loan.parentPersonId === loan.childPersonId ||
        !loan.title.trim() || loan.title.length > 160 ||
        (loan.linkedInnsynLoanId != null && !validId(loan.linkedInnsynLoanId)) ||
        (loan.vehicleEntityId != null && !validId(loan.vehicleEntityId))) {
      throw Error('FAMILY_LEDGER_LOAN_INVALID');
    }
    accounts.set(loan.id, loan);
  }
  const byId = new Map<number, FamilyLoanMovement>();
  const bankClaims = new Set<number>();
  const openingLoans = new Set<number>();
  const reversed = new Set<number>();
  const movementList = [...input.movements].sort((a, b) => a.id - b.id);
  for (const item of movementList) {
    if (!validId(item.id) || byId.has(item.id) || item.companyId !== input.companyId ||
        !accounts.has(item.loanId) || !validMoney(item.amountIsk) ||
        !validId(item.createdByUserId) || !validDate(item.effectiveDate) ||
        !item.note.trim() || item.note.length > 240 ||
        (item.bankTransactionId !== null && !validId(item.bankTransactionId)) ||
        !(['OPENING_BALANCE', 'ADVANCE', 'REPAYMENT', 'REVERSAL'] as string[]).includes(item.kind)) {
      throw Error('FAMILY_LEDGER_MOVEMENT_INVALID');
    }
    if (item.kind === 'OPENING_BALANCE') {
      if (openingLoans.has(item.loanId) || item.bankTransactionId !== null || item.reversalOfId !== null) {
        throw Error('FAMILY_LEDGER_OPENING_INVALID');
      }
      openingLoans.add(item.loanId);
    } else if (item.kind === 'REVERSAL') {
      const original = item.reversalOfId === null ? null : byId.get(item.reversalOfId);
      if (!original || original.kind === 'REVERSAL' || original.loanId !== item.loanId ||
          original.amountIsk !== item.amountIsk || reversed.has(original.id) ||
          item.bankTransactionId !== null || item.effectiveDate < original.effectiveDate) {
        throw Error('FAMILY_LEDGER_REVERSAL_INVALID');
      }
      reversed.add(original.id);
    } else if (item.reversalOfId !== null) {
      throw Error('FAMILY_LEDGER_UNEXPECTED_REVERSAL_REFERENCE');
    }
    if (item.bankTransactionId != null) {
      if (bankClaims.has(item.bankTransactionId)) throw Error('FAMILY_LEDGER_BANK_DOUBLE_COUNT');
      bankClaims.add(item.bankTransactionId);
    }
    byId.set(item.id, item);
  }

  return [...accounts.values()].map(loan => {
    const events = movementList.filter(item => item.loanId === loan.id &&
      (input.asOfDate == null || item.effectiveDate <= input.asOfDate));
    let balance = 0;
    let advanced = 0;
    let repaid = 0;
    const reversedEffect = (item: FamilyLoanMovement): FamilyLoanMovementKind => {
      if (item.kind !== 'REVERSAL') return item.kind;
      const original = byId.get(item.reversalOfId!);
      if (!original) throw Error('FAMILY_LEDGER_REVERSAL_INVALID');
      return original.kind;
    };
    // Apply in accounting effective-date order. A reversal reverses exactly its source.
    events.sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id-b.id);
    for (const entry of events) {
      const kind = reversedEffect(entry);
      const sign = entry.kind === 'REVERSAL' ? -1 : 1;
      const amount = sign * entry.amountIsk;
      if (kind === 'REPAYMENT') {
        repaid = addSafe(repaid, amount);
        balance = addSafe(balance, sign * balanceEffect('REPAYMENT', entry.amountIsk));
      } else {
        advanced = addSafe(advanced, amount);
        balance = addSafe(balance, sign * balanceEffect('ADVANCE', entry.amountIsk));
      }
      // A historical correction can temporarily reduce the balance; final
      // balance remains nonnegative, and all historic reports are reproducible.
    }
    if (balance < 0 || advanced < 0 || repaid < 0) throw Error('FAMILY_LEDGER_NEGATIVE_BALANCE');
    return { loanId: loan.id, childPersonId: loan.childPersonId, title: loan.title,
      outstandingIsk: balance, totalAdvancedIsk: advanced, totalRepaidIsk: repaid,
      movementCount: events.length, asOfDate: input.asOfDate ?? null };
  });
}
