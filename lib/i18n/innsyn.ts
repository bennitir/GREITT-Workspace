export type InnsynLanguage = "is" | "en" | "pl" | "sr";

const texts = {
  is: {
    balanceDescription:"Innkoma að frádregnum útgjöldum samkvæmt þeim gögnum sem GLÖGGT þekkir.", comparisonDescription:"Samanburður við fyrra ár og áætlun birtist hér þegar samanburðargögn liggja fyrir.", confirmedExpensesDescription:"Staðfest útgjöld sem GLÖGGT getur nú tengt við bókaðar færslur.", showAllInsurance:"Sýna allar greindar tryggingaupplýsingar", noInsightData:"Engin Innsýn-gögn hafa verið vistuð fyrir þetta fyrirtæki enn.", knownItems:"Það sem GLÖGGT þekkir", moreFacts:"Nánari staðreyndir", financialEvents:"Fjárhagsatburðir", inProgress:"í vinnslu", entitiesWord:"fyrirbæri", factsWord:"staðreyndir", recentEventsWord:"nýlegir fjárhagsatburðir", source:"Heimild", confidence:"Öryggi", operationsPositive:(v:string)=>`Þekkt innkoma er ${v} umfram útgjöld.`, operationsNegative:(v:string)=>`Útgjöld eru ${v} umfram þekkta innkomu.`, pensionNeedsConfirmation:(n:number)=>`${n} atriði í lífeyrisgögnum þarfnast nánari staðfestingar.`, noUnconfirmedPension:"Engin augljós óstaðfest lífeyrisatriði í samantektinni.", insightsBuilding:"Innsýn er enn að byggjast upp úr skjölum fyrirtækisins.", processingActive:(n:number)=>`${n} Innsýn-vinnsla er í gangi.`, processingIdle:"Engin virk Innsýn-vinnsla bíður núna.",
    title:"Innsýn", noCompany:"Ekkert fyrirtæki er virkt.", intro:"Staðan í dag, byggð á bókhaldi og þeim gögnum sem GLÖGGT þekkir.",
    today:"Staðan í dag", income:"Innkoma", expenses:"Útgjöld", more:"Sjá nánar →", vat:"VSK-staða", seeVat:"Sjá VSK →",
    attention:"GLÖGGT vekur athygli á", important:"Það sem skiptir mestu máli núna", operations:"Rekstur", documentData:"Gögn úr skjölum", processing:"Innsýn-vinnsla",
    outgoing:"Hvað hefur farið út", bookedExpenses:"Bókuð útgjöld", detailed:"Sjá nánari greiningu →", homeCost:"Kostnaður heimilis",
    propertyData:"Greind gögn um fasteignir úr frumgögnum GLÖGGT", loansKnown:"Lán sem GLÖGGT þekkir", confirmedLink:"Staðfest tenging",
    noBooked:"Engin bókuð útgjöld fundust á tímabilinu.", totalBooked:"Samtals bókuð útgjöld", principal:"Lækkun höfuðstóls",
    expenseImpact:"Áhrif á útgjöld", installments:"Sjá afborganir →", incomeDocs:"Innkoma úr skjölum", pension:"Lífeyrir og greiðslur",
    latestPeriod:"Nýjasta tímabil", analyzedPayments:"Greind greiðsluskjöl", needsConfirmation:"Þarfnast staðfestingar",
    assetsRisk:"Eignir og áhætta", insurance:"Tryggingar", vehicles:"Ökutæki", properties:"Fasteignir", highestCoverage:"Hæsta tryggingarfjárhæð",
    possibleRefund:"Möguleg endurgreiðsla", possibleCost:"Mögulegur kostnaður eftir endurgreiðslu", deductible:"Eigin áhætta", insured:"Það sem er tryggt",
    building:"Innsýn er að byggjast upp", further:"Frekari Innsýn", docsContain:"Það sem kemur fram í skjölunum", latestFacts:"Nýjustu lykilupplýsingar",
    date:"Dagsetning", event:"Atburður", status:"Staða", amount:"Upphæð", noEvents:"Engir fjárhagsatburðir hafa verið tengdir enn.",
    noProcessing:"Engin Innsýn-vinnsla hefur verið skráð.", actionOpen:"Opna frumskjal →", voucher:"Fylgiskjal", loanShort:"Lán", sourceInvoiceUnconfirmed:"Reikningur úr frumgögnum · ekki staðfest greiðsla", liabilityAccount:"Skuldareikningur"
  },
  en: {
    balanceDescription:"Income less expenses based on the data currently known to GLÖGGT.", comparisonDescription:"Comparison with the previous year and budget will appear here when comparison data becomes available.", confirmedExpensesDescription:"Confirmed expenses that GLÖGGT can currently link to booked entries.", showAllInsurance:"Show all identified insurance information", noInsightData:"No Insights data has been saved for this company yet.", knownItems:"What GLÖGGT knows", moreFacts:"More facts", financialEvents:"Financial events", inProgress:"in progress", entitiesWord:"entities", factsWord:"facts", recentEventsWord:"recent financial events", source:"Source", confidence:"Confidence", operationsPositive:(v:string)=>`Known income exceeds expenses by ${v}.`, operationsNegative:(v:string)=>`Expenses exceed known income by ${v}.`, pensionNeedsConfirmation:(n:number)=>`${n} pension data items need further confirmation.`, noUnconfirmedPension:"No obvious unconfirmed pension items in the summary.", insightsBuilding:"Insights are still being built from the company documents.", processingActive:(n:number)=>`${n} insight processing job${n===1?" is":"s are"} active.`, processingIdle:"No active insight processing is currently waiting.",
    title:"Insights", noCompany:"No company is active.", intro:"Today's position, based on the accounting records and the data GLÖGGT knows.",
    today:"Today", income:"Income", expenses:"Expenses", more:"See details →", vat:"VAT position", seeVat:"View VAT →",
    attention:"GLÖGGT highlights", important:"What matters most right now", operations:"Operations", documentData:"Data from documents", processing:"Insight processing",
    outgoing:"Where the money went", bookedExpenses:"Booked expenses", detailed:"View detailed analysis →", homeCost:"Property costs",
    propertyData:"Property data identified from GLÖGGT source documents", loansKnown:"Loans GLÖGGT knows", confirmedLink:"Confirmed link",
    noBooked:"No booked expenses were found for the period.", totalBooked:"Total booked expenses", principal:"Principal reduction",
    expenseImpact:"Impact on expenses", installments:"View repayments →", incomeDocs:"Income from documents", pension:"Pension and payments",
    latestPeriod:"Latest period", analyzedPayments:"Analyzed payment documents", needsConfirmation:"Needs confirmation",
    assetsRisk:"Assets and risk", insurance:"Insurance", vehicles:"Vehicles", properties:"Properties", highestCoverage:"Highest insured amount",
    possibleRefund:"Possible reimbursement", possibleCost:"Possible cost after reimbursement", deductible:"Deductible", insured:"What is insured",
    building:"Insights are building up", further:"More insights", docsContain:"What appears in the documents", latestFacts:"Latest key information",
    date:"Date", event:"Event", status:"Status", amount:"Amount", noEvents:"No financial events have been linked yet.",
    noProcessing:"No insight processing has been recorded.", actionOpen:"Open source document →", voucher:"Source document", loanShort:"Loan", sourceInvoiceUnconfirmed:"Invoice from source data · payment not confirmed", liabilityAccount:"Liability account"
  },
  pl: {
    balanceDescription:"Przychody pomniejszone o wydatki na podstawie danych obecnie znanych GLÖGGT.", comparisonDescription:"Porównanie z poprzednim rokiem i budżetem pojawi się, gdy dane porównawcze będą dostępne.", confirmedExpensesDescription:"Potwierdzone wydatki, które GLÖGGT może obecnie powiązać z zaksięgowanymi zapisami.", showAllInsurance:"Pokaż wszystkie rozpoznane informacje o ubezpieczeniach", noInsightData:"Nie zapisano jeszcze danych Analiz dla tej firmy.", knownItems:"Co GLÖGGT wie", moreFacts:"Więcej faktów", financialEvents:"Zdarzenia finansowe", inProgress:"w toku", entitiesWord:"obiekty", factsWord:"fakty", recentEventsWord:"ostatnie zdarzenia finansowe", source:"Źródło", confidence:"Pewność", operationsPositive:(v:string)=>`Znane przychody przewyższają wydatki o ${v}.`, operationsNegative:(v:string)=>`Wydatki przewyższają znane przychody o ${v}.`, pensionNeedsConfirmation:(n:number)=>`${n} pozycji w danych emerytalno-rentowych wymaga dalszego potwierdzenia.`, noUnconfirmedPension:"Brak oczywistych niepotwierdzonych pozycji emerytalno-rentowych w podsumowaniu.", insightsBuilding:"Analizy są nadal tworzone na podstawie dokumentów firmy.", processingActive:(n:number)=>`Aktywne przetwarzanie analiz: ${n}.`, processingIdle:"Brak aktywnego przetwarzania analiz oczekującego na wykonanie.",
    title:"Analizy", noCompany:"Żadna firma nie jest aktywna.", intro:"Stan na dziś na podstawie księgowości i danych znanych GLÖGGT.",
    today:"Stan na dziś", income:"Przychody", expenses:"Wydatki", more:"Zobacz szczegóły →", vat:"Stan VAT", seeVat:"Zobacz VAT →",
    attention:"GLÖGGT zwraca uwagę", important:"Co jest teraz najważniejsze", operations:"Działalność", documentData:"Dane z dokumentów", processing:"Przetwarzanie analiz",
    outgoing:"Na co wydano środki", bookedExpenses:"Zaksięgowane wydatki", detailed:"Zobacz szczegółową analizę →", homeCost:"Koszty nieruchomości",
    propertyData:"Dane o nieruchomościach rozpoznane z dokumentów źródłowych GLÖGGT", loansKnown:"Pożyczki znane GLÖGGT", confirmedLink:"Potwierdzone powiązanie",
    noBooked:"Nie znaleziono zaksięgowanych wydatków w tym okresie.", totalBooked:"Łączne zaksięgowane wydatki", principal:"Zmniejszenie kapitału",
    expenseImpact:"Wpływ na wydatki", installments:"Zobacz spłaty →", incomeDocs:"Przychody z dokumentów", pension:"Emerytury/renty i płatności",
    latestPeriod:"Najnowszy okres", analyzedPayments:"Przeanalizowane dokumenty płatnicze", needsConfirmation:"Wymaga potwierdzenia",
    assetsRisk:"Aktywa i ryzyko", insurance:"Ubezpieczenia", vehicles:"Pojazdy", properties:"Nieruchomości", highestCoverage:"Najwyższa suma ubezpieczenia",
    possibleRefund:"Możliwy zwrot", possibleCost:"Możliwy koszt po zwrocie", deductible:"Udział własny", insured:"Co jest ubezpieczone",
    building:"Analizy są w trakcie tworzenia", further:"Więcej analiz", docsContain:"Co wynika z dokumentów", latestFacts:"Najnowsze kluczowe informacje",
    date:"Data", event:"Zdarzenie", status:"Status", amount:"Kwota", noEvents:"Nie powiązano jeszcze żadnych zdarzeń finansowych.",
    noProcessing:"Nie zarejestrowano jeszcze przetwarzania analiz.", actionOpen:"Otwórz dokument źródłowy →", voucher:"Dokument źródłowy", loanShort:"Pożyczka", sourceInvoiceUnconfirmed:"Faktura z danych źródłowych · płatność niepotwierdzona", liabilityAccount:"Konto zobowiązań"
  },
  sr: {
    balanceDescription:"Приходи умањени за расходе на основу података које GLÖGGT тренутно познаје.", comparisonDescription:"Поређење са претходном годином и планом биће приказано када подаци за поређење буду доступни.", confirmedExpensesDescription:"Потврђени расходи које GLÖGGT тренутно може да повеже са прокњиженим ставкама.", showAllInsurance:"Прикажи све препознате податке о осигурању", noInsightData:"За ову компанију још нису сачувани подаци Увида.", knownItems:"Шта GLÖGGT зна", moreFacts:"Више чињеница", financialEvents:"Финансијски догађаји", inProgress:"у обради", entitiesWord:"ентитета", factsWord:"чињеница", recentEventsWord:"недавних финансијских догађаја", source:"Извор", confidence:"Поузданост", operationsPositive:(v:string)=>`Познати приходи премашују расходе за ${v}.`, operationsNegative:(v:string)=>`Расходи премашују познате приходе за ${v}.`, pensionNeedsConfirmation:(n:number)=>`${n} ставки у подацима о пензијама захтева додатну потврду.`, noUnconfirmedPension:"У сажетку нема очигледних непотврђених ставки о пензијама.", insightsBuilding:"Увид се и даље гради из докумената компаније.", processingActive:(n:number)=>`Активних обрада Увида: ${n}.`, processingIdle:"Тренутно нема активне обраде Увида на чекању.",
    title:"Увид", noCompany:"Ниједна компанија није активна.", intro:"Стање данас, на основу књиговодства и података које GLÖGGT познаје.",
    today:"Стање данас", income:"Приходи", expenses:"Расходи", more:"Види детаље →", vat:"ПДВ стање", seeVat:"Види ПДВ →",
    attention:"GLÖGGT скреће пажњу", important:"Шта је сада најважније", operations:"Пословање", documentData:"Подаци из докумената", processing:"Обрада увида",
    outgoing:"Где је новац отишао", bookedExpenses:"Прокњижени расходи", detailed:"Види детаљну анализу →", homeCost:"Трошкови имовине",
    propertyData:"Подаци о некретнинама препознати из изворних докумената GLÖGGT-а", loansKnown:"Кредити које GLÖGGT познаје", confirmedLink:"Потврђена веза",
    noBooked:"Нема прокњижених расхода у овом периоду.", totalBooked:"Укупно прокњижени расходи", principal:"Смањење главнице",
    expenseImpact:"Утицај на расходе", installments:"Види отплате →", incomeDocs:"Приходи из докумената", pension:"Пензије и исплате",
    latestPeriod:"Најновији период", analyzedPayments:"Анализирана документа о исплатама", needsConfirmation:"Потребна потврда",
    assetsRisk:"Имовина и ризик", insurance:"Осигурање", vehicles:"Возила", properties:"Некретнине", highestCoverage:"Највиша осигурана сума",
    possibleRefund:"Могућа надокнада", possibleCost:"Могући трошак после надокнаде", deductible:"Учешће", insured:"Шта је осигурано",
    building:"Увид се постепено гради", further:"Више увида", docsContain:"Шта се види у документима", latestFacts:"Најновије кључне информације",
    date:"Датум", event:"Догађај", status:"Статус", amount:"Износ", noEvents:"Још нема повезаних финансијских догађаја.",
    noProcessing:"Није забележена обрада увида.", actionOpen:"Отвори изворни документ →", voucher:"Изворни документ", loanShort:"Кредит", sourceInvoiceUnconfirmed:"Рачун из изворних података · плаћање није потврђено", liabilityAccount:"Рачун обавеза"
  }
} as const;

