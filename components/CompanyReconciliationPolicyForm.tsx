"use client";

import { useMemo, useState } from "react";

import { updateCompanyReconciliationPolicy } from "@/app/fyrirtaeki/[id]/reconciliation-policy/actions";
import {
  resolveCompanyReconciliationPolicy,
  type CompanyPersonalBusinessUseType,
  type CompanyTaxIdentityType,
} from "@/lib/financial-reconciliation/company-policy";
import { companyReconciliationPolicyText } from "@/lib/i18n/company-reconciliation-policy";

export function CompanyReconciliationPolicyForm({
  company,
  language,
  canManage,
}: {
  company: {
    id: number;
    isActive: boolean;
    taxIdentityType: string;
    personalBusinessUse: string;
    reconciliationCoverageOverride: string | null;
  };
  language: string;
  canManage: boolean;
}) {
  const t = companyReconciliationPolicyText(language);
  const [taxIdentityType, setTaxIdentityType] =
    useState<CompanyTaxIdentityType>(
      company.taxIdentityType === "LEGAL_ENTITY" ||
        company.taxIdentityType === "INDIVIDUAL"
        ? company.taxIdentityType
        : "UNCONFIRMED",
    );
  const [personalBusinessUse, setPersonalBusinessUse] =
    useState<CompanyPersonalBusinessUseType>(
      company.personalBusinessUse === "BUSINESS_ONLY" ||
        company.personalBusinessUse === "MIXED_USE"
        ? company.personalBusinessUse
        : "UNCONFIRMED",
    );
  const [coverageOverride, setCoverageOverride] = useState(
    company.reconciliationCoverageOverride ?? "",
  );

  const policy = useMemo(
    () =>
      resolveCompanyReconciliationPolicy({
        taxIdentityType,
        personalBusinessUse:
          taxIdentityType === "INDIVIDUAL"
            ? personalBusinessUse
            : "UNCONFIRMED",
        reconciliationCoverageOverride: coverageOverride || null,
      }),
    [coverageOverride, personalBusinessUse, taxIdentityType],
  );

  const resolvedLabel =
    policy.mode === "REQUIRED"
      ? t.resolvedRequired
      : policy.mode === "EXCLUDED"
        ? t.resolvedExcluded
        : t.resolvedInformational;
  const sourceLabel =
    policy.source === "OVERRIDE"
      ? t.sourceOverride
      : policy.source === "COMPANY_PROFILE"
        ? t.sourceProfile
        : t.sourceSafeDefault;

  const disabled = !company.isActive || !canManage;

  return (
    <form action={updateCompanyReconciliationPolicy} className="mt-4 space-y-4">
      <input type="hidden" name="companyId" value={company.id} />

      <label className="grid gap-1">
        <span className="font-medium">{t.identityLabel}</span>
        <select
          name="taxIdentityType"
          value={taxIdentityType}
          onChange={(event) =>
            setTaxIdentityType(event.target.value as CompanyTaxIdentityType)
          }
          disabled={disabled}
          className="rounded border p-2"
        >
          <option value="UNCONFIRMED">{t.identityUnconfirmed}</option>
          <option value="LEGAL_ENTITY">{t.identityLegalEntity}</option>
          <option value="INDIVIDUAL">{t.identityIndividual}</option>
        </select>
      </label>

      {taxIdentityType === "INDIVIDUAL" ? (
        <label className="grid gap-1">
          <span className="font-medium">{t.useLabel}</span>
          <select
            name="personalBusinessUse"
            value={personalBusinessUse}
            onChange={(event) =>
              setPersonalBusinessUse(
                event.target.value as CompanyPersonalBusinessUseType,
              )
            }
            disabled={disabled}
            className="rounded border p-2"
          >
            <option value="UNCONFIRMED">{t.useUnconfirmed}</option>
            <option value="BUSINESS_ONLY">{t.useBusinessOnly}</option>
            <option value="MIXED_USE">{t.useMixed}</option>
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="personalBusinessUse" value="UNCONFIRMED" />
          <p className="text-sm text-slate-500">{t.useNotApplicable}</p>
        </>
      )}

      <label className="grid gap-1">
        <span className="font-medium">{t.overrideLabel}</span>
        <select
          name="reconciliationCoverageOverride"
          value={coverageOverride}
          onChange={(event) => setCoverageOverride(event.target.value)}
          disabled={disabled}
          className="rounded border p-2"
        >
          <option value="">{t.overrideAuto}</option>
          <option value="REQUIRED">{t.overrideRequired}</option>
          <option value="INFORMATIONAL">{t.overrideInformational}</option>
          <option value="EXCLUDED">{t.overrideExcluded}</option>
        </select>
        <span className="text-xs text-slate-500">{t.overrideHelp}</span>
      </label>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="font-semibold text-slate-900">
          {t.resolvedLabel}: {resolvedLabel}
        </div>
        <div className="mt-1 text-slate-600">{sourceLabel}</div>
        {policy.allowsPersonalTransactionExclusion ? (
          <div className="mt-2 text-blue-800">{t.mixedUseEnabled}</div>
        ) : null}
      </div>

      {company.isActive && canManage ? (
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          {t.save}
        </button>
      ) : (
        <p className="text-sm text-slate-500">
          {!company.isActive ? t.inactive : t.readOnly}
        </p>
      )}
    </form>
  );
}
