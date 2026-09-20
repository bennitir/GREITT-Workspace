"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEffectiveUser, requireActiveCompanyWriteAccess } from "@/lib/core/access-control";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { workResourceText } from "@/lib/i18n/work-resources";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { prisma } from "@/lib/prisma";
import { nextMaintenanceDueValue } from "@/lib/work10/maintenance";
import { removeWorkResourceMedia, saveWorkResourceMeterPhoto } from "@/lib/work10/resource-media";
import {
  WORK10_RESOURCE_UNITS,
  defaultResourceUnit,
  isWork10EquipmentKind,
  isWork10ResourceStatus,
} from "@/lib/work10/resources";

type ResourceErrors = ReturnType<typeof workResourceText>["errors"];

function optionalNumber(value: FormDataEntryValue | null, errors: ResourceErrors) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(errors.invalidNumber);
  return parsed;
}

function positiveNumber(value: FormDataEntryValue | null, errors: ResourceErrors) {
  const parsed = optionalNumber(value, errors);
  if (parsed === null) throw new Error(errors.numberRequired);
  return parsed;
}

function dateOnly(value: FormDataEntryValue | null, errors: ResourceErrors) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(errors.invalidDate);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}


function optionalMaintenanceNumber(value: FormDataEntryValue | null, errorMessage: string) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(errorMessage);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(errorMessage);
  return parsed;
}

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, "-").toUpperCase();
}

function revalidateResources() {
  revalidatePath("/verk");
  revalidatePath("/verk/tilfong");
  revalidatePath("/mobile/verk");
}

async function resourceActionContext() {
  const effectiveUser = await getEffectiveUser();
  const settings = effectiveUser
    ? await prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
    : null;
  return {
    effectiveUser,
    language: normalizeUiLanguage(settings?.interfaceLanguage ?? "is"),
    t: workResourceText(settings?.interfaceLanguage ?? "is"),
  };
}

export async function createWorkResource(formData: FormData) {
  const { effectiveUser, language, t } = await resourceActionContext();
  const kind = String(formData.get("kind") ?? "").trim();
  const code = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const requestedUnit = String(formData.get("baseUnit") ?? "").trim();
  const customUnit = String(formData.get("customUnit") ?? "").trim();
  const meterUnit = String(formData.get("meterUnit") ?? "").trim();
  const costRateIsk = optionalNumber(formData.get("costRateIsk"), t.errors);
  const saleRateIsk = optionalNumber(formData.get("saleRateIsk"), t.errors);

  if (!isWork10EquipmentKind(kind)) throw new Error(t.errors.invalidKind);
  if (!code || code.length > 60) throw new Error(t.errors.invalidCode);
  if (!name || name.length > 160) throw new Error(t.errors.invalidName);
  if (description.length > 1000) throw new Error(t.errors.descriptionTooLong);

  const baseUnit = requestedUnit || defaultResourceUnit(kind);
  if (!(WORK10_RESOURCE_UNITS as readonly string[]).includes(baseUnit)) {
    throw new Error(t.errors.invalidUnit);
  }
  if (baseUnit === "CUSTOM" && !customUnit) throw new Error(t.errors.customUnitRequired);

  const companyId = await requireActiveCompanyWriteAccess();
  const userId = effectiveUser?.id ?? null;

  const existing = await prisma.workResource.findFirst({ where: { companyId, code }, select: { id: true } });
  if (existing) redirect("/verk/tilfong?createError=duplicateCode");

  await prisma.$transaction(async (tx) => {
    const resource = await tx.workResource.create({
      data: {
        companyId,
        kind,
        code,
        name,
        description: description || null,
        sourceLanguage: language,
        baseUnit,
        customUnit: baseUnit === "CUSTOM" ? customUnit : null,
        costRateIsk,
        saleRateIsk,
        meterUnit: meterUnit || (kind === "MACHINE" || kind === "VEHICLE" ? baseUnit : null),
        qrToken: randomBytes(8).toString("hex"),
        createdById: userId,
        updatedById: userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_RESOURCE",
        entityId: resource.id,
        action: "CREATED",
        source: "USER",
        description: t.auditCreated,
        afterData: { kind, code, name, baseUnit },
      },
    });
  });

  revalidateResources();
}


