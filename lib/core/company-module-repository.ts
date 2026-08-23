import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { GloggtModuleId } from "@/lib/core/modules";

export async function getCompanyModuleSettings(companyId: number) {
  const modules = await prisma.companyModule.findMany({
    where: {
      companyId,
    },
    select: {
      moduleId: true,
      enabled: true,
    },
  });

  return Object.fromEntries(
    modules.map((module) => [module.moduleId, module.enabled]),
  ) as Partial<Record<GloggtModuleId, boolean>>;
}

export async function setCompanyModuleEnabled(
  companyId: number,
  moduleId: GloggtModuleId,
  enabled: boolean,
) {
  const result = await prisma.companyModule.upsert({
    where: {
      companyId_moduleId: {
        companyId,
        moduleId,
      },
    },
    update: {
      enabled,
    },
    create: {
      companyId,
      moduleId,
      enabled,
    },
  });

  revalidatePath("/stjornbord");
  revalidatePath("/");
  return result;
}