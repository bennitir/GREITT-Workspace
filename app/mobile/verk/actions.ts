"use server";

import { revalidatePath } from "next/cache";

import { workMobileText } from "@/lib/i18n/work-mobile";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { prisma } from "@/lib/prisma";
import { nextMaintenanceDueValue } from "@/lib/work10/maintenance";
import { removeWorkResourceMedia, saveWorkResourceMeterPhoto } from "@/lib/work10/resource-media";
import { removeWorkEvidenceMedia, saveWorkEvidencePhoto } from "@/lib/work10/work-evidence-media";
import { requireMobileWorkEmployee } from "@/lib/work10/mobile-access";
import { operationalLocationLabel } from "@/lib/work10/location-format";
import { resolveHmsOperationalLocation } from "@/lib/work10/iceland-address";
import {
  defaultResourceUnit,
  isWork10PersistentResourceKind,
  resourceUsageKind,
} from "@/lib/work10/resources";
import { deriveWork10Status } from "@/lib/work10/status";
import {
  isWork10PartTerminalStatus,
  work10UnresolvedPredecessorIds,
} from "@/lib/work10/workflow";

function numberField(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function positiveNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function textField(value: FormDataEntryValue | null, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function diaryEnabled(workExecutionMode: string) {
  return workExecutionMode === "SELF_DIRECTED" || workExecutionMode === "MIXED";
}

function workDateFromNow(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

type OperationalLocationSnapshot = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
};

function operationalLocationSnapshot(location: OperationalLocationSnapshot | null | undefined) {
  const label = operationalLocationLabel(location);
  return label || null;
}

function effectivePhotoRequirement(partRequirement: string, workRequirement: string) {
  return partRequirement === "INHERIT" ? workRequirement : partRequirement;
}

function requiredEvidenceStage(requirement: string) {
  if (requirement === "START") return "START";
  if (requirement === "PROGRESS") return "PROGRESS";
  if (requirement === "PART_COMPLETE") return "PART_COMPLETE";
  return null;
}

function revalidateMobileWork(workOrderId: number) {
  revalidatePath("/mobile/verk");
  revalidatePath(`/mobile/verk/${workOrderId}`);
  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

async function loadWorkPartForMobile(
  companyId: number,
  workOrderId: number,
  workPartId: number,
) {
  return prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      photoRequirement: true,
      workParts: {
        orderBy: { sequence: "asc" },
        select: { id: true, status: true, sequence: true, title: true, photoRequirement: true },
      },
    },
  }).then(async (work) => {
    if (!work) return null;
    const dependencies = await prisma.workPartDependency.findMany({
      where: { companyId, workOrderId },
      select: { predecessorPartId: true, successorPartId: true },
    });
    const part = work.workParts.find((item) => item.id === workPartId) ?? null;
    return { work, part, dependencies };
  });
}

async function updateWorkAndPartStatus(params: {
  companyId: number;
  userId: number;
  workOrderId: number;
  workPartId: number;
  requestedStatus: string;
  auditDescription: string;
}) {
  const { companyId, userId, workOrderId, workPartId, requestedStatus, auditDescription } = params;
  const loaded = await loadWorkPartForMobile(companyId, workOrderId, workPartId);
  if (!loaded?.part) return false;
  if (loaded.work.status === "COMPLETED" || loaded.work.status === "CANCELLED") {
    return false;
  }

  const nextParts = loaded.work.workParts.map((item) =>
    item.id === workPartId ? { ...item, status: requestedStatus } : item,
  );
  const nextWorkStatus = deriveWork10Status(loaded.work.status, nextParts);
  const now = new Date();
  const shouldHaveStarted = nextParts.some(
    (item) => item.status === "IN_PROGRESS" || isWork10PartTerminalStatus(item.status),
  );

  await prisma.$transaction(async (tx) => {
    if (loaded.part!.status !== requestedStatus) {
      await tx.workPart.update({
        where: { id: workPartId },
        data: { status: requestedStatus, updatedById: userId },
      });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId,
          entityType: "WORK_PART",
          entityId: workPartId,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: "STATUS_CHANGED",
          source: "MOBILE",
          description: auditDescription,
          beforeData: { status: loaded.part!.status },
          afterData: { status: requestedStatus },
        },
      });
    }

    const workOrderData: {
      status: string;
      startedAt?: Date;
      completedAt?: Date | null;
    } = { status: nextWorkStatus };

    if (!loaded.work.startedAt && shouldHaveStarted) workOrderData.startedAt = now;
    if (nextWorkStatus === "COMPLETED") {
      workOrderData.completedAt = loaded.work.completedAt ?? now;
    } else if (loaded.work.completedAt) {
      workOrderData.completedAt = null;
    }

    if (
      loaded.work.status !== nextWorkStatus ||
      workOrderData.startedAt ||
      workOrderData.completedAt !== undefined
    ) {
      await tx.workOrder.update({ where: { id: workOrderId }, data: workOrderData });
    }
  });

  return true;
}

