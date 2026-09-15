import { normalizeUiLanguage } from "@/lib/i18n/ui";

type SupportedLanguage = "is" | "en" | "pl" | "sr";

type ReminderTask = {
  taskType: string;
  periodStart: Date | null;
  periodEnd: Date | null;
};

const localeByLanguage: Record<SupportedLanguage, string> = {
  is: "is-IS",
  en: "en-GB",
  pl: "pl-PL",
  sr: "sr-RS",
};

function language(value: string | null | undefined): SupportedLanguage {
  return normalizeUiLanguage(value) as SupportedLanguage;
}

function monthName(date: Date, lang: SupportedLanguage) {
  return new Intl.DateTimeFormat(localeByLanguage[lang], { month: "long" }).format(date);
}

export function formatTaskPeriodLabel(
  periodStart: Date | null,
  periodEnd: Date | null,
  languageValue?: string | null,
) {
  if (!periodStart || !periodEnd) return null;
  const lang = language(languageValue);
  const startMonth = monthName(periodStart, lang);
  const endMonth = monthName(periodEnd, lang);
  const sameMonth =
    periodStart.getFullYear() === periodEnd.getFullYear() &&
    periodStart.getMonth() === periodEnd.getMonth();
  const sameYear = periodStart.getFullYear() === periodEnd.getFullYear();

  if (sameMonth) return `${startMonth} ${periodEnd.getFullYear()}`;
  if (sameYear) return `${startMonth}–${endMonth} ${periodEnd.getFullYear()}`;
  return `${startMonth} ${periodStart.getFullYear()}–${endMonth} ${periodEnd.getFullYear()}`;
}

export function getTaskDataReminderCopy(task: ReminderTask, languageValue?: string | null) {
  const lang = language(languageValue);
  const period = formatTaskPeriodLabel(task.periodStart, task.periodEnd, lang);
  if (!period) return null;

  if (task.taskType === "VAT") {
    const copy = {
      is: {
        title: `VSK-gögn fyrir ${period}`,
        body: `Vinsamlega skilaðu inn öllum fylgiskjölum og öðrum gögnum sem tilheyra VSK-tímabilinu ${period}.`,
      },
      en: {
        title: `VAT data for ${period}`,
        body: `Please submit all documents and other data relating to the VAT period ${period}.`,
      },
      pl: {
        title: `Dane VAT za okres ${period}`,
        body: `Przekaż wszystkie dokumenty i pozostałe dane dotyczące okresu VAT ${period}.`,
      },
      sr: {
        title: `ПДВ подаци за ${period}`,
        body: `Доставите све документе и остале податке који се односе на ПДВ период ${period}.`,
      },
    } as const;
    return copy[lang];
  }

  if (task.taskType === "PAYROLL") {
    const copy = {
      is: {
        title: `Launagögn fyrir ${period}`,
        body: `Vinsamlega skilaðu inn þeim launagögnum sem tilheyra tímabilinu ${period}.`,
      },
      en: {
        title: `Payroll data for ${period}`,
        body: `Please submit the payroll data relating to ${period}.`,
      },
      pl: {
        title: `Dane płacowe za ${period}`,
        body: `Przekaż dane płacowe dotyczące okresu ${period}.`,
      },
      sr: {
        title: `Подаци о зарадама за ${period}`,
        body: `Доставите податке о зарадама који се односе на период ${period}.`,
      },
    } as const;
    return copy[lang];
  }

  return null;
}
