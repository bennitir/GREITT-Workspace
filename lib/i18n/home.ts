import { normalizeUiLanguage } from "@/lib/i18n/ui";

const homeTextByLanguage = {
  is: {
    myWork: "Vinnan mín",
    myWorkHelp: "Atriði sem bíða þín samkvæmt fyrirtæki og heimildum.",
    documentsNeedWork: "Fylgiskjöl bíða vinnslu",
    documentsNeedWorkHelp: "Opnaðu skjölin sem bíða yfirferðar eða bókunar.",
    noWorkWaiting: "Engin aðgerð bíður þín hér núna.",
    openWork: "Opna",
    allCompaniesWork: "Vinnan mín – öll fyrirtæki",
    allCompaniesWorkHelp: "Atriði sem bíða þín hjá öllum fyrirtækjum sem þú hefur aðgang að.",
    companiesWithWork: "fyrirtæki með verkefni",
    noWorkAcrossCompanies: "Engin verkefni bíða þín hjá fyrirtækjunum þínum núna.",
    deadlines: "Verkefni og frestir", deadlinesHelp: "Opnar áminningar, skil og önnur tímabundin verkefni.", messages: "Skilaboð", messagesHelp: "Ný skilaboð sem þarfnast athygli. Lesin skilaboð og saga eru í pósthólfinu.", openMailbox: "Opna pósthólf", unreadMessages: "ólesin", from: "Frá", newMessage: "Nýtt", markRead: "Merkja lesið", overdue: "komin fram yfir frest", dueToday: "á eindaga í dag", dueSoon: "með frest innan 3 daga",
  },
  en: {
    myWork: "My work",
    myWorkHelp: "Items waiting for you based on the company and your permissions.",
    documentsNeedWork: "Documents are waiting for processing",
    documentsNeedWorkHelp: "Open the documents waiting for review or posting.",
    noWorkWaiting: "No action is waiting for you here right now.",
    openWork: "Open",
    allCompaniesWork: "My work – all companies",
    allCompaniesWorkHelp: "Items waiting for you across all companies you can access.",
    companiesWithWork: "companies with tasks",
    noWorkAcrossCompanies: "No tasks are waiting for you across your companies right now.",
    deadlines: "Tasks and deadlines", deadlinesHelp: "Open reminders, filings and other time-sensitive tasks.", messages: "Messages", messagesHelp: "New messages needing attention. Read messages and history are kept in the mailbox.", openMailbox: "Open mailbox", unreadMessages: "unread", from: "From", newMessage: "New", markRead: "Mark as read", overdue: "overdue", dueToday: "due today", dueSoon: "due within 3 days",
  },
  pl: {
    myWork: "Moja praca",
    myWorkHelp: "Sprawy oczekujące na Ciebie zgodnie z firmą i Twoimi uprawnieniami.",
    documentsNeedWork: "Dokumenty czekają na przetworzenie",
    documentsNeedWorkHelp: "Otwórz dokumenty oczekujące na przegląd lub księgowanie.",
    noWorkWaiting: "W tej chwili nie czeka tu na Ciebie żadna czynność.",
    openWork: "Otwórz",
    allCompaniesWork: "Moja praca – wszystkie firmy",
    allCompaniesWorkHelp: "Sprawy oczekujące na Ciebie we wszystkich firmach, do których masz dostęp.",
    companiesWithWork: "firmy z zadaniami",
    noWorkAcrossCompanies: "W tej chwili nie czekają na Ciebie zadania w żadnej z Twoich firm.",
    deadlines: "Zadania i terminy", deadlinesHelp: "Otwarte przypomnienia, deklaracje i inne zadania terminowe.", messages: "Wiadomości", messagesHelp: "Nowe wiadomości wymagające uwagi. Przeczytane wiadomości i historia są w skrzynce.", openMailbox: "Otwórz skrzynkę", unreadMessages: "nieprzeczytane", from: "Od", newMessage: "Nowa", markRead: "Oznacz jako przeczytaną", overdue: "po terminie", dueToday: "z terminem dzisiaj", dueSoon: "z terminem w ciągu 3 dni",
  },
  sr: {
    myWork: "Мој рад",
    myWorkHelp: "Ставке које вас чекају у складу са компанијом и вашим овлашћењима.",
    documentsNeedWork: "Документи чекају обраду",
    documentsNeedWorkHelp: "Отворите документе који чекају преглед или књижење.",
    noWorkWaiting: "Тренутно вас овде не чека ниједна радња.",
    openWork: "Отвори",
    allCompaniesWork: "Мој рад – све компаније",
    allCompaniesWorkHelp: "Ставке које вас чекају у свим компанијама којима имате приступ.",
    companiesWithWork: "компанија са задацима",
    noWorkAcrossCompanies: "Тренутно вас не чекају задаци ни у једној од ваших компанија.",
    deadlines: "Задаци и рокови", deadlinesHelp: "Отворени подсетници, пријаве и други временски осетљиви задаци.", messages: "Поруке", messagesHelp: "Нове поруке које траже пажњу. Прочитане поруке и историја су у поштанском сандучету.", openMailbox: "Отвори поштанско сандуче", unreadMessages: "непрочитано", from: "Од", newMessage: "Ново", markRead: "Означи као прочитано", overdue: "са истеклим роком", dueToday: "са роком данас", dueSoon: "са роком у наредна 3 дана",
  },
} as const;

export function homeText(language: string | null | undefined) {
  return homeTextByLanguage[normalizeUiLanguage(language)];
}
