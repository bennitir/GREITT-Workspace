import { normalizeUiLanguage } from "@/lib/i18n/ui";
import type { Work10Part, Work10PartStatus } from "@/lib/work10/domain";
import {
  work10LocalizedText,
  type Work10OperationalTranslation,
  type Work10TranslationSource,
} from "@/lib/work10/operational-text";

export type PersistedWorkPartRow = {
  id: number;
  title: string;
  description: string | null;
  sourceLanguage: string;
  status: string;
  sequence: number;
  translations: Array<{
    language: string;
    title: string | null;
    description: string | null;
    source: string;
  }>;
};

export type Work10PersistedPartProjection = Work10Part & {
  source: {
    kind: "WORK_PART";
    sourceId: string;
  };
  persistedInWork10: true;
};

const PART_STATUSES = new Set<Work10PartStatus>([
  "PLANNED",
  "READY",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

const TRANSLATION_SOURCES = new Set<Work10TranslationSource>([
  "HUMAN",
  "AI",
  "IMPORTED",
  "TEST_PROJECTION",
]);

function partStatus(value: string): Work10PartStatus {
  return PART_STATUSES.has(value as Work10PartStatus)
    ? (value as Work10PartStatus)
    : "PLANNED";
}

function translationSource(value: string): Work10TranslationSource {
  return TRANSLATION_SOURCES.has(value as Work10TranslationSource)
    ? (value as Work10TranslationSource)
    : "HUMAN";
}

function fieldTranslations(
  rows: PersistedWorkPartRow["translations"],
  field: "title" | "description",
): Work10OperationalTranslation[] {
  return rows
    .map((row) => {
      const text = row[field]?.trim();
      if (!text) return null;

      return {
        language: normalizeUiLanguage(row.language),
        text,
        source: translationSource(row.source),
      } satisfies Work10OperationalTranslation;
    })
    .filter((item): item is Work10OperationalTranslation => item !== null);
}

/**
 * Les varanlegan WorkPart úr nýja Verk 10 kjarnanum yfir í domain-formið.
 * Frumtexti og þýðingar eru áfram aðskilin gögn.
 */
export function projectPersistedWorkPart(
  row: PersistedWorkPartRow,
): Work10PersistedPartProjection {
  const sourceLanguage = normalizeUiLanguage(row.sourceLanguage);

  return {
    id: `work-part-${row.id}`,
    title: work10LocalizedText(
      row.title,
      sourceLanguage,
      fieldTranslations(row.translations, "title"),
    ),
    description: row.description
      ? work10LocalizedText(
          row.description,
          sourceLanguage,
          fieldTranslations(row.translations, "description"),
        )
      : null,
    status: partStatus(row.status),
    order: row.sequence,
    dependencies: [],
    source: {
      kind: "WORK_PART",
      sourceId: String(row.id),
    },
    persistedInWork10: true,
  };
}
