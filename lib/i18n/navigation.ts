import { normalizeUiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    workspaces: {
      home: "Heim",
      accounting: "Bókhald",
      sales: "Sala",
      payroll: "Laun",
      inventory: "Birgðir",
      hours: "Vinnustundir",
      work: "Verk",
      insights: "Innsýn",
      management: "Stjórnun",
      admin: "GLÖGGT Admin",
    },
    company: {
      label: "Vinnuumhverfi",
      switch: "Skipta um fyrirtæki",
      noCompany: "Ekkert fyrirtæki valið",
      role: "Aðgangur",
    },
    sections: {
      overview: "Yfirlit",
      accounting: "Bókhald",
      operations: "Rekstur",
      company: "Fyrirtæki",
      system: "Kerfi",
      workSettings: "Stillingar Verks",
    },
    links: {
      home: "Heim",
      companies: "Fyrirtæki",
      tasks: "Verkefni",
      messages: "Skilaboð",
      pendingDocuments: "Óunnin fylgiskjöl",
      archive: "Skjalasafn",
      bank: "Banki",
      vat: "VSK og skil",
      workSchedule: "Dagskipulag",
      workBank: "Verkabanki",
      workMap: "Kort",
      equipment: "Tæki og búnaður",
      workKeys: "Verklyklar",
      workTime: "Vinnutími",
      inventory: "Lagerstaða",
      stocktakes: "Vörutalningar",
      sales: "Sala",
      payroll: "Laun",
      hours: "Vinnustundir",
      employees: "Starfsmenn",
      insights: "Innsýn",
      management: "Stjórnun fyrirtækis",
      adminOverview: "Stjórnstöð",
      adminCompanies: "Fyrirtæki",
      adminUsers: "Notendur",
      adminSettings: "Kerfisstillingar",
      adminCost: "Kostnaður",
      adminSuggestions: "Ábendingar",
      mySettings: "Mínar stillingar",
      logout: "Skrá út",
    },
    workspaceHint: "Vinnusvæði",
  },
  en: {
    workspaces: {
      home: "Home", accounting: "Accounting", sales: "Sales", payroll: "Payroll", inventory: "Inventory", hours: "Hours", work: "Work", insights: "Insights", management: "Management", admin: "GLÖGGT Admin",
    },
    company: { label: "Workspace", switch: "Switch company", noCompany: "No company selected", role: "Access" },
    sections: { overview: "Overview", accounting: "Accounting", operations: "Operations", company: "Company", system: "System", workSettings: "Work settings" },
    links: {
      home: "Home", companies: "Companies", tasks: "Tasks", messages: "Messages", pendingDocuments: "Unprocessed documents", archive: "Document archive", bank: "Bank", vat: "VAT and filings", workSchedule: "Day planning", workBank: "Work bank", workMap: "Map", equipment: "Equipment", workKeys: "Work keys", workTime: "Work time", inventory: "Stock status", stocktakes: "Stocktakes", sales: "Sales", payroll: "Payroll", hours: "Work hours", employees: "Employees", insights: "Insights", management: "Company management", adminOverview: "Admin overview", adminCompanies: "Companies", adminUsers: "Users", adminSettings: "System settings", adminCost: "Cost", adminSuggestions: "Suggestions", mySettings: "My settings", logout: "Log out",
    },
    workspaceHint: "Workspace",
  },
  pl: {
    workspaces: {
      home: "Start", accounting: "Księgowość", sales: "Sprzedaż", payroll: "Płace", inventory: "Magazyn", hours: "Czas pracy", work: "Zadania", insights: "Analizy", management: "Zarządzanie", admin: "GLÖGGT Admin",
    },
    company: { label: "Środowisko pracy", switch: "Zmień firmę", noCompany: "Nie wybrano firmy", role: "Dostęp" },
    sections: { overview: "Przegląd", accounting: "Księgowość", operations: "Operacje", company: "Firma", system: "System", workSettings: "Ustawienia zadań" },
    links: {
      home: "Start", companies: "Firmy", tasks: "Zadania", messages: "Wiadomości", pendingDocuments: "Dokumenty do przetworzenia", archive: "Archiwum dokumentów", bank: "Bank", vat: "VAT i deklaracje", workSchedule: "Plan dnia", workBank: "Bank zadań", workMap: "Mapa", equipment: "Sprzęt", workKeys: "Klucze zadań", workTime: "Czas pracy", inventory: "Stan magazynu", stocktakes: "Inwentaryzacje", sales: "Sprzedaż", payroll: "Płace", hours: "Czas pracy", employees: "Pracownicy", insights: "Analizy", management: "Zarządzanie firmą", adminOverview: "Panel administracyjny", adminCompanies: "Firmy", adminUsers: "Użytkownicy", adminSettings: "Ustawienia systemu", adminCost: "Koszt", adminSuggestions: "Sugestie", mySettings: "Moje ustawienia", logout: "Wyloguj",
    },
    workspaceHint: "Obszar pracy",
  },
  sr: {
    workspaces: {
      home: "Почетна", accounting: "Књиговодство", sales: "Продаја", payroll: "Зараде", inventory: "Залихе", hours: "Радни сати", work: "Послови", insights: "Увид", management: "Управљање", admin: "GLÖGGT Admin",
    },
    company: { label: "Радно окружење", switch: "Промени компанију", noCompany: "Није изабрана компанија", role: "Приступ" },
    sections: { overview: "Преглед", accounting: "Књиговодство", operations: "Пословање", company: "Компанија", system: "Систем", workSettings: "Подешавања послова" },
    links: {
      home: "Почетна", companies: "Компаније", tasks: "Задаци", messages: "Поруке", pendingDocuments: "Необрађена документа", archive: "Архива докумената", bank: "Банка", vat: "ПДВ и пријаве", workSchedule: "Дневни план", workBank: "Банка послова", workMap: "Мапа", equipment: "Опрема", workKeys: "Кључеви послова", workTime: "Радно време", inventory: "Стање залиха", stocktakes: "Попис залиха", sales: "Продаја", payroll: "Зараде", hours: "Радни сати", employees: "Запослени", insights: "Увид", management: "Управљање компанијом", adminOverview: "Администрација", adminCompanies: "Компаније", adminUsers: "Корисници", adminSettings: "Системска подешавања", adminCost: "Трошак", adminSuggestions: "Предлози", mySettings: "Моја подешавања", logout: "Одјава",
    },
    workspaceHint: "Радни простор",
  },
} as const;

export function navigationText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}
