"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  effectiveBookkeepingCapabilities,
} from "@/lib/core/bookkeeping-access-policy";

export async function saveCompanyUserPermissions(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(companyId) || !Number.isInteger(userId)) {
    throw new Error("Ógild notenda- eða fyrirtækistenging.");
  }

  const token = (await cookies()).get("sessionToken")?.value;
  const session = token
    ? await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      })
    : null;

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    throw new Error("Innskráning vantar.");
  }

  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId,
        },
      },
    });

    if (
      !access?.isActive ||
      !(access.accessRole === "OWNER" || access.canManageCompanySettings)
    ) {
      throw new Error("Þú hefur ekki heimild til að breyta notendaheimildum.");
    }
  }

  const targetAccess = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    select: {
      id: true,
      isActive: true,
      accessRole: true,
    },
  });

  if (!targetAccess?.isActive) {
    throw new Error("Virk tenging notanda við fyrirtæki fannst ekki.");
  }

  const permissions = effectiveBookkeepingCapabilities({
    accessRole: targetAccess.accessRole,
    canPrepareBookkeeping: formData.get("canPrepareBookkeeping") === "on",
    canReviewBookkeeping: formData.get("canReviewBookkeeping") === "on",
    canReconcileBookkeeping: formData.get("canReconcileBookkeeping") === "on",
    canApproveExpenses: formData.get("canApproveExpenses") === "on",
    canBookEntries: formData.get("canBookEntries") === "on",
    canManageCompanySettings: formData.get("canManageCompanySettings") === "on",
  });

  await prisma.userCompany.update({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    data: permissions,
  });

  revalidatePath("/stillingar/fyrirtaeki");
  revalidatePath("/stjornun");
  revalidatePath(`/stjornbord/fyrirtaeki/${companyId}`);
}
