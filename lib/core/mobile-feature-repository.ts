import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  MOBILE_FEATURE_LIST,
  type MobileFeatureKey,
  type MobileFeatureSettings,
} from "@/lib/core/mobile-features";

export async function getMobileFeatureSettings(
  companyId: number,
): Promise<MobileFeatureSettings> {
  const rows = await prisma.companyFeatureSetting.findMany({
    where: {
      companyId,
      settingKey: {
        in: MOBILE_FEATURE_LIST.map((feature) => feature.settingKey),
      },
    },
    select: { settingKey: true, enabled: true },
  });

  const settings: MobileFeatureSettings = {};

  for (const feature of MOBILE_FEATURE_LIST) {
    const row = rows.find(
      (candidate) => candidate.settingKey === feature.settingKey,
    );
    if (row) settings[feature.key as MobileFeatureKey] = row.enabled;
  }

  return settings;
}

export async function getUserMobileFeatureSettings(
  companyId: number,
  userId: number,
): Promise<MobileFeatureSettings> {
  const rows = await prisma.userCompanyMobileFeature.findMany({
    where: {
      companyId,
      userId,
      featureKey: { in: MOBILE_FEATURE_LIST.map((feature) => feature.key) },
    },
    select: { featureKey: true, visible: true },
  });

  const settings: MobileFeatureSettings = {};
  for (const row of rows) {
    if (MOBILE_FEATURE_LIST.some((feature) => feature.key === row.featureKey)) {
      settings[row.featureKey as MobileFeatureKey] = row.visible;
    }
  }

  return settings;
}

export async function getEffectiveMobileFeatureSettings(
  companyId: number,
  userId: number,
): Promise<MobileFeatureSettings> {
  const [companySettings, userSettings] = await Promise.all([
    getMobileFeatureSettings(companyId),
    getUserMobileFeatureSettings(companyId, userId),
  ]);

  return { ...companySettings, ...userSettings };
}

export async function setMobileFeatureVisible(
  companyId: number,
  featureKey: MobileFeatureKey,
  enabled: boolean,
) {
  const feature = MOBILE_FEATURE_LIST.find((item) => item.key === featureKey);
  if (!feature) throw new Error("Ógild Mobile-aðgerð.");

  const result = await prisma.companyFeatureSetting.upsert({
    where: {
      companyId_settingKey: {
        companyId,
        settingKey: feature.settingKey,
      },
    },
    update: { enabled },
    create: { companyId, settingKey: feature.settingKey, enabled },
  });

  revalidatePath("/mobile");
  revalidatePath("/stjornun");
  return result;
}

export async function setUserMobileFeatureVisible(
  companyId: number,
  userId: number,
  featureKey: MobileFeatureKey,
  visible: boolean,
) {
  const feature = MOBILE_FEATURE_LIST.find((item) => item.key === featureKey);
  if (!feature) throw new Error("Ógild Mobile-aðgerð.");

  const result = await prisma.userCompanyMobileFeature.upsert({
    where: {
      companyId_userId_featureKey: {
        companyId,
        userId,
        featureKey,
      },
    },
    update: { visible },
    create: { companyId, userId, featureKey, visible },
  });

  revalidatePath("/mobile");
  revalidatePath("/stjornun");
  return result;
}
