"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getEffectiveUser,
  requireActiveCompanyWriteAccess,
} from "@/lib/core/access-control";
import { inventoryText } from "@/lib/i18n/inventory";
import { workResourceText } from "@/lib/i18n/work-resources";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";
import { notifyPriorityWork, priorityRecipientUserIdsForTeam } from "@/lib/push/priority-work";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { deriveWork10Status, isWork10EffectivelyCompleted, isWork10ReadyToClose } from "@/lib/work10/status";
import { defaultResourceUnit, isWork10PersistentResourceKind, resourceUsageKind } from "@/lib/work10/resources";
import {
  isWork10PartStatus,
  isWork10PartTerminalStatus,
  work10DependencyWouldCreateCycle,
  work10StatusRequiresResolvedDependencies,
  work10UnresolvedPredecessorIds,
} from "@/lib/work10/workflow";
import type {
  Work10OperationalTranslation,
  Work10LocalizedText,
} from "@/lib/work10/operational-text";
import { parseWork10CompletionDeadline, parseWork10PlannedDate, parseWork10PlannedStartParts } from "@/lib/work10/scheduling";
import {
  missingTargetLanguages,
  translateWork10OperationalItems,
  type Work10TranslationItem,
} from "@/lib/work10/translation-service";
import {
  effectiveUiLanguagesForUsers,
  ensureWork10OperationalTranslationsForWorkOrders,
} from "@/lib/work10/translation-sync";

async function bestEffortEnsureOperationalTranslations(args: {
  companyId: number;
  workOrderId: number;
  actingUserId: number | null;
  recipientUserIds?: number[];
  fallbackLanguages?: string[];
}) {
  try {
    const userLanguages = await effectiveUiLanguagesForUsers({
      companyId: args.companyId,
      userIds: args.recipientUserIds ?? [],
    });
    const targetLanguages = [
      ...userLanguages,
      ...(args.fallbackLanguages ?? []),
    ];
    await ensureWork10OperationalTranslationsForWorkOrders({
      companyId: args.companyId,
      userId: args.actingUserId,
      workOrderIds: [args.workOrderId],
      targetLanguages,
    });
  } catch (error) {
    // Úthlutun má aldrei falla niður þó AI-þýðing sé tímabundið ótiltæk.
    // Mobile reynir aftur þegar starfsmaður opnar Verkið.
    console.error("Operational translation preparation failed", error);
  }
}

function workPartStatusFromLegacy(status: string) {
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "COMPLETED") return "COMPLETED";
  return "PLANNED";
}

const PHOTO_REQUIREMENTS = new Set(["NONE", "START", "PROGRESS", "PART_COMPLETE", "WORK_COMPLETE"]);
const PART_PHOTO_REQUIREMENTS = new Set(["INHERIT", ...PHOTO_REQUIREMENTS]);

function parsePlanningFields(formData: FormData, options?: { allowInheritPhoto?: boolean }) {
  const requiredPeople = Number(formData.get("requiredPeople") ?? 1);
  const estimatedHours = Number(formData.get("estimatedHours") ?? 0);
  const estimatedMinutePart = Number(formData.get("estimatedMinutePart") ?? 0);
  const photoRequirement = String(
    formData.get("photoRequirement") ?? (options?.allowInheritPhoto ? "INHERIT" : "NONE"),
  );

  if (!Number.isInteger(requiredPeople) || requiredPeople < 1 || requiredPeople > 100) {
    throw new Error("Fjöldi starfsmanna þarf að vera á bilinu 1–100.");
  }
  if (
    !Number.isInteger(estimatedHours) ||
    !Number.isInteger(estimatedMinutePart) ||
    estimatedHours < 0 ||
    estimatedHours > 999 ||
    estimatedMinutePart < 0 ||
    estimatedMinutePart > 59
  ) {
    throw new Error("Áætlaður tími er ógildur.");
  }
  const allowed = options?.allowInheritPhoto ? PART_PHOTO_REQUIREMENTS : PHOTO_REQUIREMENTS;
  if (!allowed.has(photoRequirement)) throw new Error("Ógild myndakrafa.");

  const totalMinutes = estimatedHours * 60 + estimatedMinutePart;
  return {
    requiredPeople,
    estimatedMinutes: totalMinutes > 0 ? totalMinutes : null,
    photoRequirement,
  };
}

function effectivePartPhotoRequirement(partRequirement: string, workRequirement: string) {
  return partRequirement === "INHERIT" ? workRequirement : partRequirement;
}

function translationRows(
  title: Work10LocalizedText,
  description: Work10LocalizedText | null,
  createdById: number | null,
) {
  const languages = new Set([
    ...title.translations.map((item) => item.language),
    ...(description?.translations.map((item) => item.language) ?? []),
  ]);

  return Array.from(languages).map((language) => {
    const titleTranslation = title.translations.find(
      (item) => item.language === language,
    );
    const descriptionTranslation = description?.translations.find(
      (item) => item.language === language,
    );

    const source: Work10OperationalTranslation["source"] =
      titleTranslation?.source ?? descriptionTranslation?.source ?? "HUMAN";

    return {
      language,
      title: titleTranslation?.text ?? null,
      description: descriptionTranslation?.text ?? null,
      source,
      createdById,
    };
  });
}

/**
 * Fyrsta örugga yfirfærslan úr gamla WorkOrder yfir í nýjan varanlegan
 * WorkPart. WorkOrder sjálft er ekki breytt; nýja kjarnalagið bætist við.
 */