export async function updateWorkResourceDetails(formData: FormData) {
  const { effectiveUser, t } = await resourceActionContext();
  const resourceId = Number(formData.get("resourceId"));
  const code = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseUnit = String(formData.get("baseUnit") ?? "").trim();
  const customUnit = String(formData.get("customUnit") ?? "").trim();
  const meterUnit = String(formData.get("meterUnit") ?? "").trim();
  const costRateIsk = optionalNumber(formData.get("costRateIsk"), t.errors);
  const saleRateIsk = optionalNumber(formData.get("saleRateIsk"), t.errors);

  if (!Number.isInteger(resourceId)) throw new Error(t.errors.invalidResource);
  if (!code || code.length > 60) throw new Error(t.errors.invalidCode);
  if (!name || name.length > 160) throw new Error(t.errors.invalidName);
  if (description.length > 1000) throw new Error(t.errors.descriptionTooLong);
  if (!(WORK10_RESOURCE_UNITS as readonly string[]).includes(baseUnit)) throw new Error(t.errors.invalidUnit);
  if (baseUnit === "CUSTOM" && !customUnit) throw new Error(t.errors.customUnitRequired);
  if (meterUnit.length > 40) throw new Error(t.errors.invalidUnit);

  const companyId = await requireActiveCompanyWriteAccess();
  const resource = await prisma.workResource.findFirst({
    where: { id: resourceId, companyId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      baseUnit: true,
      customUnit: true,
      costRateIsk: true,
      saleRateIsk: true,
      meterUnit: true,
    },
  });
  if (!resource) throw new Error(t.errors.resourceNotFound);

  const duplicateCode = await prisma.workResource.findFirst({
    where: { companyId, code, id: { not: resourceId } },
    select: { id: true },
  });
  if (duplicateCode) redirect("/verk/tilfong?createError=duplicateCode");

  const next = {
    code,
    name,
    description: description || null,
    baseUnit,
    customUnit: baseUnit === "CUSTOM" ? customUnit : null,
    costRateIsk,
    saleRateIsk,
    meterUnit: meterUnit || null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.workResource.update({
      where: { id: resourceId },
      data: { ...next, updatedById: effectiveUser?.id ?? null },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_RESOURCE",
        entityId: resourceId,
        action: "UPDATED",
        source: "USER",
        description: t.auditUpdated,
        beforeData: resource,
        afterData: next,
      },
    });
  });

  revalidateResources();
}

export async function updateWorkResourceStatus(formData: FormData) {
  const { effectiveUser, t } = await resourceActionContext();
  const resourceId = Number(formData.get("resourceId"));
  const status = String(formData.get("status") ?? "").trim();
  if (!Number.isInteger(resourceId) || !isWork10ResourceStatus(status)) throw new Error(t.errors.invalidStatus);

  const companyId = await requireActiveCompanyWriteAccess();
  const userId = effectiveUser?.id ?? null;
  const resource = await prisma.workResource.findFirst({ where: { id: resourceId, companyId }, select: { id: true, status: true } });
  if (!resource) throw new Error(t.errors.resourceNotFound);
  if (resource.status === status) return;

  await prisma.$transaction(async (tx) => {
    await tx.workResource.update({
      where: { id: resourceId },
      data: { status, isActive: status !== "INACTIVE", updatedById: userId },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_RESOURCE",
        entityId: resourceId,
        action: "STATUS_CHANGED",
        source: "USER",
        description: t.auditStatusChanged,
        beforeData: { status: resource.status },
        afterData: { status },
      },
    });
  });
  revalidateResources();
}

export async function addWorkResourceMember(formData: FormData) {
  const { effectiveUser, t } = await resourceActionContext();
  const resourceId = Number(formData.get("resourceId"));
  const employeeId = Number(formData.get("employeeId"));
  const roleLabel = String(formData.get("roleLabel") ?? "").trim();
  if (!Number.isInteger(resourceId) || !Number.isInteger(employeeId)) throw new Error(t.errors.invalidTeamLink);
  if (roleLabel.length > 120) throw new Error(t.errors.roleTooLong);

  const companyId = await requireActiveCompanyWriteAccess();
  const [resource, employee] = await Promise.all([
    prisma.workResource.findFirst({ where: { id: resourceId, companyId, kind: "TEAM", isActive: true }, select: { id: true } }),
    prisma.employee.findFirst({ where: { id: employeeId, companyId, isActive: true }, select: { id: true, fullName: true } }),
  ]);
  if (!resource || !employee) throw new Error(t.errors.teamOrEmployeeMissing);

  const existing = await prisma.workResourceMember.findFirst({
    where: { companyId, workResourceId: resourceId, employeeId, removedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const member = await tx.workResourceMember.create({
        data: { companyId, workResourceId: resourceId, employeeId, roleLabel: roleLabel || null, createdById: effectiveUser?.id ?? null },
      });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_RESOURCE_MEMBER",
          entityId: member.id,
          parentEntityType: "WORK_RESOURCE",
          parentEntityId: resourceId,
          action: "MEMBER_ADDED",
          source: "USER",
          description: t.auditMemberAdded,
          afterData: { employeeId, roleLabel: roleLabel || null },
        },
      });
    });
  }
  revalidateResources();
}