export async function startMobileWorkPart(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);

  if (!workOrderId || !workPartId) throw new Error(t.errors.invalidWork);

  const loaded = await loadWorkPartForMobile(actor.companyId, workOrderId, workPartId);
  if (!loaded?.part) throw new Error(t.errors.workNotFound);
  if (loaded.work.status === "COMPLETED" || loaded.work.status === "CANCELLED") {
    throw new Error(t.errors.workClosed);
  }
  if (isWork10PartTerminalStatus(loaded.part.status)) throw new Error(t.errors.partClosed);
  if (loaded.part.status === "BLOCKED") throw new Error(t.errors.dependencyBlocked);

  const blockers = work10UnresolvedPredecessorIds(
    workPartId,
    loaded.work.workParts,
    loaded.dependencies,
  );
  if (blockers.length > 0) throw new Error(t.errors.dependencyBlocked);

  const startRequirement = effectivePhotoRequirement(loaded.part.photoRequirement, loaded.work.photoRequirement);
  if (startRequirement === "START") {
    const startPhoto = await prisma.workEvidencePhoto.findFirst({
      where: { companyId: actor.companyId, workOrderId, workPartId, stage: "START" },
      select: { id: true },
    });
    if (!startPhoto) throw new Error(t.errors.requiredPhotoMissing);
  }

  const [active, activeDiary] = await Promise.all([
    prisma.workPartLaborFact.findFirst({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
        startedAt: { not: null },
        endedAt: null,
      },
      select: { id: true, workPartId: true },
    }),
    prisma.employeeWorkDiaryEntry.findFirst({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
        endedAt: null,
      },
      select: { id: true },
    }),
  ]);

  if (activeDiary) throw new Error(t.errors.alreadyActiveElsewhere);

  if (active?.workPartId === workPartId) {
    revalidateMobileWork(workOrderId);
    return;
  }
  if (active) throw new Error(t.errors.alreadyActiveElsewhere);

  const now = new Date();
  const nextParts = loaded.work.workParts.map((item) =>
    item.id === workPartId ? { ...item, status: "IN_PROGRESS" } : item,
  );
  const nextWorkStatus = deriveWork10Status(loaded.work.status, nextParts);

  await prisma.$transaction(async (tx) => {
    const fact = await tx.workPartLaborFact.create({
      data: {
        companyId: actor.companyId,
        workPartId,
        employeeId: actor.employee.id,
        userId: actor.user.id,
        resourceLabel: actor.employee.fullName,
        workDate: workDateFromNow(now),
        startedAt: now,
        durationMinutes: 0,
        noteSourceLanguage: actor.language,
        source: "MOBILE",
        createdById: actor.user.id,
      },
    });

    if (loaded.part!.status !== "IN_PROGRESS") {
      await tx.workPart.update({
        where: { id: workPartId },
        data: { status: "IN_PROGRESS", updatedById: actor.user.id },
      });
    }

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: nextWorkStatus,
        startedAt: loaded.work.startedAt ?? now,
        completedAt: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: actor.companyId,
        userId: actor.user.id,
        entityType: "WORK_PART_LABOR_FACT",
        entityId: fact.id,
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        action: "MOBILE_WORK_STARTED",
        source: "MOBILE",
        description: t.audit.started,
        afterData: { workPartId, employeeId: actor.employee.id, startedAt: now.toISOString() },
      },
    });
  });

  revalidateMobileWork(workOrderId);
}

