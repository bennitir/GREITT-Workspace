"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function context(requestedCompanyId?: number) {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const cookieCompanyId = Number(store.get("activeCompanyId")?.value);
  const companyId = requestedCompanyId ?? cookieCompanyId;

  if (!token || !Number.isInteger(companyId) || companyId < 1) {
    throw new Error("Virkt fyrirtæki eða innskráning vantar.");
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    throw new Error("Innskráning er útrunnin.");
  }

  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!access?.isActive) throw new Error("Aðgang vantar.");
  }

  return { userId: session.user.id, companyId };
}

export async function getMyTimeTrackingSettings() {
  const { userId, companyId } = await context();
  const settings = await prisma.userSettings.findUnique({ where: { userId } });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const today = await prisma.serviceTimeEntry.aggregate({
    where: { userId, startedAt: { gte: startOfDay } },
    _sum: { durationSeconds: true },
  });

  return {
    mode: settings?.timeTrackingMode ?? "OFF",
    idleMinutes: settings?.timeTrackingIdleMinutes ?? 10,
    todaySeconds: today._sum.durationSeconds ?? 0,
    interfaceLanguage: settings?.interfaceLanguage ?? "is",
    companyId,
  };
}

export async function recordAutomaticServiceTime(input: {
  companyId?: number;
  startedAt: string;
  endedAt: string;
  module?: string;
}) {
  const { userId, companyId } = await context(input.companyId);
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings || !["AUTO", "AUTO_PROMPT"].includes(settings.timeTrackingMode)) return;

  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);
  const startedMs = startedAt.getTime();
  const endedMs = endedAt.getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) return;

  const durationSeconds = Math.floor((endedMs - startedMs) / 1000);
  if (durationSeconds < 1 || durationSeconds > 24 * 60 * 60) return;

  await prisma.serviceTimeEntry.create({
    data: {
      companyId,
      userId,
      source: "AUTO",
      category: input.module ?? "GLÖGGT",
      module: input.module,
      startedAt,
      endedAt,
      durationSeconds,
      // Haldið fyrir samhæfni við eldri kóða. Ný yfirlit nota sekúndur.
      durationMinutes: Math.floor(durationSeconds / 60),
    },
  });

  revalidatePath("/");
  revalidatePath("/vinnustundir");
  return { recorded: true, durationSeconds };
}

export async function addManualServiceTime(formData: FormData) {
  const { userId, companyId } = await context();
  const minutes = Math.round(Number(formData.get("minutes")));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) {
    throw new Error("Ógildur tími.");
  }

  const durationSeconds = minutes * 60;
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - durationSeconds * 1000);

  await prisma.serviceTimeEntry.create({
    data: {
      companyId,
      userId,
      source: "MANUAL",
      category: String(formData.get("category") || "ANNAÐ"),
      description: String(formData.get("description") || "") || null,
      startedAt,
      endedAt,
      durationMinutes: minutes,
      durationSeconds,
    },
  });

  revalidatePath("/stillingar");
  revalidatePath("/vinnustundir");
  revalidatePath("/");
}
