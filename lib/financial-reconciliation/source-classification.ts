import { classifyBankReconciliationFlow } from "./flow-kind";

export const FINANCIAL_SOURCE_CLASSIFICATIONS = [
  "BUSINESS",
  "PERSONAL",
  "INTERNAL_TRANSFER",
  "NON_DOCUMENT",
  "REVIEW",
] as const;

export type FinancialSourceClassificationCode =
  (typeof FINANCIAL_SOURCE_CLASSIFICATIONS)[number];

export type FinancialSourceClassificationRecord = {
  sourceType: string;
  sourceKey: string;
  classification: FinancialSourceClassificationCode;
};

export function isFinancialSourceClassificationCode(
  value: unknown,
): value is FinancialSourceClassificationCode {
  return FINANCIAL_SOURCE_CLASSIFICATIONS.includes(
    String(value ?? "").trim().toUpperCase() as FinancialSourceClassificationCode,
  );
}

export function classificationExcludesBusinessCoverage(
  classification: FinancialSourceClassificationCode | null | undefined,
) {
  return classification === "PERSONAL";
}

export function classificationExcludesDocumentCoverage(
  classification: FinancialSourceClassificationCode | null | undefined,
) {
  return classification === "PERSONAL" ||
    classification === "INTERNAL_TRANSFER" ||
    classification === "NON_DOCUMENT";
}


export type FinancialSourceClassificationValidationError =
  | "PERSONAL_CLASSIFICATION_REQUIRES_MIXED_USE"
  | "RECONCILED_TRANSACTION_CANNOT_BE_EXCLUDED";

export function validateFinancialSourceClassificationTransition(input: {
  classification: FinancialSourceClassificationCode;
  allowsPersonalTransactionExclusion: boolean;
  hasConfirmedReconciliation: boolean;
}): FinancialSourceClassificationValidationError | null {
  if (
    input.classification === "PERSONAL" &&
    !input.allowsPersonalTransactionExclusion
  ) {
    return "PERSONAL_CLASSIFICATION_REQUIRES_MIXED_USE";
  }
  if (
    classificationExcludesDocumentCoverage(input.classification) &&
    input.hasConfirmedReconciliation
  ) {
    return "RECONCILED_TRANSACTION_CANNOT_BE_EXCLUDED";
  }
  return null;
}

export function normalizeBankClassificationPatternText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LearnedBankClassificationSuggestion = {
  classification: "PERSONAL" | "BUSINESS";
  evidence: "CONFIRMED_EXACT_TEXT_PATTERN";
  confirmationCount: number;
};

/**
 * Builds a read-only suggestion index from user-confirmed history.
 * At least two consistent confirmations are required and any contradictory
 * confirmed classification blocks the suggestion. Nothing is auto-applied.
 */
export function buildBankClassificationSuggestionIndex(
  rows: readonly { text: string; classification: FinancialSourceClassificationCode }[],
  minimumConfirmations = 2,
) {
  const groups = new Map<string, FinancialSourceClassificationCode[]>();
  for (const row of rows) {
    const key = normalizeBankClassificationPatternText(row.text);
    if (!key || row.classification === "REVIEW") continue;
    groups.set(key, [...(groups.get(key) ?? []), row.classification]);
  }

  const result = new Map<string, LearnedBankClassificationSuggestion>();
  for (const [key, classifications] of groups) {
    const unique = new Set(classifications);
    if (unique.size !== 1 || classifications.length < minimumConfirmations) continue;
    const only = classifications[0];
    if (only !== "PERSONAL" && only !== "BUSINESS") continue;
    result.set(key, {
      classification: only,
      evidence: "CONFIRMED_EXACT_TEXT_PATTERN",
      confirmationCount: classifications.length,
    });
  }
  return result;
}

export type BankClassificationSuggestion = {
  classification: FinancialSourceClassificationCode;
  evidence:
    | "EXPLICIT_BANK_FEE_FLOW"
    | "EXPLICIT_INTEREST_FLOW"
    | "EXPLICIT_REVERSAL_FLOW"
    | "EXPLICIT_CARD_ACCOUNT_MOVEMENT";
} | null;

/**
 * Conservative read-only suggestion layer.
 *
 * It only suggests NON_DOCUMENT where the existing deterministic flow
 * classifier has explicit bank evidence. It deliberately never infers
 * PERSONAL from merchant/counterparty text alone and never treats a generic
 * transfer as an internal transfer without own-account evidence.
 */
export function suggestBankTransactionClassification(input: {
  text: string;
  amount: string | number;
  sourceRawData: string | null;
}): BankClassificationSuggestion {
  const flow = classifyBankReconciliationFlow(input);
  switch (flow.kind) {
    case "BANK_FEE":
      return { classification: "NON_DOCUMENT", evidence: "EXPLICIT_BANK_FEE_FLOW" };
    case "INTEREST":
      return { classification: "NON_DOCUMENT", evidence: "EXPLICIT_INTEREST_FLOW" };
    case "REVERSAL":
      return { classification: "NON_DOCUMENT", evidence: "EXPLICIT_REVERSAL_FLOW" };
    case "CARD_ACCOUNT_MOVEMENT":
      return { classification: "NON_DOCUMENT", evidence: "EXPLICIT_CARD_ACCOUNT_MOVEMENT" };
    default:
      return null;
  }
}
