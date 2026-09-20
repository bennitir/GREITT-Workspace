import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "Banki",
    noActiveCompany: "Ekkert virkt fyrirtæki er valið.",
    activeCompanyNotFound: "Virkt fyrirtæki fannst ekki.",
    activeCompany: "Virkt fyrirtæki",
    companyAccounts: "Bankareikningar þessa fyrirtækis",
    addAccount: "+ Bæta við bankareikningi",
    noAccounts: "Enginn bankareikningur hefur verið tengdur enn.",
    accountNumber: "Reikningsnúmer",
    notRegistered: "Ekki skráð",
    iban: "IBAN",
  },
  en: {
    title: "Bank",
    noActiveCompany: "No active company is selected.",
    activeCompanyNotFound: "The active company could not be found.",
    activeCompany: "Active company",
    companyAccounts: "Bank accounts for this company",
    addAccount: "+ Add bank account",
    noAccounts: "No bank account has been connected yet.",
    accountNumber: "Account number",
    notRegistered: "Not registered",
    iban: "IBAN",
  },
  pl: {
    title: "Bank",
    noActiveCompany: "Nie wybrano aktywnej firmy.",
    activeCompanyNotFound: "Nie znaleziono aktywnej firmy.",
    activeCompany: "Aktywna firma",
    companyAccounts: "Rachunki bankowe tej firmy",
    addAccount: "+ Dodaj rachunek bankowy",
    noAccounts: "Nie podłączono jeszcze żadnego rachunku bankowego.",
    accountNumber: "Numer rachunku",
    notRegistered: "Nie podano",
    iban: "IBAN",
  },
  sr: {
    title: "Банка",
    noActiveCompany: "Није изабрана активна компанија.",
    activeCompanyNotFound: "Активна компанија није пронађена.",
    activeCompany: "Активна компанија",
    companyAccounts: "Банковни рачуни ове компаније",
    addAccount: "+ Додај банковни рачун",
    noAccounts: "Још није повезан ниједан банковни рачун.",
    accountNumber: "Број рачуна",
    notRegistered: "Није унето",
    iban: "IBAN",
  },
} as const;

export function bankText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
