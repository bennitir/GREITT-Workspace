import type { ReconciliationCoverageMode } from "./coverage";

export const COMPANY_TAX_IDENTITY_TYPES = [
  "UNCONFIRMED",
  "LEGAL_ENTITY",
  "INDIVIDUAL",
] as const;
export type CompanyTaxIdentityType =
  (typeof COMPANY_TAX_IDENTITY_TYPES)[number];

export const COMPANY_PERSONAL_BUSINESS_USE_TYPES = [
  "UNCONFIRMED",
  "BUSINESS_ONLY",
  "MIXED_USE",
] as const;
export type CompanyPersonalBusinessUseType =
  (typeof COMPANY_PERSONAL_BUSINESS_USE_TYPES)[number];

export type CompanyReconciliationPolicyInput = {
  taxIdentityType?: string | null;
  personalBusinessUse?: string | null;
  reconciliationCoverageOverride?: string | null;
};

export type CompanyReconciliationPolicy = {
  mode: ReconciliationCoverageMode;
  source: "OVERRIDE" | "COMPANY_PROFILE" | "SAFE_DEFAULT";
  context:
    | "LEGAL_ENTITY_BUSINESS"
    | "INDIVIDUAL_BUSINESS"
    | "INDIVIDUAL_MIXED_USE"
    | "UNCONFIRMED";
  taxIdentityType: CompanyTaxIdentityType;
  personalBusinessUse: CompanyPersonalBusinessUseType;
  allowsPersonalTransactionExclusion: boolean;
  isMixedUse: boolean;
};

export function isCompanyTaxIdentityType(
  value: string,
): value is CompanyTaxIdentityType {
  return (COMPANY_TAX_IDENTITY_TYPES as readonly string[]).includes(value);
}

export function isCompanyPersonalBusinessUseType(
  value: string,
): value is CompanyPersonalBusinessUseType {
  return (COMPANY_PERSONAL_BUSINESS_USE_TYPES as readonly string[]).includes(value);
}

export function isReconciliationCoverageMode(
  value: string,
): value is ReconciliationCoverageMode {
  return ["REQUIRED", "INFORMATIONAL", "EXCLUDED"].includes(value);
}

function normalizedTaxIdentityType(
  value: string | null | undefined,
): CompanyTaxIdentityType {
  const normalized = String(value ?? "").trim().toUpperCase();
  return isCompanyTaxIdentityType(normalized)
    ? normalized
    : "UNCONFIRMED";
}

function normalizedPersonalBusinessUse(
  value: string | null | undefined,
): CompanyPersonalBusinessUseType {
  const normalized = String(value ?? "").trim().toUpperCase();
  return isCompanyPersonalBusinessUseType(normalized)
    ? normalized
    : "UNCONFIRMED";
}

/**
 * Resolve the dataset-level reconciliation policy from explicit Company data.
 *
 * Fail-closed rule: this function never infers whether a kennitala belongs to
 * an individual, whether card/bank use is private, or whether documents are
 * required. Unknown/legacy data therefore stays INFORMATIONAL until a user has
 * explicitly confirmed the company context.
 */
export function resolveCompanyReconciliationPolicy(
  input: CompanyReconciliationPolicyInput,
): CompanyReconciliationPolicy {
  const taxIdentityType = normalizedTaxIdentityType(input.taxIdentityType);
  const personalBusinessUse = normalizedPersonalBusinessUse(
    input.personalBusinessUse,
  );
  const override = String(
    input.reconciliationCoverageOverride ?? "",
  )
    .trim()
    .toUpperCase();

  const isMixedUse =
    taxIdentityType === "INDIVIDUAL" &&
    personalBusinessUse === "MIXED_USE";
  const allowsPersonalTransactionExclusion = isMixedUse;

  let context: CompanyReconciliationPolicy["context"] = "UNCONFIRMED";
  let derivedMode: ReconciliationCoverageMode = "INFORMATIONAL";

  if (taxIdentityType === "LEGAL_ENTITY") {
    context = "LEGAL_ENTITY_BUSINESS";
    derivedMode = "REQUIRED";
  } else if (
    taxIdentityType === "INDIVIDUAL" &&
    personalBusinessUse === "BUSINESS_ONLY"
  ) {
    context = "INDIVIDUAL_BUSINESS";
    derivedMode = "REQUIRED";
  } else if (isMixedUse) {
    context = "INDIVIDUAL_MIXED_USE";
    derivedMode = "INFORMATIONAL";
  }

  if (isReconciliationCoverageMode(override)) {
    return {
      mode: override,
      source: "OVERRIDE",
      context,
      taxIdentityType,
      personalBusinessUse,
      allowsPersonalTransactionExclusion,
      isMixedUse,
    };
  }

  return {
    mode: derivedMode,
    source: context === "UNCONFIRMED" ? "SAFE_DEFAULT" : "COMPANY_PROFILE",
    context,
    taxIdentityType,
    personalBusinessUse,
    allowsPersonalTransactionExclusion,
    isMixedUse,
  };
}
