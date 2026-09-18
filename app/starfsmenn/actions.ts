"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCompanyAccess, getEffectiveUser, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";

const EMPLOYMENT_KINDS = new Set(["EMPLOYEE", "TEMPORARY", "APPRENTICE", "OTHER"]);
const PAY_TYPES = new Set(["MONTHLY", "HOURLY", "MIXED"]);
const QUALIFICATION_TYPES = new Set(["DRIVING_LICENSE", "MACHINE", "CERTIFICATION", "TRAINING", "OTHER"]);
const LANGUAGES = new Set(["is", "en", "pl", "sr"]);

async function requireEmployeeManager() {
  const companyId = await requireActiveCompanyReadAccess();
  const [access, user] = await Promise.all([getCompanyAccess(companyId), getEffectiveUser()]);
  const allowed =
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "MANAGER" ||
    access.canManageCompanySettings;
  if (!allowed) throw new Error("Þú hefur ekki heimild til að vinna með starfsmannaspjöld.");
  if (!user) throw new Error("Innskráning vantar.");
  return { companyId, userId: user.id };
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function requiredText(value: FormDataEntryValue | null, label: string) {
  const text = clean(value);
  if (!text) throw new Error(`${label} vantar.`);
  return text;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error("Ógild tala.");
  return number;
}

function dateOnly(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("Ógild dagsetning.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Ógild dagsetning.");
  }
  return date;
}

function dayBefore(value: Date) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

function revalidateEmployee(employeeId?: number) {
  revalidatePath("/starfsmenn");
  if (employeeId) revalidatePath(`/starfsmenn/${employeeId}`);
  revalidatePath("/verk10");
}

export async function createEmployee(formData: FormData) {
  const { companyId, userId } = await requireEmployeeManager();
  const fullName = requiredText(formData.get("fullName"), "Nafn");
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "is");
  const employee = await prisma.employee.create({
    data: {
      companyId,
      fullName,
      employeeNumber: clean(formData.get("employeeNumber")),
      kennitala: clean(formData.get("kennitala")),
      phone: clean(formData.get("phone")),
      email: clean(formData.get("email")),
      preferredLanguage: LANGUAGES.has(preferredLanguage) ? preferredLanguage : "is",
      createdById: userId,
      updatedById: userId,
    },
  });
  revalidateEmployee(employee.id);
  redirect(`/starfsmenn/${employee.id}`);
}

export async function createEmployeeFromUser(formData: FormData) {
  const { companyId, userId: actorId } = await requireEmployeeManager();
  const linkedUserId = Number(formData.get("userId"));
  if (!Number.isInteger(linkedUserId)) throw new Error("Ógildur notandi.");

  const membership = await prisma.userCompany.findFirst({
    where: { companyId, userId: linkedUserId, isActive: true, user: { isActive: true } },
    include: { user: { include: { settings: true } } },
  });
  if (!membership) throw new Error("Notandinn er ekki virkur hjá fyrirtækinu.");

  const existing = await prisma.employee.findFirst({
    where: { companyId, userId: linkedUserId },
  });
  if (existing) redirect(`/starfsmenn/${existing.id}`);

  const employee = await prisma.employee.create({
    data: {
      companyId,
      userId: linkedUserId,
      fullName: membership.user.name,
      email: membership.user.email,
      preferredLanguage: membership.user.settings?.interfaceLanguage ?? "is",
      createdById: actorId,
      updatedById: actorId,
    },
  });

  revalidateEmployee(employee.id);
  redirect(`/starfsmenn/${employee.id}`);
}

export async function updateEmployee(formData: FormData) {
  const { companyId, userId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  if (!Number.isInteger(employeeId)) throw new Error("Ógilt starfsmannaspjald.");

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
  if (!employee) throw new Error("Starfsmaður fannst ekki.");

  const employmentKindRaw = String(formData.get("employmentKind") ?? "EMPLOYEE");
  const preferredLanguageRaw = String(formData.get("preferredLanguage") ?? "is");
  const employmentPercent = optionalNumber(formData.get("employmentPercent"));
  if (employmentPercent !== null && (employmentPercent < 0 || employmentPercent > 100)) {
    throw new Error("Starfshlutfall verður að vera á bilinu 0–100%.");
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      employeeNumber: clean(formData.get("employeeNumber")),
      fullName: requiredText(formData.get("fullName"), "Nafn"),
      kennitala: clean(formData.get("kennitala")),
      address: clean(formData.get("address")),
      postalCode: clean(formData.get("postalCode")),
      city: clean(formData.get("city")),
      phone: clean(formData.get("phone")),
      email: clean(formData.get("email")),
      preferredLanguage: LANGUAGES.has(preferredLanguageRaw) ? preferredLanguageRaw : "is",
      jobTitle: clean(formData.get("jobTitle")),
      department: clean(formData.get("department")),
      employmentKind: EMPLOYMENT_KINDS.has(employmentKindRaw) ? employmentKindRaw : "EMPLOYEE",
      employmentStartDate: dateOnly(formData.get("employmentStartDate")),
      employmentEndDate: dateOnly(formData.get("employmentEndDate")),
      employmentPercent,
      notes: clean(formData.get("notes")),
      updatedById: userId,
    },
  });

  revalidateEmployee(employeeId);
}

