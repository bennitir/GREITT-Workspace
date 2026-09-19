"use server";

import { revalidatePath } from "next/cache";

import {
  getEffectiveUser,
  requireActiveCompanyWriteAccess,
} from "@/lib/core/access-control";
import { inventoryText } from "@/lib/i18n/inventory";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { isWork10EffectivelyCompleted } from "@/lib/work10/status";
import type {
  Work10OperationalTranslation,
  Work10LocalizedText,
} from "@/lib/work10/operational-text";
import {
  missingTargetLanguages,
  translateWork10OperationalItems,
  type Work10TranslationItem,
} from "@/lib/work10/translation-service";

function workPartStatusFromLegacy(status: string) {
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "COMPLETED") return "COMPLETED";
  return "PLANNED";
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
  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }

  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();

  const work = await prisma.workOrder.findFirst({
    where: { id: workOrderId, companyId },
    include: {
      translations: true,
      workParts: {
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!work) {
    throw new Error("Verkið fannst ekki.");
  }

  // Idempotent: endurtekin smellun býr ekki til tvöfaldan fyrsta verkþátt.
  if (work.workParts.length > 0) {
    revalidatePath("/verk");
    revalidatePath(`/verk/${workOrderId}`);
    return;
  }

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

  await prisma.workPart.create({
    data: {
      companyId,
      workOrderId: work.id,
      sequence: 1,
      sourceLanguage: operationalText.title.sourceLanguage,
      title: operationalText.title.sourceText,
      description: operationalText.description?.sourceText ?? null,
      status: workPartStatusFromLegacy(work.status),
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

  revalidatePath("/verk");
  revalidatePath(`/verk/${workOrderId}`);
}

/**
 * Bætir við nýjum varanlegum verkþætti. Frumtextinn fær tungumál þess
 * viðmóts sem notandinn er að vinna í; framtíðarþýðingar verða sérfærslur.
 */
export async function createWorkPart(formData: FormData) {
  const workOrderId = Number(formData.get("workOrderId"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

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
        workOrder: { select: { status: true } },
      },
    }),
    prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      select: { id: true, fullName: true, userId: true },
    }),
  ]);

  if (!part) throw new Error("Verkþátturinn fannst ekki.");
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
  }

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

