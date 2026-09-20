import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  WORK_CAPABILITIES,
  WORK_CAPABILITY_LIST,
  type WorkCapabilityKey,
  type WorkCapabilitySettings,
} from "@/lib/core/work-capabilities";

/**
 * Verk-capabilities eru fyrirtækisstillingar, ekki áskriftareiningar.
 * Þær eru því vistaðar í CompanyFeatureSetting og CompanyModule er haldið
 * hreinu sem entitlement-/einingalagi.
 */
export async function getWorkCapabilitySettings(
  companyId: number,
): Promise<WorkCapabilitySettings> {
  const settingKeys = WORK_CAPABILITY_LIST.map(
    (capability) => capability.settingKey,
  );

  const rows = await prisma.companyFeatureSetting.findMany({
    where: {
      companyId,
      settingKey: {
        in: settingKeys,
      },
    },
    select: {
      settingKey: true,
      enabled: true,
    },
  });

  const settings: WorkCapabilitySettings = {};

  for (const capability of WORK_CAPABILITY_LIST) {
    const row = rows.find(
      (candidate) => candidate.settingKey === capability.settingKey,
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

  const result = await prisma.companyFeatureSetting.upsert({
    where: {
      companyId_settingKey: {
        companyId,
        settingKey: capability.settingKey,
      },
    },
    update: {
      enabled,
    },
    create: {
      companyId,
      settingKey: capability.settingKey,
      enabled,
    },
  });

  revalidatePath(`/stjornbord/fyrirtaeki/${companyId}`);
  revalidatePath("/verk10");

  return result;
}
