"use server";

import { revalidatePath } from "next/cache";

import { getCompanyAccess, getEffectiveUser, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { workTimeText } from "@/lib/i18n/work-time";
import { prisma } from "@/lib/prisma";

function parsePositiveInt(value: FormDataEntryValue | null, message: string, allowZero = false) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) throw new Error(message);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) throw new Error(message);
  return parsed;
}

function parseOptionalId(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Invalid id");
  return parsed;
}

function parseClock(value: FormDataEntryValue | null, message: string) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) throw new Error(message);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(message);
  return hour * 60 + minute;
}

async function context() {
  const companyId = await requireActiveCompanyReadAccess();
  const [access, user] = await Promise.all([getCompanyAccess(companyId), getEffectiveUser()]);
  const allowed =
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "MANAGER" ||
    access.canManageCompanySettings;
  const settings = user
    ? await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } })
    : null;
  const t = workTimeText(settings?.interfaceLanguage ?? "is");
  if (!allowed) throw new Error(t.noAccess);
  return { companyId, t };
}

function revalidate() {
  revalidatePath("/verk");
  revalidatePath("/verk/vinnutimi");
  revalidatePath("/starfsmenn");
}

export async function saveWorkplaceProfile(formData: FormData) {
  const { companyId, t } = await context();
  const id = parseOptionalId(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const dayStartMinutes = parseClock(formData.get("dayStart"), t.invalidTime);
  const standardWorkMinutes = parsePositiveInt(formData.get("standardWorkMinutes"), t.invalidNumber);
  const isDefault = formData.get("isDefault") === "on";
  if (!name) throw new Error(t.invalidNumber);

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.workplaceScheduleProfile.updateMany({ where: { companyId }, data: { isDefault: false } });
    }
    if (id) {
      const existing = await tx.workplaceScheduleProfile.findFirst({ where: { id, companyId }, select: { id: true } });
      if (!existing) throw new Error(t.noAccess);
      await tx.workplaceScheduleProfile.update({
        where: { id },
        data: { name, address: address || null, dayStartMinutes, standardWorkMinutes, isDefault },
      });
    } else {
      await tx.workplaceScheduleProfile.create({
        data: { companyId, name, address: address || null, dayStartMinutes, standardWorkMinutes, isDefault },
      });
    }
  });
  revalidate();
}

export async function saveWorkplaceBreak(formData: FormData) {
  const { companyId, t } = await context();
  const id = parseOptionalId(formData.get("id"));
  const workplaceScheduleProfileId = parsePositiveInt(formData.get("workplaceScheduleProfileId"), t.invalidNumber);
  const profile = await prisma.workplaceScheduleProfile.findFirst({ where: { id: workplaceScheduleProfileId, companyId }, select: { id: true } });
  if (!profile) throw new Error(t.noAccess);

  const code = String(formData.get("code") ?? "").trim().replace(/\s+/g, "_").toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  const targetStartMinutes = parseClock(formData.get("targetTime"), t.invalidTime);
  const durationMinutes = parsePositiveInt(formData.get("durationMinutes"), t.invalidNumber);
  const flexibleBeforeMinutes = parsePositiveInt(formData.get("flexibleBeforeMinutes") ?? "0", t.invalidNumber, true);
  const flexibleAfterMinutes = parsePositiveInt(formData.get("flexibleAfterMinutes") ?? "0", t.invalidNumber, true);
  const finishNearCompleteThresholdMinutes = parsePositiveInt(formData.get("finishNearCompleteThresholdMinutes") ?? "0", t.invalidNumber, true);
  const allowFinishNearCompleteWork = formData.get("allowFinishNearCompleteWork") === "on";
  if (!code || !label) throw new Error(t.invalidNumber);

  if (id) {
    const existing = await prisma.workplaceBreakRule.findFirst({ where: { id, companyId, workplaceScheduleProfileId }, select: { id: true } });
    if (!existing) throw new Error(t.noAccess);
    await prisma.workplaceBreakRule.update({
      where: { id },
      data: { code, label, targetStartMinutes, durationMinutes, flexibleBeforeMinutes, flexibleAfterMinutes, allowFinishNearCompleteWork, finishNearCompleteThresholdMinutes },
    });
  } else {
    const maxSequence = await prisma.workplaceBreakRule.aggregate({ where: { workplaceScheduleProfileId }, _max: { sequence: true } });
    await prisma.workplaceBreakRule.create({
      data: {
        companyId,
        workplaceScheduleProfileId,
        sequence: (maxSequence._max.sequence ?? 0) + 1,
        code,
        label,
        targetStartMinutes,
        durationMinutes,
        flexibleBeforeMinutes,
        flexibleAfterMinutes,
        allowFinishNearCompleteWork,
        finishNearCompleteThresholdMinutes,
      },
    });
  }
  revalidate();
}

export async function createLaborAgreementProfile(formData: FormData) {
  const { companyId, t } = await context();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!name) throw new Error(t.invalidNumber);
  await prisma.laborAgreementProfile.create({
    data: { companyId, name, code: code || null, notes: notes || null, interpretationStatus: "UNVERIFIED" },
  });
  revalidate();
}

export async function saveEmployeeWorkdayProfiles(formData: FormData) {
  const { companyId, t } = await context();
  const employeeId = parsePositiveInt(formData.get("employeeId"), t.invalidNumber);
  const workplaceScheduleProfileId = parseOptionalId(formData.get("workplaceScheduleProfileId"));
  const laborAgreementProfileId = parseOptionalId(formData.get("laborAgreementProfileId"));

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
  if (!employee) throw new Error(t.noAccess);

  if (workplaceScheduleProfileId) {
    const profile = await prisma.workplaceScheduleProfile.findFirst({ where: { id: workplaceScheduleProfileId, companyId }, select: { id: true } });
    if (!profile) throw new Error(t.noAccess);
  }
  if (laborAgreementProfileId) {
    const profile = await prisma.laborAgreementProfile.findFirst({ where: { id: laborAgreementProfileId, companyId }, select: { id: true } });
    if (!profile) throw new Error(t.noAccess);
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: { workplaceScheduleProfileId, laborAgreementProfileId },
  });
  revalidate();
}
