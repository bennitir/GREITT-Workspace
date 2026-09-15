import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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
  role: null as string | null,
};

export async function getEffectiveUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }

  const activeUserId = cookieStore.get("activeUserId")?.value;
  if (session.user.role === "ADMIN" && activeUserId) {
    const impersonated = await prisma.user.findUnique({
      where: { id: Number(activeUserId) },
    });
    if (impersonated?.isActive) return impersonated;
  }

  return session.user;
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
      role: "ADMIN",
    };
  }

  const access = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });

  if (!access?.isActive) return { ...DENIED_ACCESS };

  // Nýju aðgerðarheimildirnar í UserCompany eru frumheimildin.
  // Gömlu heitin eru áfram skiluð sem samhæfingarlag fyrir síður sem
  // hafa ekki enn verið færðar yfir á nákvæmari heimildir.
  const canWrite =
    access.canPrepareBookkeeping ||
    access.canReviewBookkeeping ||
    access.canReconcileBookkeeping ||
    access.canApproveExpenses ||
    access.canBookEntries ||
    access.canManageCompanySettings;

  return {
    allowed: true,
    canWrite,
    canUpload: access.canPrepareBookkeeping,
    canReview: access.canReviewBookkeeping,
    canBook: access.canBookEntries,
    canDelete: access.canBookEntries,
    canManage: access.canManageCompanySettings,
    canPrepareBookkeeping: access.canPrepareBookkeeping,
    canReviewBookkeeping: access.canReviewBookkeeping,
    canReconcileBookkeeping: access.canReconcileBookkeeping,
    canApproveExpenses: access.canApproveExpenses,
    canBookEntries: access.canBookEntries,
    canManageCompanySettings: access.canManageCompanySettings,
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

export async function requireActiveCompanyWriteAccess() {
  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value || 0);
  if (!activeCompanyId) throw new Error("Ekkert virkt fyrirtæki valið.");
  await requireCompanyWriteAccess(activeCompanyId);
  return activeCompanyId;
}

export async function requireActiveCompanyReadAccess() {
  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value || 0);
  if (!activeCompanyId) throw new Error("Ekkert virkt fyrirtæki valið.");

  const access = await getCompanyAccess(activeCompanyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  return activeCompanyId;
}
