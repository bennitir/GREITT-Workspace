import type { UiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "Afstemming",
    accountNumberMissing: "Reikningsnúmer ekki skráð",
    transactions: "Bankafærslur",
    strong: "Sterk samsvörun",
    possible: "Möguleg samsvörun",
    ambiguous: "Tvíræð sterk samsvörun",
    none: "Engin samsvörun",
    noTransactions: "Engar bankafærslur til afstemmingar.",
    strongBadge: "Sterk samsvörun",
    possibleBadge: "Möguleg samsvörun",
    ambiguousBadge: "Þarf yfirferð",
    noneBadge: "Engin samsvörun",
    booking: "Bókun",
    account: "Lykill",
    exactDateAmountParty: "Sama dagsetning, upphæð og mótaðili",
    exactDateAmount: "Sama dagsetning og upphæð",
    nearDateAmountParty: "Sama upphæð og mótaðili, nálæg dagsetning",
    extendedDateAmountParty: "Sama upphæð og mótaðili, dagsetning innan 30 daga",
    noDateAmountParty: "Sama upphæð og mótaðili, bókunardagsetning vantar",
    readOnly:
      "Þetta eru deterministic pörunartillögur. Ekkert er tengt eða bókað sjálfkrafa.",
    notLinkedTitle: "Bókhaldslykill bankareiknings er ekki tengdur",
    notLinkedHelp:
      "Velja þarf hvaða bókhaldslykill tilheyrir þessum bankareikningi áður en afstemming getur hafist.",
    sourceErrorTitle: "Ekki tókst að lesa afstemmingargögn",
    sourceErrorHelp:
      "Athuga þarf tengingu bankareiknings og bókhaldslykils áður en haldið er áfram.",
  },

  en: {
    title: "Reconciliation",
    accountNumberMissing: "Account number not registered",
    transactions: "Bank transactions",
    strong: "Strong matches",
    possible: "Possible matches",
    ambiguous: "Ambiguous strong matches",
    none: "No match",
    noTransactions: "No bank transactions to reconcile.",
    strongBadge: "Strong match",
    possibleBadge: "Possible match",
    ambiguousBadge: "Review needed",
    noneBadge: "No match",
    booking: "Booking",
    account: "Account",
    exactDateAmountParty: "Same date, amount and counterparty",
    exactDateAmount: "Same date and amount",
    nearDateAmountParty: "Same amount and counterparty, nearby date",
    extendedDateAmountParty: "Same amount and counterparty, date within 30 days",
    noDateAmountParty: "Same amount and counterparty, booking date missing",
    readOnly:
      "These are deterministic matching suggestions. Nothing is linked or posted automatically.",
    notLinkedTitle: "No ledger account linked to this bank account",
    notLinkedHelp:
      "Choose the ledger account that belongs to this bank account before reconciliation can begin.",
    sourceErrorTitle: "Reconciliation data could not be loaded",
    sourceErrorHelp:
      "Check the bank-account and ledger-account link before continuing.",
  },

  pl: {
    title: "Uzgadnianie",
    accountNumberMissing: "Numer rachunku nie jest zapisany",
    transactions: "Transakcje bankowe",
    strong: "Silne dopasowania",
    possible: "Możliwe dopasowania",
    ambiguous: "Niejednoznaczne silne dopasowania",
    none: "Brak dopasowania",
    noTransactions: "Brak transakcji bankowych do uzgodnienia.",
    strongBadge: "Silne dopasowanie",
    possibleBadge: "Możliwe dopasowanie",
    ambiguousBadge: "Wymaga sprawdzenia",
    noneBadge: "Brak dopasowania",
    booking: "Księgowanie",
    account: "Konto",
    exactDateAmountParty: "Ta sama data, kwota i kontrahent",
    exactDateAmount: "Ta sama data i kwota",
    nearDateAmountParty: "Ta sama kwota i kontrahent, zbliżona data",
    extendedDateAmountParty: "Ta sama kwota i kontrahent, data w ciągu 30 dni",
    noDateAmountParty: "Ta sama kwota i kontrahent, brak daty księgowania",
    readOnly:
      "To są deterministyczne sugestie dopasowania. Nic nie jest automatycznie łączone ani księgowane.",
    notLinkedTitle: "Brak konta księgowego powiązanego z rachunkiem bankowym",
    notLinkedHelp:
      "Przed rozpoczęciem uzgadniania należy wybrać konto księgowe należące do tego rachunku bankowego.",
    sourceErrorTitle: "Nie udało się wczytać danych uzgodnienia",
    sourceErrorHelp:
      "Sprawdź powiązanie rachunku bankowego z kontem księgowym przed kontynuowaniem.",
  },

  sr: {
    title: "Усклађивање",
    accountNumberMissing: "Број рачуна није унет",
    transactions: "Банковне трансакције",
    strong: "Сигурна поклапања",
    possible: "Могућа поклапања",
    ambiguous: "Неједнозначна јака поклапања",
    none: "Нема поклапања",
    noTransactions: "Нема банковних трансакција за усклађивање.",
    strongBadge: "Сигурно поклапање",
    possibleBadge: "Могуће поклапање",
    ambiguousBadge: "Потребан преглед",
    noneBadge: "Нема поклапања",
    booking: "Књижење",
    account: "Конто",
    exactDateAmountParty: "Исти датум, износ и друга страна",
    exactDateAmount: "Исти датум и износ",
    nearDateAmountParty: "Исти износ и друга страна, близак датум",
    extendedDateAmountParty: "Исти износ и друга страна, датум у року од 30 дана",
    noDateAmountParty: "Исти износ и друга страна, недостаје датум књижења",
    readOnly:
      "Ово су детерминистички предлози за поклапање. Ништа се не повезује нити књижи аутоматски.",
    notLinkedTitle: "Банковни рачун није повезан са књиговодственим контом",
    notLinkedHelp:
      "Пре усклађивања треба изабрати књиговодствени конто који припада овом банковном рачуну.",
    sourceErrorTitle: "Подаци за усклађивање нису могли да се учитају",
    sourceErrorHelp:
      "Проверите везу банковног рачуна и књиговодственог конта пре наставка.",
  },
} as const satisfies Record<UiLanguage, object>;

export function bankReconciliationText(language: UiLanguage) {
  return text[language];
}
