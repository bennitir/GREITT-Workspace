import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "Verk", overviewDescription: "Yfirlit yfir verk, stöðu þeirra og verkasögu.", newWork: "＋ Nýtt verk",
    allWork: "Öll verk", newWorks: "Ný verk", inProgress: "Í vinnu", completed: "Lokið", workList: "Verklisti",
    newestFirst: "Nýjustu verk efst.", noWork: "Engin verk skráð", noWorkHelp: "Byrjaðu á að stofna fyrsta verkið.", createFirst: "＋ Stofna nýtt verk",
    priority: "Forgangur", openWork: "Opna verk", statusNew: "Nýtt", statusInProgress: "Í vinnu", statusCompleted: "Lokið",
    priorityLow: "Lágur", priorityNormal: "Venjulegur", priorityHigh: "Mikill", priorityUrgent: "Brýnt",
    newTitle: "Nýtt verk", newDescription: "Skráðu nýtt verk fyrir virkt fyrirtæki.", workNumber: "Verknúmer", workNumberPlaceholder: "Valkvætt – GLÖGGT úthlutar ef autt", workKey: "Verklykill", workKeyPlaceholder: "Valkvætt samhengi / flokkun", workTitle: "Heiti verks", workTitlePlaceholder: "T.d. Viðgerð á hitakerfi",
    address: "Heimilisfang", addressPlaceholder: "Byrjaðu að skrifa stað eða heimilisfang", operationalLocation: "Verkstaður / staðsetning", operationalLocationHelp: "Byrjaðu að skrifa. GLÖGGT stingur fyrst upp á þekktum stöðum fyrirtækisins og nýlegum verkstöðum.", workResourcesAtCreate: "Tæki / vinnuvélar á Verk", workResourcesAtCreateHelp: "Veldu tæki sem á að fylgja Verkinu. Ferðamáti og ferðahraði vinnuvéla fara sjálfkrafa inn í Dagsmönnun.", companyWorkBase: "Sjálfgefin starfsstöð fyrirtækis", companyWorkBaseMissing: "Engin sjálfgefin starfsstöð skráð", description: "Lýsing", descriptionPlaceholder: "Lýstu verkinu...", saveWork: "Vista verk", cancel: "Hætta við",
    detailDescription: "Upplýsingar um verk.", status: "Staða", notRegistered: "Ekki skráð", noDescription: "Engin lýsing skráð", created: "Stofnað", started: "Verk hafið", finished: "Verki lokið", createdBy: "Stofnað af",
    workStatus: "Verkstaða", workHours: "Verkstundir", noWorkHours: "Engar verkstundir skráðar enn.", unknownEmployee: "Óskráður starfsmaður", timeNotCalculated: "Tími ekki reiknaður",
    employee: "Starfsmaður", chooseEmployee: "Veldu starfsmann", date: "Dagsetning", from: "Frá", to: "Til", breakMinutes: "Hlé í mínútum", whatWasDone: "Hvað var unnið?", saveWorkHour: "Vista verkstund", saveChanges: "Vista breytingar", edit: "Breyta", closeEdit: "Loka breytingu",
    requiredPeople: "Fjöldi starfsmanna", requiredPeopleHelp: "Hversu marga þarf að manna í Verkið.", estimatedTime: "Áætlaður vinnutími", estimatedHours: "Klst.", estimatedMinutes: "Mín.", plannedDate: "Áætlaður dagur", plannedDateHelp: "Valkvætt. Verk án dags birtist áfram í Verklista en ekki á dagskipulagi.", plannedStartTime: "Áætlað upphaf", plannedStartTimeHelp: "Skildu autt ef Verkið á að vera á þessum degi en klukkan er ekki ákveðin.", completionDeadlineDate: "Klárað fyrir – dagsetning", completionDeadlineTime: "Klárað fyrir – klukkan", completionDeadlineHelp: "Valkvætt skuldbundið lokamark. Þegar nær dregur hækkar Verkið sjálfkrafa í röðun Dagsmönnunar.", allowAfterWorkdayEnd: "Heimilt að fara fram yfir dagslok", allowAfterWorkdayEndHelp: "Undantekning frá venjulegum dagslokum. Skráðu ástæðu svo frávikið sé rekjanlegt.", workdayEndExceptionReason: "Ástæða dagsloka-undantekningar", workdayEndExceptionReasonPlaceholder: "T.d. brýnt Verk, ekki má stöðva, samþykkt frávik", photoRequirement: "Myndakrafa", photoRequirementHelp: "Sjálfgefið er engin myndakrafa. Veldu aðeins þar sem staðfesting með mynd er nauðsynleg.", photoNone: "Engin", photoStart: "Mynd áður en vinna hefst", photoProgress: "Mynd af stöðu / framvindu", photoPartComplete: "Mynd áður en Verkþætti er lokið", photoWorkComplete: "Mynd áður en Verki er lokað",
    hoursShort: "klst.", minutesShort: "mín."
  },
  en: {
    title: "Work", overviewDescription: "Overview of work orders, their status and work history.", newWork: "＋ New work order",
    allWork: "All work", newWorks: "New", inProgress: "In progress", completed: "Completed", workList: "Work orders",
    newestFirst: "Newest work orders first.", noWork: "No work orders", noWorkHelp: "Start by creating the first work order.", createFirst: "＋ Create work order",
    priority: "Priority", openWork: "Open work order", statusNew: "New", statusInProgress: "In progress", statusCompleted: "Completed",
    priorityLow: "Low", priorityNormal: "Normal", priorityHigh: "High", priorityUrgent: "Urgent",
    newTitle: "New work order", newDescription: "Create a new work order for the active company.", workNumber: "Work number", workNumberPlaceholder: "Optional – GLÖGGT assigns one if blank", workKey: "Work key", workKeyPlaceholder: "Optional context / classification", workTitle: "Work order title", workTitlePlaceholder: "E.g. Repair heating system",
    address: "Address", addressPlaceholder: "Start typing a place or address", operationalLocation: "Work site / location", operationalLocationHelp: "Start typing. GLÖGGT suggests known company locations and recent work sites first.", workResourcesAtCreate: "Equipment / machinery for Work", workResourcesAtCreateHelp: "Choose equipment that should follow the Work item. Machinery travel mode and speed automatically feed daily scheduling.", companyWorkBase: "Company default work base", companyWorkBaseMissing: "No default work base registered", description: "Description", descriptionPlaceholder: "Describe the work...", saveWork: "Save work order", cancel: "Cancel",
    detailDescription: "Work order information.", status: "Status", notRegistered: "Not registered", noDescription: "No description registered", created: "Created", started: "Work started", finished: "Work completed", createdBy: "Created by",
    workStatus: "Work status", workHours: "Work hours", noWorkHours: "No work hours recorded yet.", unknownEmployee: "Unspecified employee", timeNotCalculated: "Time not calculated",
    employee: "Employee", chooseEmployee: "Choose employee", date: "Date", from: "From", to: "To", breakMinutes: "Break in minutes", whatWasDone: "What was done?", saveWorkHour: "Save work hours", saveChanges: "Save changes", edit: "Edit", closeEdit: "Close editing",
    requiredPeople: "People required", requiredPeopleHelp: "How many employees are needed for this Work.", estimatedTime: "Estimated work time", estimatedHours: "Hours", estimatedMinutes: "Minutes", plannedDate: "Planned day", plannedDateHelp: "Optional. Work without a day remains in the Work list but is not placed on the daily schedule.", plannedStartTime: "Planned start", plannedStartTimeHelp: "Leave blank when the Work belongs on that day but the clock time has not been decided.", completionDeadlineDate: "Complete by – date", completionDeadlineTime: "Complete by – time", completionDeadlineHelp: "Optional committed completion deadline. The Work rises automatically in daily scheduling as available slack shrinks.", allowAfterWorkdayEnd: "May run past the normal workday end", allowAfterWorkdayEndHelp: "Exception to the normal workday end. Record a reason so the deviation is traceable.", workdayEndExceptionReason: "Reason for workday-end exception", workdayEndExceptionReasonPlaceholder: "E.g. urgent Work, cannot stop, approved exception", photoRequirement: "Photo requirement", photoRequirementHelp: "No photo is required by default. Enable this only where photo evidence is needed.", photoNone: "None", photoStart: "Photo before work starts", photoProgress: "Progress / status photo", photoPartComplete: "Photo before completing a work part", photoWorkComplete: "Photo before closing the Work",
    hoursShort: "h", minutesShort: "min"
  },
  pl: {
    title: "Zadania", overviewDescription: "Przegląd zadań, ich statusu i historii pracy.", newWork: "＋ Nowe zadanie",
    allWork: "Wszystkie zadania", newWorks: "Nowe", inProgress: "W toku", completed: "Zakończone", workList: "Lista zadań",
    newestFirst: "Najnowsze zadania na górze.", noWork: "Brak zadań", noWorkHelp: "Zacznij od utworzenia pierwszego zadania.", createFirst: "＋ Utwórz zadanie",
    priority: "Priorytet", openWork: "Otwórz zadanie", statusNew: "Nowe", statusInProgress: "W toku", statusCompleted: "Zakończone",
    priorityLow: "Niski", priorityNormal: "Normalny", priorityHigh: "Wysoki", priorityUrgent: "Pilny",
    newTitle: "Nowe zadanie", newDescription: "Utwórz nowe zadanie dla aktywnej firmy.", workNumber: "Numer zadania", workNumberPlaceholder: "Opcjonalnie – GLÖGGT nada numer, jeśli pole będzie puste", workKey: "Klucz zadania", workKeyPlaceholder: "Opcjonalny kontekst / klasyfikacja", workTitle: "Nazwa zadania", workTitlePlaceholder: "Np. naprawa instalacji grzewczej",
    address: "Adres", addressPlaceholder: "Zacznij wpisywać miejsce lub adres", operationalLocation: "Miejsce pracy / lokalizacja", operationalLocationHelp: "Zacznij pisać. GLÖGGT najpierw podpowiada znane lokalizacje firmy i ostatnie miejsca pracy.", workResourcesAtCreate: "Sprzęt / maszyny dla zadania", workResourcesAtCreateHelp: "Wybierz sprzęt przypisany do zadania. Sposób przemieszczania i prędkość maszyn automatycznie trafiają do planowania dnia.", companyWorkBase: "Domyślna baza firmy", companyWorkBaseMissing: "Brak domyślnej bazy pracy", description: "Opis", descriptionPlaceholder: "Opisz zadanie...", saveWork: "Zapisz zadanie", cancel: "Anuluj",
    detailDescription: "Informacje o zadaniu.", status: "Status", notRegistered: "Nie podano", noDescription: "Brak opisu", created: "Utworzono", started: "Rozpoczęto", finished: "Zakończono", createdBy: "Utworzone przez",
    workStatus: "Status zadania", workHours: "Czas pracy", noWorkHours: "Nie zarejestrowano jeszcze czasu pracy.", unknownEmployee: "Nieokreślony pracownik", timeNotCalculated: "Czas nie został obliczony",
    employee: "Pracownik", chooseEmployee: "Wybierz pracownika", date: "Data", from: "Od", to: "Do", breakMinutes: "Przerwa w minutach", whatWasDone: "Co zostało wykonane?", saveWorkHour: "Zapisz czas pracy", saveChanges: "Zapisz zmiany", edit: "Edytuj", closeEdit: "Zamknij edycję",
    requiredPeople: "Wymagana liczba pracowników", requiredPeopleHelp: "Ilu pracowników potrzeba do wykonania tej pracy.", estimatedTime: "Szacowany czas pracy", estimatedHours: "Godziny", estimatedMinutes: "Minuty", plannedDate: "Planowany dzień", plannedDateHelp: "Opcjonalnie. Zadanie bez dnia pozostaje na liście, ale nie jest umieszczane w planie dnia.", plannedStartTime: "Planowane rozpoczęcie", plannedStartTimeHelp: "Pozostaw puste, jeśli zadanie ma być tego dnia, ale godzina nie została jeszcze ustalona.", completionDeadlineDate: "Zakończyć do – data", completionDeadlineTime: "Zakończyć do – godzina", completionDeadlineHelp: "Opcjonalny wiążący termin zakończenia. Wraz ze zmniejszaniem się zapasu czasu zadanie automatycznie rośnie w kolejności planowania.", allowAfterWorkdayEnd: "Można przekroczyć standardowy koniec dnia pracy", allowAfterWorkdayEndHelp: "Wyjątek od zwykłego końca dnia pracy. Podaj powód, aby odstępstwo było możliwe do prześledzenia.", workdayEndExceptionReason: "Powód wyjątku po końcu dnia pracy", workdayEndExceptionReasonPlaceholder: "Np. pilne zadanie, nie można przerwać, zatwierdzony wyjątek", photoRequirement: "Wymaganie zdjęcia", photoRequirementHelp: "Domyślnie zdjęcie nie jest wymagane. Włącz tylko tam, gdzie potrzebne jest potwierdzenie zdjęciem.", photoNone: "Brak", photoStart: "Zdjęcie przed rozpoczęciem pracy", photoProgress: "Zdjęcie postępu / stanu", photoPartComplete: "Zdjęcie przed zakończeniem etapu", photoWorkComplete: "Zdjęcie przed zamknięciem pracy",
    hoursShort: "godz.", minutesShort: "min"
  },
  sr: {
    title: "Послови", overviewDescription: "Преглед послова, њиховог статуса и историје рада.", newWork: "＋ Нови посао",
    allWork: "Сви послови", newWorks: "Нови", inProgress: "У току", completed: "Завршени", workList: "Листа послова",
    newestFirst: "Најновији послови су први.", noWork: "Нема евидентираних послова", noWorkHelp: "Почните креирањем првог посла.", createFirst: "＋ Креирај посао",
    priority: "Приоритет", openWork: "Отвори посао", statusNew: "Ново", statusInProgress: "У току", statusCompleted: "Завршено",
    priorityLow: "Низак", priorityNormal: "Нормалан", priorityHigh: "Висок", priorityUrgent: "Хитан",
    newTitle: "Нови посао", newDescription: "Креирајте нови посао за активну компанију.", workNumber: "Број посла", workNumberPlaceholder: "Опционо – GLÖGGT додељује број ако је празно", workKey: "Кључ посла", workKeyPlaceholder: "Опциони контекст / класификација", workTitle: "Назив посла", workTitlePlaceholder: "Нпр. поправка система грејања",
    address: "Адреса", addressPlaceholder: "Почните да куцате место или адресу", operationalLocation: "Место рада / локација", operationalLocationHelp: "Почните да куцате. GLÖGGT прво предлаже познате локације компаније и недавна места рада.", workResourcesAtCreate: "Опрема / машине за посао", workResourcesAtCreateHelp: "Изаберите опрему која прати посао. Начин путовања и брзина машина аутоматски улазе у дневно планирање.", companyWorkBase: "Подразумевана база компаније", companyWorkBaseMissing: "Није евидентирана подразумевана база", description: "Опис", descriptionPlaceholder: "Опишите посао...", saveWork: "Сачувај посао", cancel: "Откажи",
    detailDescription: "Информације о послу.", status: "Статус", notRegistered: "Није унето", noDescription: "Опис није унет", created: "Креирано", started: "Посао започет", finished: "Посао завршен", createdBy: "Креирао",
    workStatus: "Статус посла", workHours: "Радни сати", noWorkHours: "Још нема евидентираних радних сати.", unknownEmployee: "Неодређен радник", timeNotCalculated: "Време није израчунато",
    employee: "Радник", chooseEmployee: "Изаберите радника", date: "Датум", from: "Од", to: "До", breakMinutes: "Пауза у минутима", whatWasDone: "Шта је урађено?", saveWorkHour: "Сачувај радне сате", saveChanges: "Сачувај измене", edit: "Измени", closeEdit: "Затвори измену",
    requiredPeople: "Потребан број радника", requiredPeopleHelp: "Колико радника је потребно за овај посао.", estimatedTime: "Процењено време рада", estimatedHours: "Сати", estimatedMinutes: "Минути", plannedDate: "Планирани дан", plannedDateHelp: "Опционо. Посао без дана остаје на листи, али се не поставља у дневни распоред.", plannedStartTime: "Планирани почетак", plannedStartTimeHelp: "Оставите празно ако је посао планиран за тај дан, али време још није одређено.", completionDeadlineDate: "Завршити до – датум", completionDeadlineTime: "Завршити до – време", completionDeadlineHelp: "Опциони обавезујући рок завршетка. Како се расположиво време смањује, посао аутоматски расте у дневном распореду.", allowAfterWorkdayEnd: "Дозвољено је прећи уобичајени крај радног дана", allowAfterWorkdayEndHelp: "Изузетак од уобичајеног краја радног дана. Унесите разлог да би одступање било следљиво.", workdayEndExceptionReason: "Разлог изузетка после краја радног дана", workdayEndExceptionReasonPlaceholder: "Нпр. хитан посао, не сме да се прекине, одобрено одступање", photoRequirement: "Захтев за фотографију", photoRequirementHelp: "Подразумевано фотографија није обавезна. Укључите само тамо где је потребна фото-потврда.", photoNone: "Нема", photoStart: "Фотографија пре почетка рада", photoProgress: "Фотографија напретка / стања", photoPartComplete: "Фотографија пре завршетка дела посла", photoWorkComplete: "Фотографија пре затварања посла",
    hoursShort: "ч", minutesShort: "мин"
  }
} as const;

export function workText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}

export function workStatusText(status: string, language: string | null | undefined) {
  const t = workText(language);
  if (status === "NEW") return t.statusNew;
  if (status === "IN_PROGRESS") return t.statusInProgress;
  if (status === "COMPLETED") return t.statusCompleted;
  return status;
}

export function workPriorityText(priority: string, language: string | null | undefined) {
  const t = workText(language);
  if (priority === "LOW") return t.priorityLow;
  if (priority === "NORMAL") return t.priorityNormal;
  if (priority === "HIGH") return t.priorityHigh;
  if (priority === "URGENT") return t.priorityUrgent;
  return priority;
}

export function workLocale(language: string | null | undefined) {
  const lang: UiLanguage = normalizeUiLanguage(language);
  return lang === "is" ? "is-IS" : lang === "pl" ? "pl-PL" : lang === "sr" ? "sr-RS" : "en-GB";
}
