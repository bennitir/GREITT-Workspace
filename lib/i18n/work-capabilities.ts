import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    sectionTitle: "Verk – virkni",
    sectionDescription:
      "Veldu sérhæfða vinnuhluta sem eiga að vera sýnilegir fyrir þetta fyrirtæki. Verk-kjarninn helst sá sami þó sýnileg virkni sé mismunandi eftir rekstri.",
    experimentalBadge: "Fyrirtækjastilling",
    enabled: "Virkt",
    disabled: "Óvirkt",
    moreLater:
      "Fleiri atvinnugreinasértækir valkostir geta bæst hér við síðar án þess að breyta Verk-kjarnanum.",
    capabilities: {
      machines: {
        name: "Vinnuvélar",
        description:
          "Sýnir vélar sem sérstaka auðlind í Verk, þar á meðal vélarflipa og vélahluta í dagskipulagi.",
      },
    },
  },
  en: {
    sectionTitle: "Work – capabilities",
    sectionDescription:
      "Choose specialized work areas that should be visible for this company. The Work core stays the same even when visible capabilities differ by business.",
    experimentalBadge: "Company setting",
    enabled: "Enabled",
    disabled: "Disabled",
    moreLater:
      "Additional industry-specific capabilities can be added here later without changing the Work core.",
    capabilities: {
      machines: {
        name: "Work machinery",
        description:
          "Shows machinery as a dedicated Work resource, including the machinery tab and machine areas in scheduling.",
      },
    },
  },
  pl: {
    sectionTitle: "Zadania – funkcje",
    sectionDescription:
      "Wybierz specjalistyczne obszary pracy widoczne dla tej firmy. Rdzeń zadań pozostaje ten sam, nawet gdy widoczne funkcje różnią się między firmami.",
    experimentalBadge: "Ustawienie firmy",
    enabled: "Aktywne",
    disabled: "Nieaktywne",
    moreLater:
      "Kolejne funkcje branżowe można później dodać tutaj bez zmiany rdzenia zadań.",
    capabilities: {
      machines: {
        name: "Maszyny robocze",
        description:
          "Pokazuje maszyny jako oddzielny zasób w zadaniach, wraz z zakładką maszyn i elementami maszyn w planie dnia.",
      },
    },
  },
  sr: {
    sectionTitle: "Послови – могућности",
    sectionDescription:
      "Изаберите специјализоване радне области које треба да буду видљиве за ову компанију. Језгро послова остаје исто и када се видљиве могућности разликују по делатности.",
    experimentalBadge: "Подешавање компаније",
    enabled: "Активно",
    disabled: "Неактивно",
    moreLater:
      "Касније се овде могу додати додатне могућности за поједине делатности без промене језгра послова.",
    capabilities: {
      machines: {
        name: "Радне машине",
        description:
          "Приказује машине као посебан ресурс у Пословима, укључујући картицу машина и машинске делове у дневном распореду.",
      },
    },
  },
} as const;

export function workCapabilitiesText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