export async function persistLegacyFirstWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const employeeValue = formData.get("employeeId");
  const employeeId = employeeValue && String(employeeValue) !== "" ? Number(employeeValue) : null;
  const stayOnDashboard = String(formData.get("stayOnDashboard") ?? "") === "1";
  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }
  if (employeeId !== null && !Number.isInteger(employeeId)) {
    throw new Error("Ógild úthlutun.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const [work, employee] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId },
      include: {
        translations: true,
        workParts: {
          select: { id: true },
          orderBy: { sequence: "asc" },
          take: 1,
        },
      },
    }),
    employeeId === null
      ? Promise.resolve(null)
      : prisma.employee.findFirst({
          where: { id: employeeId, companyId, isActive: true },
          select: { id: true, fullName: true, userId: true, preferredLanguage: true, baseOperationalLocationId: true },
        }),
  ]);

  if (!work) {
    throw new Error("Verkið fannst ekki.");
  }
  if (employeeId !== null && !employee) {
    throw new Error("Starfsmaðurinn fannst ekki eða er óvirkur.");
  }
  if (employee && work.status === "COMPLETED") {
    throw new Error("Ekki er hægt að úthluta starfsmanni á lokið Verk. Enduropna þarf Verkið fyrst.");
  }

  let workPartId = work.workParts[0]?.id ?? null;

  if (!workPartId) {
    const operationalText =
      work.translations.length > 0
        ? projectPersistedWorkOrderText(work)
        : projectLegacyOperationalText({
            id: work.id,
            title: work.title,
            description: work.description,
          });

    const createdById = effectiveUser?.id ?? null;
    const translations = translationRows(
      operationalText.title,
      operationalText.description,
      createdById,
    );

    const createdPart = await prisma.$transaction(async (tx) => {
      const part = await tx.workPart.create({
        data: {
          companyId,
          workOrderId: work.id,
          sequence: 1,
          sourceLanguage: operationalText.title.sourceLanguage,
          title: operationalText.title.sourceText,
          description: operationalText.description?.sourceText ?? null,
          status: workPartStatusFromLegacy(work.status),
          requiredPeople: work.requiredPeople,
          estimatedMinutes: work.estimatedMinutes,
          photoRequirement: "INHERIT",
          createdById,
          updatedById: createdById,
          translations:
            translations.length > 0
              ? {
                  create: translations,
                }
              : undefined,
        },
      });

      if (employee) {
        await tx.workPartAssignment.create({
          data: {
            companyId,
            workPartId: part.id,
            resourceKind: "PERSON",
            employeeId: employee.id,
            userId: employee.userId,
            resourceLabel: employee.fullName,
            createdById,
          },
        });
      }
      return part;
    });
    workPartId = createdPart.id;
  } else if (employee) {
    const existing = await prisma.workPartAssignment.findFirst({
      where: {
        companyId,
        workPartId,
        resourceKind: "PERSON",
        employeeId: employee.id,
        removedAt: null,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.workPartAssignment.create({
        data: {
          companyId,
          workPartId,
          resourceKind: "PERSON",
          employeeId: employee.id,
          userId: employee.userId,
          resourceLabel: employee.fullName,
          createdById: effectiveUser?.id ?? null,
        },
      });
    }
  }

  if (employee) {
    await bestEffortEnsureOperationalTranslations({
      companyId,
      workOrderId,
      actingUserId: effectiveUser?.id ?? null,
      recipientUserIds: employee.userId ? [employee.userId] : [],
      fallbackLanguages: [employee.preferredLanguage],
    });
  }

  if (employee?.userId) {
    try {
      await notifyPriorityWork({
        workOrderId,
        companyId,
        reason: "ASSIGNED_PRIORITY",
        recipientUserIds: [employee.userId],
      });
    } catch (error) {
      console.error("Priority notification failed after first work-part assignment", error);
    }
  }

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  if (!stayOnDashboard) redirect(`/verk/${workOrderId}#uthlutun`);
}

/**
 * Bætir við nýjum varanlegum verkþætti. Frumtextinn fær tungumál þess
 * viðmóts sem notandinn er að vinna í; framtíðarþýðingar verða sérfærslur.
 */
export async function createWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const planning = parsePlanningFields(formData, { allowInheritPhoto: true });

  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }
  if (!title) {
    throw new Error("Heiti verkþáttar vantar.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const [work, userSettings] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId },
      select: { id: true, status: true },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
  ]);

  if (!work) {
    throw new Error("Verkið fannst ekki.");
  }

  const lastPart = await prisma.workPart.findFirst({
    where: { workOrderId: work.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  if (!lastPart) {
    throw new Error(
      "Vista þarf núverandi Verk sem fyrsta Verkþátt áður en nýjum er bætt við.",
    );
  }

  const sourceLanguage = normalizeUiLanguage(
    userSettings?.interfaceLanguage ?? "is",
  );
  const createdById = effectiveUser?.id ?? null;

  await prisma.$transaction(async (tx) => {
    const createdPart = await tx.workPart.create({
      data: {
        companyId,
        workOrderId: work.id,
        sequence: lastPart.sequence + 1,
        sourceLanguage,
        title,
        description: description || null,
        status: "PLANNED",
        requiredPeople: planning.requiredPeople,
        estimatedMinutes: planning.estimatedMinutes,
        photoRequirement: planning.photoRequirement,
        createdById,
        updatedById: createdById,
      },
    });

    // Nýr opinn Verkþáttur á áður lokuðu Verki er meðvituð enduropnun.
    // completedAt er því hreinsað en eldri framkvæmdarsaga helst óbreytt.
    if (work.status === "COMPLETED") {
      await tx.workOrder.update({
        where: { id: work.id },
        data: {
          status: "IN_PROGRESS",
          completedAt: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          companyId,
          userId: createdById,
          entityType: "WORK_ORDER",
          entityId: work.id,
          action: "REOPENED",
          parentEntityType: "WORK_PART",
          parentEntityId: createdPart.id,
          source: "USER",
          description: "Verk enduropnað þegar nýjum opnum Verkþætti var bætt við.",
          beforeData: { status: "COMPLETED" },
          afterData: { status: "IN_PROGRESS" },
          metadata: { reason: "NEW_OPEN_WORK_PART" },
        },
      });
    }
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}


/**
 * Fyrsta varanlega úthlutunargerðin: manneskja tengd við ákveðinn Verkþátt.
 * Úthlutunin er sjálfstæð frá tímaskráningu; hún segir hver á að vinna þáttinn,
 * ekki hvaða tími hefur raunverulega verið unninn.
 */
export async function assignPersonToWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const employeeId = Number(formData.get("employeeId"));

  if (
    !Number.isInteger(workOrderId) ||
    !Number.isInteger(workPartId) ||
    !Number.isInteger(employeeId)
  ) {
    throw new Error("Ógild úthlutun.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const [part, employee] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId, workOrderId },
      select: {
        id: true,
        workOrder: { select: { status: true, workParts: { select: { status: true } } } },
      },
    }),
    prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      select: { id: true, fullName: true, userId: true, preferredLanguage: true },
    }),
  ]);

  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (isWork10EffectivelyCompleted(part.workOrder.status, part.workOrder.workParts)) {
    throw new Error("Ekki er hægt að úthluta starfsmanni á lokið Verk. Enduropna þarf Verkið fyrst.");
  }
  if (!employee) throw new Error("Starfsmaðurinn fannst ekki eða er óvirkur.");

  const existing = await prisma.workPartAssignment.findFirst({
    where: {
      companyId,
      workPartId,
      resourceKind: "PERSON",
      employeeId,
      removedAt: null,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.workPartAssignment.create({
      data: {
        companyId,
        workPartId,
        resourceKind: "PERSON",
        employeeId,
        userId: employee.userId,
        resourceLabel: employee.fullName,
        createdById: effectiveUser?.id ?? null,
      },
    });

    if (employee.userId) {
      try {
        await notifyPriorityWork({
          workOrderId,
          companyId,
          reason: "ASSIGNED_PRIORITY",
          recipientUserIds: [employee.userId],
        });
      } catch (error) {
        console.error("Priority notification failed after person assignment", error);
      }
    }
  }

  await bestEffortEnsureOperationalTranslations({
    companyId,
    workOrderId,
    actingUserId: effectiveUser?.id ?? null,
    recipientUserIds: employee.userId ? [employee.userId] : [],
    fallbackLanguages: [employee.preferredLanguage],
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

/**
 * Fjarlæging eyðir ekki sögulegri úthlutun. Hún lokar tengingunni með tíma
 * og notanda svo hægt sé að rekja hver var úthlutaður hvenær.
 */
export async function removePersonFromWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const assignmentId = Number(formData.get("assignmentId"));

  if (!Number.isInteger(workOrderId) || !Number.isInteger(assignmentId)) {
    throw new Error("Ógild úthlutun.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const assignment = await prisma.workPartAssignment.findFirst({
    where: {
      id: assignmentId,
      companyId,
      resourceKind: "PERSON",
      removedAt: null,
      workPart: {
        workOrderId,
      },
    },
    select: { id: true },
  });

  if (!assignment) {
    revalidatePath("/verk");
    revalidatePath(`/verk/${workOrderId}`);
    return;
  }

  await prisma.workPartAssignment.update({
    where: { id: assignment.id },
    data: {
      removedAt: new Date(),
      removedById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}


/** Tengir varanlega Verk-auðlind við Verkþátt. Úthlutun er áætlun, ekki notkun. */
export async function assignWorkResourceToWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const workResourceId = Number(formData.get("workResourceId"));

  if (!Number.isInteger(workOrderId) || !Number.isInteger(workPartId) || !Number.isInteger(workResourceId)) {
    throw new Error("Ógild auðlindaúthlutun.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const [part, resource, userSettings] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId, workOrderId },
      select: { id: true, workOrder: { select: { status: true, workParts: { select: { status: true } } } } },
    }),
    prisma.workResource.findFirst({
      where: { id: workResourceId, companyId, isActive: true },
      select: { id: true, kind: true, name: true, status: true },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
  ]);
  const resourceT = workResourceText(userSettings?.interfaceLanguage ?? "is");
  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (isWork10EffectivelyCompleted(part.workOrder.status, part.workOrder.workParts)) {
    throw new Error("Ekki er hægt að bæta nýrri auðlindaúthlutun við lokið Verk. Enduropna þarf Verkið fyrst.");
  }
  if (
    !resource ||
    !isWork10PersistentResourceKind(resource.kind) ||
    resource.status === "MAINTENANCE" ||
    resource.status === "OUT_OF_SERVICE" ||
    resource.status === "INACTIVE"
  ) {
    throw new Error("Auðlindin fannst ekki eða er ekki tiltæk til úthlutunar.");
  }

  const existing = await prisma.workPartAssignment.findFirst({
    where: { companyId, workPartId, workResourceId, removedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.workPartAssignment.create({
        data: {
          companyId,
          workPartId,
          resourceKind: resource.kind,
          workResourceId,
          resourceLabel: resource.name,
          createdById: effectiveUser?.id ?? null,
        },
      });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_PART_ASSIGNMENT",
          entityId: assignment.id,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: "RESOURCE_ASSIGNED",
          source: "USER",
          description: resourceT.auditAssigned,
          afterData: { workPartId, workResourceId, resourceKind: resource.kind },
        },
      });
    });

    if (resource.kind === "TEAM") {
      try {
        const recipientUserIds = await priorityRecipientUserIdsForTeam(companyId, resource.id);
        if (recipientUserIds.length > 0) {
          await bestEffortEnsureOperationalTranslations({
            companyId,
            workOrderId,
            actingUserId: effectiveUser?.id ?? null,
            recipientUserIds,
          });
          await notifyPriorityWork({
            workOrderId,
            companyId,
            reason: "ASSIGNED_PRIORITY",
            recipientUserIds,
          });
        }
      } catch (error) {
        console.error("Priority notification failed after team assignment", error);
      }
    }
  }

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/verk/tilfong");
}

export async function removeWorkResourceFromWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const assignmentId = Number(formData.get("assignmentId"));
  if (!Number.isInteger(workOrderId) || !Number.isInteger(assignmentId)) throw new Error("Ógild auðlindaúthlutun.");

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const [assignment, userSettings] = await Promise.all([
    prisma.workPartAssignment.findFirst({
      where: { id: assignmentId, companyId, removedAt: null, workResourceId: { not: null }, workPart: { workOrderId } },
      select: { id: true, workPartId: true, workResourceId: true, resourceKind: true },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
  ]);
  if (assignment) {
    const removedAt = new Date();
    const resourceT = workResourceText(userSettings?.interfaceLanguage ?? "is");
    await prisma.$transaction(async (tx) => {
      await tx.workPartAssignment.update({
        where: { id: assignment.id },
        data: { removedAt, removedById: effectiveUser?.id ?? null },
      });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_PART_ASSIGNMENT",
          entityId: assignment.id,
          parentEntityType: "WORK_ORDER",
          parentEntityId: workOrderId,
          action: "RESOURCE_UNASSIGNED",
          source: "USER",
          description: resourceT.auditUnassigned,
          beforeData: { workPartId: assignment.workPartId, workResourceId: assignment.workResourceId, resourceKind: assignment.resourceKind, removedAt: null },
          afterData: { removedAt: removedAt.toISOString() },
        },
      });
    });
  }
  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/verk/tilfong");
}

