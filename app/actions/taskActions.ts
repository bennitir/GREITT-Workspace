"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";
import {
  nextVatGeneralPeriod,
  periodCodeFromDates,
  VAT_GENERAL_PERIODS,
  vatGeneralDueDate,
  vatGeneralPeriodDates,
  type VatGeneralPeriod,
} from "@/lib/core/task-schedules";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safeInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function safeExternalUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) throw new Error("Dagsetning þarf að vera dd.mm.áááá.");
  const date = new Date(+match[3], +match[2] - 1, +match[1], 12);
  if (
    date.getFullYear() !== +match[3] ||
    date.getMonth() !== +match[2] - 1 ||
    date.getDate() !== +match[1]
  ) {
    throw new Error("Ógild dagsetning.");
  }
  return date;
}

const types = new Set(["GENERAL", "TAX_FILING", "PAYROLL", "VAT", "DOCUMENT"]);
const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const recurrences = new Set(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

async function assertEdit(companyId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const access = await getCompanyAccess(companyId);
  if (!access.allowed || !(user.role === "ADMIN" || access.canWrite)) {
    throw new Error("Þú hefur ekki heimild til að breyta verkefnum.");
  }
  return user;
}

async function assertDataReview(companyId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const access = await getCompanyAccess(companyId);
  const allowed =
    user.role === "ADMIN" ||
    access.canPrepareBookkeeping ||
    access.canReviewBookkeeping ||
    access.canManageCompanySettings;
  if (!access.allowed || !allowed) {
    throw new Error("Þú hefur ekki heimild til að yfirfara gagnaskil.");
  }
  return user;
}

function values(formData: FormData) {
  const taskType = clean(formData.get("taskType"));
  const priority = clean(formData.get("priority"));
  const scheduleRule = clean(formData.get("scheduleRule"));
  let dueAt = parseDate(clean(formData.get("dueAt")));
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  let recurrenceFrequency = clean(formData.get("recurrenceFrequency"));
  let recurrenceInterval = Math.max(
    1,
    Math.min(120, Number(clean(formData.get("recurrenceInterval"))) || 1),
  );

  if (scheduleRule === "VAT_GENERAL_BIMONTHLY") {
    const year = Number(clean(formData.get("vatPeriodYear")));
    const period = clean(formData.get("vatPeriod")) as VatGeneralPeriod;
    if (!Number.isInteger(year) || year < 2000 || year > 2200 || !VAT_GENERAL_PERIODS.includes(period)) {
      throw new Error("Ógilt VSK-uppgjörstímabil.");
    }
    const dates = vatGeneralPeriodDates(year, period);
    periodStart = dates.start;
    periodEnd = dates.end;
    dueAt = vatGeneralDueDate(year, period);
    recurrenceFrequency = "NONE";
    recurrenceInterval = 1;
  }

  const dataRequestEnabled = clean(formData.get("dataRequestEnabled")) === "1";
  const dataDueAt = dataRequestEnabled ? parseDate(clean(formData.get("dataDueAt"))) : null;
  const reminderStartAt = dataRequestEnabled
    ? parseDate(clean(formData.get("reminderStartAt")))
    : null;
  const reminderIntervalDays = dataRequestEnabled
    ? Math.max(1, Math.min(60, Number(clean(formData.get("reminderIntervalDays"))) || 3))
    : 3;

  if (dataRequestEnabled && dataDueAt && dueAt && dataDueAt > dueAt) {
    throw new Error("Skiladagur gagna getur ekki verið eftir opinberum skilafresti verkefnisins.");
  }
  if (dataRequestEnabled && reminderStartAt && dataDueAt && reminderStartAt > dataDueAt) {
    throw new Error("Upphaf áminninga getur ekki verið eftir skiladegi gagna.");
  }

  return {
    title: clean(formData.get("title")),
    details: clean(formData.get("details")) || null,
    dueAt,
    taskType: types.has(taskType) ? taskType : "GENERAL",
    priority: priorities.has(priority) ? priority : "NORMAL",
    actionPath: safeInternalPath(clean(formData.get("actionPath"))),
    externalUrl: safeExternalUrl(clean(formData.get("externalUrl"))),
    recurrenceFrequency: recurrences.has(recurrenceFrequency) ? recurrenceFrequency : "NONE",
    recurrenceInterval,
    scheduleRule: scheduleRule === "VAT_GENERAL_BIMONTHLY" ? scheduleRule : "NONE",
    periodStart,
    periodEnd,
    dataRequestStatus: dataRequestEnabled ? "REQUESTED" : "NONE",
    dataDueAt,
    reminderStartAt,
    reminderIntervalDays,
  };
}

export async function createCompanyTask(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("Ógilt fyrirtæki.");
  const user = await assertEdit(companyId);
  const data = values(formData);
  if (!data.title) throw new Error("Heiti verkefnis vantar.");
  await prisma.companyTask.create({ data: { companyId, ...data, createdByUserId: user.id } });
  revalidatePath("/");
  revalidatePath("/verkefni");
  redirect("/verkefni");
}

export async function updateCompanyTask(taskId: number, formData: FormData) {
  const task = await prisma.companyTask.findUnique({ where: { id: taskId }, select: { companyId: true, dataRequestStatus: true } });
  if (!task) throw new Error("Verkefnið fannst ekki.");
  await assertEdit(task.companyId);
  const data = values(formData);
  if (!data.title) throw new Error("Heiti verkefnis vantar.");

  const nextStatus = data.dataRequestStatus === "NONE"
    ? "NONE"
    : task.dataRequestStatus === "NONE"
      ? "REQUESTED"
      : task.dataRequestStatus;

  await prisma.companyTask.update({
    where: { id: taskId },
    data: {
      ...data,
      dataRequestStatus: nextStatus,
      ...(nextStatus === "NONE"
        ? {
            clientSubmittedAt: null,
            clientSubmittedByUserId: null,
            dataReviewedAt: null,
            dataReviewedByUserId: null,
            lastReminderAt: null,
          }
        : {}),
    },
  });
  revalidatePath("/");
  revalidatePath("/verkefni");
  revalidatePath(`/verkefni/${taskId}`);
  redirect("/verkefni");
}

export async function markTaskDataSubmitted(taskId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const task = await prisma.companyTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Verkefnið fannst ekki.");
  const access = await getCompanyAccess(task.companyId);
  if (!access.allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  if (task.dataRequestStatus === "NONE") throw new Error("Ekki hefur verið óskað eftir gögnum fyrir þetta verkefni.");

  await prisma.companyTask.update({
    where: { id: taskId },
    data: {
      dataRequestStatus: "CLIENT_SUBMITTED",
      clientSubmittedAt: new Date(),
      clientSubmittedByUserId: user.id,
      dataReviewedAt: null,
      dataReviewedByUserId: null,
    },
  });
  revalidatePath("/");
  revalidatePath("/verkefni");
  revalidatePath(`/verkefni/${taskId}`);
}

export async function reviewTaskData(taskId: number, accepted: boolean) {
  const task = await prisma.companyTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Verkefnið fannst ekki.");
  const user = await assertDataReview(task.companyId);
  if (task.dataRequestStatus === "NONE") throw new Error("Ekki hefur verið óskað eftir gögnum fyrir þetta verkefni.");

  await prisma.companyTask.update({
    where: { id: taskId },
    data: {
      dataRequestStatus: accepted ? "ACCEPTED" : "NEEDS_MORE",
      dataReviewedAt: new Date(),
      dataReviewedByUserId: user.id,
    },
  });
  revalidatePath("/");
  revalidatePath("/verkefni");
  revalidatePath(`/verkefni/${taskId}`);
}

function nextDue(date: Date, frequency: string, interval: number) {
  const next = new Date(date);
  const step = Math.max(1, interval);
  if (frequency === "DAILY") next.setDate(next.getDate() + step);
  else if (frequency === "WEEKLY") next.setDate(next.getDate() + 7 * step);
  else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + step);
  else if (frequency === "YEARLY") next.setFullYear(next.getFullYear() + step);
  return next;
}

export async function setCompanyTaskCompleted(taskId: number, completed: boolean) {
  const task = await prisma.companyTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Verkefnið fannst ekki.");
  const user = await assertEdit(task.companyId);

  await prisma.$transaction(async (tx) => {
    await tx.companyTask.update({
      where: { id: taskId },
      data: completed
        ? { status: "COMPLETED", completedAt: new Date(), completedByUserId: user.id }
        : { status: "OPEN", completedAt: null, completedByUserId: null },
    });
    if (!completed || task.status === "COMPLETED") return;

    let next: null | { dueAt: Date; periodStart: Date | null; periodEnd: Date | null } = null;
    if (task.scheduleRule === "VAT_GENERAL_BIMONTHLY" && task.periodStart && task.periodEnd) {
      const code = periodCodeFromDates(task.periodStart, task.periodEnd);
      if (code) {
        const period = nextVatGeneralPeriod(task.periodStart.getFullYear(), code);
        const dates = vatGeneralPeriodDates(period.year, period.period);
        next = {
          dueAt: vatGeneralDueDate(period.year, period.period),
          periodStart: dates.start,
          periodEnd: dates.end,
        };
      }
    } else if (task.dueAt && task.recurrenceFrequency !== "NONE") {
      next = {
        dueAt: nextDue(task.dueAt, task.recurrenceFrequency, task.recurrenceInterval),
        periodStart: null,
        periodEnd: null,
      };
    }

    if (next) {
      await tx.companyTask.create({
        data: {
          companyId: task.companyId,
          taskType: task.taskType,
          title: task.title,
          details: task.details,
          status: "OPEN",
          priority: task.priority,
          dueAt: next.dueAt,
          assigneeUserId: task.assigneeUserId,
          createdByUserId: user.id,
          sourceType: task.scheduleRule === "VAT_GENERAL_BIMONTHLY" ? "VAT_SCHEDULE" : "RECURRING_TASK",
          sourceId: String(task.id),
          actionPath: task.actionPath,
          externalUrl: task.externalUrl,
          recurrenceFrequency: task.recurrenceFrequency,
          recurrenceInterval: task.recurrenceInterval,
          scheduleRule: task.scheduleRule,
          periodStart: next.periodStart,
          periodEnd: next.periodEnd,
          dataRequestStatus: task.dataRequestStatus === "NONE" ? "NONE" : "REQUESTED",
          dataDueAt: null,
          reminderStartAt: null,
          reminderIntervalDays: task.reminderIntervalDays,
        },
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/verkefni");
}
