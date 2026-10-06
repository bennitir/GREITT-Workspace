import { cookies } from "next/headers";
import {
  getRequestAuthContext,
  getRequestUserCompany,
} from "@/lib/core/request-context";
import { effectiveBookkeepingCapabilities } from "@/lib/core/bookkeeping-access-policy";

export const COMPANY_ACCESS_ROLES = [
  "OWNER",
  "MANAGER",
  "BOOKKEEPER",
  "VIEWER",
] as const;

export type CompanyAccessRole = (typeof COMPANY_ACCESS_ROLES)[number];

const DENIED_ACCESS = {
  allowed: false,
  canWrite: false,
  canUpload: false,
  canReview: false,
  canBook: false,
  canDelete: false,
  canManage: false,
  canPrepareBookkeeping: false,
  canReviewBookkeeping: false,
  canReconcileBookkeeping: false,
  canApproveExpenses: false,
  canBookEntries: false,
  canManageCompanySettings: false,
  canSaleUse: false,
  canSaleHold: false,
  canSaleDiscount: false,
  canSaleChangePrice: false,
  canSaleInvoice: false,
  canSaleRefund: false,
  canSaleVoid: false,
  canSaleSettlementView: false,
  canSaleSettlementCreate: false,
  canSaleSettlementFinalize: false,
  canSaleCustomerManage: false,
  canSaleSettingsManage: false,
  role: null as string | null,
};

export async function getEffectiveUser() {
  const context = await getRequestAuthContext();
  return context.effectiveUser;
}

export async function getCompanyAccess(companyId: number) {
  const user = await getEffectiveUser();
  if (!user) return { ...DENIED_ACCESS };

  if (user.role === "ADMIN") {
    return {
      allowed: true,
      canWrite: true,
      canUpload: true,
      canReview: true,
      canBook: true,
      canDelete: true,
      canManage: true,
      canPrepareBookkeeping: true,
      canReviewBookkeeping: true,
      canReconcileBookkeeping: true,
      canApproveExpenses: true,
      canBookEntries: true,
      canManageCompanySettings: true,
      canSaleUse: true,
      canSaleHold: true,
      canSaleDiscount: true,
      canSaleChangePrice: true,
      canSaleInvoice: true,
      canSaleRefund: true,
      canSaleVoid: true,
      canSaleSettlementView: true,
      canSaleSettlementCreate: true,
      canSaleSettlementFinalize: true,
      canSaleCustomerManage: true,
      canSaleSettingsManage: true,
      role: "ADMIN",
    };
  }

  const access = await getRequestUserCompany(user.id, companyId);

  if (!access?.isActive) return { ...DENIED_ACCESS };

  // Nýju aðgerðarheimildirnar í UserCompany eru frumheimildin.
  // VIEWER er þó harður read-only boundary fyrir bókhald, jafnvel ef
  // eldri/stale UserCompany-röð ber óvart true capability-gildi.
  const bookkeeping = effectiveBookkeepingCapabilities(access);

  // Gömlu heitin eru áfram skiluð sem samhæfingarlag fyrir síður sem
  // hafa ekki enn verið færðar yfir á nákvæmari heimildir.
  const canWrite =
    bookkeeping.canPrepareBookkeeping ||
    bookkeeping.canReviewBookkeeping ||
    bookkeeping.canReconcileBookkeeping ||
    bookkeeping.canApproveExpenses ||
    bookkeeping.canBookEntries ||
    bookkeeping.canManageCompanySettings;

  return {
    allowed: true,
    canWrite,
    canUpload: bookkeeping.canPrepareBookkeeping,
    canReview: bookkeeping.canReviewBookkeeping,
    canBook: bookkeeping.canBookEntries,
    canDelete: bookkeeping.canBookEntries,
    canManage: bookkeeping.canManageCompanySettings,
    canPrepareBookkeeping: bookkeeping.canPrepareBookkeeping,
    canReviewBookkeeping: bookkeeping.canReviewBookkeeping,
    canReconcileBookkeeping: bookkeeping.canReconcileBookkeeping,
    canApproveExpenses: bookkeeping.canApproveExpenses,
    canBookEntries: bookkeeping.canBookEntries,
    canManageCompanySettings: bookkeeping.canManageCompanySettings,
    canSaleUse: access.canSaleUse,
    canSaleHold: access.canSaleHold,
    canSaleDiscount: access.canSaleDiscount,
    canSaleChangePrice: access.canSaleChangePrice,
    canSaleInvoice: access.canSaleInvoice,
    canSaleRefund: access.canSaleRefund,
    canSaleVoid: access.canSaleVoid,
    canSaleSettlementView: access.canSaleSettlementView,
    canSaleSettlementCreate: access.canSaleSettlementCreate,
    canSaleSettlementFinalize: access.canSaleSettlementFinalize,
    canSaleCustomerManage: access.canSaleCustomerManage,
    canSaleSettingsManage: access.canSaleSettingsManage,
    role: access.accessRole as CompanyAccessRole,
  };
}

export async function requireCompanyWriteAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canWrite) throw new Error("Skoðunaraðgangur leyfir ekki breytingar.");
  return access;
}

export async function requireCompanyBookAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canBookEntries) throw new Error("Þú hefur ekki heimild til að bóka.");
  return access;
}

export async function requireCompanyDeleteAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canDelete) throw new Error("Þú hefur ekki heimild til að eyða fylgiskjali.");
  return access;
}

export async function requireCompanyUploadAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canPrepareBookkeeping) throw new Error("Þú hefur ekki heimild til að flytja inn gögn.");
  return access;
}

export async function requireCompanyPrepareBookkeepingAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canPrepareBookkeeping) {
    throw new Error("Þú hefur ekki heimild til að undirbúa bókhaldsgögn.");
  }
  return access;
}

export async function requireCompanyReviewBookkeepingAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canReviewBookkeeping) {
    throw new Error("Þú hefur ekki heimild til að yfirfara bókhaldsgögn.");
  }
  return access;
}

async function getRequiredActiveCompanyId() {
  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value || 0);
  if (!activeCompanyId) throw new Error("Ekkert virkt fyrirtæki valið.");
  return activeCompanyId;
}

export async function requireActiveCompanyPrepareBookkeepingAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();
  await requireCompanyPrepareBookkeepingAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyReviewBookkeepingAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();
  await requireCompanyReviewBookkeepingAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyBookAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();
  await requireCompanyBookAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyDeleteAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();
  await requireCompanyDeleteAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyWriteAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();
  await requireCompanyWriteAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyReadAccess() {
  const activeCompanyId = await getRequiredActiveCompanyId();

  const access = await getCompanyAccess(activeCompanyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  return activeCompanyId;
}
