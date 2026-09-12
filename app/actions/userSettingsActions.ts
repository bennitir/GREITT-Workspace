"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const AI_LEVELS = new Set(["OFF", "LOW", "STANDARD", "HIGH"]);
const DETAIL_LEVELS = new Set(["SHORT", "NORMAL", "DETAILED"]);
const UI_LANGUAGES = new Set(["is", "en", "pl", "sr"]);
const EXPLANATION_LANGUAGES = new Set(["is", "en", "pl", "sr", "hr", "bs", "uk", "ro", "es", "pt", "lt", "lv", "ru"]);
const TIME_MODES = new Set(["OFF", "MANUAL", "AUTO", "AUTO_PROMPT"]);

async function requireSessionUser() {
  const token = (await cookies()).get("sessionToken")?.value;
  if (!token) throw new Error("Innskráning vantar.");
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    throw new Error("Innskráning er útrunnin.");
  }
  return session.user;
}

export async function saveMySettings(formData: FormData) {
  const user = await requireSessionUser();
  const interfaceLanguage = String(formData.get("interfaceLanguage") ?? "is");
  const aiExplanationLanguage = String(formData.get("aiExplanationLanguage") ?? "is");
  const aiSupportLevel = String(formData.get("aiSupportLevel") ?? "STANDARD");
  const aiExplanationDetail = String(formData.get("aiExplanationDetail") ?? "NORMAL");

  if (!UI_LANGUAGES.has(interfaceLanguage) || !EXPLANATION_LANGUAGES.has(aiExplanationLanguage)) throw new Error("Ógilt tungumál.");
  if (!AI_LEVELS.has(aiSupportLevel)) throw new Error("Ógilt stig AI-stuðnings.");
  if (!DETAIL_LEVELS.has(aiExplanationDetail)) throw new Error("Ógilt skýringarstig.");
  const timeTrackingMode = String(formData.get("timeTrackingMode") ?? "OFF");
  const timeTrackingIdleMinutes = Number(formData.get("timeTrackingIdleMinutes") ?? 10);
  if (!TIME_MODES.has(timeTrackingMode)) throw new Error("Ógild tímaskráningarstilling.");
  if (![5, 10, 15, 30].includes(timeTrackingIdleMinutes)) throw new Error("Ógildur biðtími.");

  const data = {
    interfaceLanguage,
    aiExplanationLanguage,
    aiSupportLevel,
    aiExplanationDetail,
    autoOpenNextDocument: formData.get("autoOpenNextDocument") === "on",
    showHelpText: formData.get("showHelpText") === "on",
    timeTrackingMode,
    timeTrackingIdleMinutes,
  };
  await prisma.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  revalidatePath("/stillingar");
  revalidatePath("/mobile");
  revalidatePath("/mobile/stillingar");
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo === "/mobile/stillingar" ? "/mobile/stillingar?saved=1" : "/stillingar?saved=1");
}
