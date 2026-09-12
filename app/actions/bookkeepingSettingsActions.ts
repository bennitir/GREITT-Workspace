"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";

const PREPARATION_MODES = new Set(["AI", "MANUAL", "HYBRID"]);
const COMPLETION_MODES = new Set(["MANUAL_CONFIRMATION", "AUTO_BOOK"]);

export async function saveCompanyBookkeepingSettings(formData: FormData) {
  const user = await getEffectiveUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Þú hefur ekki heimild til að breyta þessum stillingum.");
  }

  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const preparationMode = String(formData.get("preparationMode") ?? "HYBRID");
  const completionMode = String(formData.get("completionMode") ?? "MANUAL_CONFIRMATION");

  if (!PREPARATION_MODES.has(preparationMode)) {
    throw new Error("Ógild vinnuleið.");
  }
  if (!COMPLETION_MODES.has(completionMode)) {
    throw new Error("Ógild lokastilling bókunar.");
  }

  const data = {
    preparationMode,
    requireReviewBeforeBooking: formData.get("requireReviewBeforeBooking") === "on",
    requireReconciliationBeforeBooking:
      formData.get("requireReconciliationBeforeBooking") === "on",
    requireApprovalBeforeBooking: formData.get("requireApprovalBeforeBooking") === "on",
    completionMode,
  };

  await prisma.$transaction([
    prisma.companyBookkeepingSettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    }),
    // Heldur eldri receiptEntryMode samstilltu meðan gamli kóðinn notar það enn.
    prisma.company.update({
      where: { id: companyId },
      data: { receiptEntryMode: preparationMode },
    }),
  ]);

  revalidatePath(`/stjornbord/fyrirtaeki/${companyId}`);
  revalidatePath("/bókhald");
  revalidatePath("/bokhald");
  revalidatePath("/fylgiskjol");
}
