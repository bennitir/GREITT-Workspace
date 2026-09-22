export const WORK10_RESOURCE_KINDS = [
  "TEAM",
  "MACHINE",
  "VEHICLE",
  "TOOL",
  "CONTRACTOR",
] as const;

export type Work10PersistentResourceKind = (typeof WORK10_RESOURCE_KINDS)[number];

export const WORK10_EQUIPMENT_KINDS = ["MACHINE", "VEHICLE", "TOOL"] as const;

export type Work10EquipmentKind = (typeof WORK10_EQUIPMENT_KINDS)[number];

export const WORK10_RESOURCE_STATUSES = [
  "AVAILABLE",
  "IN_USE",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
  "INACTIVE",
] as const;

export type Work10ResourceStatus = (typeof WORK10_RESOURCE_STATUSES)[number];

export const WORK10_RESOURCE_UNITS = ["HOUR", "KM", "PCS", "CUSTOM"] as const;


export const WORK10_RESOURCE_TRAVEL_MODES = [
  "NONE",
  "ROAD",
  "SELF_PROPELLED",
  "TRANSPORTED",
] as const;

export type Work10ResourceTravelMode = (typeof WORK10_RESOURCE_TRAVEL_MODES)[number];

export function isWork10ResourceTravelMode(value: string): value is Work10ResourceTravelMode {
  return (WORK10_RESOURCE_TRAVEL_MODES as readonly string[]).includes(value);
}

export function isWork10PersistentResourceKind(value: string): value is Work10PersistentResourceKind {
  return (WORK10_RESOURCE_KINDS as readonly string[]).includes(value);
}

export function isWork10EquipmentKind(value: string): value is Work10EquipmentKind {
  return (WORK10_EQUIPMENT_KINDS as readonly string[]).includes(value);
}

export function isWork10ResourceStatus(value: string): value is Work10ResourceStatus {
  return (WORK10_RESOURCE_STATUSES as readonly string[]).includes(value);
}

export function resourceUsageKind(kind: Work10PersistentResourceKind) {
  if (kind === "MACHINE") return "MACHINE_TIME";
  if (kind === "VEHICLE") return "VEHICLE";
  return "OTHER";
}

export function defaultResourceUnit(kind: Work10PersistentResourceKind) {
  if (kind === "VEHICLE") return "KM";
  if (kind === "MACHINE" || kind === "CONTRACTOR") return "HOUR";
  return "PCS";
}
