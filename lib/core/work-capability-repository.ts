import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  WORK_CAPABILITIES,
  WORK_CAPABILITY_LIST,
  type WorkCapabilityKey,
  type WorkCapabilitySettings,
} from "@/lib/core/work-capabilities";

/**
 * Fyrsta útgáfa capability-geymslu.
 *
 * Við nýtum núverandi CompanyModule töfluna með nafngreindum storage-id
 * (t.d. verk:machines) svo við þurfum enga migration á meðan mynstrið er
 * reynsluekið. Verk-kjarninn sjálfur veit aðeins um capability-lykla.
 */
export async function getWorkCapabilitySettings(
  companyId: number,
): Promise<WorkCapabilitySettings> {
  const storageIds = WORK_CAPABILITY_LIST.map(
    (capability) => capability.storageId,
  );

  const rows = await prisma.companyModule.findMany({
    where: {
      companyId,
      moduleId: {
        in: storageIds,
      },
    },
    select: {
      moduleId: true,
      enabled: true,
    },
  });

  const settings: WorkCapabilitySettings = {};

  for (const capability of WORK_CAPABILITY_LIST) {
    const row = rows.find(
      (candidate) => candidate.moduleId === capability.storageId,
    );

    if (row) {
      settings[capability.key] = row.enabled;
    }
  }

  return settings;
}

export async function setWorkCapabilityEnabled(
  companyId: number,
  capabilityKey: WorkCapabilityKey,
  enabled: boolean,
) {
  const capability = WORK_CAPABILITIES[capabilityKey];

  const result = await prisma.companyModule.upsert({
    where: {
      companyId_moduleId: {
        companyId,
        moduleId: capability.storageId,
      },
    },
    update: {
      enabled,
    },
    create: {
      companyId,
      moduleId: capability.storageId,
      enabled,
    },
  });

  revalidatePath(`/stjornbord/fyrirtaeki/${companyId}`);
  revalidatePath("/verk10");

  return result;
}
