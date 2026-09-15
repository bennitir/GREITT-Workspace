import { normalizeUiLanguage } from "@/lib/i18n/ui";

const companiesTextByLanguage = {
  is: {
    title: "Fyrirtæki",
    description: "Yfirlit yfir öll fyrirtæki sem þú hefur aðgang að.",
    closedCompanies: "Lokuð fyrirtæki",
    newCompany: "➕ Nýtt fyrirtæki",
    neutralWorkspace: "Hlutlaust svæði",
    neutralWorkspaceHelp: "Loka virku fyrirtæki og sjá verkefni yfir öll fyrirtæki.",
    openCompany: "Opna fyrirtæki",
    emptyTitle: "Engin fyrirtæki skráð",
    emptyDescription: "Engin virk fyrirtæki eru tiltæk fyrir þennan notanda.",
  },
  en: {
    title: "Companies",
    description: "Overview of all companies you can access.",
    closedCompanies: "Closed companies",
    newCompany: "➕ New company",
    neutralWorkspace: "Neutral workspace",
    neutralWorkspaceHelp: "Close the active company and view tasks across all companies.",
    openCompany: "Open company",
    emptyTitle: "No companies",
    emptyDescription: "No active companies are available to this user.",
  },
  pl: {
    title: "Firmy",
    description: "Przegląd wszystkich firm, do których masz dostęp.",
    closedCompanies: "Zamknięte firmy",
    newCompany: "➕ Nowa firma",
    neutralWorkspace: "Obszar ogólny",
    neutralWorkspaceHelp: "Zamknij aktywną firmę i zobacz zadania ze wszystkich firm.",
    openCompany: "Otwórz firmę",
    emptyTitle: "Brak firm",
    emptyDescription: "Ten użytkownik nie ma dostępu do żadnej aktywnej firmy.",
  },
  sr: {
    title: "Компаније",
    description: "Преглед свих компанија којима имате приступ.",
    closedCompanies: "Затворене компаније",
    newCompany: "➕ Нова компанија",
    neutralWorkspace: "Општи радни простор",
    neutralWorkspaceHelp: "Затворите активну компанију и погледајте задатке за све компаније.",
    openCompany: "Отвори компанију",
    emptyTitle: "Нема компанија",
    emptyDescription: "Овај корисник нема приступ ниједној активној компанији.",
  },
} as const;

export function companiesText(language: string | null | undefined) {
  return companiesTextByLanguage[normalizeUiLanguage(language)];
}
