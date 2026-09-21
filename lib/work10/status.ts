import type { Work10PartStatus, Work10Status } from "@/lib/work10/domain";

/**
 * WorkPart er sannleikurinn um framkvæmd Verkþátta en WorkOrder.status er
 * meðvituð stjórnunarmerking fyrir sjálft Verkið. Verk lokast því ekki
 * sjálfkrafa þegar síðasti Verkþátturinn fer í lokastöðu; stjórnandi staðfestir
 * lokun sérstaklega. Þetta heldur framkvæmd, lokun og sögu aðskildum.
 */

const ORDER_STATUSES = new Set<Work10Status>([
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

const PART_STATUSES = new Set<Work10PartStatus>([
  "PLANNED",
  "READY",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

export function normalizeLegacyWork10Status(status: string): Work10Status {
  if (status === "NEW") return "DRAFT";
  return ORDER_STATUSES.has(status as Work10Status)
    ? (status as Work10Status)
    : "DRAFT";
}

export function isWork10PartTerminal(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function hasOpenWork10Parts(parts: Array<{ status: string }>) {
  return parts.some((part) => !isWork10PartTerminal(part.status));
}

function normalizedPartStatus(status: string): Work10PartStatus {
  return PART_STATUSES.has(status as Work10PartStatus)
    ? (status as Work10PartStatus)
    : "PLANNED";
}

export function deriveWork10Status(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
): Work10Status {
  const legacyStatus = normalizeLegacyWork10Status(workOrderStatus);

  // Eldri Verk án varanlegra Verkþátta halda merkingu sinni í read-only brú.
  if (parts.length === 0) return legacyStatus;

  // Meðvituð niðurfelling Verks hefur forgang yfir framkvæmdarstöðu hluta.
  if (legacyStatus === "CANCELLED") return "CANCELLED";

  const statuses = parts.map((part) => normalizedPartStatus(part.status));
  const allTerminal = statuses.every((status) =>
    status === "COMPLETED" || status === "CANCELLED",
  );

  // Lokun sjálfs Verks er meðvituð stjórnandaaðgerð. Síðasti lokni Verkþáttur
  // setur því Verkið í bið eftir lokun, en breytir því ekki sjálfkrafa í COMPLETED.
  if (allTerminal) {
    if (legacyStatus === "COMPLETED") return "COMPLETED";
    return "IN_PROGRESS";
  }

  // Virk framkvæmd hefur forgang yfir bið/áætlun því eitthvað er sannanlega í gangi.
  if (statuses.includes("IN_PROGRESS")) return "IN_PROGRESS";
  if (statuses.includes("BLOCKED")) return "BLOCKED";
  if (statuses.includes("ON_HOLD")) return "ON_HOLD";
  if (statuses.includes("READY")) return "READY";

  // Ef einhver Verkþáttur er þegar lokið en aðrir eru enn opnir hefur framkvæmd
  // sannanlega hafist. Verkið má þá ekki falla aftur í Drög bara af því að
  // eftirstandandi hlutar eru enn PLANNED.
  if (statuses.includes("COMPLETED")) return "IN_PROGRESS";

  // Aðeins PLANNED/CANCELLED stendur eftir. Ef gamla yfirheitið segir að verkið
  // sé þegar hafið höldum við þeirri rekjanlegu merkingu; annars er það drög.
  if (legacyStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (legacyStatus === "BLOCKED") return "BLOCKED";
  if (legacyStatus === "ON_HOLD") return "ON_HOLD";
  if (legacyStatus === "READY") return "READY";

  return "DRAFT";
}

export function isWork10ReadyToClose(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  if (parts.length === 0) return false;
  const orderStatus = normalizeLegacyWork10Status(workOrderStatus);
  if (orderStatus === "COMPLETED" || orderStatus === "CANCELLED") return false;
  return parts.every((part) => isWork10PartTerminal(part.status));
}

export function isWork10EffectivelyCompleted(
  workOrderStatus: string,
  _parts: Array<{ status: string }>,
) {
  return normalizeLegacyWork10Status(workOrderStatus) === "COMPLETED";
}

// Gamalt heiti varðveitt tímabundið svo eldri kallstaðir brotni ekki.
// Nýi kjarninn notar deriveWork10Status sem skýrir betur að staðan er afleidd.
export function effectiveWork10Status(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  return deriveWork10Status(workOrderStatus, parts);
}
