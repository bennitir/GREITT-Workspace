"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCompanyAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import {
  isCompanyPersonalBusinessUseType,
  isCompanyTaxIdentityType,
  isReconciliationCoverageMode,
} from "@/lib/financial-reconciliation/company-policy";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { companyReconciliationPolicyText } from "@/lib/i18n/company-reconciliation-policy";
import { prisma } from "@/lib/prisma";

export async function updateCompanyReconciliationPolicy(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const language = await getCurrentInterfaceLanguage();
  const t = companyReconciliationPolicyText(language);

  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error(t.errors.invalidCompany);
  }

  const [user, access, company] = await Promise.all([
    getEffectiveUser(),
    getCompanyAccess(companyId),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        isActive: true,
        taxIdentityType: true,
        personalBusinessUse: true,
        reconciliationCoverageOverride: true,
      },
    }),
  ]);

  if (!user || !company || !access.allowed || !access.canManageCompanySettings) {
    throw new Error(t.errors.noAccess);
  }
  if (!company.isActive) {
    throw new Error(t.errors.inactiveCompany);
  }

  const taxIdentityType = String(
    formData.get("taxIdentityType") ?? "",
  )
    .trim()
    .toUpperCase();
  if (!isCompanyTaxIdentityType(taxIdentityType)) {
    throw new Error(t.errors.invalidIdentity);
  }

  let personalBusinessUse = String(
    formData.get("personalBusinessUse") ?? "",
  )
    .trim()
    .toUpperCase();
  if (!isCompanyPersonalBusinessUseType(personalBusinessUse)) {
    throw new Error(t.errors.invalidUse);
  }

  // Mixed/private context only has meaning when the tax identity is an
  // individual. Clear stale values when switching back to a legal entity.
  if (taxIdentityType !== "INDIVIDUAL") {
    personalBusinessUse = "UNCONFIRMED";
  }

  const rawOverride = String(
    formData.get("reconciliationCoverageOverride") ?? "",
  )
    .trim()
    .toUpperCase();
  const reconciliationCoverageOverride = rawOverride || null;
  if (
    reconciliationCoverageOverride !== null &&
    !isReconciliationCoverageMode(reconciliationCoverageOverride)
  ) {
    throw new Error(t.errors.invalidOverride);
  }

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: {
        taxIdentityType,
        personalBusinessUse,
        reconciliationCoverageOverride,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "COMPANY",
        entityId: companyId,
        action: "RECONCILIATION_POLICY_UPDATED",
        source: "USER",
        description: t.auditDescription,
        beforeData: {
          taxIdentityType: company.taxIdentityType,
          personalBusinessUse: company.personalBusinessUse,
          reconciliationCoverageOverride:
            company.reconciliationCoverageOverride,
        },
        afterData: {
          taxIdentityType,
          personalBusinessUse,
          reconciliationCoverageOverride,
        },
        metadata: {
          policyVersion: "company-reconciliation-policy-v1",
        },
      },
    });
  });

  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath(`/banki`);
  redirect(`/fyrirtaeki/${companyId}?saved=reconciliation-policy`);
}