async function closeActiveMobileFact(params: {
  workOrderId: number;
  workPartId: number;
  setStatus?: "ON_HOLD" | "COMPLETED";
}) {
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  const { workOrderId, workPartId, setStatus } = params;

  const loaded = await loadWorkPartForMobile(actor.companyId, workOrderId, workPartId);
  if (!loaded?.part) throw new Error(t.errors.workNotFound);

  if (setStatus === "COMPLETED") {
    const requirement = effectivePhotoRequirement(loaded.part.photoRequirement, loaded.work.photoRequirement);
    const evidenceStage = requiredEvidenceStage(requirement);
    if (evidenceStage) {
      const evidence = await prisma.workEvidencePhoto.findFirst({
        where: { companyId: actor.companyId, workOrderId, workPartId, stage: evidenceStage },
        select: { id: true },
      });
      if (!evidence) throw new Error(t.errors.requiredPhotoMissing);
    }
    const completingLastOpenPart = loaded.work.workParts
      .map((part) => part.id === workPartId ? { ...part, status: "COMPLETED" } : part)
      .every((part) => isWork10PartTerminalStatus(part.status));
    if (requirement === "WORK_COMPLETE" && completingLastOpenPart) {
      const evidence = await prisma.workEvidencePhoto.findFirst({
        where: { companyId: actor.companyId, workOrderId, stage: "WORK_COMPLETE" },
        select: { id: true },
      });
      if (!evidence) throw new Error(t.errors.requiredPhotoMissing);
    }

    const blockers = work10UnresolvedPredecessorIds(
      workPartId,
      loaded.work.workParts,
      loaded.dependencies,
    );
    if (blockers.length > 0) throw new Error(t.errors.dependencyBlocked);

    const otherActive = await prisma.workPartLaborFact.findFirst({
      where: {
        companyId: actor.companyId,
        workPartId,
        voidedAt: null,
        startedAt: { not: null },
        endedAt: null,
        employeeId: { not: actor.employee.id },
      },
      select: { id: true },
    });
    if (otherActive) throw new Error(t.errors.othersStillActive);
  }

  const active = await prisma.workPartLaborFact.findFirst({
    where: {
      companyId: actor.companyId,
      workPartId,
      employeeId: actor.employee.id,
      voidedAt: null,
      startedAt: { not: null },
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (active?.startedAt) {
      const elapsed = Math.max(1, Math.round((now.getTime() - active.startedAt.getTime()) / 60_000));
      await tx.workPartLaborFact.update({
        where: { id: active.id },
        data: { endedAt: now, durationMinutes: elapsed },
      });
      await tx.auditEvent.create({
        data: {
          companyId: actor.companyId,
          userId: actor.user.id,
          entityType: "WORK_PART_LABOR_FACT",
          entityId: active.id,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: setStatus === "ON_HOLD" ? "MOBILE_WORK_PAUSED" : setStatus === "COMPLETED" ? "MOBILE_WORK_COMPLETED" : "MOBILE_WORK_STOPPED",
          source: "MOBILE",
          description: setStatus === "ON_HOLD" ? t.audit.paused : setStatus === "COMPLETED" ? t.audit.completed : t.audit.stopped,
          beforeData: { endedAt: null, durationMinutes: active.durationMinutes },
          afterData: { endedAt: now.toISOString(), durationMinutes: elapsed },
        },
      });
    } else if (!setStatus) {
      throw new Error(t.errors.activeFactMissing);
    }
  });

  if (setStatus) {
    await updateWorkAndPartStatus({
      companyId: actor.companyId,
      userId: actor.user.id,
      workOrderId,
      workPartId,
      requestedStatus: setStatus,
      auditDescription: setStatus === "ON_HOLD" ? t.audit.paused : t.audit.completed,
    });
  }

  revalidateMobileWork(workOrderId);
}

export async function stopMobileWorkPart(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  if (!workOrderId || !workPartId) throw new Error(t.errors.invalidWork);
  await closeActiveMobileFact({ workOrderId, workPartId });
}

export async function pauseMobileWorkPart(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  if (!workOrderId || !workPartId) throw new Error(t.errors.invalidWork);
  await closeActiveMobileFact({ workOrderId, workPartId, setStatus: "ON_HOLD" });
}

export async function completeMobileWorkPart(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  if (!workOrderId || !workPartId) throw new Error(t.errors.invalidWork);
  await closeActiveMobileFact({ workOrderId, workPartId, setStatus: "COMPLETED" });
}

export async function recordMobileWorkEvidencePhoto(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const stage = String(formData.get("stage") ?? "").trim();
  const photo = formData.get("photo");

  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  const allowedStages = new Set(["START", "PROGRESS", "PART_COMPLETE", "WORK_COMPLETE", "OPTIONAL"]);

  if (!workOrderId || !workPartId || !allowedStages.has(stage)) throw new Error(t.errors.invalidWork);
  if (!(photo instanceof File) || photo.size === 0) throw new Error(t.errors.photoRequired);

  const loaded = await loadWorkPartForMobile(actor.companyId, workOrderId, workPartId);
  if (!loaded?.part) throw new Error(t.errors.workNotFound);
  if (loaded.work.status === "COMPLETED" || loaded.work.status === "CANCELLED") {
    throw new Error(t.errors.workClosed);
  }

  const storagePath = await saveWorkEvidencePhoto(
    photo,
    actor.companyId,
    workOrderId,
    workPartId,
    stage,
  );

  if (!storagePath) throw new Error(t.errors.photoRequired);

  try {
    await prisma.$transaction(async (tx) => {
      const evidence = await tx.workEvidencePhoto.create({
        data: {
          companyId: actor.companyId,
          workOrderId,
          workPartId,
          stage,
          storagePath,
          fileName: photo.name || null,
          mimeType: photo.type || null,
          createdById: actor.user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          companyId: actor.companyId,
          userId: actor.user.id,
          entityType: "WORK_EVIDENCE_PHOTO",
          entityId: evidence.id,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: "CREATED",
          source: "MOBILE",
          description: t.audit.photoAdded,
          afterData: { workPartId, stage, storagePath },
        },
      });
    });
  } catch (error) {
    await removeWorkEvidenceMedia(storagePath);
    throw error;
  }

  revalidateMobileWork(workOrderId);
}


function revalidateMobileDiary(employeeId: number) {
  revalidatePath("/mobile/verk");
  revalidatePath("/mobile/verk/dagbok");
  revalidatePath("/verk");
  revalidatePath(`/starfsmenn/${employeeId}`);
}

export async function startMobileDiaryEntry(formData: FormData) {
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);

  if (!diaryEnabled(actor.employee.workExecutionMode)) {
    throw new Error(t.errors.diaryNotAllowed);
  }

  const title = textField(formData.get("title"), 200);
  if (!title) throw new Error(t.errors.diaryTitleRequired);

  const workKeyId = numberField(formData, "workKeyId");
  const workResourceId = numberField(formData, "workResourceId");
  const note = textField(formData.get("note"), 2000);
  let locationText = textField(formData.get("locationText"), 240);
  let operationalLocationId = numberField(formData, "operationalLocationId");
  const externalAddressId = textField(formData.get("externalAddressId"), 80);

  const rawTravelMinutes = String(formData.get("travelMinutes") ?? "").trim();
  const rawTravelKm = String(formData.get("travelKm") ?? "").trim();
  const travelMinutesValue = rawTravelMinutes ? nonNegativeNumber(formData.get("travelMinutes")) : null;
  const travelKm = rawTravelKm ? nonNegativeNumber(formData.get("travelKm")) : null;
  if ((rawTravelMinutes && travelMinutesValue === null) || (rawTravelKm && travelKm === null)) {
    throw new Error(t.errors.invalidDiaryTravel);
  }
  const travelMinutes = travelMinutesValue === null ? null : Math.round(travelMinutesValue);

  const selectedWorkKey = workKeyId
    ? await prisma.workKey.findFirst({
        where: { id: workKeyId, companyId: actor.companyId, isActive: true },
        select: { id: true, code: true },
      })
    : null;
  if (workKeyId && !selectedWorkKey) {
    throw new Error(t.errors.invalidDiaryWorkKey);
  }
  const workKey = selectedWorkKey?.code ?? null;

  const selectedWorkResource = workResourceId
    ? await prisma.workResource.findFirst({
        where: {
          id: workResourceId,
          companyId: actor.companyId,
          isActive: true,
          kind: { in: ["MACHINE", "VEHICLE", "TOOL"] },
          status: { in: ["AVAILABLE", "IN_USE"] },
        },
        select: {
          id: true,
          kind: true,
          code: true,
          name: true,
          travelMode: true,
          planningTravelSpeedKmh: true,
        },
      })
    : null;
  if (workResourceId && !selectedWorkResource) {
    throw new Error(t.errors.invalidDiaryResource);
  }

  if (!operationalLocationId && externalAddressId) {
    const resolved = await resolveHmsOperationalLocation({ companyId: actor.companyId, hnitnum: externalAddressId });
    if (!resolved) throw new Error(t.errors.invalidDiaryLocation);
    operationalLocationId = resolved.location.id;
    locationText = resolved.displayText;
  }

  const destinationLocation: OperationalLocationSnapshot | null = operationalLocationId
    ? await prisma.operationalLocation.findFirst({
        where: { id: operationalLocationId, companyId: actor.companyId, isActive: true },
        select: { id: true, code: true, name: true, address: true, postalCode: true, city: true },
      })
    : null;
  if (operationalLocationId && !destinationLocation) {
    throw new Error(t.errors.invalidDiaryLocation);
  }

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: {
      defaultOperationalLocation: {
        select: { id: true, code: true, name: true, address: true, postalCode: true, city: true },
      },
    },
  });
  const travelFromLocation: OperationalLocationSnapshot | null =
    actor.employee.baseOperationalLocation ??
    actor.employee.departmentUnit?.defaultOperationalLocation ??
    company?.defaultOperationalLocation ??
    null;
  const travelFromOperationalLocationId = travelFromLocation?.id ?? null;

  let estimatedTravelMinutes: number | null = null;
  let estimatedTravelKm: number | null = null;
  let travelEstimateSource: string | null = null;

  if (destinationLocation && travelFromLocation) {
    if (destinationLocation.id === travelFromLocation.id) {
      estimatedTravelMinutes = 0;
      estimatedTravelKm = 0;
      travelEstimateSource = "SAME_LOCATION";
    } else {
      const route = await prisma.operationalTravelRoute.findFirst({
        where: {
          companyId: actor.companyId,
          fromLocationId: travelFromLocation.id,
          toLocationId: destinationLocation.id,
          isActive: true,
        },
        select: { distanceKm: true, defaultMinutes: true, source: true },
      });
      if (route) {
        estimatedTravelMinutes = route.defaultMinutes;
        estimatedTravelKm = route.distanceKm;
        travelEstimateSource = route.source;

        const travelSpeed = selectedWorkResource?.planningTravelSpeedKmh ?? null;
        const speedControlsTravel =
          (selectedWorkResource?.travelMode === "SELF_PROPELLED" || selectedWorkResource?.travelMode === "ROAD") &&
          travelSpeed !== null &&
          travelSpeed > 0 &&
          route.distanceKm > 0;
        if (speedControlsTravel) {
          const resourceMinimumMinutes = Math.ceil((route.distanceKm / travelSpeed) * 60);
          if (resourceMinimumMinutes > estimatedTravelMinutes) {
            estimatedTravelMinutes = resourceMinimumMinutes;
            travelEstimateSource = "ROUTE_AND_RESOURCE_SPEED";
          }
        }
      }
    }
  }

  const travelFromLabelSnapshot = operationalLocationSnapshot(travelFromLocation);
  const travelToLabelSnapshot = destinationLocation
    ? operationalLocationSnapshot(destinationLocation)
    : locationText;

  const [activeWork, activeDiary] = await Promise.all([
    prisma.workPartLaborFact.findFirst({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
        startedAt: { not: null },
        endedAt: null,
      },
      select: { id: true },
    }),
    prisma.employeeWorkDiaryEntry.findFirst({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
        endedAt: null,
      },
      select: { id: true },
    }),
  ]);
  if (activeWork || activeDiary) throw new Error(t.errors.alreadyActiveElsewhere);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const entry = await tx.employeeWorkDiaryEntry.create({
      data: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        workDate: workDateFromNow(now),
        startedAt: now,
        durationMinutes: 0,
        title,
        note,
        noteSourceLanguage: actor.language,
        workKey,
        workKeyId: selectedWorkKey?.id ?? null,
        workResourceId: selectedWorkResource?.id ?? null,
        workResourceCodeSnapshot: selectedWorkResource?.code ?? null,
        workResourceNameSnapshot: selectedWorkResource?.name ?? null,
        resourceTravelModeSnapshot: selectedWorkResource?.travelMode ?? null,
        resourceTravelSpeedKmhSnapshot: selectedWorkResource?.planningTravelSpeedKmh ?? null,
        operationalLocationId,
        travelFromOperationalLocationId,
        travelFromLabelSnapshot,
        travelToLabelSnapshot,
        estimatedTravelMinutes,
        estimatedTravelKm,
        travelEstimateSource,
        locationText,
        travelMinutes,
        travelKm,
        source: "MOBILE",
        createdById: actor.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: actor.companyId,
        userId: actor.user.id,
        entityType: "EMPLOYEE_WORK_DIARY_ENTRY",
        entityId: entry.id,
        parentEntityType: "EMPLOYEE",
        parentEntityId: actor.employee.id,
        action: "MOBILE_DIARY_STARTED",
        source: "MOBILE",
        description: t.audit.diaryStarted,
        afterData: {
          employeeId: actor.employee.id,
          startedAt: now.toISOString(),
          title,
          workKey,
          workKeyId: selectedWorkKey?.id ?? null,
        workResourceId: selectedWorkResource?.id ?? null,
        workResourceCodeSnapshot: selectedWorkResource?.code ?? null,
        workResourceNameSnapshot: selectedWorkResource?.name ?? null,
        resourceTravelModeSnapshot: selectedWorkResource?.travelMode ?? null,
        resourceTravelSpeedKmhSnapshot: selectedWorkResource?.planningTravelSpeedKmh ?? null,
          operationalLocationId,
          travelFromOperationalLocationId,
          travelFromLabelSnapshot,
          travelToLabelSnapshot,
          estimatedTravelMinutes,
          estimatedTravelKm,
          travelEstimateSource,
          travelMinutes,
          travelKm,
        },
      },
    });
  });

  revalidateMobileDiary(actor.employee.id);
}

