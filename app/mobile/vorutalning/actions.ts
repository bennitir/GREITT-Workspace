"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { getEffectiveUser } from "@/lib/core/access-control";

function nonNegativeNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Ógilt talið magn.");
  }
  return parsed;
}

async function requireMobileUser() {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile/vorutalning");
  return user;
}

export async function startHandheldStocktake(formData: FormData) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await requireMobileUser();
  const locationId = Number(formData.get("locationId"));

  if (!Number.isInteger(locationId) || locationId <= 0) {
    throw new Error("Velja þarf staðsetningu.");
  }

  const location = await prisma.inventoryLocation.findFirst({
    where: { id: locationId, companyId, isActive: true },
    select: { id: true },
  });
  if (!location) throw new Error("Staðsetning fannst ekki.");

  const existing = await prisma.inventoryCountSession.findFirst({
    where: {
      companyId,
      createdById: user.id,
      status: "COUNTING",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    redirect(`/mobile/vorutalning?session=${existing.id}`);
  }

  const session = await prisma.inventoryCountSession.create({
    data: {
      companyId,
      locationId,
      mode: "HANDHELD",
      status: "COUNTING",
      createdById: user.id,
    },
    select: { id: true },
  });

  redirect(`/mobile/vorutalning?session=${session.id}`);
}

export async function recordHandheldCount(formData: FormData) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await requireMobileUser();
  const sessionId = Number(formData.get("sessionId"));
  const itemId = Number(formData.get("itemId"));
  const countedQuantity = nonNegativeNumber(formData.get("countedQuantity"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(sessionId) || !Number.isInteger(itemId)) {
    throw new Error("Ógild talning.");
  }
  if (note.length > 1000) throw new Error("Athugasemd er of löng.");

  const [session, item] = await Promise.all([
    prisma.inventoryCountSession.findFirst({
      where: {
        id: sessionId,
        companyId,
        createdById: user.id,
        status: "COUNTING",
      },
      select: { id: true },
    }),
    prisma.inventoryItem.findFirst({
      where: { id: itemId, companyId, isActive: true, isStockTracked: true },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        baseUnit: true,
      },
    }),
  ]);

  if (!session) throw new Error("Virk talning fannst ekki.");
  if (!item) throw new Error("Vara fannst ekki eða er ekki birgðafærð.");

  const countedAt = new Date();

  await prisma.inventoryCountLine.upsert({
    where: { sessionId_itemId: { sessionId, itemId } },
    update: {
      skuSnapshot: item.sku,
      barcodeSnapshot: item.barcode,
      nameSnapshot: item.name,
      unit: item.baseUnit,
      countedQuantity,
      countedAt,
      note: note || null,
      status: "COUNTED",
      countedById: user.id,
      voidedAt: null,
      voidedById: null,
      stocktakeId: null,
    },
    create: {
      sessionId,
      companyId,
      itemId,
      skuSnapshot: item.sku,
      barcodeSnapshot: item.barcode,
      nameSnapshot: item.name,
      unit: item.baseUnit,
      countedQuantity,
      countedAt,
      note: note || null,
      status: "COUNTED",
      countedById: user.id,
    },
  });

  revalidatePath("/mobile/vorutalning");
  redirect(`/mobile/vorutalning?session=${sessionId}&saved=1`);
}

export async function removeHandheldCountLine(formData: FormData) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await requireMobileUser();
  const sessionId = Number(formData.get("sessionId"));
  const lineId = Number(formData.get("lineId"));

  const line = await prisma.inventoryCountLine.findFirst({
    where: {
      id: lineId,
      sessionId,
      companyId,
      session: { createdById: user.id, status: "COUNTING" },
      stocktakeId: null,
      status: { not: "RECOUNT_REQUESTED" },
    },
    select: { id: true },
  });
  if (!line) throw new Error("Talningarlína fannst ekki.");

  await prisma.inventoryCountLine.update({
    where: { id: line.id },
    data: {
      status: "VOIDED",
      voidedAt: new Date(),
      voidedById: user.id,
    },
  });

  revalidatePath("/mobile/vorutalning");
  redirect(`/mobile/vorutalning?session=${sessionId}`);
}

export async function submitHandheldStocktake(formData: FormData) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await requireMobileUser();
  const sessionId = Number(formData.get("sessionId"));

  const session = await prisma.inventoryCountSession.findFirst({
    where: {
      id: sessionId,
      companyId,
      createdById: user.id,
      status: "COUNTING",
    },
    include: {
      lines: {
        where: { status: { in: ["COUNTED", "RECOUNT_REQUESTED"] }, voidedAt: null },
        select: { id: true, status: true },
      },
    },
  });
  if (!session) throw new Error("Virk talning fannst ekki.");
  if (session.lines.length === 0) throw new Error("Skrá þarf að minnsta kosti eina vöru áður en talning er send.");
  if (session.lines.some((line) => line.status === "RECOUNT_REQUESTED")) {
    throw new Error("Endurtalningu þarf að klára áður en talning er send aftur til yfirferðar.");
  }

  await prisma.inventoryCountSession.update({
    where: { id: session.id },
    data: { status: "REVIEW", submittedAt: new Date() },
  });

  revalidatePath("/mobile/vorutalning");
  revalidatePath("/birgdir/vorutalningar");
  redirect(`/mobile/vorutalning?session=${session.id}`);
}

export async function cancelHandheldStocktake(formData: FormData) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await requireMobileUser();
  const sessionId = Number(formData.get("sessionId"));

  const session = await prisma.inventoryCountSession.findFirst({
    where: {
      id: sessionId,
      companyId,
      createdById: user.id,
      status: "COUNTING",
    },
    select: { id: true },
  });
  if (!session) throw new Error("Virk talning fannst ekki.");

  await prisma.inventoryCountSession.update({
    where: { id: session.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  revalidatePath("/mobile/vorutalning");
  redirect("/mobile/vorutalning");
}
