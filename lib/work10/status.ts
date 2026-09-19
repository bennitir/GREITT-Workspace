import type { Work10PartStatus, Work10Status } from "@/lib/work10/domain";

/**
 * WorkOrder er yfirheiti Verks en WorkPart er sannleikurinn um framkvæmdina.
 * Þegar varanlegir Verkþættir eru til er sýnileg framkvæmdastaða því leidd af
 * þeim í stað þess að láta gamalt WorkOrder.status keppa við nýja kjarnann.
 *
 * WorkOrder.status heldur áfram að nýtast fyrir eldri Verk án Verkþátta og sem
 * meðvituð stjórnunarmerking (t.d. CANCELLED). Þetta gerir yfirfærsluna
 * afturvirkt örugga án þess að tvö stöðugildi verði sjálfstæðir sannleikar.
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

  if (allTerminal) {
    return statuses.every((status) => status === "CANCELLED")
      ? "CANCELLED"
      : "COMPLETED";
  }

  // Virk framkvæmd hefur forgang yfir bið/áætlun því eitthvað er sannanlega í gangi.
  if (statuses.includes("IN_PROGRESS")) return "IN_PROGRESS";
  if (statuses.includes("BLOCKED")) return "BLOCKED";
  if (statuses.includes("ON_HOLD")) return "ON_HOLD";
  if (statuses.includes("READY")) return "READY";

  // Aðeins PLANNED/CANCELLED stendur eftir. Ef gamla yfirheitið segir að verkið
  // sé þegar hafið höldum við þeirri rekjanlegu merkingu; annars er það drög.
  if (legacyStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (legacyStatus === "BLOCKED") return "BLOCKED";
  if (legacyStatus === "ON_HOLD") return "ON_HOLD";
  if (legacyStatus === "READY") return "READY";

  return "DRAFT";
}

export function isWork10EffectivelyCompleted(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  return deriveWork10Status(workOrderStatus, parts) === "COMPLETED";
}

// Gamalt heiti varðveitt tímabundið svo eldri kallstaðir brotni ekki.
// Nýi kjarninn notar deriveWork10Status sem skýrir betur að staðan er afleidd.
export function effectiveWork10Status(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  return deriveWork10Status(workOrderStatus, parts);
}