export async function stopMobileDiaryEntry(formData: FormData) {
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  const entryId = numberField(formData, "entryId");
  if (!entryId) throw new Error(t.errors.diaryEntryMissing);

  const entry = await prisma.employeeWorkDiaryEntry.findFirst({
    where: {
      id: entryId,
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      voidedAt: null,
      endedAt: null,
    },
  });
  if (!entry) throw new Error(t.errors.diaryEntryMissing);

  const now = new Date();
  const elapsed = Math.max(1, Math.round((now.getTime() - entry.startedAt.getTime()) / 60_000));

  await prisma.$transaction(async (tx) => {
    await tx.employeeWorkDiaryEntry.update({
      where: { id: entry.id },
      data: {
        endedAt: now,
        durationMinutes: elapsed,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: actor.companyId,
        userId: actor.user.id,
        entityType: "EMPLOYEE_WORK_DIARY_ENTRY",
        entityId: entry.id,
        parentEntityType: "EMPLOYEE",
        parentEntityId: actor.employee.id,
        action: "MOBILE_DIARY_STOPPED",
        source: "MOBILE",
        description: t.audit.diaryStopped,
        beforeData: { endedAt: null, durationMinutes: entry.durationMinutes },
        afterData: { endedAt: now.toISOString(), durationMinutes: elapsed },
      },
    });
  });

  revalidateMobileDiary(actor.employee.id);
}