export function innsynText(language: string | null | undefined) {
  const lang: InnsynLanguage =
    language === "en" || language === "pl" || language === "sr" ? language : "is";
  return texts[lang];
}


export type InnsynDisplayLanguage = "is" | "en" | "pl" | "sr";

function displayLanguage(language: string | null | undefined): InnsynDisplayLanguage {
  return language === "en" || language === "pl" || language === "sr" ? language : "is";
}

const codeLabels: Record<InnsynDisplayLanguage, Record<string, string>> = {
  is: {
    PERSON:"Einstaklingur", ORGANIZATION:"Fyrirtæki / stofnun", COMPANY:"Fyrirtæki", VEHICLE:"Ökutæki", PROPERTY:"Fasteign", LOAN:"Lán", CONTRACT:"Samningur", ACCOUNT:"Reikningur", INVOICE:"Reikningur", OFFER:"Tilboð", INSURANCE_OFFER:"Tryggingatilboð", INSURANCE:"Trygging", INSURANCE_POLICY:"Tryggingarskírteini", POLICY:"Tryggingarskírteini", INSURER:"Tryggingafélag", ACTIVE:"Virkt", OPEN:"Opið", CLOSED:"Lokað", PENDING:"Bíður", PROCESSING:"Í vinnslu", COMPLETED:"Lokið", COMPLETED_WITH_ERRORS:"Lokið með villum", FAILED:"Mistókst", CANCELLED:"Hætt við", NEEDS_REPROCESS:"Þarf endurvinnslu", CONFIRMED:"Staðfest", UNCONFIRMED:"Óstaðfest", PROPOSED:"Tillaga", REJECTED:"Hafnað", PRIMARY:"Aðalskjal", SUPPORTING:"Stuðningsskjal", PAYMENT:"Greiðsla", SETTLEMENT:"Uppgjör", CORRECTION:"Leiðrétting", PREMIUM:"Iðgjald", FEE:"Gjald", COVERAGE:"Tryggingarfjárhæð", DEDUCTIBLE:"Eigin áhætta", OTHER:"Önnur upplýsing", CHARGE:"Krafa", CREDIT:"Kredit", LOAN_INSTALLMENT:"Afborgun láns", ANNUAL_ASSESSMENT:"Ársálagning", USER:"Notandi", SYSTEM:"Kerfi", AI:"AI", UPLOAD:"Innlestur"
  },
  en: {
    PERSON:"Person", ORGANIZATION:"Company / organization", COMPANY:"Company", VEHICLE:"Vehicle", PROPERTY:"Property", LOAN:"Loan", CONTRACT:"Contract", ACCOUNT:"Account", INVOICE:"Invoice", OFFER:"Offer", INSURANCE_OFFER:"Insurance offer", INSURANCE:"Insurance", INSURANCE_POLICY:"Insurance policy", POLICY:"Insurance policy", INSURER:"Insurance company", ACTIVE:"Active", OPEN:"Open", CLOSED:"Closed", PENDING:"Pending", PROCESSING:"Processing", COMPLETED:"Completed", COMPLETED_WITH_ERRORS:"Completed with errors", FAILED:"Failed", CANCELLED:"Cancelled", NEEDS_REPROCESS:"Needs reprocessing", CONFIRMED:"Confirmed", UNCONFIRMED:"Unconfirmed", PROPOSED:"Proposed", REJECTED:"Rejected", PRIMARY:"Primary document", SUPPORTING:"Supporting document", PAYMENT:"Payment", SETTLEMENT:"Settlement", CORRECTION:"Correction", PREMIUM:"Premium", FEE:"Fee", COVERAGE:"Coverage", DEDUCTIBLE:"Deductible", OTHER:"Other", CHARGE:"Claim", CREDIT:"Credit", LOAN_INSTALLMENT:"Loan repayment", ANNUAL_ASSESSMENT:"Annual assessment", USER:"User", SYSTEM:"System", AI:"AI", UPLOAD:"Upload"
  },
  pl: {
    PERSON:"Osoba", ORGANIZATION:"Firma / instytucja", COMPANY:"Firma", VEHICLE:"Pojazd", PROPERTY:"Nieruchomość", LOAN:"Pożyczka", CONTRACT:"Umowa", ACCOUNT:"Konto", INVOICE:"Faktura", OFFER:"Oferta", INSURANCE_OFFER:"Oferta ubezpieczenia", INSURANCE:"Ubezpieczenie", INSURANCE_POLICY:"Polisa ubezpieczeniowa", POLICY:"Polisa ubezpieczeniowa", INSURER:"Towarzystwo ubezpieczeniowe", ACTIVE:"Aktywne", OPEN:"Otwarte", CLOSED:"Zamknięte", PENDING:"Oczekuje", PROCESSING:"W trakcie", COMPLETED:"Zakończone", COMPLETED_WITH_ERRORS:"Zakończone z błędami", FAILED:"Niepowodzenie", CANCELLED:"Anulowane", NEEDS_REPROCESS:"Wymaga ponownego przetworzenia", CONFIRMED:"Potwierdzone", UNCONFIRMED:"Niepotwierdzone", PROPOSED:"Propozycja", REJECTED:"Odrzucone", PRIMARY:"Dokument główny", SUPPORTING:"Dokument pomocniczy", PAYMENT:"Płatność", SETTLEMENT:"Rozliczenie", CORRECTION:"Korekta", PREMIUM:"Składka", FEE:"Opłata", COVERAGE:"Suma ubezpieczenia", DEDUCTIBLE:"Udział własny", OTHER:"Inne", CHARGE:"Należność", CREDIT:"Kredyt", LOAN_INSTALLMENT:"Spłata pożyczki", ANNUAL_ASSESSMENT:"Naliczanie roczne", USER:"Użytkownik", SYSTEM:"System", AI:"AI", UPLOAD:"Import"
  },
  sr: {
    PERSON:"Особа", ORGANIZATION:"Компанија / установа", COMPANY:"Компанија", VEHICLE:"Возило", PROPERTY:"Некретнина", LOAN:"Кредит", CONTRACT:"Уговор", ACCOUNT:"Рачун", INVOICE:"Рачун", OFFER:"Понуда", INSURANCE_OFFER:"Понуда осигурања", INSURANCE:"Осигурање", INSURANCE_POLICY:"Полиса осигурања", POLICY:"Полиса осигурања", INSURER:"Осигуравајућа кућа", ACTIVE:"Активно", OPEN:"Отворено", CLOSED:"Затворено", PENDING:"На чекању", PROCESSING:"У обради", COMPLETED:"Завршено", COMPLETED_WITH_ERRORS:"Завршено са грешкама", FAILED:"Неуспело", CANCELLED:"Отказано", NEEDS_REPROCESS:"Потребна поновна обрада", CONFIRMED:"Потврђено", UNCONFIRMED:"Непотврђено", PROPOSED:"Предлог", REJECTED:"Одбијено", PRIMARY:"Главни документ", SUPPORTING:"Пратећи документ", PAYMENT:"Плаћање", SETTLEMENT:"Поравнање", CORRECTION:"Исправка", PREMIUM:"Премија", FEE:"Накнада", COVERAGE:"Осигурана сума", DEDUCTIBLE:"Учешће", OTHER:"Остало", CHARGE:"Потраживање", CREDIT:"Кредит", LOAN_INSTALLMENT:"Отплата кредита", ANNUAL_ASSESSMENT:"Годишњи обрачун", USER:"Корисник", SYSTEM:"Систем", AI:"AI", UPLOAD:"Увоз"
  }
};