function dateOnlyFromInput(value: string) {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const displayMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

  const year = isoMatch ? Number(isoMatch[1]) : displayMatch ? Number(displayMatch[3]) : NaN;
  const month = isoMatch ? Number(isoMatch[2]) : displayMatch ? Number(displayMatch[2]) : NaN;
  const day = isoMatch ? Number(isoMatch[3]) : displayMatch ? Number(displayMatch[1]) : NaN;

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Ógild dagsetning.");
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Ógild dagsetning.");
  }

  return date;
}

/**
 * Skráir raunverulega vinnu einstaklings á ákveðinn Verkþátt.
 * Þetta er sjálfstæð staðreynd frá úthlutun: manneskja má hafa unnið
 * á Verkþætti þó hún hafi ekki verið formlega úthlutuð fyrirfram.
 */
export async function recordPersonLaborFact(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const employeeId = Number(formData.get("employeeId"));
  const workDateRaw = String(formData.get("workDate") ?? "").trim();
  const durationHours = Number(formData.get("durationHours") ?? 0);
  const durationMinutePart = Number(formData.get("durationMinutePart") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  const durationMinutes = durationHours * 60 + durationMinutePart;

  if (
    !Number.isInteger(workOrderId) ||
    !Number.isInteger(workPartId) ||
    !Number.isInteger(employeeId) ||
    !Number.isInteger(durationHours) ||
    !Number.isInteger(durationMinutePart) ||
    durationHours < 0 ||
    durationHours > 24 ||
    durationMinutePart < 0 ||
    durationMinutePart > 59 ||
    (durationHours === 24 && durationMinutePart !== 0) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  ) {
    throw new Error("Ógild raunvinnufærsla.");
  }

  const workDate = dateOnlyFromInput(workDateRaw);
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const [part, employee, userSettings] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId, workOrderId },
      select: {
        id: true,
        workOrder: { select: { status: true, workParts: { select: { status: true } } } },
      },
    }),
    prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      select: { id: true, fullName: true, userId: true },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
  ]);

  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (isWork10EffectivelyCompleted(part.workOrder.status, part.workOrder.workParts)) {
    throw new Error("Ekki er hægt að bæta nýrri raunvinnu við lokið Verk. Enduropna þarf Verkið fyrst.");
  }
  if (!employee) throw new Error("Starfsmaðurinn fannst ekki eða er óvirkur.");

  await prisma.workPartLaborFact.create({
    data: {
      companyId,
      workPartId,
      employeeId,
      userId: employee.userId,
      resourceLabel: employee.fullName,
      workDate,
      durationMinutes,
      note: note || null,
      noteSourceLanguage: normalizeUiLanguage(
        userSettings?.interfaceLanguage ?? "is",
      ),
      source: "MANUAL",
      createdById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}



const WORK10_USAGE_UNITS = new Set([
  "PCS",
  "KG",
  "L",
  "M",
  "M2",
  "M3",
  "KM",
  "HOUR",
  "MINUTE",
  "CUSTOM",
]);

function parseLocalizedPositiveNumber(value: string) {
  const compact = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(compact)) {
    throw new Error("Ógilt magn.");
  }

  const parsed = Number(compact);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    throw new Error("Ógilt magn.");
  }
  return parsed;
}

/**
 * Skráir magnmælanlega raunnotkun á Verkþátt. Fyrsta virka tegundin er efni.
 * Þetta er staðreynd um notkun, ekki birgðahreyfing, kostnaðarfærsla eða sölulína.
 */
