import { calculatePersonalLedgerSummary, type PersonalEntryKind, type PersonalLedgerInput, type PersonalObligationKind } from "./model";

export type PersonalBankEvidence = {
  bankTransactionId: number;
  amountIsk: number;
  payerCanonicalPartyId: string | null;
  payeeCanonicalPartyId: string | null;
  financialEventId?: number | null;
  canonicalExpenseId?: string | null;
  ownerExplanation?: {
    ownerConfirmed: true;
    description: string;
    purchaseAmountIsk: number | null;
    allocationCertainty: "EXACT" | "ESTIMATED" | "UNKNOWN";
  };
};

export type PersonalTransferExplanation = {
  source: "OWNER_EXPLANATION";
  classification: "ERRAND_REIMBURSEMENT_WITH_POSSIBLE_GIFT";
  description: string;
  purchaseAmountIsk: number | null;
  giftAmountIsk: number | null;
  allocationCertainty: "EXACT" | "ESTIMATED" | "UNKNOWN";
  isPaymentEvidence: false;
  isBookingAuthority: false;
};

export type PersonalSettlementOption = {
  obligationId: string;
  personId: string;
  obligationKind: PersonalObligationKind;
  settlementKind: Extract<PersonalEntryKind, "LOAN_REPAYMENT" | "OUTLAY_REIMBURSEMENT" | "OWNER_REIMBURSEMENT">;
  remainingAmountIsk: number;
};

export type PersonalReconciliationReview = {
  bankTransactionId: number;
  decision: "REVIEW" | "EVIDENCE_ONLY";
  reason:
    | "BANK_TRANSACTION_ALREADY_LINKED"
    | "EXISTING_PERSONAL_SOURCE_EVIDENCE"
    | "PARTIES_UNVERIFIED_OR_UNMATCHED"
    | "TRANSFER_CLASSIFICATION_UNCONFIRMED"
    | "POSSIBLE_OBLIGATION_SETTLEMENT";
  relatedEntryIds: string[];
  settlementOptions: PersonalSettlementOption[];
  ownerExplanation?: PersonalTransferExplanation;
  requiresUserConfirmation: true;
};

function isValidEvidenceId(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0;
}

export function buildOwnerExplanation(
  amountIsk: number,
  input: PersonalBankEvidence["ownerExplanation"],
): PersonalTransferExplanation | undefined {
  if (!input) return undefined;
  if (input.ownerConfirmed !== true || !input.description.trim() || input.description.length > 240) {
    throw new Error("PERSONAL_OWNER_EXPLANATION_INVALID");
  }
  if (input.purchaseAmountIsk === null) {
    if (input.allocationCertainty !== "UNKNOWN") throw new Error("PERSONAL_OWNER_EXPLANATION_ALLOCATION_INVALID");
    return {
      source: "OWNER_EXPLANATION",
      classification: "ERRAND_REIMBURSEMENT_WITH_POSSIBLE_GIFT",
      description: input.description.trim(),
      purchaseAmountIsk: null,
      giftAmountIsk: null,
      allocationCertainty: "UNKNOWN",
      isPaymentEvidence: false,
      isBookingAuthority: false,
    };
  }
  if (!Number.isSafeInteger(input.purchaseAmountIsk) ||
      input.purchaseAmountIsk < 0 ||
      input.purchaseAmountIsk > amountIsk ||
      (input.allocationCertainty !== "EXACT" && input.allocationCertainty !== "ESTIMATED")) {
    throw new Error("PERSONAL_OWNER_EXPLANATION_ALLOCATION_INVALID");
  }
  return {
    source: "OWNER_EXPLANATION",
    classification: "ERRAND_REIMBURSEMENT_WITH_POSSIBLE_GIFT",
    description: input.description.trim(),
    purchaseAmountIsk: input.purchaseAmountIsk,
    giftAmountIsk: amountIsk - input.purchaseAmountIsk,
    allocationCertainty: input.allocationCertainty,
    isPaymentEvidence: false,
    isBookingAuthority: false,
  };
}

/**
 * Produces read-only personal-finance review hints. A party match or event link
 * can narrow the evidence, but only a user-selected obligation can classify a transfer.
 */
