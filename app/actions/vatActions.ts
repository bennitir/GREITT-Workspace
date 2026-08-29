"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createVatPeriod(
  companyId: number,
  year: number,
  period: number
) {
  if (!companyId) {
    throw new Error("Fyrirtæki vantar.");
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ógilt ár.");
  }

  if (!Number.isInteger(period) || period < 1 || period > 6) {
    throw new Error("Ógilt VSK-tímabil.");
  }

  await prisma.vatPeriod.upsert({
    where: {
      companyId_year_period: {
        companyId,
        year,
        period,
      },
    },
    update: {},
    create: {
      companyId,
      year,
      period,
      status: "OPEN",
    },
  });

  revalidatePath("/vsk");
}