export async function recordMaterialUsageFact(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const inventoryItemIdRaw = String(formData.get("inventoryItemId") ?? "").trim();
  const inventoryLocationIdRaw = String(formData.get("inventoryLocationId") ?? "").trim();
  const inventoryItemId = inventoryItemIdRaw ? Number(inventoryItemIdRaw) : null;
  const inventoryLocationId = inventoryLocationIdRaw ? Number(inventoryLocationIdRaw) : null;

  const manualResourceLabel = String(formData.get("resourceLabel") ?? "").trim();
  const manualResourceCode = String(formData.get("resourceCode") ?? "").trim();
  const usageDateRaw = String(formData.get("usageDate") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const manualUnit = String(formData.get("unit") ?? "PCS").trim();
  const manualCustomUnit = String(formData.get("customUnit") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(workOrderId) || !Number.isInteger(workPartId)) {
    throw new Error("Ógild efnisnotkun.");
  }
  if (inventoryItemId !== null && !Number.isInteger(inventoryItemId)) {
    throw new Error("Ógild birgðavara.");
  }
  if (inventoryLocationId !== null && !Number.isInteger(inventoryLocationId)) {
    throw new Error("Ógild birgðastaðsetning.");
  }
  if (note.length > 1000 || manualResourceCode.length > 80 || manualCustomUnit.length > 40) {
    throw new Error("Of langur texti í efnisnotkun.");
  }

  const quantity = parseLocalizedPositiveNumber(quantityRaw);
  const usageDate = dateOnlyFromInput(usageDateRaw);
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const createdById = effectiveUser?.id ?? null;

  const [part, userSettings, inventoryItem, inventoryLocation] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId, workOrderId },
      select: {
        id: true,
        workOrder: { select: { status: true, workParts: { select: { status: true } } } },
      },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
    inventoryItemId !== null
      ? prisma.inventoryItem.findFirst({
          where: { id: inventoryItemId, companyId, isActive: true },
        })
      : Promise.resolve(null),
    inventoryLocationId !== null
      ? prisma.inventoryLocation.findFirst({
          where: { id: inventoryLocationId, companyId, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (isWork10EffectivelyCompleted(part.workOrder.status, part.workOrder.workParts)) {
    throw new Error("Ekki er hægt að bæta nýrri efnisnotkun við lokið Verk. Enduropna þarf Verkið fyrst.");
  }

  const linkedToInventory = inventoryItemId !== null;
  if (linkedToInventory && !inventoryItem) {
    throw new Error("Birgðavaran fannst ekki.");
  }
  if (linkedToInventory && inventoryItem && !inventoryItem.isStockTracked) {
    const language = normalizeUiLanguage(userSettings?.interfaceLanguage ?? "is");
    throw new Error(inventoryText(language).stockTrackingRequiredForMovement);
  }
  if (linkedToInventory && !inventoryLocation) {
    throw new Error("Velja þarf virka birgðastaðsetningu.");
  }

  const resourceLabel = inventoryItem?.name ?? manualResourceLabel;
  const resourceCode = inventoryItem?.sku ?? manualResourceCode;
  const unit = inventoryItem?.baseUnit ?? manualUnit;
  const customUnit = inventoryItem?.customUnit ?? (manualUnit === "CUSTOM" ? manualCustomUnit : null);

  if (!resourceLabel || resourceLabel.length > 160) {
    throw new Error("Heiti efnis vantar eða er of langt.");
  }
  if (!WORK10_USAGE_UNITS.has(unit)) {
    throw new Error("Ógild mælieining.");
  }
  if (unit === "CUSTOM" && !customUnit) {
    throw new Error("Skrá þarf sérsniðna mælieiningu.");
  }

  if (inventoryItem && inventoryLocation) {
    const [stock, committed] = await Promise.all([
      prisma.inventoryMovement.aggregate({
        where: { companyId, itemId: inventoryItem.id, locationId: inventoryLocation.id, voidedAt: null },
        _sum: { quantityDelta: true },
      }),
      prisma.inventoryCommitment.aggregate({
        where: { companyId, itemId: inventoryItem.id, locationId: inventoryLocation.id, status: "ACTIVE" },
        _sum: { quantity: true },
      }),
    ]);
    const available = (stock._sum.quantityDelta ?? 0) - (committed._sum.quantity ?? 0);
    if (quantity > available + 1e-9) {
      const language = normalizeUiLanguage(userSettings?.interfaceLanguage ?? "is");
      const t = inventoryText(language);
      throw new Error(`${t.insufficientAvailableStock} ${t.availableStock}: ${available}.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const fact = await tx.workPartUsageFact.create({
      data: {
        companyId,
        workPartId,
        kind: "MATERIAL",
        resourceCode: resourceCode || null,
        resourceLabel,
        sourceLanguage: normalizeUiLanguage(
          userSettings?.interfaceLanguage ?? "is",
        ),
        usageDate,
        quantity,
        unit,
        customUnit: unit === "CUSTOM" ? customUnit : null,
        note: note || null,
        source: "MANUAL",
        inventoryItemId: inventoryItem?.id ?? null,
        inventoryLocationId: inventoryLocation?.id ?? null,
        createdById,
      },
    });

    if (inventoryItem && inventoryLocation) {
      await tx.inventoryMovement.create({
        data: {
          companyId,
          itemId: inventoryItem.id,
          locationId: inventoryLocation.id,
          movementType: "WORK_USAGE",
          quantityDelta: -quantity,
          unit: inventoryItem.baseUnit,
          unitCost: inventoryItem.purchaseUnitCost,
          movementAt: usageDate,
          note: note || null,
          source: "WORK",
          workPartId,
          usageFactId: fact.id,
          createdById,
        },
      });
    }
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/birgdir");
}


/** Skráir raunnotkun varanlegrar auðlindar. Þetta breytir ekki úthlutun eða stöðu auðlindar sjálfkrafa. */
export async function recordWorkResourceUsageFact(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const workResourceId = Number(formData.get("workResourceId"));
  const usageDateRaw = String(formData.get("usageDate") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(workOrderId) || !Number.isInteger(workPartId) || !Number.isInteger(workResourceId)) {
    throw new Error("Ógild auðlindanotkun.");
  }
  if (note.length > 1000) throw new Error("Of langur texti í auðlindanotkun.");

  const quantity = parseLocalizedPositiveNumber(quantityRaw);
  const usageDate = dateOnlyFromInput(usageDateRaw);
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const [part, resource, userSettings] = await Promise.all([
    prisma.workPart.findFirst({
      where: { id: workPartId, companyId, workOrderId },
      select: { id: true, workOrder: { select: { status: true, workParts: { select: { status: true } } } } },
    }),
    prisma.workResource.findFirst({
      where: { id: workResourceId, companyId, isActive: true },
      select: { id: true, kind: true, code: true, name: true, baseUnit: true, customUnit: true, costRateIsk: true },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
  ]);

  const resourceT = workResourceText(userSettings?.interfaceLanguage ?? "is");

  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (isWork10EffectivelyCompleted(part.workOrder.status, part.workOrder.workParts)) {
    throw new Error("Ekki er hægt að bæta nýrri notkun við lokið Verk. Enduropna þarf Verkið fyrst.");
  }
  if (!resource || !isWork10PersistentResourceKind(resource.kind) || resource.kind === "TEAM") {
    throw new Error("Auðlindin fannst ekki eða styður ekki magnmælda notkun.");
  }

  // Preserve the type guard across the transaction callback. Prisma exposes
  // `kind` as string here, and TypeScript does not keep a property narrowing
  // reliably once the object is captured by an async callback.
  const resourceKind = resource.kind;
  const unit = resource.baseUnit || defaultResourceUnit(resourceKind);
  const resolvedCustomUnit = unit === "CUSTOM" ? resource.customUnit : null;
  if (!WORK10_USAGE_UNITS.has(unit)) throw new Error("Ógild mælieining.");
  if (unit === "CUSTOM" && !resolvedCustomUnit) throw new Error("Sérsniðna einingu vantar.");

  await prisma.$transaction(async (tx) => {
    const fact = await tx.workPartUsageFact.create({
      data: {
        companyId,
        workPartId,
        kind: resourceUsageKind(resourceKind),
        resourceCode: resource.code,
        resourceLabel: resource.name,
        sourceLanguage: normalizeUiLanguage(userSettings?.interfaceLanguage ?? "is"),
        usageDate,
        quantity,
        unit,
        customUnit: resolvedCustomUnit,
        note: note || null,
        source: "MANUAL",
        workResourceId: resource.id,
        resourceUnitCostIsk: resource.costRateIsk,
        createdById: effectiveUser?.id ?? null,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_PART_USAGE_FACT",
        entityId: fact.id,
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        action: "RESOURCE_USAGE_RECORDED",
        source: "USER",
        description: resourceT.auditUsageRecorded,
        afterData: { workResourceId: resource.id, kind: resourceKind, quantity, unit, resourceUnitCostIsk: resource.costRateIsk },
      },
    });
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/verk/tilfong");
}

/**
 * "Eyða" á opnu Verki er mjúk eyðing undir húddinu svo rekjanleiki tapist ekki.
 * Ef notkunin hafði þegar myndað birgðahreyfingu er gerð gagnstæð RETURN-hreyfing
 * í stað þess að endurskrifa lager-söguna. Á lokuðu Verki er ástæða skyldubundin.
 */
export async function voidWorkPartUsageFact(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const factId = Number(formData.get("factId"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isInteger(workOrderId) || !Number.isInteger(factId)) {
    throw new Error("Ógild raunnotkunarfærsla.");
  }
  if (reason.length > 500) {
    throw new Error("Ástæða leiðréttingar er of löng.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const voidedById = effectiveUser?.id ?? null;

  const fact = await prisma.workPartUsageFact.findFirst({
    where: {
      id: factId,
      companyId,
      voidedAt: null,
      workPart: { workOrderId },
    },
    select: {
      id: true,
      workPartId: true,
      workPart: {
        select: {
          workOrder: { select: { status: true, workParts: { select: { status: true } } } },
        },
      },
      inventoryMovement: {
        select: {
          id: true,
          itemId: true,
          locationId: true,
          quantityDelta: true,
          unit: true,
          unitCost: true,
          voidedAt: true,
        },
      },
    },
  });

  if (!fact) {
    revalidatePath("/verk");
    revalidatePath(`/verk/${workOrderId}`);
    return;
  }

  const isCompletedWork = isWork10EffectivelyCompleted(
    fact.workPart.workOrder.status,
    fact.workPart.workOrder.workParts,
  );
  if (isCompletedWork && reason.length < 2) {
    throw new Error("Skrá þarf ástæðu þegar færslu á lokuðu Verki er ógilt.");
  }

  const voidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.workPartUsageFact.update({
      where: { id: fact.id },
      data: {
        voidedAt,
        voidedById,
        voidReason: reason || null,
      },
    });

    const movement = fact.inventoryMovement;
    if (movement && !movement.voidedAt && movement.quantityDelta !== 0) {
      await tx.inventoryMovement.create({
        data: {
          companyId,
          itemId: movement.itemId,
          locationId: movement.locationId,
          movementType: "RETURN",
          quantityDelta: -movement.quantityDelta,
          unit: movement.unit,
          unitCost: movement.unitCost,
          movementAt: voidedAt,
          note: reason || null,
          source: "WORK",
          workPartId: fact.workPartId,
          createdById: voidedById,
        },
      });
    }
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/birgdir");
}

/**
 * Býr til aðeins þær starfsmannasýnilegu þýðingar sem vantar fyrir núverandi
 * Verk. Frumtexti er aldrei yfirskrifaður. AI er kallað aðeins eftir beinni
 * aðgerð notanda í þessum reynsluakstri.
 */
export async function ensureWork10OperationalTranslations(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      id: true,
      sourceLanguage: true,
      title: true,
      description: true,
      translations: {
        select: {
          language: true,
          title: true,
          description: true,
        },
      },
      workParts: {
        select: {
          id: true,
          sourceLanguage: true,
          title: true,
          description: true,
          translations: {
            select: {
              language: true,
              title: true,
              description: true,
            },
          },
          laborFacts: {
            select: {
              id: true,
              note: true,
              noteSourceLanguage: true,
              translations: {
                select: { language: true },
              },
            },
          },
        },
      },
    },
  });

  if (!work) throw new Error("Verkið fannst ekki.");

  const items: Work10TranslationItem[] = [];

  const workTitleTargets = missingTargetLanguages(
    work.sourceLanguage,
    work.translations
      .filter((translation) => Boolean(translation.title?.trim()))
      .map((translation) => translation.language),
  );
  if (workTitleTargets.length > 0) {
    items.push({
      key: `work:${work.id}:title`,
      sourceLanguage: normalizeUiLanguage(work.sourceLanguage),
      text: work.title,
      targetLanguages: workTitleTargets,
    });
  }

  if (work.description?.trim()) {
    const workDescriptionTargets = missingTargetLanguages(
      work.sourceLanguage,
      work.translations
        .filter((translation) => Boolean(translation.description?.trim()))
        .map((translation) => translation.language),
    );
    if (workDescriptionTargets.length > 0) {
      items.push({
        key: `work:${work.id}:description`,
        sourceLanguage: normalizeUiLanguage(work.sourceLanguage),
        text: work.description,
        targetLanguages: workDescriptionTargets,
      });
    }
  }

  items.push(
    ...work.workParts.flatMap((part) => {
      const rows: Work10TranslationItem[] = [];

    const titleTargets = missingTargetLanguages(
      part.sourceLanguage,
      part.translations
        .filter((translation) => Boolean(translation.title?.trim()))
        .map((translation) => translation.language),
    );
    if (titleTargets.length > 0) {
      rows.push({
        key: `part:${part.id}:title`,
        sourceLanguage: normalizeUiLanguage(part.sourceLanguage),
        text: part.title,
        targetLanguages: titleTargets,
      });
    }

    if (part.description?.trim()) {
      const descriptionTargets = missingTargetLanguages(
        part.sourceLanguage,
        part.translations
          .filter((translation) => Boolean(translation.description?.trim()))
          .map((translation) => translation.language),
      );
      if (descriptionTargets.length > 0) {
        rows.push({
          key: `part:${part.id}:description`,
          sourceLanguage: normalizeUiLanguage(part.sourceLanguage),
          text: part.description,
          targetLanguages: descriptionTargets,
        });
      }
    }

    for (const fact of part.laborFacts) {
      if (!fact.note?.trim()) continue;
      const noteTargets = missingTargetLanguages(
        fact.noteSourceLanguage,
        fact.translations.map((translation) => translation.language),
      );
      if (noteTargets.length > 0) {
        rows.push({
          key: `labor:${fact.id}:note`,
          sourceLanguage: normalizeUiLanguage(fact.noteSourceLanguage),
          text: fact.note,
          targetLanguages: noteTargets,
        });
      }
    }

      return rows;
    }),
  );

  const translations = await translateWork10OperationalItems({
    companyId,
    userId,
    items,
  });

  for (const translation of translations) {
    const [kind, rawId, field] = translation.key.split(":");
    const id = Number(rawId);
    if (!Number.isInteger(id)) continue;

    if (kind === "work" && (field === "title" || field === "description")) {
      await prisma.workOrderTranslation.upsert({
        where: {
          workOrderId_language: {
            workOrderId: id,
            language: translation.language,
          },
        },
        create: {
          workOrderId: id,
          language: translation.language,
          title: field === "title" ? translation.text : null,
          description: field === "description" ? translation.text : null,
          source: "AI",
          createdById: userId,
        },
        update:
          field === "title"
            ? { title: translation.text }
            : { description: translation.text },
      });
    }

    if (kind === "part" && (field === "title" || field === "description")) {
      await prisma.workPartTranslation.upsert({
        where: {
          workPartId_language: {
            workPartId: id,
            language: translation.language,
          },
        },
        create: {
          workPartId: id,
          language: translation.language,
          title: field === "title" ? translation.text : null,
          description: field === "description" ? translation.text : null,
          source: "AI",
          createdById: userId,
        },
        update:
          field === "title"
            ? { title: translation.text }
            : { description: translation.text },
      });
    }

    if (kind === "labor" && field === "note") {
      await prisma.workPartLaborFactTranslation.upsert({
        where: {
          laborFactId_language: {
            laborFactId: id,
            language: translation.language,
          },
        },
        create: {
          laborFactId: id,
          language: translation.language,
          text: translation.text,
          source: "AI",
          createdById: userId,
        },
        update: {
          text: translation.text,
          source: "AI",
        },
      });
    }
  }

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

/**
 * "Eyða" á opnu Verki merkir færsluna sem eydda án þess að tapa upprunalegu
 * staðreyndinni. Á lokuðu Verki er aðgerðin ógilding og ástæða er skyldubundin.
 */
export async function voidPersonLaborFact(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const factId = Number(formData.get("factId"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!Number.isInteger(workOrderId) || !Number.isInteger(factId)) {
    throw new Error("Ógild raunvinnufærsla.");
  }
  if (reason.length > 500) {
    throw new Error("Ástæða leiðréttingar er of löng.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const fact = await prisma.workPartLaborFact.findFirst({
    where: {
      id: factId,
      companyId,
      voidedAt: null,
      workPart: { workOrderId },
    },
    select: {
      id: true,
      workPart: {
        select: {
          workOrder: { select: { status: true, workParts: { select: { status: true } } } },
        },
      },
    },
  });

  if (!fact) {
    revalidatePath("/verk");
    revalidatePath(`/verk/${workOrderId}`);
    return;
  }

  const isCompletedWork = isWork10EffectivelyCompleted(
    fact.workPart.workOrder.status,
    fact.workPart.workOrder.workParts,
  );
  if (isCompletedWork && reason.length < 2) {
    throw new Error("Skrá þarf ástæðu þegar færslu á lokuðu Verki er ógilt.");
  }

  await prisma.workPartLaborFact.update({
    where: { id: fact.id },
    data: {
      voidedAt: new Date(),
      voidedById: effectiveUser?.id ?? null,
      voidReason: reason || null,
    },
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}



function revalidateWorkOrder(workOrderId: number) {
  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

export async function updateWorkOrderPriority(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const priority = String(formData.get("priority") ?? "").trim();
  const allowed = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
  if (!Number.isInteger(workOrderId) || !allowed.has(priority)) {
    throw new Error("Ógildur forgangur.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: { id: true, priority: true },
  });
  if (!work) throw new Error("Verkið fannst ekki.");
  if (work.priority === priority) return;

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: work.id },
      data: { priority },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_ORDER",
        entityId: work.id,
        action: "PRIORITY_CHANGED",
        source: "USER",
        description: "Forgangi Verks breytt.",
        beforeData: { priority: work.priority },
        afterData: { priority },
      },
    });
  });

  const alertRank = (value: string) => value === "URGENT" ? 2 : value === "HIGH" ? 1 : 0;
  if (alertRank(priority) > alertRank(work.priority)) {
    try {
      await notifyPriorityWork({
        workOrderId,
        companyId,
        reason: "PRIORITY_CHANGED",
      });
    } catch (error) {
      console.error("Priority notification failed after priority change", error);
    }
  }

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/mobile");
  revalidatePath("/mobile/verk");
  redirect(`/verk/${workOrderId}#forgangur`);
}

/** Uppfærir mönnunar-/tímaáætlun og valkvæða myndakröfu á þegar stofnuðu Verki. */
export async function updateWorkOrderPlanning(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  if (!Number.isInteger(workOrderId)) throw new Error("Ógilt verknúmer.");

  const planning = parsePlanningFields(formData);
  const plannedDate = parseWork10PlannedDate(String(formData.get("plannedDate") ?? ""));
  const plannedStartMinutes = parseWork10PlannedStartParts(formData.get("plannedStartHour")?.toString(), formData.get("plannedStartMinute")?.toString());
  const completionDeadline = parseWork10CompletionDeadline(
    String(formData.get("completionDeadlineDate") ?? ""),
    formData.get("completionDeadlineHour")?.toString(),
    formData.get("completionDeadlineMinute")?.toString(),
  );
  const allowAfterWorkdayEnd = formData.get("allowAfterWorkdayEnd") === "on";
  const workdayEndExceptionReason = String(formData.get("workdayEndExceptionReason") ?? "").trim();
  if (plannedStartMinutes !== null && !plannedDate) {
    throw new Error("Veldu áætlaðan dag áður en upphafstími er skráður.");
  }
  if (allowAfterWorkdayEnd && !workdayEndExceptionReason) {
    throw new Error("Skrá þarf ástæðu ef heimilt er að fara fram yfir dagslok.");
  }
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: { id: true, status: true },
  });
  if (!work) throw new Error("Verkið fannst ekki.");
  if (work.status === "COMPLETED" || work.status === "CANCELLED") {
    throw new Error("Endurvirkja þarf Verkið áður en áætlun þess er breytt.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        requiredPeople: planning.requiredPeople,
        estimatedMinutes: planning.estimatedMinutes,
        plannedDate,
        plannedStartMinutes,
        plannedEndMinutes: null,
        completionDeadlineDate: completionDeadline.date,
        completionDeadlineMinutes: completionDeadline.minutes,
        allowAfterWorkdayEnd,
        workdayEndExceptionReason: allowAfterWorkdayEnd ? workdayEndExceptionReason : null,
        photoRequirement: planning.photoRequirement,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "WORK_ORDER",
        entityId: workOrderId,
        action: "PLANNING_UPDATED",
        source: "USER",
        description: "Mönnunar-/tímaáætlun Verks uppfærð.",
        afterData: {
          ...planning,
          plannedDate: plannedDate?.toISOString().slice(0, 10) ?? null,
          plannedStartMinutes,
          completionDeadlineDate: completionDeadline.date?.toISOString().slice(0, 10) ?? null,
          completionDeadlineMinutes: completionDeadline.minutes,
          allowAfterWorkdayEnd,
          workdayEndExceptionReason: allowAfterWorkdayEnd ? workdayEndExceptionReason : null,
        },
      },
    });
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/mobile/verk");
}


export async function applyWorkdayStaffingPlan(formData: FormData) {
  const rawPlan = String(formData.get("plan") ?? "").trim();
  if (!rawPlan) throw new Error("Dagsáætlun vantar.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPlan);
  } catch {
    throw new Error("Dagsáætlunin er ógild.");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Dagsáætlunin er ógild.");
  const payload = parsed as {
    plannedDate?: unknown;
    works?: unknown;
  };
  const plannedDate = parseWork10PlannedDate(String(payload.plannedDate ?? ""));
  if (!plannedDate) throw new Error("Dagsetning dagsáætlunar er ógild.");
  if (!Array.isArray(payload.works) || payload.works.length === 0 || payload.works.length > 500) {
    throw new Error("Dagsáætlunin inniheldur engan eða of marga Verkliði.");
  }

  const parsePlanTravelLeg = (rawValue: unknown, kind: "TO_WORK" | "RETURN_BASE", plannedStartMinutes: number, plannedEndMinutes: number) => {
    if (rawValue === null || rawValue === undefined) return null;
    if (typeof rawValue !== "object") throw new Error("Ógild ferðaleið í dagsáætlun.");
    const rawTravel = rawValue as Record<string, unknown>;
    const fromLocationId = Number(rawTravel.fromLocationId);
    const toLocationId = Number(rawTravel.toLocationId);
    const departureMinutes = Number(rawTravel.departureMinutes);
    const arrivalMinutes = Number(rawTravel.arrivalMinutes);
    const estimatedMinutes = Number(rawTravel.estimatedMinutes);
    const distanceKm = Number(rawTravel.distanceKm);
    const estimateSource = String(rawTravel.estimateSource ?? "MANUAL").trim().slice(0, 40) || "MANUAL";
    const trafficRuleCode = rawTravel.trafficRuleCode === null || rawTravel.trafficRuleCode === undefined
      ? null
      : String(rawTravel.trafficRuleCode).trim().slice(0, 80) || null;
    const commonInvalid =
      !Number.isInteger(fromLocationId) || !Number.isInteger(toLocationId) ||
      !Number.isInteger(departureMinutes) || !Number.isInteger(arrivalMinutes) || !Number.isInteger(estimatedMinutes) ||
      !Number.isFinite(distanceKm) || distanceKm < 0 || estimatedMinutes < 0 ||
      departureMinutes < 0 || departureMinutes >= 24 * 60 ||
      arrivalMinutes < departureMinutes || arrivalMinutes > 24 * 60 ||
      arrivalMinutes - departureMinutes !== estimatedMinutes;
    const timingInvalid = kind === "TO_WORK"
      ? arrivalMinutes > plannedStartMinutes
      : departureMinutes < plannedEndMinutes;
    if (commonInvalid || timingInvalid) throw new Error("Ógild ferðaleið í dagsáætlun.");
    return { fromLocationId, toLocationId, departureMinutes, arrivalMinutes, estimatedMinutes, distanceKm, estimateSource, trafficRuleCode };
  };

  const works = payload.works.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Ógildur Verkliður í dagsáætlun.");
    const item = value as {
      workOrderId?: unknown;
      plannedStartMinutes?: unknown;
      plannedEndMinutes?: unknown;
      assignments?: unknown;
    };
    const workOrderId = Number(item.workOrderId);
    const plannedStartMinutes = Number(item.plannedStartMinutes);
    const plannedEndMinutes = Number(item.plannedEndMinutes);
    if (
      !Number.isInteger(workOrderId) ||
      !Number.isInteger(plannedStartMinutes) ||
      !Number.isInteger(plannedEndMinutes) ||
      plannedStartMinutes < 0 ||
      plannedStartMinutes >= 24 * 60 ||
      plannedEndMinutes <= plannedStartMinutes ||
      plannedEndMinutes > 24 * 60
    ) {
      throw new Error("Ógildur tími eða verknúmer í dagsáætlun.");
    }
    if (!Array.isArray(item.assignments) || item.assignments.length === 0 || item.assignments.length > 100) {
      throw new Error("Ógild mönnun í dagsáætlun.");
    }
    const assignments = item.assignments.map((assignmentValue) => {
      if (!assignmentValue || typeof assignmentValue !== "object") throw new Error("Ógild úthlutun í dagsáætlun.");
      const assignment = assignmentValue as { employeeId?: unknown; workPartId?: unknown; travelLeg?: unknown; returnLeg?: unknown };
      const employeeId = Number(assignment.employeeId);
      const workPartId = Number(assignment.workPartId);
      if (!Number.isInteger(employeeId) || !Number.isInteger(workPartId)) throw new Error("Ógild úthlutun í dagsáætlun.");

      const travelLeg = parsePlanTravelLeg(assignment.travelLeg, "TO_WORK", plannedStartMinutes, plannedEndMinutes);
      const returnLeg = parsePlanTravelLeg(assignment.returnLeg, "RETURN_BASE", plannedStartMinutes, plannedEndMinutes);
      return { employeeId, workPartId, travelLeg, returnLeg };
    });
    return { workOrderId, plannedStartMinutes, plannedEndMinutes, assignments };
  });

  const workOrderIds = [...new Set(works.map((item) => item.workOrderId))];
  if (workOrderIds.length !== works.length) throw new Error("Sama Verk má aðeins koma einu sinni fyrir í dagsáætlun.");
  const employeeIds = [...new Set(works.flatMap((item) => item.assignments.map((assignment) => assignment.employeeId)))];
  const workPartIds = [...new Set(works.flatMap((item) => item.assignments.map((assignment) => assignment.workPartId)))];
  const travelLocationIds = [...new Set(works.flatMap((item) => item.assignments.flatMap((assignment) => [
    ...(assignment.travelLeg ? [assignment.travelLeg.fromLocationId, assignment.travelLeg.toLocationId] : []),
    ...(assignment.returnLeg ? [assignment.returnLeg.fromLocationId, assignment.returnLeg.toLocationId] : []),
  ])))];

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const [dbWorks, employees, parts, existingAssignments, travelLocations] = await Promise.all([
    prisma.workOrder.findMany({
      where: { id: { in: workOrderIds }, companyId },
      select: { id: true, status: true, priority: true, plannedDate: true, plannedStartMinutes: true, plannedEndMinutes: true, operationalLocationId: true },
    }),
    prisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId, isActive: true },
      select: { id: true, fullName: true, userId: true, preferredLanguage: true, baseOperationalLocationId: true },
    }),
    prisma.workPart.findMany({
      where: { id: { in: workPartIds }, companyId },
      select: { id: true, workOrderId: true },
    }),
    prisma.workPartAssignment.findMany({
      where: {
        companyId,
        workPartId: { in: workPartIds },
        employeeId: { in: employeeIds },
        resourceKind: "PERSON",
        removedAt: null,
      },
      select: { workPartId: true, employeeId: true },
    }),
    travelLocationIds.length > 0
      ? prisma.operationalLocation.findMany({ where: { companyId, id: { in: travelLocationIds }, isActive: true }, select: { id: true } })
      : Promise.resolve([] as Array<{ id: number }>),
  ]);

  if (dbWorks.length !== workOrderIds.length) throw new Error("Eitt eða fleiri Verk fundust ekki.");
  if (employees.length !== employeeIds.length) throw new Error("Einn eða fleiri starfsmenn fundust ekki eða eru óvirkir.");
  if (travelLocations.length !== travelLocationIds.length) throw new Error("Einn eða fleiri rekstrarstaðir í ferðaleið fundust ekki.");
  const workById = new Map(dbWorks.map((work) => [work.id, work]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const partById = new Map(parts.map((part) => [part.id, part]));
  const existingKeys = new Set(existingAssignments.map((assignment) => `${assignment.workPartId}:${assignment.employeeId}`));

  for (const item of works) {
    const work = workById.get(item.workOrderId);
    if (!work) throw new Error("Verkið fannst ekki.");
    if (work.status === "COMPLETED" || work.status === "CANCELLED") throw new Error("Lokuðu Verki má ekki bæta í dagsáætlun.");
    for (const assignment of item.assignments) {
      const part = partById.get(assignment.workPartId);
      if (!part || part.workOrderId !== item.workOrderId) throw new Error("Verkþáttur passar ekki við Verk í dagsáætlun.");
      if (!employeeById.has(assignment.employeeId)) throw new Error("Starfsmaður fannst ekki.");
      if (assignment.travelLeg && work.operationalLocationId && assignment.travelLeg.toLocationId !== work.operationalLocationId) {
        throw new Error("Áfangastaður ferðaleiðar passar ekki við rekstrarstað Verks.");
      }
      const employee = employeeById.get(assignment.employeeId);
      if (assignment.returnLeg && work.operationalLocationId && assignment.returnLeg.fromLocationId !== work.operationalLocationId) {
        throw new Error("Upphaf heimferðar passar ekki við rekstrarstað Verks.");
      }
      if (assignment.returnLeg && employee?.baseOperationalLocationId && assignment.returnLeg.toLocationId !== employee.baseOperationalLocationId) {
        throw new Error("Heimferð endar ekki á starfstöð starfsmanns.");
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of works) {
      const before = workById.get(item.workOrderId)!;
      await tx.workOrder.update({
        where: { id: item.workOrderId },
        data: { plannedDate, plannedStartMinutes: item.plannedStartMinutes, plannedEndMinutes: item.plannedEndMinutes },
      });
      await tx.auditEvent.create({
        data: {
          companyId,
          userId: effectiveUser?.id ?? null,
          entityType: "WORK_ORDER",
          entityId: item.workOrderId,
          action: "DAY_PLAN_CONFIRMED",
          source: "USER",
          description: "Dagsáætlun Verks staðfest.",
          beforeData: {
            plannedDate: before.plannedDate?.toISOString().slice(0, 10) ?? null,
            plannedStartMinutes: before.plannedStartMinutes,
            plannedEndMinutes: before.plannedEndMinutes,
          },
          afterData: {
            plannedDate: plannedDate.toISOString().slice(0, 10),
            plannedStartMinutes: item.plannedStartMinutes,
            plannedEndMinutes: item.plannedEndMinutes,
          },
        },
      });
    }

    for (const item of works) {
      for (const assignment of item.assignments) {
        const persistLeg = async (legType: "TO_WORK" | "RETURN_BASE", leg: typeof assignment.travelLeg) => {
          if (!leg) {
            await tx.workTravelPlanLeg.deleteMany({
              where: { workOrderId: item.workOrderId, employeeId: assignment.employeeId, plannedDate, legType },
            });
            return;
          }
          await tx.workTravelPlanLeg.upsert({
            where: {
              workOrderId_employeeId_plannedDate_legType: {
                workOrderId: item.workOrderId,
                employeeId: assignment.employeeId,
                plannedDate,
                legType,
              },
            },
            create: {
              companyId, workOrderId: item.workOrderId, employeeId: assignment.employeeId, plannedDate, legType,
              fromLocationId: leg.fromLocationId, toLocationId: leg.toLocationId,
              departureMinutes: leg.departureMinutes, arrivalMinutes: leg.arrivalMinutes,
              estimatedMinutes: leg.estimatedMinutes, distanceKm: leg.distanceKm,
              estimateSource: leg.estimateSource, trafficRuleCode: leg.trafficRuleCode, status: "PLANNED",
            },
            update: {
              fromLocationId: leg.fromLocationId, toLocationId: leg.toLocationId,
              departureMinutes: leg.departureMinutes, arrivalMinutes: leg.arrivalMinutes,
              estimatedMinutes: leg.estimatedMinutes, distanceKm: leg.distanceKm,
              estimateSource: leg.estimateSource, trafficRuleCode: leg.trafficRuleCode, status: "PLANNED",
            },
          });
        };

        await persistLeg("TO_WORK", assignment.travelLeg);
        await persistLeg("RETURN_BASE", assignment.returnLeg);
      }
    }

    const newAssignments = works.flatMap((item) =>
      item.assignments
        .filter((assignment) => !existingKeys.has(`${assignment.workPartId}:${assignment.employeeId}`))
        .map((assignment) => {
          const employee = employeeById.get(assignment.employeeId)!;
          return {
            companyId,
            workPartId: assignment.workPartId,
            resourceKind: "PERSON",
            employeeId: assignment.employeeId,
            userId: employee.userId,
            resourceLabel: employee.fullName,
            createdById: effectiveUser?.id ?? null,
          };
        }),
    );
    if (newAssignments.length > 0) await tx.workPartAssignment.createMany({ data: newAssignments });
  });

  for (const item of works) {
    const recipientUserIds = [...new Set(
      item.assignments
        .map((assignment) => employeeById.get(assignment.employeeId)?.userId ?? null)
        .filter((userId): userId is number => userId !== null),
    )];
    try {
      await bestEffortEnsureOperationalTranslations({
        companyId,
        workOrderId: item.workOrderId,
        actingUserId: effectiveUser?.id ?? null,
        recipientUserIds,
        fallbackLanguages: item.assignments
          .map((assignment) => employeeById.get(assignment.employeeId)?.preferredLanguage ?? null)
          .filter((language): language is string => Boolean(language)),
      });
      if (recipientUserIds.length > 0 && ["HIGH", "URGENT"].includes(workById.get(item.workOrderId)?.priority ?? "")) {
        await notifyPriorityWork({
          workOrderId: item.workOrderId,
          companyId,
          reason: "ASSIGNED_PRIORITY",
          recipientUserIds,
        });
      }
    } catch (error) {
      console.error("Day-plan post-processing failed", error);
    }
  }

  revalidatePath("/verk");
  revalidatePath("/mobile");
  revalidatePath("/mobile/verk");
  for (const workOrderId of workOrderIds) revalidatePath(`/verk/${workOrderId}`);
}

/**
 * Lokun sjálfs Verks er meðvituð stjórnandaaðgerð. Verkþættir mega allir vera
 * loknir án þess að Verkið sjálft hverfi úr virkri rekstrarsýn fyrr en þetta
 * skref er staðfest.
 */
export async function completeWorkOrder(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  if (!Number.isInteger(workOrderId)) throw new Error("Ógilt verknúmer.");

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: {
      id: true,
      status: true,
      completedAt: true,
      photoRequirement: true,
      evidencePhotos: {
        where: { stage: "WORK_COMPLETE" },
        select: { id: true },
        take: 1,
      },
      workParts: {
        select: {
          id: true,
          status: true,
          laborFacts: {
            where: { voidedAt: null, startedAt: { not: null }, endedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!work) throw new Error("Verkið fannst ekki.");
  if (work.status === "CANCELLED") throw new Error("Ekki er hægt að ljúka niðurfelldu Verki.");
  if (work.status === "COMPLETED") {
    redirect(`/verk/${workOrderId}#lifsferill`);
  }
  if (!isWork10ReadyToClose(work.status, work.workParts)) {
    throw new Error("Ekki er hægt að ljúka Verkinu fyrr en allir Verkþættir eru komnir í lokastöðu.");
  }

  if (work.photoRequirement === "WORK_COMPLETE" && work.evidencePhotos.length === 0) {
    throw new Error("Myndakrafa Verks er ekki uppfyllt. Bæta þarf við lokamynd áður en Verkinu er lokað.");
  }

  const activeLaborCount = work.workParts.reduce(
    (sum, part) => sum + part.laborFacts.length,
    0,
  );
  if (activeLaborCount > 0) {
    throw new Error("Ekki er hægt að ljúka Verkinu meðan virk tímaskráning er í gangi.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: { status: "COMPLETED", completedAt: now },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_ORDER",
        entityId: workOrderId,
        action: "COMPLETED",
        source: "USER",
        description: "Verki lokað eftir staðfestingu stjórnanda.",
        beforeData: { status: work.status, completedAt: work.completedAt?.toISOString() ?? null },
        afterData: { status: "COMPLETED", completedAt: now.toISOString() },
        metadata: { reason: "MANUAL_WORK_CLOSE" },
      },
    });
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/mobile");
  revalidatePath("/mobile/verk");
  redirect(`/verk/${workOrderId}#lifsferill`);
}

export async function reopenWorkOrder(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  if (!Number.isInteger(workOrderId)) throw new Error("Ógilt verknúmer.");

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    select: { id: true, status: true, completedAt: true },
  });
  if (!work) throw new Error("Verkið fannst ekki.");
  if (work.status !== "COMPLETED") {
    redirect(`/verk/${workOrderId}#lifsferill`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_ORDER",
        entityId: workOrderId,
        action: "REOPENED",
        source: "USER",
        description: "Verk endurvirkjað eftir handvirka lokun.",
        beforeData: { status: work.status, completedAt: work.completedAt?.toISOString() ?? null },
        afterData: { status: "IN_PROGRESS", completedAt: null },
        metadata: { reason: "MANUAL_WORK_REOPEN" },
      },
    });
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
  revalidatePath("/mobile");
  revalidatePath("/mobile/verk");
  redirect(`/verk/${workOrderId}#lifsferill`);
}

/**
 * Verkþáttur er sannleikurinn um framkvæmdarstöðu. WorkOrder.status heldur
 * utan um stjórnunarstöðu sjálfs Verks og lokast ekki sjálfkrafa með síðasta
 * Verkþættinum.
 */
export async function updateWorkPartStatus(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const requestedStatus = String(formData.get("status") ?? "").trim();

  if (
    !Number.isInteger(workOrderId) ||
    !Number.isInteger(workPartId) ||
    !isWork10PartStatus(requestedStatus)
  ) {
    throw new Error("Ógild staða Verkþáttar.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const [work, dependencies] = await Promise.all([
    prisma.workOrder.findFirst({
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
    }),
    prisma.workPartDependency.findMany({
      where: { companyId, workOrderId },
      select: { predecessorPartId: true, successorPartId: true },
    }),
  ]);

  if (!work) throw new Error("Verkið fannst ekki.");
  if (work.status === "COMPLETED") {
    throw new Error("Endurvirkja þarf Verkið áður en stöðu Verkþáttar er breytt.");
  }
  if (work.status === "CANCELLED") {
    throw new Error("Ekki er hægt að breyta Verkþætti á niðurfelldu Verki.");
  }

  const part = work.workParts.find((item) => item.id === workPartId);
  if (!part) throw new Error("Verkþátturinn fannst ekki.");
  if (part.status === requestedStatus) {
    revalidateWorkOrder(workOrderId);
    redirect(`/verk/${workOrderId}#verkthattur-${workPartId}`);
  }

  if (work10StatusRequiresResolvedDependencies(requestedStatus)) {
    const blockers = work10UnresolvedPredecessorIds(
      workPartId,
      work.workParts,
      dependencies,
    );
    if (blockers.length > 0) {
      const names = work.workParts
        .filter((item) => blockers.includes(item.id))
        .map((item) => item.title)
        .join(", ");
      throw new Error(
        `Verkþátturinn bíður eftir óloknum undanförum${names ? `: ${names}` : "."}`,
      );
    }
  }

  if (requestedStatus === "COMPLETED") {
    const requirement = effectivePartPhotoRequirement(part.photoRequirement, work.photoRequirement);
    const requiredStage =
      requirement === "START" ? "START" :
      requirement === "PROGRESS" ? "PROGRESS" :
      requirement === "PART_COMPLETE" ? "PART_COMPLETE" :
      null;
    if (requiredStage) {
      const evidence = await prisma.workEvidencePhoto.findFirst({
        where: { companyId, workOrderId, workPartId, stage: requiredStage },
        select: { id: true },
      });
      if (!evidence) {
        throw new Error("Myndakrafa Verkþáttar er ekki uppfyllt. Bæta þarf við tilskilinni mynd áður en honum er lokið.");
      }
    }
  }

  const nextParts = work.workParts.map((item) =>
    item.id === workPartId ? { ...item, status: requestedStatus } : item,
  );
  const nextWorkStatus = deriveWork10Status(work.status, nextParts);
  const now = new Date();
  const shouldHaveStarted = nextParts.some(
    (item) => item.status === "IN_PROGRESS" || isWork10PartTerminalStatus(item.status),
  );

  await prisma.$transaction(async (tx) => {
    await tx.workPart.update({
      where: { id: workPartId },
      data: {
        status: requestedStatus,
        updatedById: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_PART",
        entityId: workPartId,
        action: "STATUS_CHANGED",
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        source: "USER",
        description: "Stöðu Verkþáttar breytt.",
        beforeData: { status: part.status },
        afterData: { status: requestedStatus },
      },
    });

    const workOrderData: {
      status: string;
      startedAt?: Date;
      completedAt?: Date | null;
    } = {
      status: nextWorkStatus,
    };

    if (!work.startedAt && shouldHaveStarted) workOrderData.startedAt = now;
    if (nextWorkStatus === "COMPLETED") {
      workOrderData.completedAt = work.completedAt ?? now;
    } else if (work.completedAt) {
      workOrderData.completedAt = null;
    }

    if (
      work.status !== nextWorkStatus ||
      workOrderData.startedAt ||
      workOrderData.completedAt !== undefined
    ) {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: workOrderData,
      });
    }
  });

  revalidateWorkOrder(workOrderId);
  redirect(`/verk/${workOrderId}#verkthattur-${workPartId}`);
}