export async function recordMobileMaterialUsage(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const inventoryItemId = numberField(formData, "inventoryItemId");
  const inventoryLocationId = numberField(formData, "inventoryLocationId");
  const quantity = positiveNumber(formData.get("quantity"));
  const note = String(formData.get("note") ?? "").trim();

  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);

  if (!workOrderId || !workPartId || !inventoryItemId || !inventoryLocationId || !quantity) {
    throw new Error(t.errors.invalidQuantity);
  }
  if (note.length > 1000) throw new Error(t.errors.noteTooLong);

  const [part, item, location] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId: actor.companyId, workOrderId },
      select: { id: true, status: true },
    }),
    prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, companyId: actor.companyId, isActive: true },
    }),
    prisma.inventoryLocation.findFirst({
      where: { id: inventoryLocationId, companyId: actor.companyId, isActive: true },
    }),
  ]);

  if (!part) throw new Error(t.errors.workNotFound);
  if (isWork10PartTerminalStatus(part.status)) throw new Error(t.errors.partClosed);
  if (!item || !location) throw new Error(t.errors.inventoryMissing);
  if (!item.isStockTracked) throw new Error(t.errors.stockTrackedRequired);

  const [stock, committed] = await Promise.all([
    prisma.inventoryMovement.aggregate({
      where: {
        companyId: actor.companyId,
        itemId: item.id,
        locationId: location.id,
        voidedAt: null,
      },
      _sum: { quantityDelta: true },
    }),
    prisma.inventoryCommitment.aggregate({
      where: {
        companyId: actor.companyId,
        itemId: item.id,
        locationId: location.id,
        status: "ACTIVE",
      },
      _sum: { quantity: true },
    }),
  ]);

  const available = (stock._sum.quantityDelta ?? 0) - (committed._sum.quantity ?? 0);
  if (quantity > available + 1e-9) throw new Error(t.errors.insufficientStock);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const fact = await tx.workPartUsageFact.create({
      data: {
        companyId: actor.companyId,
        workPartId,
        kind: "MATERIAL",
        resourceCode: item.sku,
        resourceLabel: item.name,
        sourceLanguage: actor.language,
        usageDate: now,
        quantity,
        unit: item.baseUnit,
        customUnit: item.customUnit,
        note: note || null,
        source: "MOBILE",
        inventoryItemId: item.id,
        inventoryLocationId: location.id,
        createdById: actor.user.id,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        companyId: actor.companyId,
        itemId: item.id,
        locationId: location.id,
        movementType: "WORK_USAGE",
        quantityDelta: -quantity,
        unit: item.baseUnit,
        unitCost: item.purchaseUnitCost,
        movementAt: now,
        note: note || null,
        source: "WORK",
        workPartId,
        usageFactId: fact.id,
        createdById: actor.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: actor.companyId,
        userId: actor.user.id,
        entityType: "WORK_PART_USAGE_FACT",
        entityId: fact.id,
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        action: "MOBILE_MATERIAL_USAGE_RECORDED",
        source: "MOBILE",
        description: t.audit.material,
        afterData: { inventoryItemId: item.id, inventoryLocationId: location.id, quantity, unit: item.baseUnit },
      },
    });
  });

  revalidateMobileWork(workOrderId);
  revalidatePath("/birgdir");
}

