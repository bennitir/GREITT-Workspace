"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";

export async function openMobileNotification(formData: FormData) {
  const notificationId = Number(formData.get("notificationId"));
  if (!Number.isInteger(notificationId)) throw new Error("INVALID_NOTIFICATION");

  const companyId = await requireCompanyModule("verk");
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile/tilkynningar");

  const notification = await prisma.userNotification.findFirst({
    where: { id: notificationId, userId: user.id, companyId },
    select: { id: true, href: true, readAt: true },
  });
  if (!notification) redirect("/mobile/tilkynningar");

  if (!notification.readAt) {
    await prisma.userNotification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }

  revalidatePath("/mobile");
  revalidatePath("/mobile/tilkynningar");
  redirect(notification.href || "/mobile/tilkynningar");
}

export async function markAllMobileNotificationsRead() {
  const companyId = await requireCompanyModule("verk");
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile/tilkynningar");

  await prisma.userNotification.updateMany({
    where: { userId: user.id, companyId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/mobile");
  revalidatePath("/mobile/tilkynningar");
}
