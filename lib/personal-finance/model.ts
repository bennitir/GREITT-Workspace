export type PersonalEntryKind =
  | "LOAN_DISBURSEMENT"
  | "LOAN_REPAYMENT"
  | "REIMBURSABLE_OUTLAY"
  | "OUTLAY_REIMBURSEMENT"
  | "THIRD_PARTY_OUTLAY_FOR_OWNER"
  | "OWNER_REIMBURSEMENT"
  | "GIFT"
  | "PERSONAL_EXPENSE"
  | "INTERNAL_TRANSFER";

export type PersonalObligationKind = "LOAN" | "REIMBURSABLE_OUTLAY" | "OWNER_PAYABLE_OUTLAY";

export type PersonalPerson = {
  id: string;
  name: string;
  canonicalPartyId: string | null;
  identityVerified: boolean;
};

export type PersonalVehicleOwnership = {
  personId: string;
  validFrom: string;
  validUntil: string | null;
};

export type PersonalVehicle = {
  registration: string;
  registrationVerified: boolean;
  ownership: PersonalVehicleOwnership[];
  usePeriods: PersonalVehicleOwnership[];
};

export type PersonalEvidenceReference = {
  bankTransactionId: string | null;
  canonicalExpenseId: string | null;
  financialEventId: number | null;
  reconciliationId: number | null;
  receiptId: number | null;
  receiptLineId: string | null;
  verification: "UNVERIFIED" | "USER_CONFIRMED";
  relationship: "EVIDENCE_ONLY";
};

export type PersonalLedgerEntry = {
  id: string;
  personId: string;
  payerPersonId: string;
  paymentRecipientPersonId: string | null;
  costBeneficiaryPersonId: string;
  date: string;
  kind: PersonalEntryKind;
  amountIsk: number;
  description: string;
  obligationId: string | null;
  vehicleRegistration: string | null;
  evidence: PersonalEvidenceReference;
};

export type PersonalObligationBalance = {
  obligationId: string;
  personId: string;
  kind: PersonalObligationKind;
  originalAmountIsk: number;
  settledAmountIsk: number;
  remainingAmountIsk: number;
};

export type PersonalLedgerSummary = {
  obligations: PersonalObligationBalance[];
  loanBalanceByPerson: Record<string, number>;
  reimbursableBalanceByPerson: Record<string, number>;
  ownerPayableBalanceByPerson: Record<string, number>;
  giftSpendByPerson: Record<string, number>;
  personalExpenseByPerson: Record<string, number>;
  transferVolumeByPerson: Record<string, number>;
  vehicleExpenseByRegistration: Record<string, number>;
};

export type PersonalLedgerInput = {
  ownerPersonId: string;
  people: PersonalPerson[];
  vehicles: PersonalVehicle[];
  entries: PersonalLedgerEntry[];
};

