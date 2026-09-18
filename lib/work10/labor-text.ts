import { normalizeUiLanguage } from "@/lib/i18n/ui";
import {
  resolveWork10LocalizedText,
  work10LocalizedText,
  type Work10OperationalTranslation,
  type Work10TranslationSource,
} from "@/lib/work10/operational-text";

export type PersistedLaborFactTextRow = {
  note: string | null;
  noteSourceLanguage: string;
  translations: Array<{
    language: string;
    text: string;
    source: string;
  }>;
};

const TRANSLATION_SOURCES = new Set<Work10TranslationSource>([
  "HUMAN",
  "AI",
  "IMPORTED",
  "TEST_PROJECTION",
]);

function translationSource(value: string): Work10TranslationSource {
  return TRANSLATION_SOURCES.has(value as Work10TranslationSource)
    ? (value as Work10TranslationSource)
    : "HUMAN";
}

export function resolveLaborFactNote(
  row: PersistedLaborFactTextRow,
  requestedLanguage: string | null | undefined,
) {
  const note = row.note?.trim();
  if (!note) return null;

  const translations: Work10OperationalTranslation[] = row.translations
    .map((translation) => {
      const text = translation.text.trim();
      if (!text) return null;
      return {
        language: normalizeUiLanguage(translation.language),
        text,
        source: translationSource(translation.source),
      } satisfies Work10OperationalTranslation;
    })
    .filter((item): item is Work10OperationalTranslation => item !== null);

  return resolveWork10LocalizedText(
    work10LocalizedText(
      note,
      normalizeUiLanguage(row.noteSourceLanguage),
      translations,
    ),
    requestedLanguage,
  );
}
