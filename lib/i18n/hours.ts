import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n/ui";

const text = {
  is: {
    title: "Vinnustund",
    description: "Tímaskráning sem starfsmaður skilur strax – með rekjanleika fyrir stjórnanda og tengingu við Laun.",
    workingNow: "Í vinnu núna", livePunch: "Tengist lifandi stimplun",
    hoursThisWeek: "Stundir í vikunni", approvedAndPending: "Samþykktar + óyfirfarnar",
    requests: "Beiðnir", leaveAndCorrections: "Frí og leiðréttingar",
    forApproval: "Til samþykktar", nextPayroll: "Fyrir næstu launakeyrslu",
    employee: "Starfsmaður", punchInOut: "Stimpla inn / út", punchHelp: "Símaútgáfan fær sama einfalda flæði og getur síðar tekið myndir af fylgiskjölum.", punchIn: "Stimpla inn", punchOut: "Stimpla út",
    items: [
      ["Stimplun", "Inn / út", "Símaapp og vefur. Hlé og deild/verkefni fylgja vinnulotunni."],
      ["Mínar stundir", "Starfsmaður sér allt", "Dagur, vika og mánuður. Leiðréttingar eyða aldrei upprunalegri skráningu."],
      ["Frí og fjarvistir", "Beiðnir og staða", "Orlof, veikindi, launalaust leyfi og aðrar fjarvistir með samþykki."],
      ["Samþykki", "Vinnubakki stjórnanda", "Vantaðar stimplanir, óvenjulegir tímar og breytingarbeiðnir á einum stað."],
    ],
    devTest: "Þróunarpróf", bookkeeperHistory: "Vinnusaga bókara", bookkeeperHistoryHelp: "Þjónustutími bókara er aðskilinn frá Vinnustund starfsmanna. Þetta yfirlit er tímabundið hér á þróunarstigi.",
    today: "Í dag", thisWeek: "Þessi vika", thisMonth: "Þessi mánuður", byCompany: "Eftir fyrirtækjum – þessi mánuður", latest: "Nýjustu skráningar", noService: "Enginn þjónustutími hefur verið skráður enn.",
    time: "Tími", company: "Fyrirtæki", workPart: "Verkþáttur", source: "Uppruni", duration: "Lengd", automatic: "Sjálfvirkt", manual: "Handvirkt",
    designRule: "Hönnunarregla", designRuleText: "Vinnustund starfsmanna og Vinnusaga bókara eru tvær aðskildar þjónustur. Þær mega deila tímavél undir húddinu en aldrei ruglast saman í launum eða reikningagerð.",
    hourShort: "klst.", minuteShort: "mín.",
  },
  en: {
    title: "Work hours",
    description: "Time tracking employees can understand immediately – with traceability for managers and a link to Payroll.",
    workingNow: "Working now", livePunch: "Connected to live clocking",
    hoursThisWeek: "Hours this week", approvedAndPending: "Approved + pending review",
    requests: "Requests", leaveAndCorrections: "Leave and corrections",
    forApproval: "For approval", nextPayroll: "For the next payroll run",
    employee: "Employee", punchInOut: "Clock in / out", punchHelp: "The mobile version uses the same simple flow and can later support receipt photos.", punchIn: "Clock in", punchOut: "Clock out",
    items: [
      ["Clocking", "In / out", "Mobile app and web. Breaks and department/work context follow the work session."],
      ["My hours", "Employee sees everything", "Day, week and month. Corrections never erase the original record."],
      ["Leave and absence", "Requests and status", "Vacation, illness, unpaid leave and other absences with approval."],
      ["Approval", "Manager work queue", "Missing punches, unusual hours and change requests in one place."],
    ],
    devTest: "Development test", bookkeeperHistory: "Bookkeeper work history", bookkeeperHistoryHelp: "Bookkeeper service time is separate from employee Work Hours. This overview is temporarily shown here during development.",
    today: "Today", thisWeek: "This week", thisMonth: "This month", byCompany: "By company – this month", latest: "Latest entries", noService: "No service time has been recorded yet.",
    time: "Time", company: "Company", workPart: "Work area", source: "Source", duration: "Duration", automatic: "Automatic", manual: "Manual",
    designRule: "Design rule", designRuleText: "Employee Work Hours and bookkeeper service history are separate services. They may share a time engine underneath, but must never be mixed in payroll or invoicing.",
    hourShort: "h", minuteShort: "min",
  },
  pl: {
    title: "Czas pracy",
    description: "Ewidencja czasu zrozumiała dla pracownika – z pełną historią dla kierownika i powiązaniem z Płacami.",
    workingNow: "Teraz w pracy", livePunch: "Połączone z bieżącym rejestrowaniem",
    hoursThisWeek: "Godziny w tym tygodniu", approvedAndPending: "Zatwierdzone + oczekujące na przegląd",
    requests: "Wnioski", leaveAndCorrections: "Nieobecności i korekty",
    forApproval: "Do zatwierdzenia", nextPayroll: "Do następnego naliczenia płac",
    employee: "Pracownik", punchInOut: "Wejście / wyjście", punchHelp: "Wersja mobilna używa tego samego prostego przepływu i później będzie mogła obsługiwać zdjęcia dokumentów.", punchIn: "Rozpocznij pracę", punchOut: "Zakończ pracę",
    items: [
      ["Rejestracja", "Wejście / wyjście", "Aplikacja mobilna i web. Przerwy oraz dział/zadanie pozostają powiązane z sesją pracy."],
      ["Moje godziny", "Pracownik widzi wszystko", "Dzień, tydzień i miesiąc. Korekty nigdy nie usuwają pierwotnego zapisu."],
      ["Urlopy i nieobecności", "Wnioski i status", "Urlop, choroba, urlop bezpłatny i inne nieobecności z zatwierdzeniem."],
      ["Zatwierdzanie", "Kolejka kierownika", "Brakujące wejścia/wyjścia, nietypowe godziny i wnioski o zmianę w jednym miejscu."],
    ],
    devTest: "Test rozwojowy", bookkeeperHistory: "Historia pracy księgowego", bookkeeperHistoryHelp: "Czas usług księgowego jest oddzielony od Czasu pracy pracowników. Ten widok jest tymczasowo pokazywany tutaj na etapie rozwoju.",
    today: "Dzisiaj", thisWeek: "Ten tydzień", thisMonth: "Ten miesiąc", byCompany: "Według firmy – ten miesiąc", latest: "Najnowsze wpisy", noService: "Nie zarejestrowano jeszcze czasu usług.",
    time: "Czas", company: "Firma", workPart: "Obszar pracy", source: "Źródło", duration: "Czas trwania", automatic: "Automatycznie", manual: "Ręcznie",
    designRule: "Zasada projektowa", designRuleText: "Czas pracy pracowników i historia usług księgowego to dwie odrębne usługi. Mogą współdzielić silnik czasu, ale nie mogą mieszać się w płacach ani fakturowaniu.",
    hourShort: "godz.", minuteShort: "min",
  },
  sr: {
    title: "Радни сати",
    description: "Евиденција времена коју запослени одмах разуме – са трагом за руководиоца и везом са Зарадама.",
    workingNow: "Тренутно ради", livePunch: "Повезано са живом евиденцијом",
    hoursThisWeek: "Сати ове недеље", approvedAndPending: "Одобрено + чека преглед",
    requests: "Захтеви", leaveAndCorrections: "Одсуства и исправке",
    forApproval: "За одобрење", nextPayroll: "За следећи обрачун зарада",
    employee: "Запослени", punchInOut: "Пријава / одјава", punchHelp: "Мобилна верзија користи исти једноставан ток и касније може да подржи фотографије докумената.", punchIn: "Пријави долазак", punchOut: "Пријави одлазак",
    items: [
      ["Евиденција", "Улаз / излаз", "Мобилна апликација и веб. Паузе и одељење/посао остају повезани са радном сесијом."],
      ["Моји сати", "Запослени види све", "Дан, недеља и месец. Исправке никада не бришу оригинални запис."],
      ["Одмор и одсуства", "Захтеви и статус", "Одмор, боловање, неплаћено одсуство и друга одсуства уз одобрење."],
      ["Одобрење", "Ред руководиоца", "Недостајуће пријаве, необични сати и захтеви за измене на једном месту."],
    ],
    devTest: "Развојни тест", bookkeeperHistory: "Историја рада књиговође", bookkeeperHistoryHelp: "Време услуге књиговође је одвојено од радних сати запослених. Овај преглед је привремено овде током развоја.",
    today: "Данас", thisWeek: "Ове недеље", thisMonth: "Овог месеца", byCompany: "По компанијама – овог месеца", latest: "Најновији уноси", noService: "Још нема евидентираног времена услуге.",
    time: "Време", company: "Компанија", workPart: "Област рада", source: "Извор", duration: "Трајање", automatic: "Аутоматски", manual: "Ручно",
    designRule: "Правило дизајна", designRuleText: "Радни сати запослених и историја услуге књиговође су две одвојене услуге. Могу да деле временски механизам испод хаубе, али се не смеју мешати у зарадама или фактурисању.",
    hourShort: "ч", minuteShort: "мин",
  },
} as const;

export function hoursText(language: string | null | undefined) {
  return text[normalizeUiLanguage(language)];
}

export function hoursLocale(language: string | null | undefined) {
  const lang = normalizeUiLanguage(language);
  return lang === "en" ? "en-GB" : lang === "pl" ? "pl-PL" : lang === "sr" ? "sr-RS" : "is-IS";
}

export function formatHoursDuration(seconds: number, language: string | null | undefined) {
  const t = hoursText(language);
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours) return `${hours} ${t.hourShort}${remainder ? ` ${remainder} ${t.minuteShort}` : ""}`;
  return `${remainder} ${t.minuteShort}`;
}
