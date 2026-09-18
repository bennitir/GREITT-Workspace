/**
 * Verk – valkvæð virkni fyrirtækis.
 *
 * Markmiðið er að halda Verk-kjarnanum almennum en leyfa fyrirtækjum að
 * virkja sérhæfða vinnuhluta eftir þörfum. Ný atvinnugreinasértæk atriði
 * eiga að bætast hér við í stað þess að harðkóða þau inn í Verk-viðmótið.
 */
export const WORK_CAPABILITIES = {
  machines: {
    key: "machines",
    storageId: "verk:machines",
    defaultEnabled: false,
  },
} as const;

export type WorkCapabilityKey = keyof typeof WORK_CAPABILITIES;

export type WorkCapabilitySettings = Partial<
  Record<WorkCapabilityKey, boolean>
>;

export const WORK_CAPABILITY_LIST = Object.values(WORK_CAPABILITIES);

export function isWorkCapabilityEnabled(
  capabilityKey: WorkCapabilityKey,
  settings: WorkCapabilitySettings = {},
) {
  const configuredValue = settings[capabilityKey];

  if (configuredValue !== undefined) {
    return configuredValue;
  }

  return WORK_CAPABILITIES[capabilityKey].defaultEnabled;
}
