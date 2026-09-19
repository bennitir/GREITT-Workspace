"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser, requireActiveCompanyWriteAccess } from "@/lib/core/access-control";

const REASON_CODES = new Set([
  "COUNT_VARIANCE",
  "SHRINKAGE",
  "DAMAGE",
  "SPOILAGE",
  "THEFT",
  "OBSOLETE",
  "OTHER",
]);

export async function requestHandheldRecount(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const user = await getEffectiveUser();
  const sessionId = Number(formData.get("sessionId"));
  const lineId = Number(formData.get("lineId"));

  const line = await prisma.inventoryCountLine.findFirst({
    where: {
      id: lineId,
      sessionId,
      companyId,
      stocktakeId: null,
      voidedAt: null,
      session: { status: "REVIEW" },
    },
    select: { id: true },
  });
  if (!line) throw new Error("Talningarlína fannst ekki eða er ekki lengur í yfirferð.");

  await prisma.$transaction([
    prisma.inventoryCountLine.update({
      where: { id: line.id },
      data: { status: "RECOUNT_REQUESTED" },
    }),
    prisma.inventoryCountSession.update({
      where: { id: sessionId },
      data: {
        status: "COUNTING",
        submittedAt: null,
        reviewedAt: new Date(),
        reviewedById: user?.id ?? null,
      },
    }),
  ]);

  revalidatePath(`/birgdir/vorutalningar/${sessionId}`);
  revalidatePath("/birgdir/vorutalningar");
  revalidatePath("/mobile/vorutalning");
  redirect(`/birgdir/vorutalningar/${sessionId}`);
}

export async function approveHandheldStocktake(formData: FormData) {
  const companyId = await requireActiveCompanyWriteAccess();
  const reviewer = await getEffectiveUser();
  const sessionId = Number(formData.get("sessionId"));

  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new Error("Ógild talningarlota.");

  await prisma.$transaction(async (tx) => {
    const session = await tx.inventoryCountSession.findFirst({
      where: { id: sessionId, companyId, status: "REVIEW" },
      include: {
        lines: {
          where: { voidedAt: null, status: { not: "VOIDED" } },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!session) throw new Error("Talningarlota fannst ekki eða bíður ekki lengur yfirferðar.");
    if (session.lines.length === 0) throw new Error("Engar talningarlínur eru í lotunni.");
    if (session.lines.some((line) => line.status === "RECOUNT_REQUESTED")) {
      throw new Error("Endurtalningu þarf að klára áður en lotan er samþykkt.");
    }
    if (session.lines.some((line) => line.status !== "COUNTED" || line.stocktakeId !== null)) {
      throw new Error("Talningarlotan inniheldur línu sem er ekki tilbúin til samþykktar.");
    }

    for (const line of session.lines) {
      const requestedReason = String(formData.get(`reason_${line.id}`) ?? "COUNT_VARIANCE").trim();
      const reasonCode = REASON_CODES.has(requestedReason) ? requestedReason : "COUNT_VARIANCE";
      const reviewNote = String(formData.get(`note_${line.id}`) ?? "").trim();
      if (reviewNote.length > 1000) throw new Error("Athugasemd er of löng.");
      if (reasonCode === "OTHER" && !reviewNote) {
        throw new Error("Skrá þarf athugasemd þegar önnur ástæða er valin.");
      }

      const current = await tx.inventoryMovement.aggregate({
        where: {
          companyId,
          itemId: line.itemId,
          locationId: session.locationId,
          voidedAt: null,
          movementAt: { lte: line.countedAt },
        },
        _sum: { quantityDelta: true },
      });

      const expectedQuantity = current._sum.quantityDelta ?? 0;
      const varianceQuantity = line.countedQuantity - expectedQuantity;
      const stocktake = await tx.inventoryStocktake.create({
        data: {
          companyId,
          itemId: line.itemId,
          locationId: session.locationId,
          countedAt: line.countedAt,
          expectedQuantity,
          countedQuantity: line.countedQuantity,
          varianceQuantity,
          reasonCode: Math.abs(varianceQuantity) > 1e-9 ? reasonCode : null,
          note: reviewNote || line.note || null,
          createdById: line.countedById,
        },
      });

      if (Math.abs(varianceQuantity) > 1e-9) {
        await tx.inventoryMovement.create({
          data: {
            companyId,
            itemId: line.itemId,
            locationId: session.locationId,
            movementType: "STOCKTAKE_ADJUSTMENT",
            quantityDelta: varianceQuantity,
            unit: line.unit,
            movementAt: line.countedAt,
            note: reviewNote || line.note || null,
            reasonCode,
            source: "HANDHELD_STOCKTAKE",
            stocktakeId: stocktake.id,
            createdById: reviewer?.id ?? null,
          },
        });
      }

      await tx.inventoryCountLine.update({
        where: { id: line.id },
        data: { status: "APPROVED", stocktakeId: stocktake.id },
      });
    }

    await tx.inventoryCountSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        reviewedAt: new Date(),
        completedAt: new Date(),
        reviewedById: reviewer?.id ?? null,
      },
    });
  });

  revalidatePath("/birgdir");
  revalidatePath("/birgdir/vorutalningar");
  revalidatePath(`/birgdir/vorutalningar/${sessionId}`);
  revalidatePath("/mobile/vorutalning");
  redirect(`/birgdir/vorutalningar/${sessionId}`);
}