export async function recordMobileResourceUsage(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const workResourceId = numberField(formData, "workResourceId");
  const quantity = positiveNumber(formData.get("quantity"));
  const note = String(formData.get("note") ?? "").trim();

  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);

  if (!workOrderId || !workPartId || !workResourceId || !quantity) {
    throw new Error(t.errors.invalidQuantity);
  }
  if (note.length > 1000) throw new Error(t.errors.noteTooLong);

  const [part, resource, assignment] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId: actor.companyId, workOrderId },
      select: { id: true, status: true },
    }),
    prisma.workResource.findFirst({
      where: { id: workResourceId, companyId: actor.companyId, isActive: true },
      select: {
        id: true,
        kind: true,
        code: true,
        name: true,
        baseUnit: true,
        customUnit: true,
        costRateIsk: true,
      },
    }),
    prisma.workPartAssignment.findFirst({
      where: {
        companyId: actor.companyId,
        workPartId,
        workResourceId,
        removedAt: null,
      },
      select: { id: true },
    }),
  ]);

  if (!part) throw new Error(t.errors.workNotFound);
  if (isWork10PartTerminalStatus(part.status)) throw new Error(t.errors.partClosed);
  if (!resource || !assignment) throw new Error(t.errors.resourceMissing);
  if (!isWork10PersistentResourceKind(resource.kind) || resource.kind === "TEAM") {
    throw new Error(t.errors.resourceUnsupported);
  }

  const resourceKind = resource.kind;
  const unit = resource.baseUnit || defaultResourceUnit(resourceKind);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const fact = await tx.workPartUsageFact.create({
      data: {
        companyId: actor.companyId,
        workPartId,
        kind: resourceUsageKind(resourceKind),
        resourceCode: resource.code,
        resourceLabel: resource.name,
        sourceLanguage: actor.language,
        usageDate: now,
        quantity,
        unit,
        customUnit: unit === "CUSTOM" ? resource.customUnit : null,
        note: note || null,
        source: "MOBILE",
        workResourceId: resource.id,
        resourceUnitCostIsk: resource.costRateIsk,
        createdById: actor.user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: actor.companyId,
        userId: actor.user.id,
        entityType: "WORK_PART_USAGE_FACT",
        entityId: fact.id,
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        action: "MOBILE_RESOURCE_USAGE_RECORDED",
        source: "MOBILE",
        description: t.audit.resource,
        afterData: {
          workResourceId: resource.id,
          kind: resourceKind,
          quantity,
          unit,
          resourceUnitCostIsk: resource.costRateIsk,
        },
      },
    });
  });

  revalidateMobileWork(workOrderId);
  revalidatePath("/verk/tilfong");
}

