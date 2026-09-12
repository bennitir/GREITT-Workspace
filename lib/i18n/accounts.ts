export type AccountDisplayLanguage = "is" | "en" | "pl" | "sr";

type AccountNames = Record<AccountDisplayLanguage, string>;

// Presentation aliases for GLÖGGT's standardized chart of accounts.
// Account numbers and Account.name in the database are never changed here.
const standardAccountNames: Record<string, AccountNames> = {
  "1510": { is: "Banki", en: "Bank", pl: "Bank", sr: "Банка" },
  "2200": { is: "Langtímalán", en: "Long-term loans", pl: "Kredyty długoterminowe", sr: "Дугорочни кредити" },
  "2220": { is: "Fjármögnun og tækjalán", en: "Financing and equipment loans", pl: "Finansowanie i kredyty na sprzęt", sr: "Финансирање и кредити за опрему" },
  "2510": { is: "Útskattur", en: "Output VAT", pl: "VAT należny", sr: "Излазни ПДВ" },
  "2520": { is: "Innskattur", en: "Input VAT", pl: "VAT naliczony", sr: "Улазни ПДВ" },
  "4300": { is: "Húsaleiga", en: "Rent", pl: "Czynsz", sr: "Закупнина" },
  "4310": { is: "Skrifstofukostnaður", en: "Office expenses", pl: "Koszty biurowe", sr: "Канцеларијски трошкови" },
  "4320": { is: "Hiti", en: "Heating", pl: "Ogrzewanie", sr: "Грејање" },
  "4330": { is: "Vatn", en: "Water", pl: "Woda", sr: "Вода" },
  "4400": { is: "Sími og fjarskipti", en: "Telephone and communications", pl: "Telefon i telekomunikacja", sr: "Телефон и телекомуникације" },
  "4410": { is: "Internet", en: "Internet", pl: "Internet", sr: "Интернет" },
  "4430": { is: "Tölvubúnaður", en: "Computer equipment", pl: "Sprzęt komputerowy", sr: "Рачунарска опрема" },
  "4510": { is: "Auglýsingar", en: "Advertising", pl: "Reklama", sr: "Оглашавање" },
  "4530": { is: "Tryggingagjald", en: "Insurance levy", pl: "Opłata ubezpieczeniowa", sr: "Накнада за осигурање" },
  "4600": { is: "Tryggingar", en: "Insurance", pl: "Ubezpieczenia", sr: "Осигурање" },
  "4620": { is: "Bifreiðatryggingar", en: "Vehicle insurance", pl: "Ubezpieczenia pojazdów", sr: "Осигурање возила" },
  "4630": { is: "Líf- og persónutryggingar", en: "Life and personal insurance", pl: "Ubezpieczenia na życie i osobowe", sr: "Животно и лично осигурање" },
  "4700": { is: "Bifreið", en: "Vehicle expenses", pl: "Koszty pojazdów", sr: "Трошкови возила" },
  "4740": { is: "Bifreiðagjöld", en: "Vehicle fees", pl: "Opłaty za pojazdy", sr: "Накнаде за возила" },
  "4900": { is: "Almennur", en: "General expenses", pl: "Koszty ogólne", sr: "Општи трошкови" },
  "4910": { is: "Veitingar", en: "Meals and refreshments", pl: "Posiłki i poczęstunek", sr: "Оброци и освежење" },
  "4950": { is: "Bankakostnaður", en: "Bank charges", pl: "Opłaty bankowe", sr: "Банкарске накнаде" },
  "4960": { is: "Annar", en: "Other expenses", pl: "Pozostałe koszty", sr: "Остали трошкови" },
  "4980": { is: "Greiðslu- og innheimtugjöld", en: "Payment and collection fees", pl: "Opłaty płatnicze i windykacyjne", sr: "Накнаде за плаћање и наплату" },
  "5110": { is: "Vextir af bankalánum", en: "Interest on bank loans", pl: "Odsetki od kredytów bankowych", sr: "Камате на банкарске кредите" },
  "5120": { is: "Verðbætur", en: "Indexation", pl: "Indeksacja", sr: "Индексација" },
};

function accountLanguage(language: string | null | undefined): AccountDisplayLanguage {
  return language === "en" || language === "pl" || language === "sr" ? language : "is";
}

export function accountDisplayName(
  accountNumber: string | null | undefined,
  storedName: string | null | undefined,
  language: string | null | undefined
) {
  const number = accountNumber?.trim() ?? "";
  const fallback = storedName?.trim() ?? "";
  const standard = standardAccountNames[number];

  // Only standardized account numbers get a presentation alias.
  // Custom/user-created account names remain exactly as stored.
  if (!standard) return fallback;

  return standard[accountLanguage(language)] || fallback;
}
