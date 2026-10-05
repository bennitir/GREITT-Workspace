import {
  classifyBankReconciliationFlow,
  type BankReconciliationFlowClassification,
  type BankReconciliationFlowInput,
  type ReconciliationFlowKind,
} from "./flow-kind";

export const BANK_ORIGINATED_PROVIDER_FLOW_KINDS = [
  "BANK_FEE",
  "INTEREST",
] as const satisfies readonly ReconciliationFlowKind[];

export type BankOriginatedProviderFlowKind =
  (typeof BANK_ORIGINATED_PROVIDER_FLOW_KINDS)[number];

export type BankOriginatedProviderInput = BankReconciliationFlowInput & {
  id: number;
  bankAccountId: number;
  date: Date;
  reference: string | null;
};

export type BankOriginatedFlowCandidate = {
  bankTransactionId: number;
  bankAccountId: number;
  bankDate: Date;
  bankText: string;
  bankReference: string | null;
  bankAmount: string;
  flowKind: BankOriginatedProviderFlowKind;
  providerCode:
    | "EXPLICIT_BANK_FEE_TEXT"
    | "EXPLICIT_INTEREST_TEXT";
  evidence: BankReconciliationFlowClassification["evidence"];
  proposedEventType: "CHARGE" | "CREDIT";
  proposedEventAmount: string;
  currency: "ISK";
  resolution: "DETERMINISTIC";
  writeState: "READ_ONLY";
};

export type BankOriginatedFlowProvider = {
  flowKind: BankOriginatedProviderFlowKind;
  buildCandidate: (
    input: BankOriginatedProviderInput,
    classification: BankReconciliationFlowClassification,
  ) => BankOriginatedFlowCandidate | null;
};

type DecimalParts = {
  negative: boolean;
  whole: string;
  fraction: string;
};

function decimalParts(value: string | number): DecimalParts | null {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }

  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return null;

  const fraction = match[3] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;

  const whole = match[2].replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fraction.slice(0, 2).padEnd(2, "0");
  const isZero = whole === "0" && normalizedFraction === "00";
  if (isZero) return null;

  return {
    negative: match[1] === "-",
    whole,
    fraction: normalizedFraction,
  };
}

function decimalString(parts: DecimalParts, negative: boolean) {
  const fraction = parts.fraction === "00" ? "" : `.${parts.fraction}`;
  return `${negative ? "-" : ""}${parts.whole}${fraction}`;
}

function proposedEventFromBankAmount(value: string | number) {
  const parsed = decimalParts(value);
  if (!parsed) return null;

  // Existing FinancialEvent semantics use a positive CHARGE against a negative
  // bank movement and a negative CREDIT against a positive bank movement.
  if (parsed.negative) {
    return {
      eventType: "CHARGE" as const,
      eventAmount: decimalString(parsed, false),
    };
  }

  return {
    eventType: "CREDIT" as const,
    eventAmount: decimalString(parsed, true),
  };
}

function baseCandidate(
  input: BankOriginatedProviderInput,
  classification: BankReconciliationFlowClassification,
  flowKind: BankOriginatedProviderFlowKind,
  providerCode: BankOriginatedFlowCandidate["providerCode"],
): BankOriginatedFlowCandidate | null {
  if (
    classification.resolution !== "DETERMINISTIC" ||
    classification.kind !== flowKind
  ) {
    return null;
  }

  if (!Number.isSafeInteger(input.id) || !Number.isSafeInteger(input.bankAccountId)) {
    return null;
  }

  if (!Number.isFinite(input.date.getTime())) {
    return null;
  }

  const proposedEvent = proposedEventFromBankAmount(input.amount);
  if (!proposedEvent) return null;

  return {
    bankTransactionId: input.id,
    bankAccountId: input.bankAccountId,
    bankDate: input.date,
    bankText: input.text,
    bankReference: input.reference,
    bankAmount: String(input.amount),
    flowKind,
    providerCode,
    evidence: classification.evidence,
    proposedEventType: proposedEvent.eventType,
    proposedEventAmount: proposedEvent.eventAmount,
    currency: "ISK",
    resolution: "DETERMINISTIC",
    writeState: "READ_ONLY",
  };
}

const bankFeeProvider: BankOriginatedFlowProvider = {
  flowKind: "BANK_FEE",
  buildCandidate(input, classification) {
    return baseCandidate(
      input,
      classification,
      "BANK_FEE",
      "EXPLICIT_BANK_FEE_TEXT",
    );
  },
};

const interestProvider: BankOriginatedFlowProvider = {
  flowKind: "INTEREST",
  buildCandidate(input, classification) {
    return baseCandidate(
      input,
      classification,
      "INTEREST",
      "EXPLICIT_INTEREST_TEXT",
    );
  },
};

const providerRegistry = new Map<
  BankOriginatedProviderFlowKind,
  BankOriginatedFlowProvider
>([
  [bankFeeProvider.flowKind, bankFeeProvider],
  [interestProvider.flowKind, interestProvider],
]);

export function getBankOriginatedFlowProvider(
  flowKind: ReconciliationFlowKind,
): BankOriginatedFlowProvider | null {
  if (flowKind !== "BANK_FEE" && flowKind !== "INTEREST") {
    return null;
  }
  return providerRegistry.get(flowKind) ?? null;
}

/**
 * Pure provider entry point.
 *
 * Flow classification happens first. A provider is consulted only for a
 * deterministic flow kind registered above. UNKNOWN and deterministic kinds
 * without a provider fail closed and produce no candidate.
 */
export function buildBankOriginatedFlowCandidate(
  input: BankOriginatedProviderInput,
): BankOriginatedFlowCandidate | null {
  const classification = classifyBankReconciliationFlow(input);
  if (classification.resolution !== "DETERMINISTIC") return null;

  const provider = getBankOriginatedFlowProvider(classification.kind);
  if (!provider) return null;

  return provider.buildCandidate(input, classification);
}