export async function recordMobileMeterReading(formData: FormData) {
  const workOrderId = numberField(formData, "workOrderId");
  const workPartId = numberField(formData, "workPartId");
  const workResourceId = numberField(formData, "workResourceId");
  const value = nonNegativeNumber(formData.get("value"));
  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");

  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  const ops = workResourceOperationsText(actor.language);

  if (!workOrderId || !workPartId || !workResourceId || value === null) {
    throw new Error(t.errors.invalidQuantity);
  }
  if (note.length > 500) throw new Error(t.errors.noteTooLong);

  const [part, resource, assignment] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId: actor.companyId, workOrderId },
      select: { id: true, status: true },
    }),
    prisma.workResource.findFirst({
      where: {
        id: workResourceId,
        companyId: actor.companyId,
        kind: { in: ["MACHINE", "VEHICLE", "TOOL"] },
        isActive: true,
      },
      select: {
        id: true,
        kind: true,
        baseUnit: true,
        meterUnit: true,
        meterValue: true,
      },
    }),
    prisma.workPartAssignment.findFirst({
      where: {
        companyId: actor.companyId,
        workPartId,
        workResourceId,
        removedAt: null,
      },
      select: { id: true },
    }),
  ]);

  if (!part) throw new Error(t.errors.workNotFound);
  if (isWork10PartTerminalStatus(part.status)) throw new Error(t.errors.partClosed);
  if (!resource || !assignment) throw new Error(t.errors.meterUnsupported);
  if (resource.meterValue !== null && value + 1e-9 < resource.meterValue) {
    throw new Error(t.errors.meterLower);
  }

  const unit = resource.meterUnit?.trim() || resource.baseUnit?.trim() || defaultResourceUnit(resource.kind as "MACHINE" | "VEHICLE" | "TOOL");
  const now = new Date();
  const photoPath = await saveWorkResourceMeterPhoto(photo instanceof File ? photo : null, actor.companyId, workResourceId);

  try {
    await prisma.$transaction(async (tx) => {
      const reading = await tx.workResourceMeterReading.create({
        data: {
          companyId: actor.companyId,
          workResourceId,
          workPartId,
          readingAt: now,
          value,
          unit,
          photoPath,
          note: note || null,
          source: "MOBILE",
          createdById: actor.user.id,
        },
      });

      await tx.workResource.update({
        where: { id: workResourceId },
        data: { meterValue: value, updatedById: actor.user.id },
      });

      await tx.auditEvent.create({
        data: {
          companyId: actor.companyId,
          userId: actor.user.id,
          entityType: "WORK_RESOURCE_METER_READING",
          entityId: reading.id,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: "MOBILE_METER_READING_RECORDED",
          source: "MOBILE",
          description: photoPath ? ops.audit.meterPhotoAdded : t.audit.meter,
          afterData: { workResourceId, workPartId, value, unit, photoPath: photoPath ?? undefined },
        },
      });
    });
  } catch (error) {
    await removeWorkResourceMedia(photoPath);
    throw error;
  }

  revalidateMobileWork(workOrderId);
  revalidatePath("/verk/tilfong");
}

