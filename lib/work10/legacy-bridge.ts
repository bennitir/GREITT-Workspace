import type { Work10Part, Work10PartStatus } from "@/lib/work10/domain";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";

export type LegacyWorkOrderForProjection = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
};

export type Work10PartProjection = Work10Part & {
  source: {
    kind: "LEGACY_WORK_ORDER";
    sourceId: string;
  };
  persistedInWork10: false;
};

function legacyStatusToPartStatus(status: string): Work10PartStatus {
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "COMPLETED") return "COMPLETED";
  return "PLANNED";
}

/**
 * Brú úr núverandi WorkOrder yfir í fyrsta Work10-domain hlutinn.
 *
 * Engin ný gagnagrunnsfærsla er búin til. Frumtexti Verks verður
 * Work10LocalizedText og er því varðveittur óbreyttur ásamt mögulegum
 * þýðingum í sér lagi.
 */
export function projectLegacyWorkOrderToParts(
  work: LegacyWorkOrderForProjection,
): Work10PartProjection[] {
  const operationalText = projectLegacyOperationalText({
    id: work.id,
    title: work.title,
    description: work.description ?? null,
  });

  return [
    {
      id: `legacy-work-${work.id}-part-1`,
      title: operationalText.title,
      description: operationalText.description,
      status: legacyStatusToPartStatus(work.status),
      order: 1,
      dependencies: [],
      source: {
        kind: "LEGACY_WORK_ORDER",
        sourceId: String(work.id),
      },
      persistedInWork10: false,
    },
  ];
}
