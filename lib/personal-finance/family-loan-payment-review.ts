/**
 * GLÖGGT personal-finance: read-only verification of a parent's payment to an
 * external lender for a child's obligation (including a vehicle loan).
 *
 * This is intentionally NOT a booking/reconciliation/loan-balance writer.
 * The external lender's balance and any debt from child to parent are distinct.
 * Only explicit owner allocations can establish a proposed family receivable.
 */
export type FamilyLoanPaymentReviewInput = {
  companyId: number;
  bankTransactionId: number;
  bankAccountId: number;
  date: string; // YYYY-MM-DD; original bank date
  signedBankAmountIsk: number; // debit is negative, whole ISK
  bankPayeeCanonicalPartyId: string | null;
  payerPersonId: string;
  ownerPersonId: string;
  childPersonId: string;
  loan: {
    canonicalObligationId: string;
    lenderCanonicalPartyId: string;
    borrowerPersonId: string;
    contractIdentityVerified: boolean;
    vehicleRegistration: string | null;
    vehicleAssociationVerified: boolean;
    /** Exact outstanding according to a verified lender statement, NOT inferred. */
    lenderStatement: {
      verified: boolean;
      asOfDate: string;
      outstandingPrincipalIsk: number;
    } | null;
  };
  /** From a checked installment statement: principal, interest and fees paid.
   * Indexation paid is separate; do not silently infer capitalized indexation.
   * When not documented, assign those kroner to `unexplainedIsk`.
   */
  breakdown: {
    principalIsk: number;
    interestIsk: number;
    paidIndexationIsk: number;
    feesIsk: number;
    unexplainedIsk: number;
    sourceVerified: boolean;
  };
  /** Owner's explicit decision about parent-to-child accounting, independently
   * from the bank-loan amortization. An unknown intent stays unresolved.
   */
  familyAllocation: {
    childOwesParentIsk: number;
    giftIsk: number;
    unresolvedIsk: number;
    ownerConfirmed: boolean;
  };
  /** Caller must populate from company-scoped BankAllocationClaim/related links. */
  alreadyClaimedBankTransactionIds: readonly number[];
};

export type FamilyLoanPaymentReviewReason =
  | 'INVALID_INPUT'
  | 'BANK_MOVEMENT_ALREADY_CLAIMED'
  | 'BANK_PAYEE_NOT_VERIFIED'
  | 'LOAN_IDENTITY_NOT_VERIFIED'
  | 'CHILD_NOT_CONFIRMED_BORROWER'
  | 'PARENT_PAYMENT_NOT_VERIFIED'
  | 'VEHICLE_ASSOCIATION_NOT_VERIFIED'
  | 'PAYMENT_BREAKDOWN_UNVERIFIED'
  | 'PAYMENT_COMPONENTS_UNEXPLAINED'
  | 'FAMILY_ALLOCATION_UNCONFIRMED'
  | 'FAMILY_ALLOCATION_UNRESOLVED';