export async function recordScannedResourceMeterReading(formData: FormData) {
  const qrToken = String(formData.get("qrToken") ?? "").trim().toLowerCase();
  const value = nonNegativeNumber(formData.get("value"));
  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");
  const actor = await requireMobileWorkEmployee();
  const t = workMobileText(actor.language);
  const ops = workResourceOperationsText(actor.language);
  if (!/^[0-9a-f]{16}$/.test(qrToken)) throw new Error(ops.errors.invalidQr);
  if (value === null) throw new Error(t.errors.invalidQuantity);
  if (note.length > 500) throw new Error(t.errors.noteTooLong);

  const resource = await prisma.workResource.findFirst({
    where: { companyId: actor.companyId, qrToken, kind: { in: ["MACHINE", "VEHICLE", "TOOL"] }, isActive: true },
    select: { id: true, kind: true, baseUnit: true, meterUnit: true, meterValue: true },
  });
  if (!resource) throw new Error(ops.errors.resourceMissing);
  if (resource.meterValue !== null && value + 1e-9 < resource.meterValue) throw new Error(t.errors.meterLower);
  const unit = resource.meterUnit?.trim() || resource.baseUnit?.trim() || defaultResourceUnit(resource.kind as "MACHINE" | "VEHICLE" | "TOOL");
  const photoPath = await saveWorkResourceMeterPhoto(photo instanceof File ? photo : null, actor.companyId, resource.id);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const reading = await tx.workResourceMeterReading.create({
        data: { companyId: actor.companyId, workResourceId: resource.id, readingAt: now, value, unit, photoPath, note: note || null, source: "MOBILE", createdById: actor.user.id },
      });
      await tx.workResource.update({ where: { id: resource.id }, data: { meterValue: value, updatedById: actor.user.id } });
      await tx.auditEvent.create({
        data: { companyId: actor.companyId, userId: actor.user.id, entityType: "WORK_RESOURCE_METER_READING", entityId: reading.id, parentEntityType: "WORK_RESOURCE", parentEntityId: resource.id, action: "MOBILE_METER_READING_RECORDED", source: "MOBILE", description: photoPath ? ops.audit.meterPhotoAdded : t.audit.meter, afterData: { value, unit, photoPath: photoPath ?? undefined } },
      });
    });
  } catch (error) {
    await removeWorkResourceMedia(photoPath);
    throw error;
  }
  revalidatePath(`/mobile/verk/tilfong/${qrToken}`);
  revalidatePath("/verk/tilfong");
}

export async function completeMobileResourceMaintenance(formData: FormData) {
  const maintenanceKeyId = numberField(formData, "maintenanceKeyId");
  const qrToken = String(formData.get("qrToken") ?? "").trim().toLowerCase();
  const note = String(formData.get("note") ?? "").trim();
  const actor = await requireMobileWorkEmployee();
  const ops = workResourceOperationsText(actor.language);
  if (!maintenanceKeyId || !/^[0-9a-f]{16}$/.test(qrToken)) throw new Error(ops.errors.invalidMaintenance);
  if (note.length > 1000) throw new Error(ops.errors.noteTooLong);

  const key = await prisma.workResourceMaintenanceKey.findFirst({
    where: { id: maintenanceKeyId, companyId: actor.companyId, isActive: true, workResource: { qrToken, isActive: true } },
    include: { workResource: { select: { id: true, meterValue: true } } },
  });
  if (!key) throw new Error(ops.errors.invalidMaintenance);
  const completedAt = new Date();
  const meterValue = key.workResource.meterValue;
  const nextDueMeterValue = nextMaintenanceDueValue(meterValue, key.intervalValue);

  await prisma.$transaction(async (tx) => {
    const log = await tx.workResourceMaintenanceLog.create({
      data: { companyId: actor.companyId, workResourceId: key.workResourceId, maintenanceKeyId: key.id, completedAt, meterValue, note: note || null, source: "MOBILE", createdById: actor.user.id },
    });
    await tx.workResourceMaintenanceKey.update({
      where: { id: key.id },
      data: { lastCompletedAt: completedAt, lastCompletedMeterValue: meterValue, nextDueMeterValue, updatedById: actor.user.id },
    });
    await tx.auditEvent.create({
      data: { companyId: actor.companyId, userId: actor.user.id, entityType: "WORK_RESOURCE_MAINTENANCE_LOG", entityId: log.id, parentEntityType: "WORK_RESOURCE", parentEntityId: key.workResourceId, action: "MAINTENANCE_COMPLETED", source: "MOBILE", description: ops.audit.maintenanceCompleted, afterData: { maintenanceKeyId: key.id, meterValue, nextDueMeterValue } },
    });
  });
  revalidatePath(`/mobile/verk/tilfong/${qrToken}`);
  revalidatePath("/verk/tilfong");
}