export async function removeWorkResourceMember(formData: FormData) {
  const { effectiveUser, t } = await resourceActionContext();
  const memberId = Number(formData.get("memberId"));
  if (!Number.isInteger(memberId)) throw new Error(t.errors.invalidTeamLink);
  const companyId = await requireActiveCompanyWriteAccess();
  const member = await prisma.workResourceMember.findFirst({
    where: { id: memberId, companyId, removedAt: null },
    select: { id: true, workResourceId: true, employeeId: true },
  });
  if (member) {
    const removedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.workResourceMember.update({ where: { id: member.id }, data: { removedAt } });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_RESOURCE_MEMBER",
          entityId: member.id,
          parentEntityType: "WORK_RESOURCE",
          parentEntityId: member.workResourceId,
          action: "MEMBER_REMOVED",
          source: "USER",
          description: t.auditMemberRemoved,
          beforeData: { employeeId: member.employeeId, removedAt: null },
          afterData: { employeeId: member.employeeId, removedAt: removedAt.toISOString() },
        },
      });
    });
  }
  revalidateResources();
}

export async function addWorkResourceMeterReading(formData: FormData) {
  const { effectiveUser, language, t } = await resourceActionContext();
  const ops = workResourceOperationsText(language);
  const resourceId = Number(formData.get("resourceId"));
  const readingAt = dateOnly(formData.get("readingAt"), t.errors);
  const value = positiveNumber(formData.get("value"), t.errors);
  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");
  if (!Number.isInteger(resourceId)) throw new Error(t.errors.invalidResource);
  if (note.length > 500) throw new Error(t.errors.noteTooLong);

  const companyId = await requireActiveCompanyWriteAccess();
  const resource = await prisma.workResource.findFirst({
    where: { id: resourceId, companyId, kind: { in: ["MACHINE", "VEHICLE", "TOOL"] }, isActive: true },
    select: { id: true, kind: true, baseUnit: true, customUnit: true, meterUnit: true, meterValue: true },
  });
  if (!resource) throw new Error(t.errors.meterUnsupported);
  if (resource.meterValue !== null && value + 1e-9 < resource.meterValue) throw new Error(t.errors.invalidNumber);
  const unit = resource.meterUnit?.trim() || resource.baseUnit?.trim() || defaultResourceUnit(resource.kind as "MACHINE" | "VEHICLE" | "TOOL");
  const photoPath = await saveWorkResourceMeterPhoto(photo instanceof File ? photo : null, companyId, resourceId);

  try {
    await prisma.$transaction(async (tx) => {
      const reading = await tx.workResourceMeterReading.create({
        data: { companyId, workResourceId: resourceId, readingAt, value, unit, note: note || null, photoPath, createdById: effectiveUser?.id ?? null },
      });
      await tx.workResource.update({ where: { id: resourceId }, data: { meterValue: value, updatedById: effectiveUser?.id ?? null } });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_RESOURCE_METER_READING",
          entityId: reading.id,
          parentEntityType: "WORK_RESOURCE",
          parentEntityId: resourceId,
          action: "CREATED",
          source: "USER",
          description: photoPath ? ops.audit.meterPhotoAdded : t.auditMeterReadingCreated,
          afterData: { value, unit, readingAt: readingAt.toISOString(), photoPath: photoPath ?? undefined },
        },
      });
    });
  } catch (error) {
    await removeWorkResourceMedia(photoPath);
    throw error;
  }
  revalidateResources();
}

