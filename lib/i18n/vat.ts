import { normalizeUiLanguage } from "@/lib/i18n/ui";

const months = {
  is: ["Janúar","Febrúar","Mars","Apríl","Maí","Júní","Júlí","Ágúst","September","Október","Nóvember","Desember"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  pl: ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"],
  sr: ["Јануар","Фебруар","Март","Април","Мај","Јун","Јул","Август","Септембар","Октобар","Новембар","Децембар"],
} as const;

const text = {
  is: {
    title: "VSK og skil", description: "Yfirlit byggt beint á bókuðum færslum og VSK-stofngögnum fyrirtækisins.",
    activeCompany: "Virkt fyrirtæki", idNumberShort: "Kt.", notVatRegistered: "Ekki VSK-skráð", vatRegisteredIncomplete: "⚠ VSK-skráð – stofngögn ófullnægjandi", vatRegistered: "✓ VSK-skráð", vatUnknown: "⚠ VSK-staða ekki staðfest",
    vatNumber: "VSK-númer", registeredFrom: "Skráð frá", settlementType: "Uppgjörstegund", confirmation: "Staðfesting", notRegisteredValue: "Ekki skráð", notConfirmed: "Ekki staðfest", confirmed: "Staðfest", source: "Uppruni VSK-upplýsinga", updated: "Uppfært",
    checkSetup: "Athuga þarf VSK-stofngögn", warningStatus: "• Ekki hefur verið staðfest hvort fyrirtækið sé VSK-skráð.", warningNumber: "• Fyrirtækið er merkt VSK-skráð en VSK-númer vantar.", warningDate: "• Skráningardag VSK vantar.", warningSettlement: "• Uppgjörstegund VSK hefur ekki verið staðfest.",
    vatNotApplicable: "VSK-uppgjör á ekki við", vatNotApplicableText: "Samkvæmt stofngögnum GLÖGGT er fyrirtækið ekki VSK-skráð.", vatNotApplicableHelp: "Bókaðar færslur eru ekki fjarlægðar eða breyttar. Ef VSK-staða fyrirtækisins breytist síðar verða stofngögnin uppfærð og VSK-uppgjör virkjast samkvæmt þeim.",
    vatNeedsConfirmation: "VSK-staða þarf staðfestingu", vatNeedsConfirmationText: "GLÖGGT mun ekki gera ráð fyrir að fyrirtækið sé VSK-skráð eingöngu vegna þess að VSK-númer eða VSK-færslur kunna að vera til staðar.", vatNeedsConfirmationHelp: "Staðfestu VSK-stöðu í stofnupplýsingum fyrirtækisins áður en VSK-tímabil er stofnað.",
    year: "Ár", vatPeriod: "VSK-tímabil", periodStatus: "Staða VSK-tímabils", notCreated: "Ekki stofnað", submissions: "skráðar sendingar / útgáfur", periodNotCreated: "Tímabilið hefur ekki enn verið stofnað í VSK-uppgjörskerfinu.", createPeriod: "Stofna VSK-tímabil", createBlocked: "Ekki er hægt að stofna VSK-tímabil fyrr en uppgjörstegund hefur verið staðfest í stofnupplýsingum fyrirtækisins.",
    calculation: "VSK-útreikningur", calculationHelp: "Byggt á samþykktum bókuðum færslum tímabilsins.", taxable24: "A – Skattskyld velta 24%", taxable11: "B – Skattskyld velta 11%", exempt: "C – Undanþegin velta", outputVat: "D – Útskattur", inputVat: "E – Innskattur", assessment: "F – Álagning", surcharge: "G – Álag", payableCredit: "H – Til greiðslu / inneign", payable: "Til greiðslu", credit: "Inneign", zeroBalance: "Stendur á núlli",
    breakdown: "Sundurliðun bókaðra VSK-færslna", dateShort: "Dags.", voucher: "Fylgiskjal", descriptionCol: "Lýsing", noRows: "Engar bókaðar VSK-færslur fundust á þessu tímabili.",
    bimonthly: "Tveggja mánaða skil", monthly: "Mánaðarleg skil", annual: "Árleg skil", wholeYear: "Allt árið",
  },
  en: {
    title: "VAT and filings", description: "Overview based directly on booked entries and the company’s VAT master data.",
    activeCompany: "Active company", idNumberShort: "ID", notVatRegistered: "Not VAT registered", vatRegisteredIncomplete: "⚠ VAT registered – master data incomplete", vatRegistered: "✓ VAT registered", vatUnknown: "⚠ VAT status not confirmed",
    vatNumber: "VAT number", registeredFrom: "Registered from", settlementType: "Filing frequency", confirmation: "Confirmation", notRegisteredValue: "Not registered", notConfirmed: "Not confirmed", confirmed: "Confirmed", source: "VAT data source", updated: "Updated",
    checkSetup: "VAT master data needs attention", warningStatus: "• It has not been confirmed whether the company is VAT registered.", warningNumber: "• The company is marked as VAT registered but the VAT number is missing.", warningDate: "• VAT registration date is missing.", warningSettlement: "• VAT filing frequency has not been confirmed.",
    vatNotApplicable: "VAT filing does not apply", vatNotApplicableText: "According to GLÖGGT master data, the company is not VAT registered.", vatNotApplicableHelp: "Booked entries are not removed or changed. If the company’s VAT status changes later, the master data is updated and VAT filing is enabled accordingly.",
    vatNeedsConfirmation: "VAT status requires confirmation", vatNeedsConfirmationText: "GLÖGGT will not assume that the company is VAT registered solely because a VAT number or VAT entries may exist.", vatNeedsConfirmationHelp: "Confirm the VAT status in the company master data before creating a VAT period.",
    year: "Year", vatPeriod: "VAT period", periodStatus: "VAT period status", notCreated: "Not created", submissions: "recorded submissions / versions", periodNotCreated: "The period has not yet been created in the VAT filing system.", createPeriod: "Create VAT period", createBlocked: "A VAT period cannot be created until the filing frequency has been confirmed in the company master data.",
    calculation: "VAT calculation", calculationHelp: "Based on approved booked entries for the period.", taxable24: "A – Taxable turnover 24%", taxable11: "B – Taxable turnover 11%", exempt: "C – Exempt turnover", outputVat: "D – Output VAT", inputVat: "E – Input VAT", assessment: "F – VAT assessment", surcharge: "G – Surcharge", payableCredit: "H – Payable / credit", payable: "Payable", credit: "Credit", zeroBalance: "Zero balance",
    breakdown: "Breakdown of booked VAT entries", dateShort: "Date", voucher: "Voucher", descriptionCol: "Description", noRows: "No booked VAT entries were found for this period.",
    bimonthly: "Every two months", monthly: "Monthly", annual: "Annual", wholeYear: "Full year",
  },
  pl: {
    title: "VAT i deklaracje", description: "Przegląd oparty bezpośrednio na zaksięgowanych zapisach i danych podstawowych VAT firmy.",
    activeCompany: "Aktywna firma", idNumberShort: "ID", notVatRegistered: "Brak rejestracji VAT", vatRegisteredIncomplete: "⚠ Firma zarejestrowana do VAT – dane podstawowe niepełne", vatRegistered: "✓ Firma zarejestrowana do VAT", vatUnknown: "⚠ Status VAT niepotwierdzony",
    vatNumber: "Numer VAT", registeredFrom: "Rejestracja od", settlementType: "Częstotliwość rozliczeń", confirmation: "Potwierdzenie", notRegisteredValue: "Nie podano", notConfirmed: "Niepotwierdzone", confirmed: "Potwierdzone", source: "Źródło danych VAT", updated: "Zaktualizowano",
    checkSetup: "Dane podstawowe VAT wymagają uwagi", warningStatus: "• Nie potwierdzono, czy firma jest zarejestrowana do VAT.", warningNumber: "• Firma jest oznaczona jako zarejestrowana do VAT, ale brakuje numeru VAT.", warningDate: "• Brakuje daty rejestracji VAT.", warningSettlement: "• Nie potwierdzono częstotliwości rozliczeń VAT.",
    vatNotApplicable: "Rozliczenie VAT nie ma zastosowania", vatNotApplicableText: "Według danych podstawowych GLÖGGT firma nie jest zarejestrowana do VAT.", vatNotApplicableHelp: "Zaksięgowane wpisy nie są usuwane ani zmieniane. Jeśli status VAT firmy później się zmieni, dane podstawowe zostaną zaktualizowane i rozliczenia VAT zostaną odpowiednio włączone.",
    vatNeedsConfirmation: "Status VAT wymaga potwierdzenia", vatNeedsConfirmationText: "GLÖGGT nie przyjmie, że firma jest zarejestrowana do VAT wyłącznie dlatego, że może istnieć numer VAT lub wpisy VAT.", vatNeedsConfirmationHelp: "Potwierdź status VAT w danych podstawowych firmy przed utworzeniem okresu VAT.",
    year: "Rok", vatPeriod: "Okres VAT", periodStatus: "Status okresu VAT", notCreated: "Nie utworzono", submissions: "zapisanych deklaracji / wersji", periodNotCreated: "Okres nie został jeszcze utworzony w systemie rozliczeń VAT.", createPeriod: "Utwórz okres VAT", createBlocked: "Nie można utworzyć okresu VAT, dopóki częstotliwość rozliczeń nie zostanie potwierdzona w danych podstawowych firmy.",
    calculation: "Obliczenie VAT", calculationHelp: "Na podstawie zatwierdzonych zaksięgowanych wpisów za okres.", taxable24: "A – Obrót opodatkowany 24%", taxable11: "B – Obrót opodatkowany 11%", exempt: "C – Obrót zwolniony", outputVat: "D – VAT należny", inputVat: "E – VAT naliczony", assessment: "F – Rozliczenie VAT", surcharge: "G – Dopłata", payableCredit: "H – Do zapłaty / nadpłata", payable: "Do zapłaty", credit: "Nadpłata", zeroBalance: "Saldo zerowe",
    breakdown: "Szczegóły zaksięgowanych wpisów VAT", dateShort: "Data", voucher: "Dowód", descriptionCol: "Opis", noRows: "Nie znaleziono zaksięgowanych wpisów VAT dla tego okresu.",
    bimonthly: "Co dwa miesiące", monthly: "Miesięcznie", annual: "Rocznie", wholeYear: "Cały rok",
  },
  sr: {
    title: "ПДВ и пријаве", description: "Преглед заснован директно на прокњиженим ставкама и основним ПДВ подацима компаније.",
    activeCompany: "Активна компанија", idNumberShort: "ID", notVatRegistered: "Није регистрована за ПДВ", vatRegisteredIncomplete: "⚠ ПДВ регистрација постоји – основни подаци нису потпуни", vatRegistered: "✓ Регистровано за ПДВ", vatUnknown: "⚠ ПДВ статус није потврђен",
    vatNumber: "ПДВ број", registeredFrom: "Регистровано од", settlementType: "Учесталост пријаве", confirmation: "Потврда", notRegisteredValue: "Није унето", notConfirmed: "Није потврђено", confirmed: "Потврђено", source: "Извор ПДВ података", updated: "Ажурирано",
    checkSetup: "Основни ПДВ подаци захтевају пажњу", warningStatus: "• Није потврђено да ли је компанија регистрована за ПДВ.", warningNumber: "• Компанија је означена као ПДВ обвезник, али недостаје ПДВ број.", warningDate: "• Недостаје датум ПДВ регистрације.", warningSettlement: "• Учесталост ПДВ пријаве није потврђена.",
    vatNotApplicable: "ПДВ пријава се не примењује", vatNotApplicableText: "Према основним подацима GLÖGGT-а, компанија није регистрована за ПДВ.", vatNotApplicableHelp: "Прокњижене ставке се не уклањају нити мењају. Ако се ПДВ статус компаније касније промени, основни подаци ће бити ажурирани и ПДВ пријаве ће бити омогућене у складу са тим.",
    vatNeedsConfirmation: "ПДВ статус захтева потврду", vatNeedsConfirmationText: "GLÖGGT неће претпоставити да је компанија регистрована за ПДВ само зато што ПДВ број или ПДВ ставке можда постоје.", vatNeedsConfirmationHelp: "Потврдите ПДВ статус у основним подацима компаније пре креирања ПДВ периода.",
    year: "Година", vatPeriod: "ПДВ период", periodStatus: "Статус ПДВ периода", notCreated: "Није креирано", submissions: "евидентираних пријава / верзија", periodNotCreated: "Период још није креиран у систему ПДВ пријава.", createPeriod: "Креирај ПДВ период", createBlocked: "ПДВ период се не може креирати док учесталост пријаве није потврђена у основним подацима компаније.",
    calculation: "Обрачун ПДВ-а", calculationHelp: "На основу одобрених прокњижених ставки за период.", taxable24: "A – Опорезиви промет 24%", taxable11: "B – Опорезиви промет 11%", exempt: "C – Ослобођени промет", outputVat: "D – Излазни ПДВ", inputVat: "E – Улазни ПДВ", assessment: "F – Обрачун ПДВ-а", surcharge: "G – Доплата", payableCredit: "H – За уплату / потраживање", payable: "За уплату", credit: "Потраживање", zeroBalance: "Нулто стање",
    breakdown: "Разрада прокњижених ПДВ ставки", dateShort: "Датум", voucher: "Документ", descriptionCol: "Опис", noRows: "Нису пронађене прокњижене ПДВ ставке за овај период.",
    bimonthly: "На свака два месеца", monthly: "Месечно", annual: "Годишње", wholeYear: "Цела година",
  },
} as const;

export function vatText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}

export function vatMonthNames(language: string | null | undefined) {
  return months[normalizeUiLanguage(language)];
}
