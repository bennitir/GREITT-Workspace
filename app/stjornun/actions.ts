"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCompanyAccess, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
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

export async function saveSalesUserPermissions(formData: FormData) {
  const companyId = await requireManagementAccess();
  const targetUserId = Number(formData.get("targetUserId"));

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new Error("INVALID_TARGET_USER");
  }

  const [userCompany, moduleSettings] = await Promise.all([
    prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
      select: { id: true, isActive: true },
    }),
    getCompanyModuleSettings(companyId),
  ]);

  if (!userCompany?.isActive) {
    throw new Error("INACTIVE_TARGET_USER_COMPANY_ACCESS");
  }

  if (!isCompanyModuleEnabled("sala", moduleSettings)) {
    redirect("/stjornun");
  }

  await prisma.userCompany.update({
    where: { userId_companyId: { userId: targetUserId, companyId } },
    data: {
      canSaleUse: formData.get("canSaleUse") === "on",
      canSaleHold: formData.get("canSaleHold") === "on",
      canSaleDiscount: formData.get("canSaleDiscount") === "on",
      canSaleChangePrice: formData.get("canSaleChangePrice") === "on",
      canSaleInvoice: formData.get("canSaleInvoice") === "on",
      canSaleRefund: formData.get("canSaleRefund") === "on",
      canSaleVoid: formData.get("canSaleVoid") === "on",
      canSaleSettlementView: formData.get("canSaleSettlementView") === "on",
      canSaleSettlementCreate: formData.get("canSaleSettlementCreate") === "on",
      canSaleSettlementFinalize: formData.get("canSaleSettlementFinalize") === "on",
      canSaleCustomerManage: formData.get("canSaleCustomerManage") === "on",
      canSaleSettingsManage: formData.get("canSaleSettingsManage") === "on",
    },
  });

  revalidatePath("/stjornun");
  revalidatePath("/sala");
  redirect(`/stjornun?userId=${targetUserId}&salesSaved=1#user-settings`);
}

export async function saveUserMobileFeatureVisibility(formData: FormData) {
  const companyId = await requireManagementAccess();
  const targetUserId = Number(formData.get("targetUserId"));

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new Error("INVALID_TARGET_USER");
  }

  const userCompany = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: targetUserId, companyId } },
    select: { id: true, isActive: true },
  });

  if (!userCompany?.isActive) {
    throw new Error("INACTIVE_TARGET_USER_COMPANY_ACCESS");
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
  redirect(`/stjornun?userId=${targetUserId}&saved=1#user-settings`);
}
