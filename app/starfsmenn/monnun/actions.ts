"use server";

import { revalidatePath } from "next/cache";
import { getCompanyAccess, getEffectiveUser, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";

const PATTERN_TYPES = new Set(["FIXED_SHIFT", "ROLLING", "FLEXIBLE", "OTHER"]);
const DEPARTMENT_TYPES = new Set(["DIVISION", "DEPARTMENT", "UNIT", "WARD", "OTHER"]);
const TEAM_TYPES = new Set(["FIXED", "FLEXIBLE", "SUPPORT"]);

async function requireManager() {
  const companyId = await requireActiveCompanyReadAccess();
  const [access, user] = await Promise.all([getCompanyAccess(companyId), getEffectiveUser()]);
  if (!(access.role === "ADMIN" || access.role === "OWNER" || access.role === "MANAGER" || access.canManageCompanySettings)) {
    throw new Error("Þú hefur ekki heimild til að breyta mönnunarstillingum.");
  }
  if (!user) throw new Error("Innskráning vantar.");
  return { companyId };
}

function clean(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function required(value: FormDataEntryValue | null, label: string) {
  const text = clean(value);
  if (!text) throw new Error(`${label} vantar.`);
  return text;
}

function int(value: FormDataEntryValue | null, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(String(value ?? "").trim());
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Ógilt gildi fyrir ${label}.`);
  return number;
}

function optionalId(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const id = Number(text);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Ógilt auðkenni.");
  return id;
}

function minutesFromClock(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`${label} þarf að vera HH:mm.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`Ógildur tími fyrir ${label}.`);
  return hour * 60 + minute;
}

function dateOnly(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const local = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let year: number, month: number, day: number;
  if (local) { day = Number(local[1]); month = Number(local[2]); year = Number(local[3]); }
  else if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
  else throw new Error("Ógild dagsetning.");
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Ógild dagsetning.");
  return date;
}

function revalidate() {
  revalidatePath("/starfsmenn");
  revalidatePath("/starfsmenn/monnun");
  revalidatePath("/verk");
  revalidatePath("/vinnustundir");
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}



export async function createDepartment(formData: FormData) {
  const { companyId } = await requireManager();
  const name = required(formData.get("name"), "Heiti");
  const code = normalizeCode(required(formData.get("code"), "Kóða"));
  const parentId = optionalId(formData.get("parentId"));
  const unitTypeRaw = String(formData.get("unitType") ?? "DEPARTMENT");
  const existing = await prisma.companyDepartment.findUnique({
    where: { companyId_code: { companyId, code } },
    select: { id: true },
  });
  if (parentId) {
    const parent = await prisma.companyDepartment.findFirst({ where: { id: parentId, companyId, isActive: true }, select: { id: true } });
    if (!parent) throw new Error("Yfireining fannst ekki.");
    if (existing?.id === parentId) throw new Error("Eining getur ekki verið eigin yfireining.");
  }
  await prisma.companyDepartment.upsert({
    where: { companyId_code: { companyId, code } },
    create: { companyId, code, name, parentId, unitType: DEPARTMENT_TYPES.has(unitTypeRaw) ? unitTypeRaw : "OTHER", notes: clean(formData.get("notes")) },
    update: { name, parentId, unitType: DEPARTMENT_TYPES.has(unitTypeRaw) ? unitTypeRaw : "OTHER", isActive: true, notes: clean(formData.get("notes")) },
  });
  revalidate();
}

export async function createEmployeeTeam(formData: FormData) {
  const { companyId } = await requireManager();
  const departmentId = int(formData.get("departmentId"), "deild", 1);
  const department = await prisma.companyDepartment.findFirst({ where: { id: departmentId, companyId, isActive: true }, select: { id: true } });
  if (!department) throw new Error("Deild fannst ekki.");
  const code = normalizeCode(required(formData.get("code"), "Kóða"));
  const teamTypeRaw = String(formData.get("teamType") ?? "FIXED");
  await prisma.employeeTeam.upsert({
    where: { companyId_code: { companyId, code } },
    create: { companyId, departmentId, code, name: required(formData.get("name"), "Heiti"), teamType: TEAM_TYPES.has(teamTypeRaw) ? teamTypeRaw : "FIXED", notes: clean(formData.get("notes")) },
    update: { departmentId, name: required(formData.get("name"), "Heiti"), teamType: TEAM_TYPES.has(teamTypeRaw) ? teamTypeRaw : "FIXED", isActive: true, notes: clean(formData.get("notes")) },
  });
  revalidate();
}

export async function createWorkScope(formData: FormData) {
  const { companyId } = await requireManager();
  const name = required(formData.get("name"), "Heiti");
  const code = normalizeCode(required(formData.get("code"), "Kóða"));
  if (!code) throw new Error("Kóði þarf að innihalda bókstafi eða tölur.");
  await prisma.workScope.upsert({
    where: { companyId_code: { companyId, code } },
    create: { companyId, code, name, description: clean(formData.get("description")) },
    update: { name, description: clean(formData.get("description")), isActive: true },
  });
  revalidate();
}

export async function createStaffingRole(formData: FormData) {
  const { companyId } = await requireManager();
  const name = required(formData.get("name"), "Heiti");
  const code = normalizeCode(required(formData.get("code"), "Kóða"));
  if (!code) throw new Error("Kóði þarf að innihalda bókstafi eða tölur.");
  await prisma.staffingRole.upsert({
    where: { companyId_code: { companyId, code } },
    create: { companyId, code, name, description: clean(formData.get("description")) },
    update: { name, description: clean(formData.get("description")), isActive: true },
  });
  revalidate();
}

export async function createShiftPattern(formData: FormData) {
  const { companyId } = await requireManager();
  const typeRaw = String(formData.get("patternType") ?? "FIXED_SHIFT");
  await prisma.shiftPattern.create({
    data: {
      companyId,
      code: clean(formData.get("code")),
      name: required(formData.get("name"), "Heiti"),
      patternType: PATTERN_TYPES.has(typeRaw) ? typeRaw : "OTHER",
      cycleLengthDays: int(formData.get("cycleLengthDays"), "lengd lotu", 1, 366),
      anchorDate: dateOnly(formData.get("anchorDate")),
      notes: clean(formData.get("notes")),
    },
  });
  revalidate();
}

export async function addShiftPatternSlot(formData: FormData) {
  const { companyId } = await requireManager();
  const shiftPatternId = int(formData.get("shiftPatternId"), "vaktamynstur", 1);
  const pattern = await prisma.shiftPattern.findFirst({ where: { id: shiftPatternId, companyId }, select: { id: true, cycleLengthDays: true } });
  if (!pattern) throw new Error("Vaktamynstur fannst ekki.");
  const dayOffset = int(formData.get("dayOffset"), "dag í lotu", 0, pattern.cycleLengthDays - 1);
  const maxSequence = await prisma.shiftPatternSlot.aggregate({ where: { shiftPatternId, dayOffset }, _max: { sequence: true } });
  await prisma.shiftPatternSlot.create({
    data: {
      companyId,
      shiftPatternId,
      dayOffset,
      sequence: (maxSequence._max.sequence ?? 0) + 1,
      shiftCode: required(formData.get("shiftCode"), "Vaktakóða"),
      label: required(formData.get("label"), "Heiti vaktar"),
      startMinutes: minutesFromClock(formData.get("start"), "Upphaf"),
      durationMinutes: int(formData.get("durationMinutes"), "lengd vaktar", 1, 1440),
    },
  });
  revalidate();
}

export async function createCoverageProfile(formData: FormData) {
  const { companyId } = await requireManager();
  const workplaceScheduleProfileId = optionalId(formData.get("workplaceScheduleProfileId"));
  const shiftPatternId = optionalId(formData.get("shiftPatternId"));
  const departmentId = optionalId(formData.get("departmentId"));
  if (workplaceScheduleProfileId) {
    const workplace = await prisma.workplaceScheduleProfile.findFirst({ where: { id: workplaceScheduleProfileId, companyId }, select: { id: true } });
    if (!workplace) throw new Error("Vinnustaður fannst ekki.");
  }
  if (shiftPatternId) {
    const pattern = await prisma.shiftPattern.findFirst({ where: { id: shiftPatternId, companyId }, select: { id: true } });
    if (!pattern) throw new Error("Vaktamynstur fannst ekki.");
  }
  const department = departmentId
    ? await prisma.companyDepartment.findFirst({ where: { id: departmentId, companyId, isActive: true }, select: { id: true, name: true } })
    : null;
  if (departmentId && !department) throw new Error("Deild fannst ekki.");
  await prisma.staffingCoverageProfile.create({
    data: {
      companyId,
      name: required(formData.get("name"), "Heiti"),
      workplaceScheduleProfileId,
      shiftPatternId,
      departmentId,
      department: department?.name ?? clean(formData.get("department")),
      notes: clean(formData.get("notes")),
    },
  });
  revalidate();
}

export async function addCoverageRule(formData: FormData) {
  const { companyId } = await requireManager();
  const staffingCoverageProfileId = int(formData.get("staffingCoverageProfileId"), "mönnunarprófíl", 1);
  const staffingRoleId = int(formData.get("staffingRoleId"), "mönnunarhlutverk", 1);
  const [profile, role] = await Promise.all([
    prisma.staffingCoverageProfile.findFirst({ where: { id: staffingCoverageProfileId, companyId }, select: { id: true } }),
    prisma.staffingRole.findFirst({ where: { id: staffingRoleId, companyId, isActive: true }, select: { id: true } }),
  ]);
  if (!profile || !role) throw new Error("Mönnunarprófíll eða hlutverk fannst ekki.");
  const days = formData.getAll("dayOfWeek").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const validFrom = dateOnly(formData.get("validFrom"));
  const validTo = dateOnly(formData.get("validTo"));
  if (validFrom && validTo && validTo < validFrom) throw new Error("Gildir til má ekki vera fyrr en Gildir frá.");
  await prisma.staffingCoverageRule.create({
    data: {
      companyId,
      staffingCoverageProfileId,
      staffingRoleId,
      label: clean(formData.get("label")),
      dayOfWeekMask: days.length ? Array.from(new Set(days)).sort().join(",") : null,
      startMinutes: minutesFromClock(formData.get("start"), "Upphaf"),
      endMinutes: minutesFromClock(formData.get("end"), "Lok"),
      minimumCount: int(formData.get("minimumCount"), "lágmarksfjölda", 1, 10000),
      validFrom,
      validTo,
      notes: clean(formData.get("notes")),
    },
  });
  revalidate();
}