export async function createWorkResourceMaintenanceKey(formData: FormData) {
  const { effectiveUser, language } = await resourceActionContext();
  const ops = workResourceOperationsText(language);
  const resourceId = Number(formData.get("resourceId"));
  const code = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const intervalValue = optionalMaintenanceNumber(formData.get("intervalValue"), ops.errors.invalidInterval);
  const warningLeadValue = optionalMaintenanceNumber(formData.get("warningLeadValue"), ops.errors.invalidInterval);

  if (!Number.isInteger(resourceId) || !code || code.length > 60) throw new Error(ops.errors.invalidMaintenance);
  if (!name || name.length > 160) throw new Error(ops.errors.maintenanceNameRequired);
  if (description.length > 1000) throw new Error(ops.errors.noteTooLong);
  if (intervalValue !== null && intervalValue <= 0) throw new Error(ops.errors.invalidInterval);
  if (warningLeadValue !== null && warningLeadValue < 0) throw new Error(ops.errors.invalidInterval);

  const companyId = await requireActiveCompanyWriteAccess();
  const resource = await prisma.workResource.findFirst({
    where: { id: resourceId, companyId, kind: { in: ["MACHINE", "VEHICLE", "TOOL"] } },
    select: { id: true, meterValue: true },
  });
  if (!resource) throw new Error(ops.errors.resourceMissing);
  const duplicate = await prisma.workResourceMaintenanceKey.findFirst({
    where: { companyId, workResourceId: resourceId, code },
    select: { id: true },
  });
  if (duplicate) throw new Error(ops.errors.duplicateMaintenanceCode);

  const nextDueMeterValue = nextMaintenanceDueValue(resource.meterValue, intervalValue);
  await prisma.$transaction(async (tx) => {
    const key = await tx.workResourceMaintenanceKey.create({
      data: {
        companyId,
        workResourceId: resourceId,
        code,
        name,
        description: description || null,
        intervalValue,
        warningLeadValue,
        nextDueMeterValue,
        createdById: effectiveUser?.id ?? null,
        updatedById: effectiveUser?.id ?? null,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_RESOURCE_MAINTENANCE_KEY",
        entityId: key.id,
        parentEntityType: "WORK_RESOURCE",
        parentEntityId: resourceId,
        action: "CREATED",
        source: "USER",
        description: ops.audit.maintenanceKeyCreated,
        afterData: { code, name, intervalValue, warningLeadValue, nextDueMeterValue },
      },
    });
  });
  revalidateResources();
}

export async function completeWorkResourceMaintenance(formData: FormData) {
  const { effectiveUser, language } = await resourceActionContext();
  const ops = workResourceOperationsText(language);
  const maintenanceKeyId = Number(formData.get("maintenanceKeyId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isInteger(maintenanceKeyId)) throw new Error(ops.errors.invalidMaintenance);
  if (note.length > 1000) throw new Error(ops.errors.noteTooLong);

  const companyId = await requireActiveCompanyWriteAccess();
  const key = await prisma.workResourceMaintenanceKey.findFirst({
    where: { id: maintenanceKeyId, companyId, isActive: true },
    include: { workResource: { select: { id: true, meterValue: true } } },
  });
  if (!key) throw new Error(ops.errors.invalidMaintenance);
  const completedAt = new Date();
  const meterValue = key.workResource.meterValue;
  const nextDueMeterValue = nextMaintenanceDueValue(meterValue, key.intervalValue);

  await prisma.$transaction(async (tx) => {
    const log = await tx.workResourceMaintenanceLog.create({
      data: {
        companyId,
        workResourceId: key.workResourceId,
        maintenanceKeyId: key.id,
        completedAt,
        meterValue,
        note: note || null,
        source: "MANUAL",
        createdById: effectiveUser?.id ?? null,
      },
    });
    await tx.workResourceMaintenanceKey.update({
      where: { id: key.id },
      data: {
        lastCompletedAt: completedAt,
        lastCompletedMeterValue: meterValue,
        nextDueMeterValue,
        updatedById: effectiveUser?.id ?? null,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_RESOURCE_MAINTENANCE_LOG",
        entityId: log.id,
        parentEntityType: "WORK_RESOURCE",
        parentEntityId: key.workResourceId,
        action: "MAINTENANCE_COMPLETED",
        source: "USER",
        description: ops.audit.maintenanceCompleted,
        afterData: { maintenanceKeyId: key.id, meterValue, nextDueMeterValue },
      },
    });
  });
  revalidateResources();
}
