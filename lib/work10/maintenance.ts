export type WorkMaintenanceState = "DUE" | "SOON" | "OK" | "UNSCHEDULED";

export type WorkMaintenanceKeyLike = {
  nextDueMeterValue: number | null;
  warningLeadValue: number | null;
  intervalValue: number | null;
};

export function deriveWorkMaintenanceState(
  key: WorkMaintenanceKeyLike,
  currentMeterValue: number | null,
): WorkMaintenanceState {
  if (key.nextDueMeterValue === null || currentMeterValue === null) return "UNSCHEDULED";
  if (currentMeterValue + 1e-9 >= key.nextDueMeterValue) return "DUE";
  const warning = Math.max(0, key.warningLeadValue ?? 0);
  if (warning > 0 && currentMeterValue + warning + 1e-9 >= key.nextDueMeterValue) return "SOON";
  return "OK";
}

export function nextMaintenanceDueValue(currentMeterValue: number | null, intervalValue: number | null) {
  if (currentMeterValue === null || intervalValue === null || intervalValue <= 0) return null;
  return currentMeterValue + intervalValue;
}
