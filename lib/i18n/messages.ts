import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    messages: "Skilaboð", mailbox: "Pósthólf", mailboxHelp: "Skilaboð og saga samskipta innan GLÖGGT.", openMailbox: "Opna pósthólf",
    newMessage: "Ný skilaboð", help: "Sendu almenn skilaboð til notanda sem tengist fyrirtækinu. Skilaboðin stofna ekki verkefni eða frest.",
    recipient: "Viðtakandi", subject: "Fyrirsögn", body: "Skilaboð", send: "Senda skilaboð", selectRecipient: "Veldu viðtakanda",
    from: "Frá", to: "Til", unread: "Nýtt", markRead: "Merkja lesið", markUnread: "Merkja ólesið", archive: "Varðveita", restore: "Færa aftur í móttekið", trash: "Færa í rusl", restoreFromTrash: "Endurheimta",
    inbox: "Móttekið", sentBox: "Sent", archived: "Geymt", trashBox: "Rusl", search: "Leita í skilaboðum", searchButton: "Leita", clearSearch: "Hreinsa leit",
    noRecipients: "Enginn virkur notandi er tengdur fyrirtækinu.", noMessages: "Engin skilaboð fundust hér.", sent: "Skilaboð hafa verið send innan GLÖGGT.",
    historyNote: "Lesin og varðveitt skilaboð haldast í pósthólfinu svo hægt sé að finna leiðbeiningar og fyrri samskipti síðar.",
    invalidCompany: "Ógilt fyrirtæki.", chooseRecipient: "Veldu viðtakanda.", subjectBodyRequired: "Fyrirsögn og skilaboð þurfa að vera útfyllt.", noSendPermission: "Þú hefur ekki heimild til að senda skilaboð fyrir þetta fyrirtæki.", inactiveRecipient: "Viðtakandinn hefur ekki virkan aðgang að fyrirtækinu.", messageNotFound: "Skilaboðin fundust ekki.",
  },
  en: {
    messages: "Messages", mailbox: "Mailbox", mailboxHelp: "Messages and communication history within GLÖGGT.", openMailbox: "Open mailbox",
    newMessage: "New message", help: "Send a general message to a user connected to the company. A message does not create a task or deadline.",
    recipient: "Recipient", subject: "Subject", body: "Message", send: "Send message", selectRecipient: "Select recipient",
    from: "From", to: "To", unread: "New", markRead: "Mark as read", markUnread: "Mark as unread", archive: "Keep", restore: "Move back to inbox", trash: "Move to trash", restoreFromTrash: "Restore",
    inbox: "Inbox", sentBox: "Sent", archived: "Kept", trashBox: "Trash", search: "Search messages", searchButton: "Search", clearSearch: "Clear search",
    noRecipients: "No active user is connected to the company.", noMessages: "No messages were found here.", sent: "The message has been sent within GLÖGGT.",
    historyNote: "Read and kept messages remain in the mailbox so instructions and previous communication can be found later.",
    invalidCompany: "Invalid company.", chooseRecipient: "Select a recipient.", subjectBodyRequired: "Subject and message are required.", noSendPermission: "You do not have permission to send messages for this company.", inactiveRecipient: "The recipient does not have active access to the company.", messageNotFound: "The message could not be found.",
  },
  pl: {
    messages: "Wiadomości", mailbox: "Skrzynka odbiorcza", mailboxHelp: "Wiadomości i historia komunikacji w GLÖGGT.", openMailbox: "Otwórz skrzynkę",
    newMessage: "Nowa wiadomość", help: "Wyślij ogólną wiadomość do użytkownika powiązanego z firmą. Wiadomość nie tworzy zadania ani terminu.",
    recipient: "Odbiorca", subject: "Temat", body: "Wiadomość", send: "Wyślij wiadomość", selectRecipient: "Wybierz odbiorcę",
    from: "Od", to: "Do", unread: "Nowa", markRead: "Oznacz jako przeczytaną", markUnread: "Oznacz jako nieprzeczytaną", archive: "Zachowaj", restore: "Przenieś do odebranych", trash: "Przenieś do kosza", restoreFromTrash: "Przywróć",
    inbox: "Odebrane", sentBox: "Wysłane", archived: "Zachowane", trashBox: "Kosz", search: "Szukaj w wiadomościach", searchButton: "Szukaj", clearSearch: "Wyczyść wyszukiwanie",
    noRecipients: "Z firmą nie jest powiązany żaden aktywny użytkownik.", noMessages: "Nie znaleziono tutaj żadnych wiadomości.", sent: "Wiadomość została wysłana w GLÖGGT.",
    historyNote: "Przeczytane i zachowane wiadomości pozostają w skrzynce, aby później można było znaleźć instrukcje i wcześniejszą komunikację.",
    invalidCompany: "Nieprawidłowa firma.", chooseRecipient: "Wybierz odbiorcę.", subjectBodyRequired: "Temat i treść wiadomości są wymagane.", noSendPermission: "Nie masz uprawnień do wysyłania wiadomości dla tej firmy.", inactiveRecipient: "Odbiorca nie ma aktywnego dostępu do firmy.", messageNotFound: "Nie znaleziono wiadomości.",
  },
  sr: {
    messages: "Поруке", mailbox: "Поштанско сандуче", mailboxHelp: "Поруке и историја комуникације унутар GLÖGGT-а.", openMailbox: "Отвори поштанско сандуче",
    newMessage: "Нова порука", help: "Пошаљите општу поруку кориснику повезаном са компанијом. Порука не креира задатак нити рок.",
    recipient: "Прималац", subject: "Наслов", body: "Порука", send: "Пошаљи поруку", selectRecipient: "Изаберите примаоца",
    from: "Од", to: "За", unread: "Ново", markRead: "Означи као прочитано", markUnread: "Означи као непрочитано", archive: "Сачувај", restore: "Врати у примљено", trash: "Премести у отпад", restoreFromTrash: "Врати",
    inbox: "Примљено", sentBox: "Послато", archived: "Сачувано", trashBox: "Отпад", search: "Претражи поруке", searchButton: "Претражи", clearSearch: "Обриши претрагу",
    noRecipients: "Ниједан активан корисник није повезан са компанијом.", noMessages: "Овде нису пронађене поруке.", sent: "Порука је послата унутар GLÖGGT-а.",
    historyNote: "Прочитане и сачуване поруке остају у сандучету како би упутства и претходна комуникација могли касније да се пронађу.",
    invalidCompany: "Неважећа компанија.", chooseRecipient: "Изаберите примаоца.", subjectBodyRequired: "Наслов и порука су обавезни.", noSendPermission: "Немате овлашћење да шаљете поруке за ову компанију.", inactiveRecipient: "Прималац нема активан приступ компанији.", messageNotFound: "Порука није пронађена.",
  },
} as const;

export function messagesText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
