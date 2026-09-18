"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function getSession() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;

  if (!token) {
    throw new Error("Innskráning vantar.");
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    throw new Error("Innskráning er útrunnin.");
  }

  return { store, session };
}

type CompanyContextSession = {
  user: {
    id: number;
    role: string;
  };
};

async function resolveCompanyId(
  store: Awaited<ReturnType<typeof cookies>>,
  session: CompanyContextSession,
  requestedCompanyId?: number,
) {
  const cookieCompanyId = Number(store.get("activeCompanyId")?.value);
  let companyId = requestedCompanyId ?? cookieCompanyId;

  if (!Number.isInteger(companyId) || companyId < 1) {
    if (session.user.role !== "ADMIN") {
      const links = await prisma.userCompany.findMany({
        where: {
          userId: session.user.id,
          isActive: true,
          company: { isActive: true },
        },
        select: { companyId: true },
        take: 2,
        orderBy: { companyId: "asc" },
      });

      if (links.length === 1) {
        companyId = links[0].companyId;
      }
    }
  }

  if (!Number.isInteger(companyId) || companyId < 1) {
    return null;
  }

  if (session.user.role === "ADMIN") {
    const company = await prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      select: { id: true },
    });

    return company ? companyId : null;
  }

  const access = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId: session.user.id,
        companyId,
      },
    },
    include: {
      company: { select: { isActive: true } },
    },
  });

  if (!access?.isActive || !access.company.isActive) {
    return null;
  }

  return companyId;
}

async function context(requestedCompanyId?: number) {
  const { store, session } = await getSession();
  const companyId = await resolveCompanyId(
    store,
    session,
    requestedCompanyId,
  );

  if (!companyId) {
    throw new Error("Virkt fyrirtæki vantar.");
  }

  return { userId: session.user.id, companyId };
}

export async function getMyTimeTrackingSettings() {
  const { store, session } = await getSession();
  const userId = session.user.id;
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const companyId = await resolveCompanyId(store, session);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const today = await prisma.serviceTimeEntry.aggregate({
    where: { userId, startedAt: { gte: startOfDay } },
    _sum: { durationSeconds: true },
  });

  // Virknimæling bókara á ekki að kasta 500-villu þegar nýr Mobile-notandi
  // hefur ekki enn valið fyrirtæki. Án fyrirtækis er hún einfaldlega óvirk.
  return {
    mode: companyId ? (settings?.timeTrackingMode ?? "OFF") : "OFF",
    idleMinutes: settings?.timeTrackingIdleMinutes ?? 10,
    todaySeconds: today._sum.durationSeconds ?? 0,
    interfaceLanguage: settings?.interfaceLanguage ?? "is",
    companyId: companyId ?? 0,
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
