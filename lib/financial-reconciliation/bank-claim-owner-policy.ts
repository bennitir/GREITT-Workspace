/**
 * Sameiginlegt auðkenni eiganda bankahreyfingar: tillaga að framtíðarsamningi.
 * Ekki tengt við runtime eða skrifheimildir í þessari útgáfu.
 *
 * A confirmed FINANCIAL_EVENT payment has TWO representations today:
 *   FinancialEventPayment AND FinancialReconciliationParticipant.
 * Both must resolve to the SAME owner, not two competing allocations.
 * An EVENT_PAYMENT_LEDGER owner can have multiple payment rows, subject to
 * a separate DATABASE-side exact numeric cap against abs(BankTransaction.amount).
 */
export type BankClaimFamily = 'EVENT_PAYMENT_LEDGER' | 'RECONCILIATION' | 'FAMILY_LEDGER';

export type CanonicalBankClaim = Readonly<{
  companyId: number;
  bankTransactionId: number;
  kind: 'ORDINARY' | 'FAMILY';
  family: BankClaimFamily;
  ownerKey: string;
}>;

function id(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVALID_CLAIM_ID');
  return value;
}

/** Always classify PAYMENT and matching BANK_TO_FINANCIAL_EVENT reconciliation alike. */
export function claimForFinancialEventPayment(companyId: number, bankTransactionId: number): CanonicalBankClaim {
  id(companyId); id(bankTransactionId);
  return { companyId, bankTransactionId, kind: 'ORDINARY',
    family: 'EVENT_PAYMENT_LEDGER', ownerKey: String(bankTransactionId) };
}

export function claimForReconciliation(input: {
  companyId: number; bankTransactionId: number; reconciliationId: number;
  reconciliationType: string;
}): CanonicalBankClaim {
  id(input.companyId); id(input.bankTransactionId); id(input.reconciliationId);
  if (!input.reconciliationType || input.reconciliationType.length > 128) throw new Error('INVALID_CLAIM_ROUTE');
  if (input.reconciliationType === 'BANK_TO_FINANCIAL_EVENT') {
    return claimForFinancialEventPayment(input.companyId, input.bankTransactionId);
  }
  return { companyId: input.companyId, bankTransactionId: input.bankTransactionId,
    kind: 'ORDINARY', family: 'RECONCILIATION', ownerKey: String(input.reconciliationId) };
}

/** Future family ledger: not active in the Production schema. */
export function claimForFamilyLedger(companyId: number, bankTransactionId: number): CanonicalBankClaim {
  id(companyId); id(bankTransactionId);
  return { companyId, bankTransactionId, kind: 'FAMILY',
    family: 'FAMILY_LEDGER', ownerKey: String(bankTransactionId) };
}

/** Idempotence only. Different owners MUST NOT share a bank movement. */
export function identicalBankClaim(a: CanonicalBankClaim, b: CanonicalBankClaim): boolean {
  return a.companyId === b.companyId && a.bankTransactionId === b.bankTransactionId &&
    a.kind === b.kind && a.family === b.family && a.ownerKey === b.ownerKey;
}