export async function setEmployeeActiveStatus(formData: FormData) {
  const { companyId, userId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  const nextStatus = String(formData.get("nextStatus") ?? "") === "active";
  if (!Number.isInteger(employeeId)) throw new Error("Ógilt starfsmannaspjald.");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true, isActive: true },
  });
  if (!employee) throw new Error("Starfsmaður fannst ekki.");
  if (employee.isActive === nextStatus) {
    revalidateEmployee(employeeId);
    return;
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      isActive: nextStatus,
      updatedById: userId,
    },
  });

  revalidateEmployee(employeeId);
}

export async function addEmployeeCompensation(formData: FormData) {
  const { companyId, userId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  const validFrom = dateOnly(formData.get("validFrom"));
  if (!Number.isInteger(employeeId) || !validFrom) throw new Error("Starfsmaður og gildistími þurfa að vera skráð.");

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
  if (!employee) throw new Error("Starfsmaður fannst ekki.");

  const payTypeRaw = String(formData.get("payType") ?? "MONTHLY");
  const payType = PAY_TYPES.has(payTypeRaw) ? payTypeRaw : "MONTHLY";
  const monthlySalary = optionalNumber(formData.get("monthlySalary"));
  const hourlyRate = optionalNumber(formData.get("hourlyRate"));
  const internalCostPerMinute = optionalNumber(formData.get("internalCostPerMinute"));
  for (const value of [monthlySalary, hourlyRate, internalCostPerMinute]) {
    if (value !== null && value < 0) throw new Error("Launa- og kostnaðargildi mega ekki vera neikvæð.");
  }

  await prisma.$transaction(async (tx) => {
    const next = await tx.employeeCompensation.findFirst({
      where: { companyId, employeeId, validFrom: { gt: validFrom } },
      orderBy: { validFrom: "asc" },
      select: { validFrom: true },
    });
    const previous = await tx.employeeCompensation.findFirst({
      where: { companyId, employeeId, validFrom: { lt: validFrom } },
      orderBy: { validFrom: "desc" },
      select: { id: true, validTo: true },
    });
    if (previous && (!previous.validTo || previous.validTo >= validFrom)) {
      await tx.employeeCompensation.update({ where: { id: previous.id }, data: { validTo: dayBefore(validFrom) } });
    }

    const sameDate = await tx.employeeCompensation.findFirst({
      where: { companyId, employeeId, validFrom },
      select: { id: true },
    });
    const data = {
      payType,
      monthlySalary,
      hourlyRate,
      internalCostPerMinute,
      internalCostSource: "MANUAL",
      validTo: next ? dayBefore(next.validFrom) : null,
      notes: clean(formData.get("notes")),
      createdById: userId,
    };
    if (sameDate) {
      await tx.employeeCompensation.update({ where: { id: sameDate.id }, data });
    } else {
      await tx.employeeCompensation.create({ data: { companyId, employeeId, validFrom, ...data } });
    }
  });

  revalidateEmployee(employeeId);
}

export async function addEmployeeQualification(formData: FormData) {
  const { companyId, userId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  if (!Number.isInteger(employeeId)) throw new Error("Ógilt starfsmannaspjald.");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
  if (!employee) throw new Error("Starfsmaður fannst ekki.");

  const qualificationTypeRaw = String(formData.get("qualificationType") ?? "OTHER");
  await prisma.employeeQualification.create({
    data: {
      companyId,
      employeeId,
      qualificationType: QUALIFICATION_TYPES.has(qualificationTypeRaw) ? qualificationTypeRaw : "OTHER",
      title: requiredText(formData.get("title"), "Heiti réttinda"),
      issuer: clean(formData.get("issuer")),
      certificateNumber: clean(formData.get("certificateNumber")),
      qualificationCodes: clean(formData.get("qualificationCodes")),
      validFrom: dateOnly(formData.get("validFrom")),
      validUntil: dateOnly(formData.get("validUntil")),
      notes: clean(formData.get("notes")),
      createdById: userId,
    },
  });

  revalidateEmployee(employeeId);
}

export async function updateEmployeeQualification(formData: FormData) {
  const { companyId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  const qualificationId = Number(formData.get("qualificationId"));
  if (!Number.isInteger(employeeId) || !Number.isInteger(qualificationId)) {
    throw new Error("Ógild réttindafærsla.");
  }

  const qualification = await prisma.employeeQualification.findFirst({
    where: { id: qualificationId, employeeId, companyId },
    select: { id: true },
  });
  if (!qualification) throw new Error("Réttindafærslan fannst ekki.");

  const qualificationTypeRaw = String(formData.get("qualificationType") ?? "OTHER");
  await prisma.employeeQualification.update({
    where: { id: qualificationId },
    data: {
      qualificationType: QUALIFICATION_TYPES.has(qualificationTypeRaw) ? qualificationTypeRaw : "OTHER",
      title: requiredText(formData.get("title"), "Heiti réttinda"),
      issuer: clean(formData.get("issuer")),
      certificateNumber: clean(formData.get("certificateNumber")),
      qualificationCodes: clean(formData.get("qualificationCodes")),
      validFrom: dateOnly(formData.get("validFrom")),
      validUntil: dateOnly(formData.get("validUntil")),
      notes: clean(formData.get("notes")),
    },
  });

  revalidateEmployee(employeeId);
}
