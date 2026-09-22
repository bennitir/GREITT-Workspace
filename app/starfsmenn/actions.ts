"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCompanyAccess, getEffectiveUser, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";

const EMPLOYMENT_KINDS = new Set(["EMPLOYEE", "TEMPORARY", "APPRENTICE", "OTHER"]);
const PAY_TYPES = new Set(["MONTHLY", "HOURLY", "MIXED"]);
const QUALIFICATION_TYPES = new Set(["EDUCATION", "DRIVING_LICENSE", "MACHINE", "CERTIFICATION", "TRAINING", "OTHER"]);
const LANGUAGES = new Set(["is", "en", "pl", "sr"]);
const WORK_SCHEDULE_TYPES = new Set(["DAY", "DAY_FIXED_OVERTIME", "SHIFT", "ROLLING_SHIFT", "FLEXIBLE", "OTHER"]);
const INCIDENTAL_WORK_MODES = new Set(["NEVER", "MANUAL_ONLY", "AUTO_IF_NEEDED"]);
const WORK_EXECUTION_MODES = new Set(["ASSIGNED", "SELF_DIRECTED", "MIXED"]);

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

function optionalId(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const id = Number(text);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Ógilt auðkenni.");
  return id;
}

function dateOnly(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const localMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  let year: number;
  let month: number;
  let day: number;

  if (localMatch) {
    day = Number(localMatch[1]);
    month = Number(localMatch[2]);
    year = Number(localMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    throw new Error("Ógild dagsetning. Notaðu sniðið dd.mm.áááá.");
  }

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
  revalidatePath("/verk");
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
  const workScheduleTypeRaw = String(formData.get("workScheduleType") ?? "DAY");
  const employmentPercent = optionalNumber(formData.get("employmentPercent"));
  const contractedWeeklyHours = optionalNumber(formData.get("contractedWeeklyHours"));
  const fixedOvertimeHoursPerWeek = optionalNumber(formData.get("fixedOvertimeHoursPerWeek"));
  const contractedWeeklyMinutes = contractedWeeklyHours === null ? null : Math.round(contractedWeeklyHours * 60);
  const fixedOvertimeMinutesPerWeek = fixedOvertimeHoursPerWeek === null ? null : Math.round(fixedOvertimeHoursPerWeek * 60);
  const workplaceScheduleProfileId = optionalId(formData.get("workplaceScheduleProfileId"));
  const laborAgreementProfileId = optionalId(formData.get("laborAgreementProfileId"));
  const shiftPatternId = optionalId(formData.get("shiftPatternId"));
  const incidentalWorkModeRaw = String(formData.get("incidentalWorkMode") ?? "NEVER");
  const workExecutionModeRaw = String(formData.get("workExecutionMode") ?? "ASSIGNED");
  const departmentId = optionalId(formData.get("departmentId"));
  const selectedTeamIds = Array.from(new Set(formData.getAll("teamIds").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)));
  const primaryTeamId = optionalId(formData.get("primaryTeamId"));
  if (primaryTeamId && !selectedTeamIds.includes(primaryTeamId)) throw new Error("Aðalteymi þarf einnig að vera valið sem teymi.");

  if (employmentPercent !== null && (employmentPercent < 0 || employmentPercent > 100)) {
    throw new Error("Starfshlutfall verður að vera á bilinu 0–100%.");
  }
  for (const [label, value] of [
    ["Samningsbundinn vinnutími", contractedWeeklyMinutes],
    ["Fastir yfirvinnutímar", fixedOvertimeMinutesPerWeek],
  ] as const) {
    if (value !== null && (value < 0 || value > 10080)) {
      throw new Error(`${label} verður að vera á bilinu 0–10.080 mínútur á viku.`);
    }
  }

  const selectedStaffingRoleIds = Array.from(
    new Set(
      formData
        .getAll("staffingRoleIds")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
  const selectedWorkScopeIds = Array.from(
    new Set(
      formData
        .getAll("workScopeIds")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
  const primaryWorkScopeId = optionalId(formData.get("primaryWorkScopeId"));
  if (primaryWorkScopeId && !selectedWorkScopeIds.includes(primaryWorkScopeId)) {
    throw new Error("Aðalstarfssvið þarf einnig að vera valið sem venjulegt starfssvið.");
  }
  const primaryStaffingRoleId = optionalId(formData.get("primaryStaffingRoleId"));
  if (primaryStaffingRoleId && !selectedStaffingRoleIds.includes(primaryStaffingRoleId)) {
    throw new Error("Aðalmönnunarhlutverk þarf einnig að vera valið sem mönnunarhlutverk.");
  }

  const [workplace, agreement, shiftPattern, staffingRoleCount, workScopeCount, department, selectedTeams] = await Promise.all([
    workplaceScheduleProfileId
      ? prisma.workplaceScheduleProfile.findFirst({ where: { id: workplaceScheduleProfileId, companyId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    laborAgreementProfileId
      ? prisma.laborAgreementProfile.findFirst({ where: { id: laborAgreementProfileId, companyId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    shiftPatternId
      ? prisma.shiftPattern.findFirst({ where: { id: shiftPatternId, companyId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    selectedStaffingRoleIds.length
      ? prisma.staffingRole.count({ where: { id: { in: selectedStaffingRoleIds }, companyId, isActive: true } })
      : Promise.resolve(0),
    selectedWorkScopeIds.length
      ? prisma.workScope.count({ where: { id: { in: selectedWorkScopeIds }, companyId, isActive: true } })
      : Promise.resolve(0),
    departmentId
      ? prisma.companyDepartment.findFirst({ where: { id: departmentId, companyId, isActive: true }, select: { id: true, name: true } })
      : Promise.resolve(null),
    selectedTeamIds.length
      ? prisma.employeeTeam.findMany({ where: { id: { in: selectedTeamIds }, companyId, isActive: true }, select: { id: true, departmentId: true } })
      : Promise.resolve([]),
  ]);

  if (workplaceScheduleProfileId && !workplace) throw new Error("Vinnustaðarprófíll fannst ekki.");
  if (laborAgreementProfileId && !agreement) throw new Error("Kjarasamningsprófíll fannst ekki.");
  if (shiftPatternId && !shiftPattern) throw new Error("Vaktamynstur fannst ekki.");
  if (staffingRoleCount !== selectedStaffingRoleIds.length) throw new Error("Eitt eða fleiri mönnunarhlutverk fundust ekki.");
  if (workScopeCount !== selectedWorkScopeIds.length) throw new Error("Eitt eða fleiri starfssvið fundust ekki.");
  if (departmentId && !department) throw new Error("Deild fannst ekki.");
  if (selectedTeams.length !== selectedTeamIds.length) throw new Error("Eitt eða fleiri teymi fundust ekki.");
  if (selectedTeamIds.length > 0 && !departmentId) throw new Error("Velja þarf deild áður en starfsmaður er settur í fast teymi.");
  if (departmentId && selectedTeams.some((team) => team.departmentId !== departmentId)) throw new Error("Valin teymi þurfa að tilheyra deild starfsmanns.");

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
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
        departmentId,
        department: department?.name ?? clean(formData.get("department")),
        jobDescription: clean(formData.get("jobDescription")),
        employmentContractReference: clean(formData.get("employmentContractReference")),
        employmentContractNotes: clean(formData.get("employmentContractNotes")),
        employmentKind: EMPLOYMENT_KINDS.has(employmentKindRaw) ? employmentKindRaw : "EMPLOYEE",
        employmentStartDate: dateOnly(formData.get("employmentStartDate")),
        employmentEndDate: dateOnly(formData.get("employmentEndDate")),
        employmentPercent,
        workplaceScheduleProfileId,
        laborAgreementProfileId,
        shiftPatternId,
        workScheduleType: WORK_SCHEDULE_TYPES.has(workScheduleTypeRaw) ? workScheduleTypeRaw : "DAY",
        contractedWeeklyMinutes,
        fixedOvertimeMinutesPerWeek,
        workScheduleNotes: clean(formData.get("workScheduleNotes")),
        incidentalWorkMode: INCIDENTAL_WORK_MODES.has(incidentalWorkModeRaw) ? incidentalWorkModeRaw : "NEVER",
        incidentalWorkNotes: clean(formData.get("incidentalWorkNotes")),
        workExecutionMode: WORK_EXECUTION_MODES.has(workExecutionModeRaw) ? workExecutionModeRaw : "ASSIGNED",
        notes: clean(formData.get("notes")),
        updatedById: userId,
      },
    });

    await tx.employeeStaffingRole.updateMany({
      where: { companyId, employeeId },
      data: { isActive: false, isPrimary: false },
    });

    for (const staffingRoleId of selectedStaffingRoleIds) {
      await tx.employeeStaffingRole.upsert({
        where: { employeeId_staffingRoleId: { employeeId, staffingRoleId } },
        create: {
          companyId,
          employeeId,
          staffingRoleId,
          isActive: true,
          isPrimary: staffingRoleId === primaryStaffingRoleId,
        },
        update: {
          isActive: true,
          isPrimary: staffingRoleId === primaryStaffingRoleId,
        },
      });
    }

    await tx.employeeWorkScope.updateMany({
      where: { companyId, employeeId },
      data: { isActive: false, isPrimary: false },
    });

    for (const workScopeId of selectedWorkScopeIds) {
      await tx.employeeWorkScope.upsert({
        where: { employeeId_workScopeId: { employeeId, workScopeId } },
        create: {
          companyId,
          employeeId,
          workScopeId,
          isActive: true,
          isPrimary: workScopeId === primaryWorkScopeId,
        },
        update: {
          isActive: true,
          isPrimary: workScopeId === primaryWorkScopeId,
        },
      });
    }

    await tx.employeeTeamMembership.updateMany({
      where: { companyId, employeeId },
      data: { isActive: false, isPrimary: false },
    });

    for (const teamId of selectedTeamIds) {
      await tx.employeeTeamMembership.upsert({
        where: { employeeId_teamId: { employeeId, teamId } },
        create: { companyId, employeeId, teamId, isActive: true, isPrimary: teamId === primaryTeamId },
        update: { isActive: true, isPrimary: teamId === primaryTeamId },
      });
    }
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

export async function updateEmployeeCompensation(formData: FormData) {
  const { companyId } = await requireEmployeeManager();
  const employeeId = Number(formData.get("employeeId"));
  const compensationId = Number(formData.get("compensationId"));
  const validFrom = dateOnly(formData.get("validFrom"));
  if (!Number.isInteger(employeeId) || !Number.isInteger(compensationId) || !validFrom) {
    throw new Error("Starfsmaður, launafærsla og gildistími þurfa að vera skráð.");
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true },
  });
  if (!employee) throw new Error("Starfsmaður fannst ekki.");

  const rows = await prisma.employeeCompensation.findMany({
    where: { companyId, employeeId },
    orderBy: { validFrom: "asc" },
    select: { id: true, validFrom: true, validTo: true },
  });
  const index = rows.findIndex((row) => row.id === compensationId);
  if (index < 0) throw new Error("Launafærslan fannst ekki.");

  const current = rows[index];
  const previous = index > 0 ? rows[index - 1] : null;
  const next = index < rows.length - 1 ? rows[index + 1] : null;

  // Leiðrétting á gildistíma má ekki færa færsluna yfir aðra sögulega færslu.
  // Þannig helst röð launasögunnar ótvíræð og gildistímabil skarast ekki.
  if (previous && validFrom <= previous.validFrom) {
    throw new Error("Gildir frá verður að vera eftir upphaf fyrri launafærslu.");
  }
  if (next && validFrom >= next.validFrom) {
    throw new Error("Gildir frá verður að vera fyrir upphaf næstu launafærslu.");
  }

  const payTypeRaw = String(formData.get("payType") ?? "MONTHLY");
  const payType = PAY_TYPES.has(payTypeRaw) ? payTypeRaw : "MONTHLY";
  const monthlySalary = optionalNumber(formData.get("monthlySalary"));
  const hourlyRate = optionalNumber(formData.get("hourlyRate"));
  const internalCostPerMinute = optionalNumber(formData.get("internalCostPerMinute"));
  for (const value of [monthlySalary, hourlyRate, internalCostPerMinute]) {
    if (value !== null && value < 0) throw new Error("Launa- og kostnaðargildi mega ekki vera neikvæð.");
  }

  await prisma.$transaction(async (tx) => {
    if (previous) {
      const oldBoundary = dayBefore(current.validFrom);
      const shouldFollowMovedStart =
        previous.validTo === null ||
        previous.validTo.getTime() === oldBoundary.getTime() ||
        previous.validTo >= validFrom;

      if (shouldFollowMovedStart) {
        await tx.employeeCompensation.update({
          where: { id: previous.id },
          data: { validTo: dayBefore(validFrom) },
        });
      }
    }

    let validTo = current.validTo;
    if (next) {
      validTo = dayBefore(next.validFrom);
    } else if (validTo && validTo < validFrom) {
      validTo = null;
    }

    await tx.employeeCompensation.update({
      where: { id: compensationId },
      data: {
        validFrom,
        validTo,
        payType,
        monthlySalary,
        hourlyRate,
        internalCostPerMinute,
        internalCostSource: "MANUAL",
        notes: clean(formData.get("notes")),
      },
    });
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