export function buildPersonalReconciliationReviews(
  ledger: PersonalLedgerInput,
  bankEvidence: readonly PersonalBankEvidence[],
): PersonalReconciliationReview[] {
  const summary = calculatePersonalLedgerSummary(ledger);
  const reviews: PersonalReconciliationReview[] = [];

  for (const bank of bankEvidence) {
    if (!Number.isSafeInteger(bank.bankTransactionId) || bank.bankTransactionId <= 0 ||
        !Number.isSafeInteger(bank.amountIsk) || bank.amountIsk <= 0) continue;
    const ownerExplanation = buildOwnerExplanation(bank.amountIsk, bank.ownerExplanation);

    const alreadyLinked = ledger.entries.filter(
      (entry) => entry.evidence.bankTransactionId === String(bank.bankTransactionId),
    );
    if (alreadyLinked.length) {
      reviews.push({
        bankTransactionId: bank.bankTransactionId,
        decision: "EVIDENCE_ONLY",
        reason: "BANK_TRANSACTION_ALREADY_LINKED",
        relatedEntryIds: alreadyLinked.map((entry) => entry.id),
        settlementOptions: [],
        ownerExplanation,
        requiresUserConfirmation: true,
      });
      continue;
    }

    const relatedExpenseEntries = ledger.entries.filter((entry) =>
      bank.canonicalExpenseId?.trim() && entry.evidence.canonicalExpenseId === bank.canonicalExpenseId,
    );
    if (relatedExpenseEntries.length) {
      reviews.push({
        bankTransactionId: bank.bankTransactionId,
        decision: "EVIDENCE_ONLY",
        reason: "EXISTING_PERSONAL_SOURCE_EVIDENCE",
        relatedEntryIds: relatedExpenseEntries.map((entry) => entry.id),
        settlementOptions: [],
        ownerExplanation,
        requiresUserConfirmation: true,
      });
      continue;
    }
    const eventRelatedEntries = ledger.entries.filter((entry) =>
      isValidEvidenceId(bank.financialEventId) && entry.evidence.financialEventId === bank.financialEventId,
    );

    const payer = ledger.people.find((person) =>
      person.identityVerified && person.canonicalPartyId === bank.payerCanonicalPartyId,
    );
    const payee = ledger.people.find((person) =>
      person.identityVerified && person.canonicalPartyId === bank.payeeCanonicalPartyId,
    );
    if (!payer || !payee || payer.id === payee.id) {
      reviews.push({
        bankTransactionId: bank.bankTransactionId,
        decision: "REVIEW",
        reason: "PARTIES_UNVERIFIED_OR_UNMATCHED",
        relatedEntryIds: [],
        settlementOptions: [],
        ownerExplanation,
        requiresUserConfirmation: true,
      });
      continue;
    }

    const ownerIsPayer = payer.id === ledger.ownerPersonId;
    const ownerIsPayee = payee.id === ledger.ownerPersonId;
    const person = ownerIsPayer ? payee : ownerIsPayee ? payer : null;
    if (!person) {
      reviews.push({
        bankTransactionId: bank.bankTransactionId,
        decision: "REVIEW",
        reason: "TRANSFER_CLASSIFICATION_UNCONFIRMED",
        relatedEntryIds: [],
        settlementOptions: [],
        ownerExplanation,
        requiresUserConfirmation: true,
      });
      continue;
    }

    const openingEntriesByObligation = new Map(
      ledger.entries
        .filter((entry) => entry.obligationId && (
          entry.kind === "LOAN_DISBURSEMENT" ||
          entry.kind === "REIMBURSABLE_OUTLAY" ||
          entry.kind === "THIRD_PARTY_OUTLAY_FOR_OWNER"
        ))
        .map((entry) => [entry.obligationId!, entry]),
    );
    const settlementOptions = summary.obligations
      .filter((obligation) => {
        if (obligation.personId !== person.id) return false;
        const proposedAmount = ownerExplanation?.purchaseAmountIsk;
        if (ownerExplanation
          ? proposedAmount !== null && proposedAmount !== undefined && proposedAmount > obligation.remainingAmountIsk
          : bank.amountIsk > obligation.remainingAmountIsk) return false;
        if (isValidEvidenceId(bank.financialEventId)) {
          return openingEntriesByObligation.get(obligation.obligationId)?.evidence.financialEventId === bank.financialEventId;
        }
        return true;
      })
      .filter((obligation) => (obligation.kind === "OWNER_PAYABLE_OUTLAY") === ownerIsPayer)
      .map((obligation) => ({
        obligationId: obligation.obligationId,
        personId: obligation.personId,
        obligationKind: obligation.kind,
        settlementKind: obligation.kind === "LOAN"
          ? "LOAN_REPAYMENT" as const
          : obligation.kind === "OWNER_PAYABLE_OUTLAY"
            ? "OWNER_REIMBURSEMENT" as const
            : "OUTLAY_REIMBURSEMENT" as const,
        remainingAmountIsk: obligation.remainingAmountIsk,
      }));

    reviews.push({
      bankTransactionId: bank.bankTransactionId,
      decision: "REVIEW",
      reason: settlementOptions.length ? "POSSIBLE_OBLIGATION_SETTLEMENT" : "TRANSFER_CLASSIFICATION_UNCONFIRMED",
      relatedEntryIds: eventRelatedEntries.map((entry) => entry.id),
      settlementOptions,
      ownerExplanation,
      requiresUserConfirmation: true,
    });
  }

  return reviews;
}