const factLabels: Record<string, Record<InnsynDisplayLanguage, string>> = {
  "Viðskiptavinur á reikningi": {is:"Viðskiptavinur á reikningi",en:"Customer on invoice",pl:"Klient na fakturze",sr:"Купац на рачуну"},
  "Samtals með VSK": {is:"Samtals með VSK",en:"Total incl. VAT",pl:"Razem z VAT",sr:"Укупно са ПДВ-ом"},
  "Tilgreindur VSK": {is:"Tilgreindur VSK",en:"Specified VAT",pl:"Wskazany VAT",sr:"Наведени ПДВ"},
  "Tilgreint VSK-hlutfall": {is:"Tilgreint VSK-hlutfall",en:"Specified VAT rate",pl:"Wskazana stawka VAT",sr:"Наведена стопа ПДВ-а"},
  "Samtals án VSK": {is:"Samtals án VSK",en:"Total excl. VAT",pl:"Razem bez VAT",sr:"Укупно без ПДВ-а"},
  "Heimabanki": {is:"Heimabanki",en:"Online banking",pl:"Bankowość internetowa",sr:"Електронско банкарство"},
  "Netnotkun innanlands": {is:"Netnotkun innanlands",en:"Domestic data usage",pl:"Krajowe zużycie danych",sr:"Домаћа потрошња интернета"},
  "Send skilaboð innanlands": {is:"Send skilaboð innanlands",en:"Domestic messages sent",pl:"Wiadomości krajowe",sr:"Послате домаће поруке"},
  "Innifalin símtöl": {is:"Innifalin símtöl",en:"Included calls",pl:"Połączenia w pakiecie",sr:"Укључени позиви"},
  "Eindagi": {is:"Eindagi",en:"Final due date",pl:"Termin końcowy",sr:"Крајњи рок"},
  "Gjalddagi": {is:"Gjalddagi",en:"Due date",pl:"Termin płatności",sr:"Датум доспећа"},
  "Gjald- og notkunartímabil": {is:"Gjald- og notkunartímabil",en:"Billing and usage period",pl:"Okres rozliczeniowy i użytkowania",sr:"Обрачунски и кориснички период"},
  "Samtals til greiðslu": {is:"Samtals til greiðslu",en:"Total due",pl:"Razem do zapłaty",sr:"Укупно за плаћање"},
  "Samtals til greiðslu án VSK": {is:"Samtals til greiðslu án VSK",en:"Total due excl. VAT",pl:"Razem do zapłaty bez VAT",sr:"Укупно за плаћање без ПДВ-а"},
  "Greiðsluháttur": {is:"Greiðsluháttur",en:"Payment method",pl:"Metoda płatności",sr:"Начин плаћања"},
  "Viðskiptanúmer": {is:"Viðskiptanúmer",en:"Customer number",pl:"Numer klienta",sr:"Број клијента"},
  "Seðilnúmer": {is:"Seðilnúmer",en:"Payment slip number",pl:"Numer blankietu płatniczego",sr:"Број уплатнице"},
  "Reikningsnúmer": {is:"Reikningsnúmer",en:"Invoice number",pl:"Numer faktury",sr:"Број рачуна"},
  "Lánsnúmer": {is:"Lánsnúmer",en:"Loan number",pl:"Numer pożyczki",sr:"Број кредита"},
  "Vextir": {is:"Vextir",en:"Interest",pl:"Odsetki",sr:"Камата"},
  "Vaxtaprósenta": {is:"Vaxtaprósenta",en:"Interest rate",pl:"Stopa procentowa",sr:"Каматна стопа"},
  "Afborgun af nafnverði": {is:"Afborgun af nafnverði",en:"Principal repayment",pl:"Spłata kapitału",sr:"Отплата главнице"},
  "Eftirstöðvar nafnverðs eftir greiðslu": {is:"Eftirstöðvar nafnverðs eftir greiðslu",en:"Principal balance after payment",pl:"Saldo kapitału po płatności",sr:"Главница после плаћања"},
  "Eftirstöðvar nafnverðs fyrir greiðslu": {is:"Eftirstöðvar nafnverðs fyrir greiðslu",en:"Principal balance before payment",pl:"Saldo kapitału przed płatnością",sr:"Главница пре плаћања"}
,
  "Samtals álögð gjöld": {is:"Samtals álögð gjöld",en:"Total assessed charges",pl:"Łącznie naliczone opłaty",sr:"Укупно обрачунате накнаде"},
  "Rekstur grenndar- og söfnunarstöðva": {is:"Rekstur grenndar- og söfnunarstöðva",en:"Operation of recycling and collection stations",pl:"Obsługa punktów recyklingu i zbiórki",sr:"Рад рециклажних и сабирних станица"},
  "Vatnsgjald": {is:"Vatnsgjald",en:"Water fee",pl:"Opłata za wodę",sr:"Накнада за воду"},
  "Fráveitugjald": {is:"Fráveitugjald",en:"Sewerage fee",pl:"Opłata kanalizacyjna",sr:"Накнада за канализацију"},
  "Lóðarleiga": {is:"Lóðarleiga",en:"Ground rent",pl:"Opłata za dzierżawę gruntu",sr:"Закуп земљишта"},
  "Fasteignaskattur A": {is:"Fasteignaskattur A",en:"Property tax A",pl:"Podatek od nieruchomości A",sr:"Порез на имовину A"},
  "Fasteignamat alls": {is:"Fasteignamat alls",en:"Total property valuation",pl:"Łączna wycena nieruchomości",sr:"Укупна процена некретнине"},
  "Lóðarhlutamat": {is:"Lóðarhlutamat",en:"Land share valuation",pl:"Wycena udziału w gruncie",sr:"Процена удела земљишта"},
  "Fasteignamat húss": {is:"Fasteignamat húss",en:"Building valuation",pl:"Wycena budynku",sr:"Процена објекта"},
  "Rúmmál fasteignar": {is:"Rúmmál fasteignar",en:"Property volume",pl:"Kubatura nieruchomości",sr:"Запремина некретнине"},
  "Flatarmál fasteignar": {is:"Flatarmál fasteignar",en:"Property area",pl:"Powierzchnia nieruchomości",sr:"Површина некретнине"},
  "Tegund fasteignar": {is:"Tegund fasteignar",en:"Property type",pl:"Rodzaj nieruchomości",sr:"Врста некретнине"},
  "Heiti og staðsetning fasteignar": {is:"Heiti og staðsetning fasteignar",en:"Property name and location",pl:"Nazwa i lokalizacja nieruchomości",sr:"Назив и локација некретнине"},
  "Fasteignanúmer": {is:"Fasteignanúmer",en:"Property number",pl:"Numer nieruchomości",sr:"Број некретнине"},
  "VSK samkvæmt reikningi samtals": {is:"VSK samkvæmt reikningi samtals",en:"Total VAT on invoice",pl:"Łączny VAT na fakturze",sr:"Укупан ПДВ на рачуну"},
  "Heildarsöluupphæð án VSK": {is:"Heildarsöluupphæð án VSK",en:"Total amount excl. VAT",pl:"Łączna kwota bez VAT",sr:"Укупан износ без ПДВ-а"},
  "Samningsnúmer rafmagnsdreifingar": {is:"Samningsnúmer rafmagnsdreifingar",en:"Electricity distribution contract number",pl:"Numer umowy dystrybucji energii",sr:"Број уговора за дистрибуцију електричне енергије"},
  "Samningsnúmer hitaveitu": {is:"Samningsnúmer hitaveitu",en:"District heating contract number",pl:"Numer umowy na ogrzewanie",sr:"Број уговора за даљинско грејање"},
  "Samningsnúmer raforkusölu": {is:"Samningsnúmer raforkusölu",en:"Electricity supply contract number",pl:"Numer umowy sprzedaży energii",sr:"Број уговора за снабдевање електричном енергијом"},
  "Magnmæling til húshitunar": {is:"Magnmæling til húshitunar",en:"Heating consumption measurement",pl:"Pomiar zużycia ogrzewania",sr:"Мерење потрошње за грејање"},
  "Raforkunotkun samtals fyrir dreifingu": {is:"Raforkunotkun samtals fyrir dreifingu",en:"Total electricity consumption for distribution",pl:"Łączne zużycie energii do dystrybucji",sr:"Укупна потрошња електричне енергије за дистрибуцију"},
  "Raforkunotkun að nóttu": {is:"Raforkunotkun að nóttu",en:"Night electricity consumption",pl:"Nocne zużycie energii",sr:"Ноћна потрошња електричне енергије"},
  "Raforkunotkun að degi": {is:"Raforkunotkun að degi",en:"Daytime electricity consumption",pl:"Dzienne zużycie energii",sr:"Дневна потрошња електричне енергије"},
  "Pöntunarnúmer": {is:"Pöntunarnúmer",en:"Order number",pl:"Numer zamówienia",sr:"Број поруџбине"},
  "Númer notkunarstaðar": {is:"Númer notkunarstaðar",en:"Usage location number",pl:"Numer miejsca poboru",sr:"Број места потрошње"},
  "Uppgjörstímabil veitna": {is:"Uppgjörstímabil veitna",en:"Utility billing period",pl:"Okres rozliczeniowy mediów",sr:"Обрачунски период комуналних услуга"},
  "Eldsneyti": {is:"Eldsneyti",en:"Fuel",pl:"Paliwo",sr:"Гориво"},
  "CO₂-losun": {is:"CO₂-losun",en:"CO₂ emissions",pl:"Emisja CO₂",sr:"Емисија CO₂"},
  "CO2-losun": {is:"CO2-losun",en:"CO₂ emissions",pl:"Emisja CO₂",sr:"Емисија CO₂"},
  "Eiginþyngd": {is:"Eiginþyngd",en:"Curb weight",pl:"Masa własna",sr:"Маса празног возила"},
  "Eiginþyngd ökutækis": {is:"Eiginþyngd ökutækis",en:"Vehicle curb weight",pl:"Masa własna pojazdu",sr:"Маса празног возила"},
  "Árgerð/ár": {is:"Árgerð/ár",en:"Model year",pl:"Rok modelowy",sr:"Година модела"},
  "Tegund ökutækis": {is:"Tegund ökutækis",en:"Vehicle type",pl:"Typ pojazdu",sr:"Врста возила"},
  "Fastanúmer ökutækis": {is:"Fastanúmer ökutækis",en:"Vehicle registration number",pl:"Numer rejestracyjny pojazdu",sr:"Регистарски број возила"},
  "Keyrsludagur": {is:"Keyrsludagur",en:"Driving date",pl:"Data jazdy",sr:"Датум вожње"},
  "Bifreiðagjald": {is:"Bifreiðagjald",en:"Vehicle fee",pl:"Opłata za pojazd",sr:"Накнада за возило"},
  "Innborgun/skuldajöfnun": {is:"Innborgun/skuldajöfnun",en:"Payment / offset",pl:"Wpłata / kompensata",sr:"Уплата / пребијање"},
  "Samtals gjöld": {is:"Samtals gjöld",en:"Total charges",pl:"Łączne opłaty",sr:"Укупне накнаде"},
  "Reikningur sem greiðslan verður lögð inn á": {is:"Reikningur sem greiðslan verður lögð inn á",en:"Account receiving the payment",pl:"Rachunek odbiorcy płatności",sr:"Рачун на који се уплаћује"},
  "Skráningarnúmer tryggðs ökutækis": {is:"Skráningarnúmer tryggðs ökutækis",en:"Insured vehicle registration number",pl:"Numer rejestracyjny ubezpieczonego pojazdu",sr:"Регистарски број осигураног возила"},
  "Tekjur annars staðar frá sem röðun skattþrepa miðar við": {is:"Tekjur annars staðar frá sem röðun skattþrepa miðar við",en:"Other income used to determine tax bracket order",pl:"Inne dochody uwzględniane przy ustalaniu kolejności progów podatkowych",sr:"Други приходи који се узимају у обзир при редоследу пореских разреда"},
  "Persónuafsláttur til lækkunar staðgreiðslu": {is:"Persónuafsláttur til lækkunar staðgreiðslu",en:"Personal tax credit applied to withholding tax",pl:"Ulga osobista obniżająca podatek u źródła",sr:"Лични порески кредит за умањење пореза по одбитку"},
  "Nýting persónuafsláttar": {is:"Nýting persónuafsláttar",en:"Personal tax credit utilization",pl:"Wykorzystanie ulgi osobistej",sr:"Искоришћење личног пореског кредита"},
  "Útborgað á árinu": {is:"Útborgað á árinu",en:"Paid out during the year",pl:"Wypłacono w ciągu roku",sr:"Исплаћено током године"},
  "Staðgreiðsla skatta á árinu": {is:"Staðgreiðsla skatta á árinu",en:"Withholding tax during the year",pl:"Podatek u źródła w ciągu roku",sr:"Порез по одбитку током године"},
  "Greiðslur alls á árinu": {is:"Greiðslur alls á árinu",en:"Total payments during the year",pl:"Łączne płatności w ciągu roku",sr:"Укупне исплате током године"},
  "Útborgað": {is:"Útborgað",en:"Paid out",pl:"Wypłacono",sr:"Исплаћено"},
  "Staðgreiðsla skatta, greitt nú": {is:"Staðgreiðsla skatta, greitt nú",en:"Withholding tax, current payment",pl:"Podatek u źródła, bieżąca płatność",sr:"Порез по одбитку, текућа исплата"},
  "Greiðslur alls, greitt nú": {is:"Greiðslur alls, greitt nú",en:"Total payments, current payment",pl:"Łączne płatności, bieżąca płatność",sr:"Укупне исплате, текућа исплата"},
  "Reikniregla kílómetragjalds": {is:"Reikniregla kílómetragjalds",en:"Mileage fee calculation rule",pl:"Zasada obliczania opłaty kilometrowej",sr:"Правило обрачуна километарске накнаде"},
  "Gjaldtímabil kílómetragjalds": {is:"Gjaldtímabil kílómetragjalds",en:"Mileage fee period",pl:"Okres opłaty kilometrowej",sr:"Период километарске накнаде"},
  "Greiðslufyrirkomulag": {is:"Greiðslufyrirkomulag",en:"Payment arrangement",pl:"Sposób płatności",sr:"Начин плаћања"},
  "Ökutæki sem lánið varðar": {is:"Ökutæki sem lánið varðar",en:"Vehicle associated with the loan",pl:"Pojazd związany z kredytem",sr:"Возило повезано са кредитом"},
  "Til greiðslu": {is:"Til greiðslu",en:"Amount due",pl:"Do zapłaty",sr:"За плаћање"},
  "Tilkynningar- og greiðslugjald": {is:"Tilkynningar- og greiðslugjald",en:"Notification and payment fee",pl:"Opłata za powiadomienie i płatność",sr:"Накнада за обавештење и плаћање"},
  "Fyrsti vaxtadagur": {is:"Fyrsti vaxtadagur",en:"First interest date",pl:"Pierwszy dzień naliczania odsetek",sr:"Први дан обрачуна камате"},
  "Útgáfudagur láns": {is:"Útgáfudagur láns",en:"Loan issue date",pl:"Data udzielenia kredytu",sr:"Датум издавања кредита"},
  "Upphafleg lánsfjárhæð": {is:"Upphafleg lánsfjárhæð",en:"Original loan amount",pl:"Pierwotna kwota kredytu",sr:"Почетни износ кредита"},
  "Afborgunarform": {is:"Afborgunarform",en:"Repayment method",pl:"Sposób spłaty",sr:"Начин отплате"},
  "Greiðslumáti samkvæmt skjali": {is:"Greiðslumáti samkvæmt skjali",en:"Payment method according to document",pl:"Sposób płatności zgodnie z dokumentem",sr:"Начин плаћања према документу"},
  "Veð": {is:"Veð",en:"Collateral",pl:"Zabezpieczenie",sr:"Обезбеђење"},
  "Samtals eftirstöðvar með verðbótum": {is:"Samtals eftirstöðvar með verðbótum",en:"Total outstanding balance incl. indexation",pl:"Łączne saldo zadłużenia z indeksacją",sr:"Укупно преостало стање са индексацијом"},
  "Áfallnar verðbætur eftir greiðslu": {is:"Áfallnar verðbætur eftir greiðslu",en:"Accrued indexation after payment",pl:"Narosła indeksacja po płatności",sr:"Обрачуната индексација након плаћања"},
  "Verðbætur vegna vaxta": {is:"Verðbætur vegna vaxta",en:"Indexation on interest",pl:"Indeksacja odsetek",sr:"Индексација камате"},
  "Afborgun verðbóta": {is:"Afborgun verðbóta",en:"Indexation repayment",pl:"Spłata indeksacji",sr:"Отплата индексације"},
  "Afborgun á nafnverði": {is:"Afborgun á nafnverði",en:"Nominal principal repayment",pl:"Spłata kapitału nominalnego",sr:"Отплата номиналне главнице"},
  "Breyting verðbóta frá síðasta gjalddaga": {is:"Breyting verðbóta frá síðasta gjalddaga",en:"Change in indexation since previous due date",pl:"Zmiana indeksacji od poprzedniego terminu płatności",sr:"Промена индексације од претходног доспећа"},
  "Breyting vísitölu": {is:"Breyting vísitölu",en:"Index change",pl:"Zmiana indeksu",sr:"Промена индекса"},
  "Vaxtatímabil": {is:"Vaxtatímabil",en:"Interest period",pl:"Okres odsetkowy",sr:"Каматни период"},
  "Gjalddagi af heildarfjölda": {is:"Gjalddagi af heildarfjölda",en:"Installment number of total",pl:"Numer raty z łącznej liczby",sr:"Број рате од укупног броја"},
  "Uppreiknuð upphæð": {is:"Uppreiknuð upphæð",en:"Indexed amount",pl:"Kwota po indeksacji",sr:"Индексирани износ"},
  "Útgáfudagur skuldabréfs": {is:"Útgáfudagur skuldabréfs",en:"Bond issue date",pl:"Data emisji obligacji",sr:"Датум издавања обвезнице"},
  "Tilvísun": {is:"Tilvísun",en:"Reference",pl:"Referencja",sr:"Референца"},
  "Innheimtubréf númer": {is:"Innheimtubréf númer",en:"Collection notice number",pl:"Numer wezwania do zapłaty",sr:"Број обавештења о наплати"},
  "Kröfunúmer": {is:"Kröfunúmer",en:"Claim number",pl:"Numer roszczenia",sr:"Број потраживања"},
  "Tilkynning um endurmat": {is:"Tilkynning um endurmat",en:"Reassessment notice",pl:"Zawiadomienie o ponownej ocenie",sr:"Обавештење о поновној процени"},
  "Tekjur annars staðar frá við röðun skattþrepa": {is:"Tekjur annars staðar frá við röðun skattþrepa",en:"Other income used to determine tax bracket order",pl:"Inne dochody użyte do ustalenia kolejności progów podatkowych",sr:"Други приходи за одређивање редоследа пореских разреда"},
  "Reiknuð staðgreiðsla í skattþrepi 2": {is:"Reiknuð staðgreiðsla í skattþrepi 2",en:"Tax bracket 2 – calculated withholding tax",pl:"Próg podatkowy 2 – obliczony podatek u źródła",sr:"Порески разред 2 – обрачунати порез по одбитку"},
  "Skattstofn í skattþrepi 2": {is:"Skattstofn í skattþrepi 2",en:"Tax bracket 2 – tax base",pl:"Próg podatkowy 2 – podstawa opodatkowania",sr:"Порески разред 2 – пореска основица"},
  "Reiknuð staðgreiðsla í skattþrepi 1": {is:"Reiknuð staðgreiðsla í skattþrepi 1",en:"Tax bracket 1 – calculated withholding tax",pl:"Próg podatkowy 1 – obliczony podatek u źródła",sr:"Порески разред 1 – обрачунати порез по одбитку"},
  "Skattstofn í skattþrepi 1": {is:"Skattstofn í skattþrepi 1",en:"Tax bracket 1 – tax base",pl:"Próg podatkowy 1 – podstawa opodatkowania",sr:"Порески разред 1 – пореска основица"},
  "Staðgreiðsla skatta – greitt nú": {is:"Staðgreiðsla skatta – greitt nú",en:"Withholding tax, current payment",pl:"Podatek u źródła, bieżąca płatność",sr:"Порез по одбитку, текућа исплата"},
  "Greiðslur alls – greitt nú": {is:"Greiðslur alls – greitt nú",en:"Total payments, current payment",pl:"Łączne płatności, bieżąca płatność",sr:"Укупне исплате, текућа исплата"},
  "Tilvísun í skýringu kílómetragjalds": {is:"Tilvísun í skýringu kílómetragjalds",en:"Mileage fee adjustment reference",pl:"Odwołanie do korekty opłaty kilometrowej",sr:"Референца корекције километарске накнаде"},
  "Skráningarnúmer ökutækis": {is:"Skráningarnúmer ökutækis",en:"Vehicle registration number",pl:"Numer rejestracyjny pojazdu",sr:"Регистарски број возила"},
  "Breyting kílómetragjalds": {is:"Breyting kílómetragjalds",en:"Mileage fee adjustment",pl:"Korekta opłaty kilometrowej",sr:"Корекција километарске накнаде"}
};

