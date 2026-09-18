import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n/ui";

/**
 * Þýðanlegur rekstrartexti í Verk 10.
 *
 * Frumtextinn er alltaf varðveittur óbreyttur. Þýðingar eru sjálfstæð gögn
 * sem mega koma frá starfsmanni, innflutningi eða AI. Viðmótið velur aðeins
 * hvaða birtingu notandinn sér; það skrifar aldrei yfir frumtextann.
 */
export type Work10TranslationSource = "HUMAN" | "AI" | "IMPORTED" | "TEST_PROJECTION";

export type Work10OperationalTranslation = {
  language: UiLanguage;
  text: string;
  source: Work10TranslationSource;
};

export type Work10LocalizedText = {
  sourceLanguage: UiLanguage;
  sourceText: string;
  translations: Work10OperationalTranslation[];
};

export type Work10ResolvedText = {
  text: string;
  language: UiLanguage;
  sourceLanguage: UiLanguage;
  translated: boolean;
  translationSource: Work10TranslationSource | null;
};

export function work10LocalizedText(
  sourceText: string,
  sourceLanguage: UiLanguage = "is",
  translations: Work10OperationalTranslation[] = [],
): Work10LocalizedText {
  return {
    sourceLanguage,
    sourceText,
    translations,
  };
}

export function resolveWork10LocalizedText(
  value: Work10LocalizedText | null | undefined,
  requestedLanguage: string | null | undefined,
): Work10ResolvedText | null {
  if (!value) return null;

  const language = normalizeUiLanguage(requestedLanguage);

  if (language === value.sourceLanguage) {
    return {
      text: value.sourceText,
      language,
      sourceLanguage: value.sourceLanguage,
      translated: false,
      translationSource: null,
    };
  }

  const translation = value.translations.find((item) => item.language === language && item.text.trim().length > 0);

  if (translation) {
    return {
      text: translation.text,
      language,
      sourceLanguage: value.sourceLanguage,
      translated: true,
      translationSource: translation.source,
    };
  }

  // Örugg fallback-regla: ef þýðing vantar sýnum við frumtextann.
  // Aldrei má skálda þýðingu eða missa rekstrarleiðbeiningu í hljóði.
  return {
    text: value.sourceText,
    language: value.sourceLanguage,
    sourceLanguage: value.sourceLanguage,
    translated: false,
    translationSource: null,
  };
}
