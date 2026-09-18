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
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseUnit = String(formData.get("baseUnit") ?? "PCS").trim();
  const customUnit = String(formData.get("customUnit") ?? "").trim();
  const minStock = optionalNumber(formData.get("minStock"));
  const purchaseUnitCost = optionalNumber(formData.get("purchaseUnitCost"));
  const saleUnitPrice = optionalNumber(formData.get("saleUnitPrice"));
  const openingQuantity = optionalNumber(formData.get("openingQuantity")) ?? 0;
  const requestedLocationId = Number(formData.get("locationId") ?? 0);

  if (!sku || sku.length > 80) throw new Error("Vörunúmer vantar eða er of langt.");
  if (!name || name.length > 180) throw new Error("Heiti vöru vantar eða er of langt.");
  if (description.length > 2000 || customUnit.length > 40) throw new Error("Of langur texti.");
  if (!INVENTORY_UNITS.has(baseUnit)) throw new Error("Ógild grunneining.");
  if (baseUnit === "CUSTOM" && !customUnit) throw new Error("Skrá þarf sérsniðna einingu.");
  if (minStock !== null && minStock < 0) throw new Error("Lágmarksstaða má ekki vera neikvæð.");
  if (purchaseUnitCost !== null && purchaseUnitCost < 0) throw new Error("Innkaupsverð má ekki vera neikvætt.");
  if (saleUnitPrice !== null && saleUnitPrice < 0) throw new Error("Söluverð má ekki vera neikvætt.");
  if (openingQuantity < 0) throw new Error("Upphafsstaða má ekki vera neikvæð.");

  const duplicate = await prisma.inventoryItem.findFirst({
    where: { companyId, sku: { equals: sku, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new Error("Vara með þessu vörunúmeri er þegar til.");

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
        name,
        description: description || null,
        sourceLanguage: language,
        baseUnit,
        customUnit: baseUnit === "CUSTOM" ? customUnit : null,
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
  if (!["WAREHOUSE", "VEHICLE", "SITE", "OTHER"].includes(kind)) {
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
