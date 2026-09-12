import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "Verk", overviewDescription: "Yfirlit yfir verk, stöðu þeirra og verkasögu.", newWork: "＋ Nýtt verk",
    allWork: "Öll verk", newWorks: "Ný verk", inProgress: "Í vinnu", completed: "Lokið", workList: "Verklisti",
    newestFirst: "Nýjustu verk efst.", noWork: "Engin verk skráð", noWorkHelp: "Byrjaðu á að stofna fyrsta verkið.", createFirst: "＋ Stofna nýtt verk",
    priority: "Forgangur", openWork: "Opna verk", statusNew: "Nýtt", statusInProgress: "Í vinnu", statusCompleted: "Lokið",
    priorityLow: "Lágur", priorityNormal: "Venjulegur", priorityHigh: "Mikill", priorityUrgent: "Brýnt",
    newTitle: "Nýtt verk", newDescription: "Skráðu nýtt verk fyrir virkt fyrirtæki.", workTitle: "Heiti verks", workTitlePlaceholder: "T.d. Viðgerð á hitakerfi",
    address: "Heimilisfang", addressPlaceholder: "Heimilisfang verks", description: "Lýsing", descriptionPlaceholder: "Lýstu verkinu...", saveWork: "Vista verk", cancel: "Hætta við",
    detailDescription: "Upplýsingar um verk.", status: "Staða", notRegistered: "Ekki skráð", noDescription: "Engin lýsing skráð", created: "Stofnað", started: "Verk hafið", finished: "Verki lokið", createdBy: "Stofnað af",
    workStatus: "Verkstaða", workHours: "Verkstundir", noWorkHours: "Engar verkstundir skráðar enn.", unknownEmployee: "Óskráður starfsmaður", timeNotCalculated: "Tími ekki reiknaður",
    employee: "Starfsmaður", chooseEmployee: "Veldu starfsmann", date: "Dagsetning", from: "Frá", to: "Til", breakMinutes: "Hlé í mínútum", whatWasDone: "Hvað var unnið?", saveWorkHour: "Vista verkstund", saveChanges: "Vista breytingar", edit: "Breyta", closeEdit: "Loka breytingu",
    hoursShort: "klst.", minutesShort: "mín."
  },
  en: {
    title: "Work", overviewDescription: "Overview of work orders, their status and work history.", newWork: "＋ New work order",
    allWork: "All work", newWorks: "New", inProgress: "In progress", completed: "Completed", workList: "Work orders",
    newestFirst: "Newest work orders first.", noWork: "No work orders", noWorkHelp: "Start by creating the first work order.", createFirst: "＋ Create work order",
    priority: "Priority", openWork: "Open work order", statusNew: "New", statusInProgress: "In progress", statusCompleted: "Completed",
    priorityLow: "Low", priorityNormal: "Normal", priorityHigh: "High", priorityUrgent: "Urgent",
    newTitle: "New work order", newDescription: "Create a new work order for the active company.", workTitle: "Work order title", workTitlePlaceholder: "E.g. Repair heating system",
    address: "Address", addressPlaceholder: "Work address", description: "Description", descriptionPlaceholder: "Describe the work...", saveWork: "Save work order", cancel: "Cancel",
    detailDescription: "Work order information.", status: "Status", notRegistered: "Not registered", noDescription: "No description registered", created: "Created", started: "Work started", finished: "Work completed", createdBy: "Created by",
    workStatus: "Work status", workHours: "Work hours", noWorkHours: "No work hours recorded yet.", unknownEmployee: "Unspecified employee", timeNotCalculated: "Time not calculated",
    employee: "Employee", chooseEmployee: "Choose employee", date: "Date", from: "From", to: "To", breakMinutes: "Break in minutes", whatWasDone: "What was done?", saveWorkHour: "Save work hours", saveChanges: "Save changes", edit: "Edit", closeEdit: "Close editing",
    hoursShort: "h", minutesShort: "min"
  },
  pl: {
    title: "Zadania", overviewDescription: "Przegląd zadań, ich statusu i historii pracy.", newWork: "＋ Nowe zadanie",
    allWork: "Wszystkie zadania", newWorks: "Nowe", inProgress: "W toku", completed: "Zakończone", workList: "Lista zadań",
    newestFirst: "Najnowsze zadania na górze.", noWork: "Brak zadań", noWorkHelp: "Zacznij od utworzenia pierwszego zadania.", createFirst: "＋ Utwórz zadanie",
    priority: "Priorytet", openWork: "Otwórz zadanie", statusNew: "Nowe", statusInProgress: "W toku", statusCompleted: "Zakończone",
    priorityLow: "Niski", priorityNormal: "Normalny", priorityHigh: "Wysoki", priorityUrgent: "Pilny",
    newTitle: "Nowe zadanie", newDescription: "Utwórz nowe zadanie dla aktywnej firmy.", workTitle: "Nazwa zadania", workTitlePlaceholder: "Np. naprawa instalacji grzewczej",
    address: "Adres", addressPlaceholder: "Adres wykonania pracy", description: "Opis", descriptionPlaceholder: "Opisz zadanie...", saveWork: "Zapisz zadanie", cancel: "Anuluj",
    detailDescription: "Informacje o zadaniu.", status: "Status", notRegistered: "Nie podano", noDescription: "Brak opisu", created: "Utworzono", started: "Rozpoczęto", finished: "Zakończono", createdBy: "Utworzone przez",
    workStatus: "Status zadania", workHours: "Czas pracy", noWorkHours: "Nie zarejestrowano jeszcze czasu pracy.", unknownEmployee: "Nieokreślony pracownik", timeNotCalculated: "Czas nie został obliczony",
    employee: "Pracownik", chooseEmployee: "Wybierz pracownika", date: "Data", from: "Od", to: "Do", breakMinutes: "Przerwa w minutach", whatWasDone: "Co zostało wykonane?", saveWorkHour: "Zapisz czas pracy", saveChanges: "Zapisz zmiany", edit: "Edytuj", closeEdit: "Zamknij edycję",
    hoursShort: "godz.", minutesShort: "min"
  },
  sr: {
    title: "Послови", overviewDescription: "Преглед послова, њиховог статуса и историје рада.", newWork: "＋ Нови посао",
    allWork: "Сви послови", newWorks: "Нови", inProgress: "У току", completed: "Завршени", workList: "Листа послова",
    newestFirst: "Најновији послови су први.", noWork: "Нема евидентираних послова", noWorkHelp: "Почните креирањем првог посла.", createFirst: "＋ Креирај посао",
    priority: "Приоритет", openWork: "Отвори посао", statusNew: "Ново", statusInProgress: "У току", statusCompleted: "Завршено",
    priorityLow: "Низак", priorityNormal: "Нормалан", priorityHigh: "Висок", priorityUrgent: "Хитан",
    newTitle: "Нови посао", newDescription: "Креирајте нови посао за активну компанију.", workTitle: "Назив посла", workTitlePlaceholder: "Нпр. поправка система грејања",
    address: "Адреса", addressPlaceholder: "Адреса посла", description: "Опис", descriptionPlaceholder: "Опишите посао...", saveWork: "Сачувај посао", cancel: "Откажи",
    detailDescription: "Информације о послу.", status: "Статус", notRegistered: "Није унето", noDescription: "Опис није унет", created: "Креирано", started: "Посао започет", finished: "Посао завршен", createdBy: "Креирао",
    workStatus: "Статус посла", workHours: "Радни сати", noWorkHours: "Још нема евидентираних радних сати.", unknownEmployee: "Неодређен радник", timeNotCalculated: "Време није израчунато",
    employee: "Радник", chooseEmployee: "Изаберите радника", date: "Датум", from: "Од", to: "До", breakMinutes: "Пауза у минутима", whatWasDone: "Шта је урађено?", saveWorkHour: "Сачувај радне сате", saveChanges: "Сачувај измене", edit: "Измени", closeEdit: "Затвори измену",
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
