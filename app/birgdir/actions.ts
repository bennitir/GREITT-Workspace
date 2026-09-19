"use server";

import { revalidatePath } from "next/cache";

import {
  getEffectiveUser,
  requireActiveCompanyWriteAccess,
} from "@/lib/core/access-control";
import { inventoryText } from "@/lib/i18n/inventory";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";

const INVENTORY_UNITS = new Set([
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

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Ógild tala.");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("Ógild tala.");
  return parsed;
}

function positiveNumber(value: FormDataEntryValue | null) {
  const parsed = optionalNumber(value);
  if (parsed === null || parsed <= 0) throw new Error("Magn verður að vera stærra en núll.");
  return parsed;
}

async function getUserLanguage(userId: number | null | undefined) {
  if (!userId) return "is" as const;
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { interfaceLanguage: true },
  });
  return normalizeUiLanguage(settings?.interfaceLanguage ?? "is");
}

async function ensureDefaultLocation(companyId: number, createdById: number | null) {
  const existing = await prisma.inventoryLocation.findFirst({
    where: { companyId, isActive: true },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;

  const language = await getUserLanguage(createdById);
  const t = inventoryText(language);

  return prisma.inventoryLocation.create({
    data: {
      companyId,
      code: "MAIN",
      name: t.defaultLocationName,
      kind: "WAREHOUSE",
      createdById,
    },
  });
}

export async function createInventoryItem(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const createdById = effectiveUser?.id ?? null;
  const language = await getUserLanguage(createdById);

  const sku = String(formData.get("sku") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseUnit = String(formData.get("baseUnit") ?? "PCS").trim();
  const customUnit = String(formData.get("customUnit") ?? "").trim();
  const isStockTracked = formData.get("isStockTracked") === "on";
  const minStock = optionalNumber(formData.get("minStock"));
  const purchaseUnitCost = optionalNumber(formData.get("purchaseUnitCost"));
  const saleUnitPrice = optionalNumber(formData.get("saleUnitPrice"));
  const openingQuantity = optionalNumber(formData.get("openingQuantity")) ?? 0;
  const requestedLocationId = Number(formData.get("locationId") ?? 0);

  if (!sku || sku.length > 80) throw new Error("Vörunúmer vantar eða er of langt.");
  if (barcode.length > 120) throw new Error("Strikamerki er of langt.");
  if (!name || name.length > 180) throw new Error("Heiti vöru vantar eða er of langt.");
  if (description.length > 2000 || customUnit.length > 40) throw new Error("Of langur texti.");
  if (!INVENTORY_UNITS.has(baseUnit)) throw new Error("Ógild grunneining.");
  if (baseUnit === "CUSTOM" && !customUnit) throw new Error("Skrá þarf sérsniðna einingu.");
  if (minStock !== null && minStock < 0) throw new Error("Lágmarksstaða má ekki vera neikvæð.");
  if (purchaseUnitCost !== null && purchaseUnitCost < 0) throw new Error("Innkaupsverð má ekki vera neikvætt.");
  if (saleUnitPrice !== null && saleUnitPrice < 0) throw new Error("Söluverð má ekki vera neikvætt.");
  if (openingQuantity < 0) throw new Error("Upphafsstaða má ekki vera neikvæð.");
  if (!isStockTracked && (openingQuantity > 0 || minStock !== null)) {
    throw new Error(inventoryText(language).stockTrackingRequiredForOpening);
  }

  const duplicate = await prisma.inventoryItem.findFirst({
    where: { companyId, sku: { equals: sku, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("Vara með þessu vörunúmeri er þegar til.");
  if (barcode) {
    const duplicateBarcode = await prisma.inventoryItem.findFirst({
      where: { companyId, barcode },
      select: { id: true },
    });
    if (duplicateBarcode) throw new Error("Vara með þessu strikamerki er þegar til.");
  }

  let location = requestedLocationId
    ? await prisma.inventoryLocation.findFirst({
        where: { id: requestedLocationId, companyId, isActive: true },
      })
    : null;

  if (openingQuantity > 0 && !location) {
    location = await ensureDefaultLocation(companyId, createdById);
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        companyId,
        sku,
        barcode: barcode || null,
        name,
        description: description || null,
        sourceLanguage: language,
        baseUnit,
        customUnit: baseUnit === "CUSTOM" ? customUnit : null,
        isStockTracked,
        minStock,
        purchaseUnitCost,
        saleUnitPrice,
        createdById,
      },
    });

    if (openingQuantity > 0 && location) {
      await tx.inventoryMovement.create({
        data: {
          companyId,
          itemId: item.id,
          locationId: location.id,
          movementType: "OPENING",
          quantityDelta: openingQuantity,
          unit: baseUnit,
          unitCost: purchaseUnitCost,
          movementAt: new Date(),
          source: "MANUAL",
          createdById,
        },
      });
    }
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk10");
}

export async function createInventoryLocation(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "WAREHOUSE").trim();

  if (!code || code.length > 60) throw new Error("Kóði staðsetningar vantar eða er of langur.");
  if (!name || name.length > 160) throw new Error("Heiti staðsetningar vantar eða er of langt.");
  if (!["WAREHOUSE", "STORE", "STAGING", "VEHICLE", "SITE", "TRANSIT", "OTHER"].includes(kind)) {
    throw new Error("Ógild tegund staðsetningar.");
  }

  const duplicate = await prisma.inventoryLocation.findFirst({
    where: { companyId, code: { equals: code, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("Staðsetning með þessum kóða er þegar til.");

  await prisma.inventoryLocation.create({
    data: {
      companyId,
      code,
      name,
      kind,
      createdById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk10");
}

export async function recordInventoryAdjustment(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const itemId = Number(formData.get("itemId"));
  const locationId = Number(formData.get("locationId"));
  const direction = String(formData.get("direction") ?? "IN");
  const quantity = positiveNumber(formData.get("quantity"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(itemId) || !Number.isInteger(locationId)) {
    throw new Error("Velja þarf vöru og staðsetningu.");
  }
  if (!['IN', 'OUT'].includes(direction)) throw new Error("Ógild hreyfing.");
  if (note.length > 1000) throw new Error("Athugasemd er of löng.");

  const [item, location] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: itemId, companyId, isActive: true } }),
    prisma.inventoryLocation.findFirst({ where: { id: locationId, companyId, isActive: true } }),
  ]);
  if (!item || !location) throw new Error("Vara eða staðsetning fannst ekki.");
  if (!item.isStockTracked) {
    const language = await getUserLanguage(effectiveUser?.id ?? null);
    throw new Error(inventoryText(language).stockTrackingRequiredForMovement);
  }
  if (direction === "OUT") {
    const availability = await getLocationAvailability(companyId, itemId, locationId);
    if (quantity > availability.available + 1e-9) {
      const language = await getUserLanguage(effectiveUser?.id ?? null);
      const t = inventoryText(language);
      throw new Error(`${t.insufficientAvailableStock} ${t.availableStock}: ${availability.available}.`);
    }
  }

  await prisma.inventoryMovement.create({
    data: {
      companyId,
      itemId: item.id,
      locationId: location.id,
      movementType: direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      quantityDelta: direction === "IN" ? quantity : -quantity,
      unit: item.baseUnit,
      unitCost: item.purchaseUnitCost,
      movementAt: new Date(),
      note: note || null,
      source: "MANUAL",
      createdById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk10");
}

const INVENTORY_REASON_CODES = new Set([
  "COUNT_VARIANCE",
  "SHRINKAGE",
  "DAMAGE",
  "SPOILAGE",
  "THEFT",
  "OBSOLETE",
  "OTHER",
]);

const INVENTORY_LOSS_REASON_CODES = new Set([
  "SHRINKAGE",
  "DAMAGE",
  "SPOILAGE",
  "THEFT",
  "OBSOLETE",
  "OTHER",
]);

function nonNegativeNumber(value: FormDataEntryValue | null) {
  const parsed = optionalNumber(value);
  if (parsed === null || parsed < 0) throw new Error("Magn má ekki vera neikvætt.");
  return parsed;
}

function parseCountedAt(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Ógild dagsetning vörutalningar.");
  return parsed;
}

async function requireStockTrackedItemAndLocation(companyId: number, itemId: number, locationId: number) {
  if (!Number.isInteger(itemId) || !Number.isInteger(locationId)) {
    throw new Error("Velja þarf vöru og staðsetningu.");
  }

  const [item, location] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: itemId, companyId, isActive: true } }),
    prisma.inventoryLocation.findFirst({ where: { id: locationId, companyId, isActive: true } }),
  ]);

  if (!item || !location) throw new Error("Vara eða staðsetning fannst ekki.");
  if (!item.isStockTracked) throw new Error("Vörutalning og aföll eiga aðeins við um birgðafærðar vörur.");

  return { item, location };
}

export async function recordInventoryStocktake(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const itemId = Number(formData.get("itemId"));
  const locationId = Number(formData.get("locationId"));
  const countedQuantity = nonNegativeNumber(formData.get("countedQuantity"));
  const countedAt = parseCountedAt(formData.get("countedAt"));
  const requestedReasonCode = String(formData.get("reasonCode") ?? "COUNT_VARIANCE").trim();
  const reasonCode = INVENTORY_REASON_CODES.has(requestedReasonCode) ? requestedReasonCode : "COUNT_VARIANCE";
  const note = String(formData.get("note") ?? "").trim();

  if (note.length > 1000) throw new Error("Athugasemd er of löng.");
  if (reasonCode === "OTHER" && !note) throw new Error("Skrá þarf athugasemd þegar önnur ástæða er valin.");

  const { item } = await requireStockTrackedItemAndLocation(companyId, itemId, locationId);

  await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryMovement.aggregate({
      where: {
        companyId,
        itemId,
        locationId,
        voidedAt: null,
        movementAt: { lte: countedAt },
      },
      _sum: { quantityDelta: true },
    });

    const expectedQuantity = current._sum.quantityDelta ?? 0;
    const varianceQuantity = countedQuantity - expectedQuantity;

    const stocktake = await tx.inventoryStocktake.create({
      data: {
        companyId,
        itemId,
        locationId,
        countedAt,
        expectedQuantity,
        countedQuantity,
        varianceQuantity,
        reasonCode: Math.abs(varianceQuantity) > 1e-9 ? reasonCode : null,
        note: note || null,
        createdById: effectiveUser?.id ?? null,
      },
    });

    if (Math.abs(varianceQuantity) > 1e-9) {
      await tx.inventoryMovement.create({
        data: {
          companyId,
          itemId,
          locationId,
          movementType: "STOCKTAKE_ADJUSTMENT",
          quantityDelta: varianceQuantity,
          unit: item.baseUnit,
          unitCost: item.purchaseUnitCost,
          movementAt: countedAt,
          note: note || null,
          reasonCode,
          source: "STOCKTAKE",
          stocktakeId: stocktake.id,
          createdById: effectiveUser?.id ?? null,
        },
      });
    }
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk");
  revalidatePath("/verk10");
}

export async function recordInventoryLoss(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const itemId = Number(formData.get("itemId"));
  const locationId = Number(formData.get("locationId"));
  const quantity = positiveNumber(formData.get("quantity"));
  const requestedReasonCode = String(formData.get("reasonCode") ?? "SHRINKAGE").trim();
  const reasonCode = INVENTORY_LOSS_REASON_CODES.has(requestedReasonCode) ? requestedReasonCode : "SHRINKAGE";
  const note = String(formData.get("note") ?? "").trim();

  if (note.length > 1000) throw new Error("Athugasemd er of löng.");
  if (reasonCode === "OTHER" && !note) throw new Error("Skrá þarf athugasemd þegar önnur ástæða er valin.");

  const { item } = await requireStockTrackedItemAndLocation(companyId, itemId, locationId);

  await prisma.inventoryMovement.create({
    data: {
      companyId,
      itemId,
      locationId,
      movementType: "WASTE",
      quantityDelta: -quantity,
      unit: item.baseUnit,
      unitCost: item.purchaseUnitCost,
      movementAt: new Date(),
      note: note || null,
      reasonCode,
      source: "MANUAL",
      createdById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk");
  revalidatePath("/verk10");
}

export async function updateInventoryItem(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const itemId = Number(formData.get("itemId"));
  const barcode = String(formData.get("barcode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseUnit = String(formData.get("baseUnit") ?? "PCS").trim();
  const customUnit = String(formData.get("customUnit") ?? "").trim();
  const isStockTracked = formData.get("isStockTracked") === "on";
  const minStock = optionalNumber(formData.get("minStock"));
  const purchaseUnitCost = optionalNumber(formData.get("purchaseUnitCost"));
  const saleUnitPrice = optionalNumber(formData.get("saleUnitPrice"));

  if (!Number.isInteger(itemId)) throw new Error("Ógild vara.");
  if (barcode.length > 120) throw new Error("Strikamerki er of langt.");
  if (!name || name.length > 180) throw new Error("Heiti vöru vantar eða er of langt.");
  if (description.length > 2000 || customUnit.length > 40) throw new Error("Of langur texti.");
  if (!INVENTORY_UNITS.has(baseUnit)) throw new Error("Ógild grunneining.");
  if (baseUnit === "CUSTOM" && !customUnit) throw new Error("Skrá þarf sérsniðna einingu.");
  if (minStock !== null && minStock < 0) throw new Error("Lágmarksstaða má ekki vera neikvæð.");
  if (purchaseUnitCost !== null && purchaseUnitCost < 0) throw new Error("Innkaupsverð má ekki vera neikvætt.");
  if (saleUnitPrice !== null && saleUnitPrice < 0) throw new Error("Söluverð má ekki vera neikvætt.");
  const existing = await prisma.inventoryItem.findFirst({
    where: { id: itemId, companyId },
  });
  if (!existing) throw new Error("Vara fannst ekki.");
  if (existing.isStockTracked && !isStockTracked) {
    const activeCommitments = await prisma.inventoryCommitment.count({
      where: { companyId, itemId, status: "ACTIVE" },
    });
    if (activeCommitments > 0) {
      const language = await getUserLanguage(effectiveUser?.id ?? null);
      throw new Error(inventoryText(language).releaseCommitmentsBeforeDisabling);
    }
  }
  if (barcode) {
    const duplicateBarcode = await prisma.inventoryItem.findFirst({
      where: { companyId, barcode, NOT: { id: itemId } },
      select: { id: true },
    });
    if (duplicateBarcode) throw new Error("Vara með þessu strikamerki er þegar til.");
  }

  await prisma.$transaction(async (tx) => {
    if (existing.isStockTracked && !isStockTracked) {
      const balances = await tx.inventoryMovement.groupBy({
        by: ["locationId"],
        where: { companyId, itemId, voidedAt: null },
        _sum: { quantityDelta: true },
      });

      for (const balance of balances) {
        const quantity = balance._sum.quantityDelta ?? 0;
        if (Math.abs(quantity) <= 1e-9) continue;
        await tx.inventoryMovement.create({
          data: {
            companyId,
            itemId,
            locationId: balance.locationId,
            movementType: "TRACKING_ADJUSTMENT",
            quantityDelta: -quantity,
            unit: existing.baseUnit,
            unitCost: existing.purchaseUnitCost,
            movementAt: new Date(),
            reasonCode: "STOCK_TRACKING_DISABLED",
            note: "Birgðahaldi lokað á vöruspjaldi; fyrri saga varðveitt.",
            source: "MANUAL",
            createdById: effectiveUser?.id ?? null,
          },
        });
      }
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        barcode: barcode || null,
        name,
        description: description || null,
        baseUnit,
        customUnit: baseUnit === "CUSTOM" ? customUnit : null,
        isStockTracked,
        minStock: isStockTracked ? minStock : null,
        purchaseUnitCost,
        saleUnitPrice,
      },
    });
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk");
  revalidatePath("/verk10");
}


const INVENTORY_COMMITMENT_TYPES = new Set(["RESERVATION", "SALE_PENDING", "OTHER"]);

async function getLocationAvailability(companyId: number, itemId: number, locationId: number) {
  const [stock, committed] = await Promise.all([
    prisma.inventoryMovement.aggregate({
      where: { companyId, itemId, locationId, voidedAt: null },
      _sum: { quantityDelta: true },
    }),
    prisma.inventoryCommitment.aggregate({
      where: { companyId, itemId, locationId, status: "ACTIVE" },
      _sum: { quantity: true },
    }),
  ]);
  const onHand = stock._sum.quantityDelta ?? 0;
  const reserved = committed._sum.quantity ?? 0;
  return { onHand, reserved, available: onHand - reserved };
}

export async function recordInventoryTransfer(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const language = await getUserLanguage(effectiveUser?.id ?? null);
  const t = inventoryText(language);
  const itemId = Number(formData.get("itemId"));
  const fromLocationId = Number(formData.get("fromLocationId"));
  const toLocationId = Number(formData.get("toLocationId"));
  const quantity = positiveNumber(formData.get("quantity"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(itemId) || !Number.isInteger(fromLocationId) || !Number.isInteger(toLocationId)) {
    throw new Error(t.invalidTransferSelection);
  }
  if (fromLocationId === toLocationId) throw new Error(t.sameTransferLocation);
  if (note.length > 1000) throw new Error("Athugasemd er of löng.");

  const [item, fromLocation, toLocation] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: itemId, companyId, isActive: true } }),
    prisma.inventoryLocation.findFirst({ where: { id: fromLocationId, companyId, isActive: true } }),
    prisma.inventoryLocation.findFirst({ where: { id: toLocationId, companyId, isActive: true } }),
  ]);
  if (!item || !fromLocation || !toLocation) throw new Error("Vara eða staðsetning fannst ekki.");
  if (!item.isStockTracked) throw new Error(t.transferStockTrackedOnly);

  const availability = await getLocationAvailability(companyId, itemId, fromLocationId);
  if (quantity > availability.available + 1e-9) {
    throw new Error(`${t.insufficientAvailableStock} ${t.availableStock}: ${availability.available}.`);
  }

  await prisma.$transaction(async (tx) => {
    const transfer = await tx.inventoryTransfer.create({
      data: {
        companyId,
        itemId,
        fromLocationId,
        toLocationId,
        quantity,
        unit: item.baseUnit,
        transferredAt: new Date(),
        note: note || null,
        source: "MANUAL",
        createdById: effectiveUser?.id ?? null,
      },
    });

    await tx.inventoryMovement.createMany({
      data: [
        {
          companyId, itemId, locationId: fromLocationId, movementType: "TRANSFER_OUT",
          quantityDelta: -quantity, unit: item.baseUnit, unitCost: item.purchaseUnitCost,
          movementAt: transfer.transferredAt, note: note || null, source: "MANUAL",
          inventoryTransferId: transfer.id, transferLeg: "OUT", createdById: effectiveUser?.id ?? null,
        },
        {
          companyId, itemId, locationId: toLocationId, movementType: "TRANSFER_IN",
          quantityDelta: quantity, unit: item.baseUnit, unitCost: item.purchaseUnitCost,
          movementAt: transfer.transferredAt, note: note || null, source: "MANUAL",
          inventoryTransferId: transfer.id, transferLeg: "IN", createdById: effectiveUser?.id ?? null,
        },
      ],
    });
  });

  revalidatePath("/birgdir");
  revalidatePath("/verk");
}

export async function createInventoryCommitment(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const language = await getUserLanguage(effectiveUser?.id ?? null);
  const t = inventoryText(language);
  const itemId = Number(formData.get("itemId"));
  const locationId = Number(formData.get("locationId"));
  const quantity = positiveNumber(formData.get("quantity"));
  const requestedType = String(formData.get("commitmentType") ?? "RESERVATION").trim();
  const commitmentType = INVENTORY_COMMITMENT_TYPES.has(requestedType) ? requestedType : "RESERVATION";
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(itemId) || !Number.isInteger(locationId)) throw new Error(t.invalidCommitmentSelection);
  if (note.length > 1000) throw new Error("Athugasemd er of löng.");

  const { item } = await requireStockTrackedItemAndLocation(companyId, itemId, locationId);
  const availability = await getLocationAvailability(companyId, itemId, locationId);
  if (quantity > availability.available + 1e-9) {
    throw new Error(`${t.insufficientAvailableStock} ${t.availableStock}: ${availability.available}.`);
  }

  await prisma.inventoryCommitment.create({
    data: {
      companyId, itemId, locationId, quantity, commitmentType, status: "ACTIVE",
      sourceType: "MANUAL", note: note || null, createdById: effectiveUser?.id ?? null,
    },
  });

  revalidatePath("/birgdir");
}

export async function releaseInventoryCommitment(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const effectiveUser = await getEffectiveUser();
  const language = await getUserLanguage(effectiveUser?.id ?? null);
  const t = inventoryText(language);
  const commitmentId = Number(formData.get("commitmentId"));
  if (!Number.isInteger(commitmentId)) throw new Error("Ógild frátekt.");

  const commitment = await prisma.inventoryCommitment.findFirst({
    where: { id: commitmentId, companyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!commitment) throw new Error(t.commitmentNotFound);

  await prisma.inventoryCommitment.update({
    where: { id: commitment.id },
    data: { status: "RELEASED", releasedAt: new Date(), releasedById: effectiveUser?.id ?? null },
  });

  revalidatePath("/birgdir");
}