const unitLabels: Record<InnsynDisplayLanguage, Record<string,string>> = {
  is:{percent:"prósent",PERCENT:"PRÓSENT",minutes:"mínútur",mínútur:"mínútur",messages:"skilaboð",skilaboð:"skilaboð",thousand:"þúsund",þúsund:"þúsund",days:"dagar",DAYS:"DAGAR",dagar:"dagar"},
  en:{percent:"percent",PERCENT:"PERCENT",minutes:"minutes",mínútur:"minutes",messages:"messages",skilaboð:"messages",thousand:"thousand",þúsund:"thousand",days:"days",DAYS:"DAYS",dagar:"days"},
  pl:{percent:"procent",PERCENT:"PROCENT",minutes:"minut",mínútur:"minut",messages:"wiadomości",skilaboð:"wiadomości",thousand:"tys.",þúsund:"tys.",days:"dni",DAYS:"DNI",dagar:"dni"},
  sr:{percent:"проценат",PERCENT:"ПРОЦЕНАТ",minutes:"минута",mínútur:"минута",messages:"порука",skilaboð:"порука",thousand:"хиљада",þúsund:"хиљада",days:"дана",DAYS:"ДАНА",dagar:"дана"}
};

export function innsynCodeLabel(value: string | null | undefined, language: string | null | undefined) {
  if (!value) return "";
  const lang = displayLanguage(language);
  const normalized = value.trim().toUpperCase();
  if (codeLabels[lang][normalized]) return codeLabels[lang][normalized];
  return value.toLowerCase().split("_").map((part) => part ? part.charAt(0).toUpperCase()+part.slice(1) : part).join(" ");
}

