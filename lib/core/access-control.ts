import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const COMPANY_ACCESS_ROLES = [
  "OWNER",
  "MANAGER",
  "BOOKKEEPER",
  "VIEWER",
] as const;

export const DEFAULT_ROLE_PERMISSIONS = {
  OWNER: {
    canWrite: true,
    canUpload: true,
    canReview: true,
    canBook: false,
    canDelete: false,
    canManage: false,
  },
  MANAGER: {
    canWrite: true,
    canUpload: true,
    canReview: true,
    canBook: false,
    canDelete: false,
    canManage: true,
  },
  BOOKKEEPER: {
    canWrite: true,
    canUpload: true,
    canReview: true,
    canBook: true,
    canDelete: true,
    canManage: false,
  },
  VIEWER: {
    canWrite: false,
    canUpload: false,
    canReview: false,
    canBook: false,
    canDelete: false,
    canManage: false,
  },
} as const;
export type CompanyAccessRole = (typeof COMPANY_ACCESS_ROLES)[number];

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
  if (!user) {
  return {
    allowed: false,
    canWrite: false,
    canUpload: false,
    canReview: false,
    canBook: false,
    canDelete: false,
    canManage: false,
    role: null as string | null,
  };
}
  if (user.role === "ADMIN") {
  return {
    allowed: true,
    canWrite: true,
    canUpload: true,
    canReview: true,
    canBook: true,
    canDelete: true,
    canManage: true,
    role: "ADMIN",
  };
}
  const access = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });

  

  if (!access?.isActive) {
  return {
    allowed: false,
    canWrite: false,
    canUpload: false,
    canReview: false,
    canBook: false,
    canDelete: false,
    canManage: false,
    role: null as string | null,
  };
}

  const role = access.accessRole as CompanyAccessRole;
const permissions = DEFAULT_ROLE_PERMISSIONS[role];

return {
  allowed: true,
  ...permissions,
  role,
};
}

export async function requireCompanyWriteAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (!access.canWrite) {
    throw new Error("Skoðunaraðgangur leyfir ekki breytingar.");
  }
  return access;
}

export async function requireCompanyBookAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);

  if (!access.allowed) {
    throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  }

  if (!access.canBook) {
    throw new Error("Þú hefur ekki heimild til að bóka.");
  }

  return access;
}

export async function requireCompanyDeleteAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);

  if (!access.allowed) {
    throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  }

  if (!access.canDelete) {
    throw new Error("Þú hefur ekki heimild til að eyða fylgiskjali.");
  }

  return access;
}

export async function requireCompanyUploadAccess(companyId: number) {
  const access = await getCompanyAccess(companyId);

  if (!access.allowed) {
    throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  }

  if (!access.canUpload) {
    throw new Error("Þú hefur ekki heimild til að flytja inn gögn.");
  }

  return access;
}

export async function requireActiveCompanyWriteAccess() {
  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value || 0);
  if (!activeCompanyId) throw new Error("Ekkert virkt fyrirtæki valið.");
  await requireCompanyWriteAccess(activeCompanyId);
  return activeCompanyId;

  
}

