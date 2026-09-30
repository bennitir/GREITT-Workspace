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
    financialEventCandidates: "Tillögur að fjárhagsatburði",
    financialEventCandidateHelp:
      "Þetta eru mögulegar tengingar við fjárhagsatburði. Engin tenging verður til fyrr en hún er staðfest sérstaklega.",
    financialEvent: "Fjárhagsatburður",
    eventCharge: "Skuldfærsla",
    eventCredit: "Inneign",
    eventNearDate: "Sama upphæð í gagnstæða átt og dagsetning innan 3 daga",
    eventExtendedDate:
      "Sama upphæð í gagnstæða átt og dagsetning innan 30 daga",
    reference: "Tilvísun",
    referenceAlsoMatches: "Tilvísun bankafærslu stemmir einnig.",
    confirmEventMatch: "Staðfesta tengingu",
    confirmingEventMatch: "Staðfesti…",
    eventMatchConfirmedBadge: "Tenging staðfest",
    eventMatchConfirmed: "Tenging staðfest",
    eventMatchConfirmedHelp:
      "Þessi bankafærsla er staðfest tengd við fjárhagsatburð.",
    confirmedOn: "Staðfest",
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
    financialEventCandidates: "Financial event suggestions",
    financialEventCandidateHelp:
      "These are possible links to financial events. No link is created until it is explicitly confirmed.",
    financialEvent: "Financial event",
    eventCharge: "Charge",
    eventCredit: "Credit",
    eventNearDate: "Same amount in the opposite direction and date within 3 days",
    eventExtendedDate:
      "Same amount in the opposite direction and date within 30 days",
    reference: "Reference",
    referenceAlsoMatches: "The bank-transaction reference also matches.",
    confirmEventMatch: "Confirm link",
    confirmingEventMatch: "Confirming…",
    eventMatchConfirmedBadge: "Link confirmed",
    eventMatchConfirmed: "Link confirmed",
    eventMatchConfirmedHelp:
      "This bank transaction is confirmed as linked to a financial event.",
    confirmedOn: "Confirmed",
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
    financialEventCandidates: "Sugestie zdarzeń finansowych",
    financialEventCandidateHelp:
      "To są możliwe powiązania ze zdarzeniami finansowymi. Powiązanie nie zostanie utworzone bez wyraźnego potwierdzenia.",
    financialEvent: "Zdarzenie finansowe",
    eventCharge: "Obciążenie",
    eventCredit: "Uznanie",
    eventNearDate: "Ta sama kwota w przeciwnym kierunku i data w ciągu 3 dni",
    eventExtendedDate:
      "Ta sama kwota w przeciwnym kierunku i data w ciągu 30 dni",
    reference: "Referencja",
    referenceAlsoMatches: "Referencja transakcji bankowej również jest zgodna.",
    confirmEventMatch: "Potwierdź powiązanie",
    confirmingEventMatch: "Potwierdzanie…",
    eventMatchConfirmedBadge: "Powiązanie potwierdzone",
    eventMatchConfirmed: "Powiązanie potwierdzone",
    eventMatchConfirmedHelp:
      "Ta transakcja bankowa jest potwierdzona jako powiązana ze zdarzeniem finansowym.",
    confirmedOn: "Potwierdzono",
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
    financialEventCandidates: "Предлози финансијских догађаја",
    financialEventCandidateHelp:
      "Ово су могуће везе са финансијским догађајима. Веза се не прави док се изричито не потврди.",
    financialEvent: "Финансијски догађај",
    eventCharge: "Задужење",
    eventCredit: "Одобрење",
    eventNearDate: "Исти износ у супротном смеру и датум у року од 3 дана",
    eventExtendedDate:
      "Исти износ у супротном смеру и датум у року од 30 дана",
    reference: "Референца",
    referenceAlsoMatches: "Референца банковне трансакције се такође поклапа.",
    confirmEventMatch: "Потврди везу",
    confirmingEventMatch: "Потврђивање…",
    eventMatchConfirmedBadge: "Веза потврђена",
    eventMatchConfirmed: "Веза потврђена",
    eventMatchConfirmedHelp:
      "Ова банкарска трансакција је потврђено повезана са финансијским догађајем.",
    confirmedOn: "Потврђено",
  },
} as const satisfies Record<UiLanguage, object>;

export function bankReconciliationText(language: UiLanguage) {
  return text[language];
}