const icelandicMonths: Record<string, Record<InnsynDisplayLanguage, string>> = {
  "janúar": {is:"janúar",en:"January",pl:"styczeń",sr:"јануар"},
  "febrúar": {is:"febrúar",en:"February",pl:"luty",sr:"фебруар"},
  "mars": {is:"mars",en:"March",pl:"marzec",sr:"март"},
  "apríl": {is:"apríl",en:"April",pl:"kwiecień",sr:"април"},
  "maí": {is:"maí",en:"May",pl:"maj",sr:"мај"},
  "júní": {is:"júní",en:"June",pl:"czerwiec",sr:"јун"},
  "júlí": {is:"júlí",en:"July",pl:"lipiec",sr:"јул"},
  "ágúst": {is:"ágúst",en:"August",pl:"sierpień",sr:"август"},
  "september": {is:"september",en:"September",pl:"wrzesień",sr:"септембар"},
  "október": {is:"október",en:"October",pl:"październik",sr:"октобар"},
  "nóvember": {is:"nóvember",en:"November",pl:"listopad",sr:"новембар"},
  "desember": {is:"desember",en:"December",pl:"grudzień",sr:"децембар"}
};

function localizedIcelandicMonthText(value: string, lang: InnsynDisplayLanguage) {
  return value.replace(/(?<![A-Za-zÁÉÍÓÚÝÞÆÖáðéíóúýþæö])(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)(?![A-Za-zÁÉÍÓÚÝÞÆÖáðéíóúýþæö])/gi, (month) => {
    const key=month.toLocaleLowerCase("is-IS");
    return icelandicMonths[key]?.[lang] ?? month;
  });
}

