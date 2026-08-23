import {
  GLOGGT_MODULES,
  type GloggtModuleId,
} from "@/lib/core/modules";

export type CompanyModuleSettings = Partial<
  Record<GloggtModuleId, boolean>
>;

export function getEnabledCompanyModules(
  settings: CompanyModuleSettings = {},
) {
  return Object.values(GLOGGT_MODULES).filter((module) => {
    const configuredValue = settings[module.id];

    if (configuredValue !== undefined) {
      return configuredValue;
    }

    return module.available;
  });
}

export function isCompanyModuleEnabled(
  moduleId: GloggtModuleId,
  settings: CompanyModuleSettings = {},
) {
  const configuredValue = settings[moduleId];

  if (configuredValue !== undefined) {
    return configuredValue;
  }

  return GLOGGT_MODULES[moduleId].available;
}