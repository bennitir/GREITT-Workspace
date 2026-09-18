import type { UiLanguage } from "@/lib/i18n/ui";
import {
  work10LocalizedText,
  type Work10LocalizedText,
  type Work10OperationalTranslation,
} from "@/lib/work10/operational-text";

export type LegacyOperationalWork = {
  id: number;
  title: string;
  description: string | null;
};

type TranslationSet = Partial<Record<Exclude<UiLanguage, "is">, string>>;

type TestWorkTranslation = {
  title?: TranslationSet;
  description?: TranslationSet;
};

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * TÍMABUNDIN REYNSLUGÖGN FYRIR /verk10.
 *
 * Þetta er EKKI framtíðar þýðingargeymslan. Markmiðið er að sannreyna núna
 * að rekstrartexti geti fylgt tungumáli starfsmanns án þess að frumtexti
 * fyrirtækisins sé yfirskrifaður. Þegar varanlegt gagnalíkan kemur verða
 * þýðingar sjálfstæðar rekjanlegar færslur og þessi brú hverfur.
 *
 * Fyrir þekkta prófunarfærslu notum við source-id frekar en nákvæman textalykil.
 * Þannig brotnar reynsluaksturinn ekki ef frumtextinn inniheldur annan bandstrik,
 * bil eða smávægilegan mun. Frumtextinn sjálfur er samt alltaf varðveittur.
 */
const TEST_WORK_TRANSLATIONS = new Map<number, TestWorkTranslation>([
  [
    3,
    {
      title: {
        en: "Connect the dryer drain",
        pl: "Podłączyć odpływ z suszarki",
        sr: "Повезати одвод сушаре",
      },
      description: {
        en: "It is a hassle having to empty the dryer containers all the time. This needs to be fixed.",
        pl: "Ciągłe opróżnianie pojemników suszarki jest uciążliwe. Trzeba to naprawić.",
        sr: "Стално пражњење посуда сушаре је непрактично. Ово треба поправити.",
      },
    },
  ],
]);

// Vara-/fallback-lykill fyrir önnur tímabundin reynslugögn.
const TEST_TEXT_TRANSLATIONS = new Map<string, TranslationSet>([
  [
    normalizeKey("Tengja fráfall frá þurrkara"),
    {
      en: "Connect the dryer drain",
      pl: "Podłączyć odpływ z suszarki",
      sr: "Повезати одвод сушаре",
    },
  ],
]);

function toTranslations(set: TranslationSet | undefined): Work10OperationalTranslation[] {
  if (!set) return [];

  return (Object.entries(set) as Array<[Exclude<UiLanguage, "is">, string]>)
    .filter(([, text]) => Boolean(text?.trim()))
    .map(([language, text]) => ({
      language,
      text,
      source: "TEST_PROJECTION" as const,
    }));
}

function fallbackTranslationsFor(sourceText: string): Work10OperationalTranslation[] {
  return toTranslations(TEST_TEXT_TRANSLATIONS.get(normalizeKey(sourceText)));
}

function localized(
  sourceText: string,
  translations?: TranslationSet,
): Work10LocalizedText {
  const projectedTranslations = translations
    ? toTranslations(translations)
    : fallbackTranslationsFor(sourceText);

  return work10LocalizedText(sourceText, "is", projectedTranslations);
}

export function projectLegacyOperationalText(work: LegacyOperationalWork) {
  const testTranslation = TEST_WORK_TRANSLATIONS.get(work.id);

  return {
    title: localized(work.title, testTranslation?.title),
    description: work.description
      ? localized(work.description, testTranslation?.description)
      : null,
  };
}