/** Breytir aðeins framsetningarröð Verkþátta; dependency-grafið helst óbreytt. */
export async function moveWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const workPartId = Number(formData.get("workPartId"));
  const direction = String(formData.get("direction") ?? "");

  if (
    !Number.isInteger(workOrderId) ||
    !Number.isInteger(workPartId) ||
    (direction !== "UP" && direction !== "DOWN")
  ) {
    throw new Error("Ógild röð Verkþáttar.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const parts = await prisma.workPart.findMany({
    where: { companyId, workOrderId },
    orderBy: { sequence: "asc" },
    select: { id: true, sequence: true },
  });

  const index = parts.findIndex((part) => part.id === workPartId);
  if (index < 0) throw new Error("Verkþátturinn fannst ekki.");
  const neighborIndex = direction === "UP" ? index - 1 : index + 1;
  const neighbor = parts[neighborIndex];
  if (!neighbor) {
    revalidateWorkOrder(workOrderId);
    return;
  }

  const current = parts[index];
  const temporarySequence = -1_000_000_000 - current.id;

  await prisma.$transaction(async (tx) => {
    await tx.workPart.update({
      where: { id: current.id },
      data: { sequence: temporarySequence, updatedById: userId },
    });
    await tx.workPart.update({
      where: { id: neighbor.id },
      data: { sequence: current.sequence, updatedById: userId },
    });
    await tx.workPart.update({
      where: { id: current.id },
      data: { sequence: neighbor.sequence, updatedById: userId },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_PART",
        entityId: current.id,
        action: "REORDERED",
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        source: "USER",
        description: "Röð Verkþáttar breytt.",
        beforeData: { sequence: current.sequence },
        afterData: { sequence: neighbor.sequence },
        metadata: { swappedWithPartId: neighbor.id },
      },
    });
  });

  revalidateWorkOrder(workOrderId);
}

