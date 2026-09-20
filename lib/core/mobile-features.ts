import type { GloggtModuleId } from "@/lib/core/modules";
import {
  isCompanyModuleEnabled,
  type CompanyModuleSettings,
} from "@/lib/core/company-modules";

export const MOBILE_FEATURES = {
  work: {
    key: "work",
    settingKey: "mobile:work",
    moduleId: "verk" as GloggtModuleId,
    defaultVisible: true,
  },
  inventoryCount: {
    key: "inventoryCount",
    settingKey: "mobile:inventory-count",
    moduleId: "birgdir" as GloggtModuleId,
    defaultVisible: true,
  },
  receiptCapture: {
    key: "receiptCapture",
    settingKey: "mobile:receipt-capture",
    moduleId: "bokhald" as GloggtModuleId,
    defaultVisible: true,
  },
} as const;

export type MobileFeatureKey = keyof typeof MOBILE_FEATURES;
export type MobileFeatureSettings = Partial<Record<MobileFeatureKey, boolean>>;

export const MOBILE_FEATURE_LIST = Object.values(MOBILE_FEATURES);

export function isMobileFeatureAvailable(
  featureKey: MobileFeatureKey,
  moduleSettings: CompanyModuleSettings = {},
) {
  return isCompanyModuleEnabled(
    MOBILE_FEATURES[featureKey].moduleId,
    moduleSettings,
  );
}

export function isMobileFeatureVisible(
  featureKey: MobileFeatureKey,
  settings: MobileFeatureSettings = {},
) {
  const configuredValue = settings[featureKey];
  if (configuredValue !== undefined) return configuredValue;
  return MOBILE_FEATURES[featureKey].defaultVisible;
}

export function isMobileFeatureShown(
  featureKey: MobileFeatureKey,
  moduleSettings: CompanyModuleSettings = {},
  settings: MobileFeatureSettings = {},
) {
  return (
    isMobileFeatureAvailable(featureKey, moduleSettings) &&
    isMobileFeatureVisible(featureKey, settings)
  );
}