export type PersonalClassification =
  | { decision: "AUTO_CLASSIFIED"; kind: PersonalEntryKind; personId: string }
  | { decision: "REVIEW"; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_KINDS = new Set<PersonalEntryKind>([
  "LOAN_DISBURSEMENT",
  "LOAN_REPAYMENT",
  "REIMBURSABLE_OUTLAY",
  "OUTLAY_REIMBURSEMENT",
  "THIRD_PARTY_OUTLAY_FOR_OWNER",
  "OWNER_REIMBURSEMENT",
  "GIFT",
  "PERSONAL_EXPENSE",
  "INTERNAL_TRANSFER",
]);

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addAmount(target: Record<string, number>, key: string, amount: number): void {
  const next = (target[key] ?? 0) + amount;
  if (!Number.isSafeInteger(next)) throw new Error("PERSONAL_AMOUNT_OVERFLOW");
  target[key] = next;
}

function expectedObligationKind(entryKind: PersonalEntryKind): PersonalObligationKind | null {
  if (entryKind === "LOAN_REPAYMENT") return "LOAN";
  if (entryKind === "OUTLAY_REIMBURSEMENT") return "REIMBURSABLE_OUTLAY";
  if (entryKind === "OWNER_REIMBURSEMENT") return "OWNER_PAYABLE_OUTLAY";
  return null;
}

export function classifyVehicleInvoice(input: {
  ledger: PersonalLedgerInput;
  registration: string;
  date: string;
  canonicalExpenseId: string;
  payerPersonId: string;
  beneficiaryPersonId: string;
  reimbursementIntent: boolean | null;
}): PersonalClassification {
  const { ledger } = input;
  const registration = input.registration.trim().toUpperCase();
  const vehicle = ledger.vehicles.find((item) => item.registration.trim().toUpperCase() === registration);
  const payer = ledger.people.find((person) => person.id === input.payerPersonId);
  const beneficiary = ledger.people.find((person) => person.id === input.beneficiaryPersonId);
  if (!vehicle || !vehicle.registrationVerified || !input.canonicalExpenseId.trim() ||
      !isValidDate(input.date) || !payer?.identityVerified || !beneficiary?.identityVerified) {
    return { decision: "REVIEW", reason: "VEHICLE_INVOICE_IDENTITY_OR_REGISTRATION_UNVERIFIED" };
  }
  if (ledger.entries.some((entry) => entry.evidence.canonicalExpenseId === input.canonicalExpenseId)) {
    return { decision: "REVIEW", reason: "CANONICAL_EXPENSE_ALREADY_RECORDED" };
  }
  const activeAssociation = [...vehicle.ownership, ...vehicle.usePeriods].some((period) =>
    period.personId === beneficiary.id &&
    period.validFrom <= input.date &&
    (period.validUntil === null || input.date <= period.validUntil),
  );
  if (!activeAssociation) {
    return { decision: "REVIEW", reason: "VEHICLE_BENEFICIARY_NOT_ASSOCIATED_ON_DATE" };
  }
  if (input.payerPersonId === input.beneficiaryPersonId) {
    return { decision: "AUTO_CLASSIFIED", kind: "PERSONAL_EXPENSE", personId: beneficiary.id };
  }
  if (input.reimbursementIntent === null) {
    return { decision: "REVIEW", reason: "REIMBURSEMENT_INTENT_UNCONFIRMED" };
  }
  if (!input.reimbursementIntent && input.payerPersonId === ledger.ownerPersonId) {
    return { decision: "AUTO_CLASSIFIED", kind: "GIFT", personId: beneficiary.id };
  }
  if (!input.reimbursementIntent) {
    return { decision: "REVIEW", reason: "NON_REIMBURSABLE_PAYMENT_DIRECTION_REQUIRES_REVIEW" };
  }
  if (input.payerPersonId === ledger.ownerPersonId) {
    return { decision: "AUTO_CLASSIFIED", kind: "REIMBURSABLE_OUTLAY", personId: beneficiary.id };
  }
  if (input.beneficiaryPersonId === ledger.ownerPersonId) {
    return { decision: "AUTO_CLASSIFIED", kind: "THIRD_PARTY_OUTLAY_FOR_OWNER", personId: payer.id };
  }
  return { decision: "REVIEW", reason: "VEHICLE_COST_PAYMENT_DIRECTION_AMBIGUOUS" };
}

export function classifyPersonalSettlement(input: {
  ledger: PersonalLedgerInput;
  bankTransactionId: string;
  obligationId: string | null;
  payerCanonicalPartyId: string;
  payeeCanonicalPartyId: string;
  amountIsk: number;
}): PersonalClassification {
  const review = (reason: string): PersonalClassification => ({ decision: "REVIEW", reason });
  if (!input.obligationId || !Number.isSafeInteger(input.amountIsk) || input.amountIsk <= 0) {
    return review("SETTLEMENT_REQUIRES_EXPLICIT_OBLIGATION_AND_VALID_AMOUNT");
  }
  if (!input.bankTransactionId.trim() ||
      input.ledger.entries.some((entry) => entry.evidence.bankTransactionId === input.bankTransactionId)) {
    return review("SETTLEMENT_TRANSACTION_MISSING_OR_ALREADY_LINKED");
  }
  const summary = calculatePersonalLedgerSummary(input.ledger);
  const obligation = summary.obligations.find((item) => item.obligationId === input.obligationId);
  if (!obligation || input.amountIsk > obligation.remainingAmountIsk) {
    return review("SETTLEMENT_OBLIGATION_MISSING_OR_AMOUNT_EXCEEDS_BALANCE");
  }
  const owner = input.ledger.people.find((person) => person.id === input.ledger.ownerPersonId);
  const counterparty = input.ledger.people.find((person) => person.id === obligation.personId);
  if (!owner?.identityVerified || !counterparty?.identityVerified ||
      (owner.canonicalPartyId !== input.payerCanonicalPartyId &&
        owner.canonicalPartyId !== input.payeeCanonicalPartyId) ||
      (counterparty.canonicalPartyId !== input.payerCanonicalPartyId &&
        counterparty.canonicalPartyId !== input.payeeCanonicalPartyId)) {
    return review("SETTLEMENT_PARTIES_UNVERIFIED_OR_MISMATCHED");
  }
  const expectedPayer = obligation.kind === "OWNER_PAYABLE_OUTLAY" ? owner : counterparty;
  const expectedPayee = obligation.kind === "OWNER_PAYABLE_OUTLAY" ? counterparty : owner;
  if (expectedPayer.canonicalPartyId !== input.payerCanonicalPartyId ||
      expectedPayee.canonicalPartyId !== input.payeeCanonicalPartyId) {
    return review("SETTLEMENT_DIRECTION_MISMATCH");
  }
  const kind: PersonalEntryKind = obligation.kind === "LOAN"
    ? "LOAN_REPAYMENT"
    : obligation.kind === "OWNER_PAYABLE_OUTLAY"
      ? "OWNER_REIMBURSEMENT"
      : "OUTLAY_REIMBURSEMENT";
  return { decision: "AUTO_CLASSIFIED", kind, personId: obligation.personId };
}

export function calculatePersonalLedgerSummary(input: PersonalLedgerInput): PersonalLedgerSummary {
  const peopleById = new Map<string, PersonalPerson>();
  const canonicalPartyIds = new Set<string>();
  for (const person of input.people) {
    if (!person.id || peopleById.has(person.id) ||
        typeof person.identityVerified !== "boolean" ||
        (person.canonicalPartyId !== null && !person.canonicalPartyId.trim()) ||
        (person.identityVerified && (!person.canonicalPartyId || canonicalPartyIds.has(person.canonicalPartyId)))) {
      throw new Error("PERSONAL_PERSON_ID_INVALID");
    }
    if (person.identityVerified && person.canonicalPartyId) canonicalPartyIds.add(person.canonicalPartyId);
    peopleById.set(person.id, person);
  }
  if (!peopleById.has(input.ownerPersonId)) throw new Error("PERSONAL_OWNER_NOT_FOUND");

  const vehiclesByRegistration = new Map<string, PersonalVehicle>();
  for (const vehicle of input.vehicles) {
    const registration = vehicle.registration.trim().toUpperCase();
    if (!registration || vehiclesByRegistration.has(registration)) {
      throw new Error("PERSONAL_VEHICLE_REGISTRATION_INVALID");
    }
    if (typeof vehicle.registrationVerified !== "boolean") {
      throw new Error("PERSONAL_VEHICLE_REGISTRATION_INVALID");
    }
    vehiclesByRegistration.set(registration, vehicle);

    for (const [relationship, source] of [
      ["OWNERSHIP", vehicle.ownership],
      ["USE", vehicle.usePeriods],
    ] as const) {
      const periods = [...source].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      for (let index = 0; index < periods.length; index += 1) {
        const period = periods[index];
        if (!peopleById.has(period.personId) || !isValidDate(period.validFrom) ||
            (period.validUntil !== null && (!isValidDate(period.validUntil) || period.validUntil < period.validFrom))) {
          throw new Error(`PERSONAL_VEHICLE_${relationship}_INVALID`);
        }
        const next = periods[index + 1];
        if (relationship === "OWNERSHIP" && next &&
            (period.validUntil === null || next.validFrom <= period.validUntil)) {
          throw new Error(`PERSONAL_VEHICLE_${relationship}_OVERLAP`);
        }
      }
    }
  }

  const obligations = new Map<string, PersonalObligationBalance>();
  const seenEntryIds = new Set<string>();
  const seenCanonicalExpenses = new Set<string>();
  const seenReceiptLines = new Set<string>();
  const costBankTransactionIds = new Set<string>();
  const settlementBankTransactionIds = new Set<string>();
  const loanBalanceByPerson: Record<string, number> = Object.create(null);
  const reimbursableBalanceByPerson: Record<string, number> = Object.create(null);
  const ownerPayableBalanceByPerson: Record<string, number> = Object.create(null);
  const giftSpendByPerson: Record<string, number> = Object.create(null);
  const personalExpenseByPerson: Record<string, number> = Object.create(null);
  const transferVolumeByPerson: Record<string, number> = Object.create(null);
  const vehicleExpenseByRegistration: Record<string, number> = Object.create(null);
  const orderedEntries = [...input.entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

  for (const entry of orderedEntries) {
    if (!entry.id || seenEntryIds.has(entry.id)) throw new Error("PERSONAL_ENTRY_ID_INVALID");
    seenEntryIds.add(entry.id);
    if (!ENTRY_KINDS.has(entry.kind)) throw new Error("PERSONAL_ENTRY_KIND_INVALID");
    if (!peopleById.has(entry.personId) ||
        !peopleById.has(entry.payerPersonId) ||
        (entry.paymentRecipientPersonId !== null && !peopleById.has(entry.paymentRecipientPersonId)) ||
        !peopleById.has(entry.costBeneficiaryPersonId)) {
      throw new Error("PERSONAL_ENTRY_PERSON_NOT_FOUND");
    }
    if (!isValidDate(entry.date)) throw new Error("PERSONAL_ENTRY_DATE_INVALID");
    if (!entry.description.trim() || entry.description.length > 240) {
      throw new Error("PERSONAL_ENTRY_DESCRIPTION_INVALID");
    }
    if (!Number.isSafeInteger(entry.amountIsk) || entry.amountIsk <= 0) {
      throw new Error("PERSONAL_ENTRY_AMOUNT_INVALID");
    }
    if (entry.evidence.relationship !== "EVIDENCE_ONLY") {
      throw new Error("PERSONAL_EVIDENCE_MUST_BE_REFERENCE_ONLY");
    }
    if ((entry.evidence.canonicalExpenseId !== null &&
          (!entry.evidence.canonicalExpenseId.trim() || entry.evidence.canonicalExpenseId.length > 200)) ||
        (entry.evidence.bankTransactionId !== null && !entry.evidence.bankTransactionId.trim()) ||
        (entry.evidence.receiptId !== null &&
          (!Number.isSafeInteger(entry.evidence.receiptId) || entry.evidence.receiptId <= 0)) ||
        (entry.evidence.receiptLineId !== null &&
          (!entry.evidence.receiptLineId.trim() || entry.evidence.receiptLineId.length > 200)) ||
        (entry.evidence.receiptLineId !== null && entry.evidence.receiptId === null) ||
        (entry.evidence.receiptId !== null && entry.evidence.receiptLineId === null)) {
      throw new Error("PERSONAL_EXPENSE_REFERENCE_INVALID");
    }

    const expectedParties: Partial<Record<PersonalEntryKind, [string, string]>> = {
      LOAN_DISBURSEMENT: [input.ownerPersonId, entry.personId],
      LOAN_REPAYMENT: [entry.personId, entry.personId],
      REIMBURSABLE_OUTLAY: [input.ownerPersonId, entry.personId],
      OUTLAY_REIMBURSEMENT: [entry.personId, entry.personId],
      THIRD_PARTY_OUTLAY_FOR_OWNER: [entry.personId, input.ownerPersonId],
      OWNER_REIMBURSEMENT: [input.ownerPersonId, entry.personId],
      GIFT: [input.ownerPersonId, entry.personId],
      PERSONAL_EXPENSE: [entry.personId, entry.personId],
    };
    const expected = expectedParties[entry.kind];
    if (expected && (entry.payerPersonId !== expected[0] || entry.costBeneficiaryPersonId !== expected[1])) {
      throw new Error("PERSONAL_ENTRY_PARTIES_INVALID");
    }
    const expectedRecipient: Record<PersonalEntryKind, string | null> = {
      LOAN_DISBURSEMENT: entry.personId,
      LOAN_REPAYMENT: input.ownerPersonId,
      REIMBURSABLE_OUTLAY: null,
      OUTLAY_REIMBURSEMENT: input.ownerPersonId,
      THIRD_PARTY_OUTLAY_FOR_OWNER: null,
      OWNER_REIMBURSEMENT: entry.personId,
      GIFT: entry.personId,
      PERSONAL_EXPENSE: null,
      INTERNAL_TRANSFER: entry.personId,
    };
    if (entry.paymentRecipientPersonId !== expectedRecipient[entry.kind]) {
      throw new Error("PERSONAL_ENTRY_RECIPIENT_INVALID");
    }

    const vehicleRegistration = entry.vehicleRegistration?.trim().toUpperCase() ?? null;
    const isCost = entry.kind === "PERSONAL_EXPENSE" ||
      entry.kind === "REIMBURSABLE_OUTLAY" ||
      entry.kind === "THIRD_PARTY_OUTLAY_FOR_OWNER";
    if (vehicleRegistration && !isCost) {
      throw new Error("PERSONAL_VEHICLE_LINK_KIND_INVALID");
    }
    if (vehicleRegistration) {
      const vehicle = vehiclesByRegistration.get(vehicleRegistration);
      const associatedBeneficiary = vehicle &&
        [...vehicle.ownership, ...vehicle.usePeriods].some((period) =>
          period.personId === entry.costBeneficiaryPersonId &&
          period.validFrom <= entry.date &&
          (period.validUntil === null || entry.date <= period.validUntil),
        );
      if (!vehicle || !associatedBeneficiary) {
        throw new Error("PERSONAL_VEHICLE_ASSOCIATION_INVALID");
      }
    }

    if (isCost) {
      const canonicalExpenseId = entry.evidence.canonicalExpenseId;
      const receiptLineId = entry.evidence.receiptId === null || entry.evidence.receiptLineId === null
        ? null
        : `${entry.evidence.receiptId}:${entry.evidence.receiptLineId}`;
      if (canonicalExpenseId && seenCanonicalExpenses.has(canonicalExpenseId)) {
        throw new Error("PERSONAL_EXPENSE_DUPLICATED");
      }
      if (receiptLineId && seenReceiptLines.has(receiptLineId)) {
        throw new Error("PERSONAL_RECEIPT_LINE_DUPLICATED");
      }
      if (canonicalExpenseId) seenCanonicalExpenses.add(canonicalExpenseId);
      if (receiptLineId) seenReceiptLines.add(receiptLineId);
      if (entry.evidence.bankTransactionId) costBankTransactionIds.add(entry.evidence.bankTransactionId);
      addAmount(personalExpenseByPerson, entry.costBeneficiaryPersonId, entry.amountIsk);
      if (vehicleRegistration) addAmount(vehicleExpenseByRegistration, vehicleRegistration, entry.amountIsk);
    }

    if (entry.kind === "LOAN_DISBURSEMENT" ||
        entry.kind === "REIMBURSABLE_OUTLAY" ||
        entry.kind === "THIRD_PARTY_OUTLAY_FOR_OWNER") {
      if (!entry.obligationId || obligations.has(entry.obligationId)) {
        throw new Error("PERSONAL_OBLIGATION_ID_INVALID");
      }
      const kind: PersonalObligationKind = entry.kind === "LOAN_DISBURSEMENT"
        ? "LOAN"
        : entry.kind === "THIRD_PARTY_OUTLAY_FOR_OWNER"
          ? "OWNER_PAYABLE_OUTLAY"
          : "REIMBURSABLE_OUTLAY";
      obligations.set(entry.obligationId, {
        obligationId: entry.obligationId,
        personId: entry.personId,
        kind,
        originalAmountIsk: entry.amountIsk,
        settledAmountIsk: 0,
        remainingAmountIsk: entry.amountIsk,
      });
      continue;
    }

    const obligationKind = expectedObligationKind(entry.kind);
    if (obligationKind) {
      if (!entry.obligationId) throw new Error("PERSONAL_OBLIGATION_REQUIRED");
      const obligation = obligations.get(entry.obligationId);
      if (!obligation || obligation.personId !== entry.personId || obligation.kind !== obligationKind) {
        throw new Error("PERSONAL_OBLIGATION_REFERENCE_INVALID");
      }
      if (entry.amountIsk > obligation.remainingAmountIsk) {
        throw new Error("PERSONAL_SETTLEMENT_EXCEEDS_BALANCE");
      }
      if (entry.evidence.bankTransactionId) {
        if (settlementBankTransactionIds.has(entry.evidence.bankTransactionId)) {
          throw new Error("PERSONAL_SETTLEMENT_TRANSACTION_DUPLICATED");
        }
        settlementBankTransactionIds.add(entry.evidence.bankTransactionId);
      }
      obligation.settledAmountIsk += entry.amountIsk;
      obligation.remainingAmountIsk -= entry.amountIsk;
      continue;
    }

    if (entry.obligationId) throw new Error("PERSONAL_UNEXPECTED_OBLIGATION");
    switch (entry.kind) {
      case "GIFT":
        addAmount(giftSpendByPerson, entry.personId, entry.amountIsk);
        break;
      case "PERSONAL_EXPENSE":
        break;
      case "INTERNAL_TRANSFER":
        addAmount(transferVolumeByPerson, entry.personId, entry.amountIsk);
        break;
    }
  }

  if ([...costBankTransactionIds].some((id) => settlementBankTransactionIds.has(id))) {
    throw new Error("PERSONAL_BANK_TRANSACTION_DOUBLE_COUNTED");
  }

  const obligationList = [...obligations.values()];
  for (const obligation of obligationList) {
    const target = obligation.kind === "LOAN"
      ? loanBalanceByPerson
      : obligation.kind === "OWNER_PAYABLE_OUTLAY"
        ? ownerPayableBalanceByPerson
        : reimbursableBalanceByPerson;
    addAmount(target, obligation.personId, obligation.remainingAmountIsk);
  }

  return {
    obligations: obligationList,
    loanBalanceByPerson,
    reimbursableBalanceByPerson,
    ownerPayableBalanceByPerson,
    giftSpendByPerson,
    personalExpenseByPerson,
    transferVolumeByPerson,
    vehicleExpenseByRegistration,
  };
}