export type FamilyLoanPaymentReview = {
  status: 'READY_FOR_HUMAN_CONFIRMATION' | 'REVIEW_REQUIRED';
  bankTransactionId: number;
  canonicalObligationId: string;
  vehicleRegistration: string | null;
  paidToLenderIsk: number;
  loanPayment: {
    principalIsk: number;
    interestIsk: number;
    paidIndexationIsk: number;
    feesIsk: number;
    unexplainedIsk: number;
  };
  /** Proposed new debt of child to parent, never confused with lender balance. */
  family: { childOwesParentIsk: number; giftIsk: number; unresolvedIsk: number };
  lenderBalance: { asOfDate: string; outstandingPrincipalIsk: number } | null;
  reasons: FamilyLoanPaymentReviewReason[];
  /** Even 'ready' means no persistence without action authorization & DB recheck. */
  requiresUserConfirmation: true;
  createsAccountingEntry: false;
  writesDatabase: false;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const dt = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(dt.valueOf()) && dt.toISOString().slice(0, 10) === value;
}
function isk(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function nonBlank(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Pure: no Prisma, side effects, or AI. Always fails closed on missing evidence. */
export function reviewFamilyLoanPayment(input: FamilyLoanPaymentReviewInput): FamilyLoanPaymentReview {
  const reasons: FamilyLoanPaymentReviewReason[] = [];
  const add = (reason: FamilyLoanPaymentReviewReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const { breakdown, familyAllocation: family, loan } = input;
  const total = -input.signedBankAmountIsk;
  const components = [breakdown.principalIsk, breakdown.interestIsk,
    breakdown.paidIndexationIsk, breakdown.feesIsk, breakdown.unexplainedIsk];
  const allocations = [family.childOwesParentIsk, family.giftIsk, family.unresolvedIsk];

  if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0 ||
      !Number.isSafeInteger(input.bankAccountId) || input.bankAccountId <= 0 ||
      !Number.isSafeInteger(input.bankTransactionId) || input.bankTransactionId <= 0 ||
      !validDate(input.date) || !Number.isSafeInteger(total) || total <= 0 ||
      !nonBlank(input.ownerPersonId) || !nonBlank(input.childPersonId) ||
      !nonBlank(input.payerPersonId) || input.ownerPersonId === input.childPersonId ||
      !nonBlank(loan.canonicalObligationId) || !nonBlank(loan.lenderCanonicalPartyId) ||
      !nonBlank(loan.borrowerPersonId) || components.some(n => !isk(n)) ||
      allocations.some(n => !isk(n)) ||
      !Number.isSafeInteger(components.reduce((a, b) => a + b, 0)) ||
      !Number.isSafeInteger(allocations.reduce((a, b) => a + b, 0)) ||
      components.reduce((a, b) => a + b, 0) !== total ||
      allocations.reduce((a, b) => a + b, 0) !== total ||
      !Array.isArray(input.alreadyClaimedBankTransactionIds)) add('INVALID_INPUT');

  if (input.alreadyClaimedBankTransactionIds?.includes(input.bankTransactionId)) {
    add('BANK_MOVEMENT_ALREADY_CLAIMED');
  }
  if (!nonBlank(input.bankPayeeCanonicalPartyId) ||
      input.bankPayeeCanonicalPartyId !== loan.lenderCanonicalPartyId) {
    add('BANK_PAYEE_NOT_VERIFIED');
  }
  if (!loan.contractIdentityVerified) add('LOAN_IDENTITY_NOT_VERIFIED');
  if (loan.borrowerPersonId !== input.childPersonId) add('CHILD_NOT_CONFIRMED_BORROWER');
  if (input.payerPersonId !== input.ownerPersonId) add('PARENT_PAYMENT_NOT_VERIFIED');
  if (loan.vehicleRegistration !== null &&
      (!nonBlank(loan.vehicleRegistration) || !loan.vehicleAssociationVerified)) {
    add('VEHICLE_ASSOCIATION_NOT_VERIFIED');
  }
  if (!breakdown.sourceVerified) add('PAYMENT_BREAKDOWN_UNVERIFIED');
  if (breakdown.unexplainedIsk > 0) add('PAYMENT_COMPONENTS_UNEXPLAINED');
  if (!family.ownerConfirmed) add('FAMILY_ALLOCATION_UNCONFIRMED');
  if (family.unresolvedIsk > 0) add('FAMILY_ALLOCATION_UNRESOLVED');

  const statement = loan.lenderStatement;
  const validStatement = statement !== null && statement.verified === true &&
    validDate(statement.asOfDate) && isk(statement.outstandingPrincipalIsk);
  if (statement !== null && !validStatement) add('INVALID_INPUT');

  return {
    status: reasons.length === 0 ? 'READY_FOR_HUMAN_CONFIRMATION' : 'REVIEW_REQUIRED',
    bankTransactionId: input.bankTransactionId,
    canonicalObligationId: loan.canonicalObligationId,
    vehicleRegistration: loan.vehicleRegistration?.trim().toUpperCase() ?? null,
    paidToLenderIsk: Number.isSafeInteger(total) && total > 0 ? total : 0,
    loanPayment: {
      principalIsk: breakdown.principalIsk,
      interestIsk: breakdown.interestIsk,
      paidIndexationIsk: breakdown.paidIndexationIsk,
      feesIsk: breakdown.feesIsk,
      unexplainedIsk: breakdown.unexplainedIsk,
    },
    // No child debt/gift can be *proposed as confirmed* until owner confirms.
    family: family.ownerConfirmed ? {
      childOwesParentIsk: family.childOwesParentIsk,
      giftIsk: family.giftIsk,
      unresolvedIsk: family.unresolvedIsk,
    } : { childOwesParentIsk: 0, giftIsk: 0, unresolvedIsk: total > 0 ? total : 0 },
    lenderBalance: validStatement ? {
      asOfDate: statement.asOfDate,
      outstandingPrincipalIsk: statement.outstandingPrincipalIsk,
    } : null,
    reasons,
    requiresUserConfirmation: true,
    createsAccountingEntry: false,
    writesDatabase: false,
  };
}
