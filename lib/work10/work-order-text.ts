import { normalizeUiLanguage } from "@/lib/i18n/ui";
import {
  work10LocalizedText,
  type Work10OperationalTranslation,
  type Work10TranslationSource,
} from "@/lib/work10/operational-text";

export type PersistedWorkOrderTextRow = {
  title: string;
  description: string | null;
  sourceLanguage: string;
  translations: Array<{
    language: string;
    title: string | null;
    description: string | null;
    source: string;
  }>;
};

const TRANSLATION_SOURCES = new Set<Work10TranslationSource>([
  "HUMAN",
  "AI",
  "IMPORTED",
  "TEST_PROJECTION",
]);

function source(value: string): Work10TranslationSource {
  return TRANSLATION_SOURCES.has(value as Work10TranslationSource)
    ? (value as Work10TranslationSource)
    : "HUMAN";
}

function fieldTranslations(
  rows: PersistedWorkOrderTextRow["translations"],
  field: "title" | "description",
): Work10OperationalTranslation[] {
  return rows
    .map((row) => {
      const text = row[field]?.trim();
      if (!text) return null;
      return {
        language: normalizeUiLanguage(row.language),
        text,
        source: source(row.source),
      } satisfies Work10OperationalTranslation;
    })
    .filter((item): item is Work10OperationalTranslation => item !== null);
}

export function projectPersistedWorkOrderText(row: PersistedWorkOrderTextRow) {
  const sourceLanguage = normalizeUiLanguage(row.sourceLanguage);
  return {
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
  };
}
