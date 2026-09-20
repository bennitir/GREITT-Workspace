"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCompanyAccess, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import {
  MOBILE_FEATURE_LIST,
  isMobileFeatureAvailable,
  type MobileFeatureKey,
} from "@/lib/core/mobile-features";
import { setUserMobileFeatureVisible } from "@/lib/core/mobile-feature-repository";
import { prisma } from "@/lib/prisma";

async function requireManagementAccess() {
  const companyId = await requireActiveCompanyReadAccess();
  const access = await getCompanyAccess(companyId);
  const allowed =
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "MANAGER" ||
    access.canManageCompanySettings;

  if (!allowed) throw new Error("Þú hefur ekki heimild til að breyta fyrirtækisstillingum.");
  return companyId;
}

export async function saveUserMobileFeatureVisibility(formData: FormData) {
  const companyId = await requireManagementAccess();
  const targetUserId = Number(formData.get("targetUserId"));

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new Error("Ógildur notandi.");
  }

  const userCompany = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: targetUserId, companyId } },
    select: { id: true, isActive: true },
  });

  if (!userCompany?.isActive) {
    throw new Error("Notandinn hefur ekki virkan aðgang að fyrirtækinu.");
  }

  const moduleSettings = await getCompanyModuleSettings(companyId);
  const visibleKeys = new Set(formData.getAll("visibleFeature").map((value) => String(value)));

  await Promise.all(
    MOBILE_FEATURE_LIST.filter((feature) =>
      isMobileFeatureAvailable(feature.key as MobileFeatureKey, moduleSettings),
    ).map((feature) =>
      setUserMobileFeatureVisible(
        companyId,
        targetUserId,
        feature.key as MobileFeatureKey,
        visibleKeys.has(feature.key),
      ),
    ),
  );

  revalidatePath("/stjornun");
  revalidatePath("/mobile");
  redirect(`/stjornun?mobileUserId=${targetUserId}&saved=1#mobile`);
}
