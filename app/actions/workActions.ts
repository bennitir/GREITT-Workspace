"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

export async function createWorkLog(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const userIdValue = formData.get("userId");
  const workDateValue = String(formData.get("workDate") ?? "");
  const startedAtValue = String(formData.get("startedAt") ?? "");
  const endedAtValue = String(formData.get("endedAt") ?? "");
  const breakMinutes = Number(formData.get("breakMinutes") ?? 0);
  const description = String(formData.get("description") ?? "").trim();

  const userId =
    userIdValue && String(userIdValue) !== ""
      ? Number(userIdValue)
      : null;

  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }

  if (!workDateValue) {
    throw new Error("Dagsetning vantar.");
  }

  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    throw new Error("Ógilt hlé.");
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki.");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const work = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      companyId,
    },
  });

  if (!work) {
    throw new Error("Verkið fannst ekki.");
  }

  if (userId !== null) {
    const companyUser = await prisma.userCompany.findFirst({
      where: {
        companyId,
        userId,
        isActive: true,
      },
    });

    if (!companyUser) {
      throw new Error("Starfsmaður tilheyrir ekki þessu fyrirtæki.");
    }
  }

  const workDate = new Date(`${workDateValue}T00:00:00`);

  let startedAt: Date | null = null;
  let endedAt: Date | null = null;
  let durationMinutes: number | null = null;

  if (startedAtValue) {
    startedAt = new Date(`${workDateValue}T${startedAtValue}:00`);
  }

  if (endedAtValue) {
    endedAt = new Date(`${workDateValue}T${endedAtValue}:00`);

    if (startedAt) {
      durationMinutes =
        Math.round(
          (endedAt.getTime() - startedAt.getTime()) / 60000
        ) - breakMinutes;

      if (durationMinutes < 0) {
        throw new Error("Lokatími getur ekki verið fyrir upphafstíma.");
      }
    }
  }

  await prisma.workLog.create({
    data: {
      companyId,
      workOrderId,
      userId,
      workDate,
      startedAt,
      endedAt,
      breakMinutes,
      durationMinutes,
      description: description || null,
    },
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

export async function updateWorkLog(formData: FormData) {
  const workLogId = Number(formData.get("workLogId"));
  const userIdValue = formData.get("userId");
  const workDateValue = String(formData.get("workDate") ?? "");
  const startedAtValue = String(formData.get("startedAt") ?? "");
  const endedAtValue = String(formData.get("endedAt") ?? "");
  const breakMinutes = Number(formData.get("breakMinutes") ?? 0);
  const description = String(formData.get("description") ?? "").trim();

  const userId =
    userIdValue && String(userIdValue) !== ""
      ? Number(userIdValue)
      : null;

  if (!Number.isInteger(workLogId)) {
    throw new Error("Ógilt verkstundarnúmer.");
  }

  if (!workDateValue) {
    throw new Error("Dagsetning vantar.");
  }

  if (!startedAtValue || !endedAtValue) {
    throw new Error(
      "Bæði upphafs- og lokatími verða að vera skráðir."
    );
  }

  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    throw new Error("Ógilt hlé.");
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki.");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const workLog = await prisma.workLog.findFirst({
    where: {
      id: workLogId,
      companyId,
    },
  });

  if (!workLog) {
    throw new Error("Verkstund fannst ekki.");
  }

  if (userId !== null) {
    const companyUser = await prisma.userCompany.findFirst({
      where: {
        companyId,
        userId,
        isActive: true,
      },
    });

    if (!companyUser) {
      throw new Error(
        "Starfsmaður tilheyrir ekki þessu fyrirtæki."
      );
    }
  }

  const workDate = new Date(`${workDateValue}T00:00:00`);
  const startedAt = new Date(
    `${workDateValue}T${startedAtValue}:00`
  );
  const endedAt = new Date(
    `${workDateValue}T${endedAtValue}:00`
  );

  let durationMinutes =
    Math.round(
      (endedAt.getTime() - startedAt.getTime()) / 60000
    ) - breakMinutes;

  if (durationMinutes < 0) {
    throw new Error(
      "Lokatími getur ekki verið fyrir upphafstíma."
    );
  }

  await prisma.workLog.update({
    where: {
      id: workLog.id,
    },
    data: {
      userId,
      workDate,
      startedAt,
      endedAt,
      breakMinutes,
      durationMinutes,
      description: description || null,
    },
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workLog.workOrderId}`);
}