const patternedFactLabels: Array<{
  pattern: RegExp;
  render: (match: RegExpMatchArray, lang: InnsynDisplayLanguage) => string;
}> = [
  { pattern: /^Bifreiðagjald · (.+)$/, render: (m,lang) => ({is:`Bifreiðagjald · ${m[1]}`,en:`Vehicle fee · ${m[1]}`,pl:`Opłata za pojazd · ${m[1]}`,sr:`Накнада за возило · ${m[1]}`}[lang]) },
  { pattern: /^Skilagjald · (.+)$/, render: (m,lang) => ({is:`Skilagjald · ${m[1]}`,en:`Refund fee · ${m[1]}`,pl:`Opłata zwrotna · ${m[1]}`,sr:`Повратна накнада · ${m[1]}`}[lang]) },
  { pattern: /^Netnotkun innanlands(\s*\(.+\))$/, render: (m,lang) => `${factLabels["Netnotkun innanlands"][lang]}${m[1]}` },
  { pattern: /^Send skilaboð innanlands(\s*\(.+\))$/, render: (m,lang) => `${factLabels["Send skilaboð innanlands"][lang]}${m[1]}` },
  { pattern: /^Innifalin símtöl(\s*\(.+\))$/, render: (m,lang) => `${factLabels["Innifalin símtöl"][lang]}${m[1]}` },
  { pattern: /^Farsími Ótakmarkað(\s*\(.+\))$/, render: (m,lang) => `${{is:"Farsími Ótakmarkað",en:"Unlimited mobile",pl:"Nielimitowany telefon komórkowy",sr:"Неограничени мобилни"}[lang]}${m[1]}` },
  { pattern: /^Gjalddagi (\d+) af (\d+)$/, render: (m,lang) => ({is:`Gjalddagi ${m[1]} af ${m[2]}`,en:`Due date ${m[1]} of ${m[2]}`,pl:`Termin płatności ${m[1]} z ${m[2]}`,sr:`Доспеће ${m[1]} од ${m[2]}`}[lang]) },
  { pattern: /^Greiðsluhlutfall (.+)$/, render: (m,lang) => ({is:`Greiðsluhlutfall ${m[1]}`,en:`Payment share — ${m[1]}`,pl:`Udział w płatności — ${m[1]}`,sr:`Удео у плаћању — ${m[1]}`}[lang]) },
  { pattern: /^Eignarhlutfall (.+)$/, render: (m,lang) => ({is:`Eignarhlutfall ${m[1]}`,en:`Ownership share — ${m[1]}`,pl:`Udział własności — ${m[1]}`,sr:`Власнички удео — ${m[1]}`}[lang]) },
  { pattern: /^Rafmagnsdreifing frá (.+), samtals með VSK$/, render: (m,lang) => ({is:`Rafmagnsdreifing frá ${m[1]}, samtals með VSK`,en:`Electricity distribution from ${m[1]}, total incl. VAT`,pl:`Dystrybucja energii od ${m[1]}, razem z VAT`,sr:`Дистрибуција електричне енергије од ${m[1]}, укупно са ПДВ-ом`}[lang]) },
  { pattern: /^Hitaveita frá (.+), samtals með VSK$/, render: (m,lang) => ({is:`Hitaveita frá ${m[1]}, samtals með VSK`,en:`District heating from ${m[1]}, total incl. VAT`,pl:`Ogrzewanie od ${m[1]}, razem z VAT`,sr:`Даљинско грејање од ${m[1]}, укупно са ПДВ-ом`}[lang]) },
  { pattern: /^Rafmagn frá (.+), samtals með VSK$/, render: (m,lang) => ({is:`Rafmagn frá ${m[1]}, samtals með VSK`,en:`Electricity from ${m[1]}, total incl. VAT`,pl:`Energia elektryczna od ${m[1]}, razem z VAT`,sr:`Електрична енергија од ${m[1]}, укупно са ПДВ-ом`}[lang]) },
  { pattern: /^Skattþrep (\d+) – reiknuð staðgreiðsla$/, render: (m,lang) => ({is:`Skattþrep ${m[1]} – reiknuð staðgreiðsla`,en:`Tax bracket ${m[1]} – calculated withholding tax`,pl:`Próg podatkowy ${m[1]} – obliczony podatek u źródła`,sr:`Порески разред ${m[1]} – обрачунати порез по одбитку`}[lang]) },
  { pattern: /^Skattþrep (\d+) – skattstofn$/, render: (m,lang) => ({is:`Skattþrep ${m[1]} – skattstofn`,en:`Tax bracket ${m[1]} – tax base`,pl:`Próg podatkowy ${m[1]} – podstawa opodatkowania`,sr:`Порески разред ${m[1]} – пореска основица`}[lang]) },
  { pattern: /^Skattþrep (\d+)$/, render: (m,lang) => ({is:`Skattþrep ${m[1]}`,en:`Tax bracket ${m[1]}`,pl:`Próg podatkowy ${m[1]}`,sr:`Порески разред ${m[1]}`}[lang]) },
  { pattern: /^(FESTA|Gildi) – örorkulífeyrisuppbót á árinu$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrisuppbót á árinu`,en:`${m[1]} – disability pension supplement during the year`,pl:`${m[1]} – dodatek do renty z tytułu niezdolności do pracy w ciągu roku`,sr:`${m[1]} – додатак инвалидској пензији током године`}[lang]) },
  { pattern: /^(FESTA|Gildi) – örorkulífeyrir á árinu$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrir á árinu`,en:`${m[1]} – disability pension during the year`,pl:`${m[1]} – renta z tytułu niezdolności do pracy w ciągu roku`,sr:`${m[1]} – инвалидска пензија током године`}[lang]) },
  { pattern: /^(FESTA|Gildi) – barnalífeyrir á árinu; engin fjárhæð sýnd í dálkinum Greitt nú$/, render: (m,lang) => ({is:`${m[1]} – barnalífeyrir á árinu; engin fjárhæð sýnd í dálkinum Greitt nú`,en:`${m[1]} – child pension during the year; no amount shown in the Current payment column`,pl:`${m[1]} – renta rodzinna na dziecko w ciągu roku; brak kwoty w kolumnie Bieżąca płatność`,sr:`${m[1]} – дечја пензија током године; нема износа у колони Текућа исплата`}[lang]) },
  { pattern: /^(FESTA|Gildi) – örorkulífeyrisuppbót í (.+), greitt nú$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrisuppbót í ${m[2]}, greitt nú`,en:`${m[1]} – disability pension supplement in ${localizedIcelandicMonthText(m[2],lang)}, current payment`,pl:`${m[1]} – dodatek do renty z tytułu niezdolności do pracy w ${localizedIcelandicMonthText(m[2],lang)}, bieżąca płatność`,sr:`${m[1]} – додатак инвалидској пензији у ${localizedIcelandicMonthText(m[2],lang)}, текућа исплата`}[lang]) },
  { pattern: /^(FESTA|Gildi) – örorkulífeyrir í (.+), greitt nú$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrir í ${m[2]}, greitt nú`,en:`${m[1]} – disability pension in ${localizedIcelandicMonthText(m[2],lang)}, current payment`,pl:`${m[1]} – renta z tytułu niezdolności do pracy w ${localizedIcelandicMonthText(m[2],lang)}, bieżąca płatność`,sr:`${m[1]} – инвалидска пензија у ${localizedIcelandicMonthText(m[2],lang)}, текућа исплата`}[lang]) },
  { pattern: /^(.+?) · (.+?) · kílómetragjald$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · kílómetragjald`,en:`${m[1]} · ${m[2]} · mileage fee`,pl:`${m[1]} · ${m[2]} · opłata kilometrowa`,sr:`${m[1]} · ${m[2]} · километарска накнада`}[lang]) },
  { pattern: /^(.+?) · (.+?) · gjald á kílómetra$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · gjald á kílómetra`,en:`${m[1]} · ${m[2]} · fee per kilometre`,pl:`${m[1]} · ${m[2]} · opłata za kilometr`,sr:`${m[1]} · ${m[2]} · накнада по километру`}[lang]) },
  { pattern: /^(.+?) · (.+?) · reiknaður akstur$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · reiknaður akstur`,en:`${m[1]} · ${m[2]} · calculated distance`,pl:`${m[1]} · ${m[2]} · obliczony przebieg`,sr:`${m[1]} · ${m[2]} · обрачуната километража`}[lang]) },
  { pattern: /^Vátryggingartímabil skírteinis (.+)$/, render: (m,lang) => ({is:`Vátryggingartímabil skírteinis ${m[1]}`,en:`Insurance period for policy ${m[1]}`,pl:`Okres ubezpieczenia polisy ${m[1]}`,sr:`Период осигурања полисе ${m[1]}`}[lang]) },
  { pattern: /^Samtals greitt vegna skírteinis (.+)$/, render: (m,lang) => ({is:`Samtals greitt vegna skírteinis ${m[1]}`,en:`Total paid for policy ${m[1]}`,pl:`Łącznie zapłacono za polisę ${m[1]}`,sr:`Укупно плаћено за полису ${m[1]}`}[lang]) },
  { pattern: /^Greiðsludreifingarkostnaður · skírteini (.+)$/, render: (m,lang) => ({is:`Greiðsludreifingarkostnaður · skírteini ${m[1]}`,en:`Payment plan fee · policy ${m[1]}`,pl:`Opłata za rozłożenie płatności · polisa ${m[1]}`,sr:`Накнада за расподелу плаћања · полиса ${m[1]}`}[lang]) },
  { pattern: /^(.+?) · (.+?) · Lögboðin ökutækjatrygging$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · Lögboðin ökutækjatrygging`,en:`${m[1]} · ${m[2]} · Mandatory motor insurance`,pl:`${m[1]} · ${m[2]} · Obowiązkowe ubezpieczenie pojazdu`,sr:`${m[1]} · ${m[2]} · Обавезно осигурање возила`}[lang]) },
  { pattern: /^(.+?) · (.+?) · Kaskótrygging ökutækis$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · Kaskótrygging ökutækis`,en:`${m[1]} · ${m[2]} · Comprehensive motor insurance`,pl:`${m[1]} · ${m[2]} · Ubezpieczenie autocasco`,sr:`${m[1]} · ${m[2]} · Каско осигурање возила`}[lang]) },
  { pattern: /^(.+?) · (.+?) · Barnatrygging$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · Barnatrygging`,en:`${m[1]} · ${m[2]} · Child insurance`,pl:`${m[1]} · ${m[2]} · Ubezpieczenie dziecka`,sr:`${m[1]} · ${m[2]} · Осигурање детета`}[lang]) },
  { pattern: /^Vaxtatímabil, (.+)$/, render: (m,lang) => { const duration=m[1].replace(/^(\d+) dagar$/, (_v,n) => ({is:`${n} dagar`,en:`${n} days`,pl:`${n} dni`,sr:`${n} дана`}[lang])); return ({is:`Vaxtatímabil, ${duration}`,en:`Interest period, ${duration}`,pl:`Okres odsetkowy, ${duration}`,sr:`Каматни период, ${duration}`}[lang]); } },
  { pattern: /^(Festa|Gildi) – örorkulífeyrisuppbót á árinu$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrisuppbót á árinu`,en:`${m[1]} – disability pension supplement during the year`,pl:`${m[1]} – dodatek do renty z tytułu niezdolności do pracy w ciągu roku`,sr:`${m[1]} – додатак инвалидској пензији током године`}[lang]) },
  { pattern: /^(Festa|Gildi) – örorkulífeyrir á árinu$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrir á árinu`,en:`${m[1]} – disability pension during the year`,pl:`${m[1]} – renta z tytułu niezdolności do pracy w ciągu roku`,sr:`${m[1]} – инвалидска пензија током године`}[lang]) },
  { pattern: /^(Festa|Gildi) – barnalífeyrir á árinu, ekki greitt nú$/, render: (m,lang) => ({is:`${m[1]} – barnalífeyrir á árinu, ekki greitt nú`,en:`${m[1]} – child pension during the year, not paid in current payment`,pl:`${m[1]} – renta rodzinna na dziecko w ciągu roku, nie wypłacono w bieżącej płatności`,sr:`${m[1]} – дечја пензија током године, није исплаћена у текућој исплати`}[lang]) },
  { pattern: /^(Festa|Gildi) – örorkulífeyrisuppbót í (.+)$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrisuppbót í ${m[2]}`,en:`${m[1]} – disability pension supplement in ${localizedIcelandicMonthText(m[2],lang)}`,pl:`${m[1]} – dodatek do renty z tytułu niezdolności do pracy w ${localizedIcelandicMonthText(m[2],lang)}`,sr:`${m[1]} – додатак инвалидској пензији у ${localizedIcelandicMonthText(m[2],lang)}`}[lang]) },
  { pattern: /^(Festa|Gildi) – örorkulífeyrir í (.+)$/, render: (m,lang) => ({is:`${m[1]} – örorkulífeyrir í ${m[2]}`,en:`${m[1]} – disability pension in ${localizedIcelandicMonthText(m[2],lang)}`,pl:`${m[1]} – renta z tytułu niezdolności do pracy w ${localizedIcelandicMonthText(m[2],lang)}`,sr:`${m[1]} – инвалидска пензија у ${localizedIcelandicMonthText(m[2],lang)}`}[lang]) },
  { pattern: /^Kílómetragjald fyrir (.+)$/, render: (m,lang) => ({is:`Kílómetragjald fyrir ${m[1]}`,en:`Mileage fee for ${m[1]}`,pl:`Opłata kilometrowa dla ${m[1]}`,sr:`Километарска накнада за ${m[1]}`}[lang]) },
  { pattern: /^Breyting á akstursvegalengd fyrir (.+)$/, render: (m,lang) => ({is:`Breyting á akstursvegalengd fyrir ${m[1]}`,en:`Distance adjustment for ${m[1]}`,pl:`Korekta przebiegu dla ${m[1]}`,sr:`Корекција километраже за ${m[1]}`}[lang]) },
  { pattern: /^(.+?) · (.+?) · vegalengd$/, render: (m,lang) => ({is:`${m[1]} · ${m[2]} · vegalengd`,en:`${m[1]} · ${m[2]} · distance`,pl:`${m[1]} · ${m[2]} · przebieg`,sr:`${m[1]} · ${m[2]} · километража`}[lang]) },
  { pattern: /^Eindagi samkvæmt skilmála:\s*(.+)$/, render: (m,lang) => { const v=m[1].replace(/^2\. dagur næsta mánaðar$/,({is:"2. dagur næsta mánaðar",en:"2nd day of the following month",pl:"2. dzień następnego miesiąca",sr:"2. дан наредног месеца"}[lang])); return ({is:`Eindagi samkvæmt skilmála: ${v}`,en:`Final due date according to terms: ${v}`,pl:`Końcowy termin zgodnie z warunkami: ${v}`,sr:`Крајњи рок према условима: ${v}`}[lang]); } },
];

export function innsynFactLabel(value: string | null | undefined, language: string | null | undefined) {
  if (!value) return "";
  const lang=displayLanguage(language);
  const exact = factLabels[value]?.[lang];
  if (exact) return exact;
  for (const entry of patternedFactLabels) {
    const match=value.match(entry.pattern);
    if (match) return entry.render(match,lang);
  }
  return value;
}

const exactFactValues: Record<string, Record<InnsynDisplayLanguage,string>> = {
  "Greiðsluseðill": {is:"Greiðsluseðill",en:"Payment slip",pl:"Blankiet płatniczy",sr:"Уплатница"},
  "Dísel": {is:"Dísel",en:"Diesel",pl:"Olej napędowy",sr:"Дизел"},
  "Rafmagn": {is:"Rafmagn",en:"Electric",pl:"Elektryczny",sr:"Електрични погон"},
  "Einbýlishús": {is:"Einbýlishús",en:"Detached house",pl:"Dom jednorodzinny",sr:"Самостојећа породична кућа"},
  "Óskilgreint": {is:"Óskilgreint",en:"Unspecified",pl:"Nieokreślone",sr:"Није наведено"},
  "Verður skuldfært": {is:"Verður skuldfært",en:"Will be debited",pl:"Zostanie pobrane z rachunku",sr:"Биће задужено"},
  "Annuitets afborgun": {is:"Annuitets afborgun",en:"Annuity repayment",pl:"Rata annuitetowa",sr:"Ануитетна отплата"},
  "Jafnar greiðslur": {is:"Jafnar greiðslur",en:"Equal payments",pl:"Równe płatności",sr:"Једнаке рате"},
  "Meðalakstur á dag × fjöldi daga á tímabili × gjald á kílómetra": {is:"Meðalakstur á dag × fjöldi daga á tímabili × gjald á kílómetra",en:"Average daily distance × number of days in period × fee per kilometre",pl:"Średni dzienny przebieg × liczba dni w okresie × opłata za kilometr",sr:"Просечна дневна километража × број дана у периоду × накнада по километру"}
};

export function innsynFactValue(
  value: string | null | undefined,
  label: string | null | undefined,
  language: string | null | undefined
) {
  if (!value) return "";
  const lang=displayLanguage(language);
  if (lang === "is") return value;

  const exact=exactFactValues[value]?.[lang];
  if (exact) return exact;

  // Standard month/year period values such as "ágúst 2026".
  if (/^(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)\s+20\d{2}$/i.test(value.trim())) {
    return localizedIcelandicMonthText(value,lang);
  }

  // Standard index-change value, while preserving the numeric values.
  const indexChange=value.match(/^úr\s+(.+?)\s+í\s+(.+?)\s+stig$/i);
  if (indexChange) {
    return ({en:`from ${indexChange[1]} to ${indexChange[2]} points`,pl:`z ${indexChange[1]} do ${indexChange[2]} punktów`,sr:`са ${indexChange[1]} на ${indexChange[2]} поена`,is:value}[lang]);
  }

  // Known reassessment notice: translate the fixed wording, preserve the fund name.
  const reassessment=value.match(/^(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)\s+(20\d{2}):\s+endurmat á örorku hjá (.+)$/i);
  if (reassessment) {
    const period=localizedIcelandicMonthText(`${reassessment[1]} ${reassessment[2]}`,lang);
    return ({en:`${period}: disability reassessment by ${reassessment[3]}`,pl:`${period}: ponowna ocena niezdolności do pracy przez ${reassessment[3]}`,sr:`${period}: поновна процена инвалидности од стране ${reassessment[3]}`,is:value}[lang]);
  }

  // Standardized installment progress, while preserving the numbers.
  const installment=value.match(/^(\d+) af (\d+)$/);
  if (installment) {
    return ({en:`${installment[1]} of ${installment[2]}`,pl:`${installment[1]} z ${installment[2]}`,sr:`${installment[1]} од ${installment[2]}`,is:value}[lang]);
  }

  // Insurance date range emitted by the analyzer.
  const dateRange=value.match(/^(\d{4}-\d{2}-\d{2}) til (\d{4}-\d{2}-\d{2})$/);
  if (dateRange) {
    return ({en:`${dateRange[1]} to ${dateRange[2]}`,pl:`${dateRange[1]} do ${dateRange[2]}`,sr:`${dateRange[1]} до ${dateRange[2]}`,is:value}[lang]);
  }

  // Interest-period explanatory sentence: translate only the fixed wording and keep dates intact.
  const interestSentence=value.match(/^Vextir reiknast frá og með (\d{2}\.\d{2}\.\d{4}) til gjalddaga$/);
  if (interestSentence) {
    return ({en:`Interest is calculated from ${interestSentence[1]} through the due date`,pl:`Odsetki są naliczane od ${interestSentence[1]} do terminu płatności`,sr:`Камата се обрачунава од ${interestSentence[1]} до датума доспећа`,is:value}[lang]);
  }

  // A duration such as "30 dagar" is translated only in the known interest-period context.
  if (label?.startsWith("Vaxtatímabil")) {
    const days=value.match(/^(\d+) dagar$/);
    if (days) return ({en:`${days[1]} days`,pl:`${days[1]} dni`,sr:`${days[1]} дана`,is:value}[lang]);
  }

  // Some older facts store a formatted amount as text instead of number + unit.
  const thousandAmount=value.match(/^(.+?)\s+þúsund\s+ISK$/i);
  if (thousandAmount) {
    return ({en:`${thousandAmount[1]} thousand ISK`,pl:`${thousandAmount[1]} tys. ISK`,sr:`${thousandAmount[1]} хиљада ISK`,is:value}[lang]);
  }

  return value;
}

export function innsynUnitLabel(value: string | null | undefined, language: string | null | undefined) {
  if (!value) return "";
  const lang=displayLanguage(language);
  const trimmed=value.trim();
  return unitLabels[lang][trimmed] ?? unitLabels[lang][trimmed.toLowerCase()] ?? value;
}

export function innsynUnconfirmedPayer(language: string | null | undefined) {
  const lang=displayLanguage(language);
  return {is:"Óstaðfestur greiðandi",en:"Unconfirmed payer",pl:"Niepotwierdzony płatnik",sr:"Непотврђени платилац"}[lang];
}

export function innsynInsuranceCount(count:number, language:string|null|undefined) {
  const lang=displayLanguage(language);
  if (lang==="en") return `${count} ${count===1?"policy":"policies"}`;
  if (lang==="pl") return `${count} ${count===1?"polisa":"polis"}`;
  if (lang==="sr") return `${count} ${count===1?"полиса":"полиса"}`;
  return `${count} ${count===1?"trygging":"tryggingar"}`;
}