/** Bætir við rekjanlegri FINISH_TO_START dependency án þess að leyfa hring. */
export async function addWorkPartDependency(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const successorPartId = Number(formData.get("successorPartId"));
  const predecessorPartId = Number(formData.get("predecessorPartId"));

  if (
    !Number.isInteger(workOrderId) ||
    !Number.isInteger(successorPartId) ||
    !Number.isInteger(predecessorPartId) ||
    successorPartId === predecessorPartId
  ) {
    throw new Error("Ógild tenging milli Verkþátta.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const [parts, dependencies] = await Promise.all([
    prisma.workPart.findMany({
      where: { companyId, workOrderId },
      select: { id: true, status: true, title: true },
    }),
    prisma.workPartDependency.findMany({
      where: { companyId, workOrderId },
      select: { id: true, predecessorPartId: true, successorPartId: true },
    }),
  ]);

  const predecessor = parts.find((part) => part.id === predecessorPartId);
  const successor = parts.find((part) => part.id === successorPartId);
  if (!predecessor || !successor) {
    throw new Error("Verkþættirnir fundust ekki á sama Verki.");
  }

  const existing = dependencies.find(
    (dependency) =>
      dependency.predecessorPartId === predecessorPartId &&
      dependency.successorPartId === successorPartId,
  );
  if (existing) {
    revalidateWorkOrder(workOrderId);
    return;
  }

  if (
    work10DependencyWouldCreateCycle(
      predecessorPartId,
      successorPartId,
      dependencies,
    )
  ) {
    throw new Error("Þessi tenging myndi mynda hring í Verkflæðinu.");
  }

  if (
    isWork10PartStatus(successor.status) &&
    work10StatusRequiresResolvedDependencies(successor.status) &&
    !isWork10PartTerminalStatus(predecessor.status)
  ) {
    throw new Error(
      "Ekki er hægt að bæta óloknum undanfara við Verkþátt sem er þegar tilbúinn, hafinn eða lokið.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.workPartDependency.create({
      data: {
        companyId,
        workOrderId,
        predecessorPartId,
        successorPartId,
        relationType: "FINISH_TO_START",
        createdById: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_PART_DEPENDENCY",
        entityId: created.id,
        action: "CREATED",
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        source: "USER",
        description: "Undanfari tengdur við Verkþátt.",
        afterData: { predecessorPartId, successorPartId, relationType: "FINISH_TO_START" },
      },
    });
  });

  revalidateWorkOrder(workOrderId);
}

export async function removeWorkPartDependency(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const dependencyId = Number(formData.get("dependencyId"));

  if (!Number.isInteger(workOrderId) || !Number.isInteger(dependencyId)) {
    throw new Error("Ógild Verkþáttatenging.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const userId = effectiveUser?.id ?? null;

  const dependency = await prisma.workPartDependency.findFirst({
    where: { id: dependencyId, companyId, workOrderId },
    select: { id: true, predecessorPartId: true, successorPartId: true, relationType: true },
  });

  if (!dependency) {
    revalidateWorkOrder(workOrderId);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workPartDependency.delete({ where: { id: dependency.id } });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_PART_DEPENDENCY",
        entityId: dependency.id,
        action: "REMOVED",
        parentEntityType: "WORK_ORDER",
        parentEntityId: workOrderId,
        source: "USER",
        description: "Tenging undanfarans við Verkþátt fjarlægð.",
        beforeData: {
          predecessorPartId: dependency.predecessorPartId,
          successorPartId: dependency.successorPartId,
          relationType: dependency.relationType,
        },
      },
    });
  });

  revalidateWorkOrder(workOrderId);
}
