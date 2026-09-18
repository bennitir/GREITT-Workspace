import { projectLegacyWorkOrderToParts } from "@/lib/work10/legacy-bridge";
import {
  projectPersistedWorkPart,
  type PersistedWorkPartRow,
} from "@/lib/work10/persisted-parts";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";

export type WorkForPartDisplay = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  workParts: PersistedWorkPartRow[];
};

export type Work10DisplayPart = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  order: number;
  dependencies: Array<{
    predecessorPartId: string;
    successorPartId: string;
  }>;
  source:
    | { kind: "LEGACY_WORK_ORDER"; sourceId: string }
    | { kind: "WORK_PART"; sourceId: string };
  persistedInWork10: boolean;
};

/**
 * Sýnir varanlega WorkPart-færslur þegar þær eru til. Á eldri verkum sem
 * hafa ekki verið færð yfir enn höldum við öruggri read-only vörpun.
 */
export function projectWorkPartsForDisplay(
  work: WorkForPartDisplay,
  language: string | null | undefined,
): Work10DisplayPart[] {
  const parts =
    work.workParts.length > 0
      ? work.workParts.map(projectPersistedWorkPart)
      : projectLegacyWorkOrderToParts(work);

  return parts.map((part) => ({
    id: part.id,
    title:
      resolveWork10LocalizedText(part.title, language)?.text ??
      part.title.sourceText,
    description:
      resolveWork10LocalizedText(part.description, language)?.text ??
      part.description?.sourceText ??
      null,
    status: part.status,
    order: part.order,
    dependencies: part.dependencies,
    source: part.source,
    persistedInWork10: part.persistedInWork10,
  }));
}
