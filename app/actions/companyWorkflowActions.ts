"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const MODES = new Set(["AI", "MANUAL", "HYBRID"]);
const COMPLETION = new Set(["MANUAL_CONFIRMATION", "AUTO_BOOK"]);

async function requireCompanySettingsAccess(companyId: number) {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  if (!token) throw new Error("Innskráning vantar.");
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) throw new Error("Innskráning er útrunnin.");
  if (session.user.role === "ADMIN") return session.user;
  const access = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: session.user.id, companyId } } });
  if (!access?.isActive || !(access.accessRole === "OWNER" || access.accessRole === "MANAGER" || access.canManageCompanySettings)) {
    throw new Error("Þú hefur ekki heimild til að breyta fyrirtækisstillingum.");
  }
  return session.user;
}

export async function saveCompanyWorkflowSettings(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId)) throw new Error("Ógilt fyrirtæki.");
  await requireCompanySettingsAccess(companyId);
  const preparationMode = String(formData.get("preparationMode") ?? "HYBRID");
  const completionMode = String(formData.get("completionMode") ?? "MANUAL_CONFIRMATION");
  if (!MODES.has(preparationMode) || !COMPLETION.has(completionMode)) throw new Error("Ógild verkferlisstilling.");
  const data = {
    preparationMode,
    requireReviewBeforeBooking: formData.get("requireReviewBeforeBooking") === "on",
    requireReconciliationBeforeBooking: formData.get("requireReconciliationBeforeBooking") === "on",
    requireApprovalBeforeBooking: formData.get("requireApprovalBeforeBooking") === "on",
    completionMode,
  };
  await prisma.$transaction([
    prisma.companyBookkeepingSettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    prisma.company.update({ where: { id: companyId }, data: { receiptEntryMode: preparationMode } }),
  ]);
  revalidatePath("/stillingar/fyrirtaeki");
  revalidatePath(`/stjornbord/fyrirtaeki/${companyId}`);
}
