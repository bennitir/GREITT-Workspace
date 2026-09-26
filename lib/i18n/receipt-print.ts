import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    printThisDocument: "Prenta þetta fylgiskjal",
    voucherLabel: "Fylgiskjal nr.",
    preparing: "Undirbý prentun...",
    printNow: "Prenta",
    close: "Til baka",
    bookingMark: "Bókunarmerking",
    bookkeeperMark: "Merki bókara",
    debit: "D",
    credit: "K",
    renderError: "Ekki tókst að útbúa prentútgáfu fylgiskjalsins.",
    sourcePage: "Síða í frumskjali",
  },
  en: {
    printThisDocument: "Print this voucher",
    voucherLabel: "Voucher no.",
    preparing: "Preparing print view...",
    printNow: "Print",
    close: "Back",
    bookingMark: "Booking mark",
    bookkeeperMark: "Bookkeeper mark",
    debit: "D",
    credit: "C",
    renderError: "The printable voucher could not be prepared.",
    sourcePage: "Source page",
  },
  pl: {
    printThisDocument: "Drukuj ten dokument",
    voucherLabel: "Dokument nr",
    preparing: "Przygotowywanie wydruku...",
    printNow: "Drukuj",
    close: "Wstecz",
    bookingMark: "Oznaczenie księgowe",
    bookkeeperMark: "Oznaczenie księgowego",
    debit: "Wn",
    credit: "Ma",
    renderError: "Nie udało się przygotować dokumentu do wydruku.",
    sourcePage: "Strona w dokumencie źródłowym",
  },
  sr: {
    printThisDocument: "Одштампај овај документ",
    voucherLabel: "Документ бр.",
    preparing: "Припрема за штампу...",
    printNow: "Штампај",
    close: "Назад",
    bookingMark: "Књиговодствена ознака",
    bookkeeperMark: "Ознака књиговође",
    debit: "Д",
    credit: "П",
    renderError: "Није успела припрема документа за штампу.",
    sourcePage: "Страница у изворном документу",
  },
} as const;

export function receiptPrintText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
