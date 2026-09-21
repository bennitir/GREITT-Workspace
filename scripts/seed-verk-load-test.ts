import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Próf ehf 2.";

// Nýtt sett 21.09.2026. Gömlu 20.09.2026 auðkennin eru líka hreinsuð með --reset
// svo 300-verka prófunarsettið sitji ekki eftir samhliða nýja settinu.
const EMPLOYEE_PREFIX = "GLG-LT-EMP-20260921-";
const WORK_EXTERNAL_PREFIX = "GLG-LT-WORK-20260921-";
const LEGACY_EMPLOYEE_PREFIX = "GLG-LT-EMP-20260920-";
const LEGACY_WORK_EXTERNAL_PREFIX = "GLG-LT-WORK-20260920-";
const WORK_KEY = "GLG-LOADTEST-20260921";
const TEST_MARKER = "[GLÖGGT LOAD TEST 2026-09-21]";

const EMPLOYEE_COUNT = 50;
const DEFAULT_WORK_COUNT = 750;
const MIN_WORK_COUNT = 500;
const MAX_WORK_COUNT = 1000;

const firstNames = [
  "Anna", "Arnar", "Berglind", "Bjarni", "Bryndís", "Dagur", "Elín", "Einar", "Embla", "Erik",
  "Guðrún", "Gunnar", "Helena", "Hrafn", "Ingibjörg", "Jón", "Katrín", "Kristján", "Lilja", "Magnús",
  "María", "Marek", "Marta", "Milan", "Nína", "Ólafur", "Páll", "Petra", "Róbert", "Sara",
  "Sigrún", "Stefan", "Tomasz", "Unnur", "Viktor", "Ylfa", "Árni", "Þóra", "Željko", "Aleksandra",
  "Bartosz", "Ewa", "Filip", "Ivana", "Jelena", "Krzysztof", "Maja", "Nikola", "Piotr", "Zoran",
];

const lastNames = [
  "Jónsdóttir", "Sigurðsson", "Eiríksdóttir", "Gunnarsson", "Magnúsdóttir", "Kristjánsson", "Pálsdóttir", "Björnsson",
  "Nowak", "Kowalski", "Wiśniewska", "Wójcik", "Petrović", "Jovanović", "Nikolić", "Marković",
];

const departmentSeeds = [
  ["LT_REKSTUR", "Rekstur", "DIVISION", null],
  ["LT_VIDHALD", "Viðhald", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_RAESTING", "Ræsting", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_LAGER", "Lager", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_THJONUSTA", "Þjónusta", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_VELAR", "Vélar", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_UMHVERFI", "Umhverfi", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_FLUTNINGAR", "Flutningar", "DEPARTMENT", "LT_REKSTUR"],
  ["LT_EFTIRLIT", "Eftirlit", "DEPARTMENT", "LT_REKSTUR"],
] as const;

const fixedTeamSeeds = [
  ["LT_RAESTING_1", "Ræstingarteymi 1", "LT_RAESTING"],
  ["LT_RAESTING_2", "Ræstingarteymi 2", "LT_RAESTING"],
  ["LT_VIDHALD_1", "Viðhaldsteymi 1", "LT_VIDHALD"],
  ["LT_VIDHALD_2", "Viðhaldsteymi 2", "LT_VIDHALD"],
  ["LT_EFTIRLIT_1", "Eftirlitsteymi 1", "LT_EFTIRLIT"],
  ["LT_EFTIRLIT_2", "Eftirlitsteymi 2", "LT_EFTIRLIT"],
  ["LT_VELAR_1", "Vélateymi", "LT_VELAR"],
  ["LT_FLUTNINGAR_1", "Flutningateymi", "LT_FLUTNINGAR"],
  ["LT_LAGER_1", "Lagerteymi", "LT_LAGER"],
  ["LT_THJONUSTA_1", "Þjónustuteymi", "LT_THJONUSTA"],
  ["LT_UMHVERFI_1", "Umhverfisteymi", "LT_UMHVERFI"],
] as const;

const jobTitles = ["Starfsmaður", "Tæknimaður", "Vélamaður", "Þjónustufulltrúi", "Umsjónarmaður", "Lagerstarfsmaður", "Iðnaðarmaður"];
const languages = ["is", "is", "is", "is", "en", "pl", "sr"];

const workScopeSeeds = [
  ["GENERAL_SERVICE", "Almenn þjónusta", "Almenn þjónustu- og verkamannastörf."],
  ["CLEANING", "Þrif", "Þrif og frágangur samkvæmt starfslýsingu."],
  ["FIELD_ASSISTANCE", "Aðstoð við vettvangsverk", "Almenn aðstoð við fag-/vettvangsverk án þess að teljast fagmannssæti."],
  ["WAREHOUSE", "Lager", "Lagerstörf, talningar og meðhöndlun birgða."],
  ["ELECTRICAL_WORK", "Rafmagnsvinna", "Rafmagnstengd vinna innan viðeigandi réttinda og hæfni."],
  ["TECHNICAL_INSPECTION", "Tæknilegt eftirlit", "Skoðanir, öryggiseftirlit og tæknilegt mat."],
  ["MAINTENANCE_TRADE", "Viðhald / iðn", "Viðhald og viðgerðir innan starfssviðs iðn-/viðhaldsfólks."],
  ["MACHINE_OPERATION", "Vélar", "Vélavinna og stjórnun vinnuvéla."],
  ["LOGISTICS", "Flutningar", "Akstur, flutningur og sækja/afhenda efni eða tæki."],
  ["HEATING", "Hitakerfi", "Tæknileg vinna við hita- og stýrikerfi."],
  ["FIRE_SAFETY", "Brunavarnir", "Eftirlit og vinna tengd brunavörnum."],
] as const;


const workTemplates = [
  ["Eftirlit með búnaði", "Athuga ástand búnaðar og skrá frávik."],
  ["Þrif á sameign", "Fara yfir skilgreint svæði og ganga frá samkvæmt verklýsingu."],
  ["Skipta um ljós", "Yfirfara lýsingu og skipta um bilaðan búnað eftir þörfum."],
  ["Flytja efni", "Sækja efni, flytja á verkstað og staðfesta afhendingu."],
  ["Yfirfara vél", "Framkvæma almenna skoðun og skrá mælistöðu ef við á."],
  ["Laga hurð", "Greina bilun og framkvæma minniháttar viðgerð."],
  ["Taka stöðu á lager", "Fara yfir valdar vörur og skrá stöðu."],
  ["Skoða leka", "Finna upptök leka og skrá stöðu áður en viðgerð er ákveðin."],
  ["Setja upp skilti", "Setja upp merkingu á tilgreindum stað og ganga frá."],
  ["Sækja tæki", "Sækja tilgreint tæki og koma því á réttan stað."],
  ["Yfirfara öryggisbúnað", "Athuga öryggisbúnað og skrá það sem þarfnast athygli."],
  ["Smáviðhald", "Framkvæma almenn minniháttar viðhaldsverk."],
  ["Skoða hitakerfi", "Athuga hitastýringu, skrá stöðu og tilkynna frávik."],
  ["Yfirfara lóð", "Fara yfir svæði, skrá frávik og sinna einföldu viðhaldi."],
  ["Sækja varahlut", "Sækja varahlut og koma honum á réttan verkstað."],
  ["Athuga brunavarnir", "Yfirfara skilgreind atriði brunavarna og skrá stöðu."],
];

// 5 daga load-test próf 21.09.2026 sýndi að upprunalega jafna template-dreifingin
// var óraunhæf miðað við mönnun: Flutningar/Viðhald/Umhverfi fylltust en
// Vélar/Lager/Ræsting/Eftirlit tæmdu sinn verkabanka of snemma. Þessi vægi eru
// EINGÖNGU prófunargögn og miða gróflega við tiltæka 5 daga getu deildanna.
// Þjónusta er ekki sett í Verk-pottinn hér; hún er áfram viðveru-/þjónustuhlutverk
// í þessu load testi og á ekki að fá tilbúin Verk bara til að hækka nýtingu.
const balancedWeekDepartmentWeights = [
  ["LT_EFTIRLIT", 26],
  ["LT_VIDHALD", 24],
  ["LT_LAGER", 15],
  ["LT_VELAR", 11],
  ["LT_RAESTING", 11],
  ["LT_FLUTNINGAR", 7],
  ["LT_UMHVERFI", 6],
] as const;

function balancedWeekDepartmentCodeFor(index: number) {
  // 37 er hlutfallslega frumtala við 100 og dreifir 100-slota lotunni jafnt yfir listann.
  // Þannig fæst nánast nákvæm vægisdreifing án Math.random() og endurkeyrsla er stöðug.
  const slot = (index * 37) % 100;
  let cursor = 0;
  for (const [departmentCode, weight] of balancedWeekDepartmentWeights) {
    cursor += weight;
    if (slot < cursor) return departmentCode;
  }
  return balancedWeekDepartmentWeights[balancedWeekDepartmentWeights.length - 1][0];
}

function balancedWorkTemplateFor(index: number) {
  const departmentCode = balancedWeekDepartmentCodeFor(index);
  const candidates = workTemplates.filter(([title]) => responsibleDepartmentCodeForTitle(title) === departmentCode);
  if (candidates.length === 0) {
    throw new Error(`Vantar Verk-template fyrir ábyrgðardeild ${departmentCode}.`);
  }
  return candidates[bucket(index, 57) % candidates.length];
}

const operationalLocationSeeds = [
  { code: "LT_LOC_RNB", name: "Reykjanesbær – þjónustumiðstöð", address: "Hafnargata 34, 230 Reykjanesbær", postalCode: "230", city: "Reykjanesbær", zoneCode: "SU_RNB", locationKind: "BASE", latitude: 63.9998, longitude: -22.5583, area: "SUDURNES", flowRank: 0 },
  { code: "LT_LOC_VOGAR", name: "Vogar – þjónustusvæði", address: "Aragerði 7, 190 Vogar", postalCode: "190", city: "Vogar", zoneCode: "SU_VOG", locationKind: "SITE", latitude: 63.9816, longitude: -22.3847, area: "SUDURNES", flowRank: 1 },
  { code: "LT_LOC_GRINDAVIK", name: "Grindavík – þjónustusvæði", address: "Víkurbraut 18, 240 Grindavík", postalCode: "240", city: "Grindavík", zoneCode: "SU_GRD", locationKind: "SITE", latitude: 63.8424, longitude: -22.4338, area: "SUDURNES", flowRank: 2 },
  { code: "LT_LOC_HAF", name: "Hafnarfjörður – prófunarsvæði", address: "Hafnarfjörður – prófunarsvæði", postalCode: "220", city: "Hafnarfjörður", zoneCode: "CAP_HAF", locationKind: "SITE", latitude: 64.0671, longitude: -21.9547, area: "CAPITAL", flowRank: 0 },
  { code: "LT_LOC_GAR", name: "Garðabær – þjónustumiðstöð", address: "Garðabær – prófunarsvæði", postalCode: "210", city: "Garðabær", zoneCode: "CAP_GAR", locationKind: "BASE", latitude: 64.0887, longitude: -21.9229, area: "CAPITAL", flowRank: 1 },
  { code: "LT_LOC_KOP", name: "Kópavogur – prófunarsvæði", address: "Kópavogur – prófunarsvæði", postalCode: "201", city: "Kópavogur", zoneCode: "CAP_KOP", locationKind: "SITE", latitude: 64.1110, longitude: -21.9057, area: "CAPITAL", flowRank: 2 },
  { code: "LT_LOC_RVK_V", name: "Reykjavík vestur – prófunarsvæði", address: "Reykjavík vestur – prófunarsvæði", postalCode: "105", city: "Reykjavík", zoneCode: "CAP_RVK_V", locationKind: "SITE", latitude: 64.1450, longitude: -21.9200, area: "CAPITAL", flowRank: 3 },
  { code: "LT_LOC_RVK_A", name: "Reykjavík austur – prófunarsvæði", address: "Reykjavík austur – prófunarsvæði", postalCode: "112", city: "Reykjavík", zoneCode: "CAP_RVK_A", locationKind: "SITE", latitude: 64.1350, longitude: -21.7900, area: "CAPITAL", flowRank: 4 },
] as const;

type OperationalLocationSeed = (typeof operationalLocationSeeds)[number];

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function projectedRoadDistanceKm(from: OperationalLocationSeed, to: OperationalLocationSeed) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(to.latitude - from.latitude);
  const dLon = degreesToRadians(to.longitude - from.longitude);
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const straightKm = 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
  const roadFactor = from.area === to.area ? 1.22 : 1.18;
  return Math.max(1, Math.round(straightKm * roadFactor * 10) / 10);
}

function defaultTravelMinutes(from: OperationalLocationSeed, to: OperationalLocationSeed, distanceKm: number) {
  const averageKmh = from.area === "CAPITAL" && to.area === "CAPITAL" ? 38 : from.area === "SUDURNES" && to.area === "SUDURNES" ? 58 : 68;
  return Math.max(5, Math.ceil((distanceKm / averageKmh) * 60 + (from.area === to.area ? 4 : 6)));
}

function peakTravelMultiplier(from: OperationalLocationSeed, to: OperationalLocationSeed, peak: "MORNING_PEAK" | "AFTERNOON_PEAK") {
  if (from.area === "SUDURNES" && to.area === "SUDURNES") return 1.08;
  if (from.area !== to.area) {
    if (peak === "MORNING_PEAK") return to.area === "CAPITAL" ? 1.45 : 1.15;
    return to.area === "SUDURNES" ? 1.50 : 1.20;
  }
  // Höfuðborgarsvæðið er viljandi stefnuvirkt í prófunargögnunum.
  // Þetta eru TEST_PROJECTION gildi, ekki mæld lifandi umferð.
  const towardHigherRank = to.flowRank > from.flowRank;
  if (peak === "MORNING_PEAK") return towardHigherRank ? 1.65 : 1.25;
  return towardHigherRank ? 1.25 : 1.75;
}

function employeeBaseLocationCode(index: number, departmentCode: string) {
  if (["LT_THJONUSTA", "LT_UMHVERFI"].includes(departmentCode)) return "LT_LOC_GAR";
  if (["LT_RAESTING", "LT_VIDHALD", "LT_EFTIRLIT"].includes(departmentCode)) return index % 2 === 0 ? "LT_LOC_RNB" : "LT_LOC_GAR";
  return "LT_LOC_RNB";
}

function workLocationCode(index: number) {
  const su = ["LT_LOC_RNB", "LT_LOC_VOGAR", "LT_LOC_GRINDAVIK"];
  const capital = ["LT_LOC_HAF", "LT_LOC_GAR", "LT_LOC_KOP", "LT_LOC_RVK_V", "LT_LOC_RVK_A"];
  // 2/3 Suðurnes, 1/3 höfuðborgarsvæði svo bæði einföld og álagsháð leið sjáist.
  const capitalWork = bucket(index, 83) % 3 === 0;
  const pool = capitalWork ? capital : su;
  return pool[bucket(index, 89) % pool.length];
}

function completionDeadlineFor(index: number) {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const make = (days: number, minutes: number, allowAfterWorkdayEnd = false) => {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() + days);
    return {
      date,
      minutes,
      allowAfterWorkdayEnd,
      reason: allowAfterWorkdayEnd ? `${TEST_MARKER} Prófun á meðvitaðri dagsloka-undantekningu.` : null,
    };
  };

  // Deadline-dreifingin er vísvitandi óháð handvirkum forgangi svo hægt sé að
  // prófa að rúmt Verk færist smám saman ofar þegar svigrúmið minnkar.
  // Flest síðdegis-deadline Verk mega EKKI opna sjálfkrafa fyrir vinnu eftir
  // venjuleg dagslok. Örfá Verk fá meðvitaða undantekningu svo bæði tilvik séu prófuð.
  if (index % 307 === 0) return make(0, 17 * 60 + 30, true);
  if (index % 101 === 0) return make(0, 17 * 60 + 30, false);
  if (index % 47 === 0) return make(0, 15 * 60 + 30);
  if (index % 31 === 0) return make(1, 14 * 60);
  if (index % 19 === 0) return make(3, 16 * 60);
  if (index % 13 === 0) return make(14, 16 * 60);
  if (index % 11 === 0) return make(30, 16 * 60);
  return null;
}

// Endurtekningar eru viljandi: algeng stutt/millilöng verk eiga að vera fleiri en heilsdagsverk.
const estimatedDurations = [
  15, 20, 30, 30, 30, 45, 45, 45, 60, 60, 60, 60,
  75, 90, 90, 120, 120, 150, 180, 240,
];

function pad(value: number, size = 3) {
  return String(value).padStart(size, "0");
}

function parseWorkCount() {
  const argument = process.argv.find((value) => value.startsWith("--count="));
  if (!argument) return DEFAULT_WORK_COUNT;

  const value = Number(argument.slice("--count=".length));
  if (!Number.isInteger(value) || value < MIN_WORK_COUNT || value > MAX_WORK_COUNT) {
    throw new Error(`--count þarf að vera heiltala frá ${MIN_WORK_COUNT} upp í ${MAX_WORK_COUNT}.`);
  }
  return value;
}

// Deterministic dreifing svo endurkeyrsla gefi sama prófunarsafn án Math.random().
function bucket(index: number, salt: number) {
  let value = (index + 1) * 1103515245 + salt * 12345;
  value ^= value >>> 16;
  return Math.abs(value) % 10000;
}

function priorityFor(index: number) {
  const value = bucket(index, 11) % 100;
  // Brýnt á að vera sjaldgæft. Annars fyllist efsti hluti listans af rauðu
  // og forgangsmerkingin hættir að hjálpa við raunverulega röðun.
  if (value < 1) return "URGENT"; // ~1%
  if (value < 11) return "HIGH";  // ~10%
  if (value < 96) return "NORMAL"; // ~85%
  return "LOW"; // ~4%
}

function requiredPeopleFor(index: number) {
  const value = bucket(index, 23) % 100;
  if (value < 68) return 1;
  if (value < 90) return 2;
  if (value < 98) return 3;
  return 4;
}

function createdAtFor(index: number) {
  const ageDays = bucket(index, 37) % 61; // 0–60 dagar
  const ageHours = bucket(index, 41) % 24;
  const date = new Date();
  date.setMilliseconds(0);
  date.setSeconds(0);
  date.setMinutes(0);
  date.setHours(date.getHours() - ageHours);
  date.setDate(date.getDate() - ageDays);
  return date;
}


type EmployeeSeedProfile = {
  jobTitle: string;
  departmentCode: string;
  workScopeCodes: string[];
  incidentalWorkMode: "NEVER" | "AUTO_IF_NEEDED";
};

function employeeSeedProfile(index: number): EmployeeSeedProfile {
  const baseTitle = jobTitles[index % jobTitles.length];
  const occurrence = Math.floor(index / jobTitles.length);

  if (baseTitle === "Starfsmaður" && occurrence < 5) {
    return { jobTitle: "Ræstitæknir", departmentCode: "LT_RAESTING", workScopeCodes: ["CLEANING"], incidentalWorkMode: "NEVER" };
  }
  if (baseTitle === "Starfsmaður") {
    const supportDepartments = ["LT_VIDHALD", "LT_EFTIRLIT", "LT_VELAR"];
    return { jobTitle: "Aðstoðarmaður", departmentCode: supportDepartments[(occurrence - 5) % supportDepartments.length], workScopeCodes: ["FIELD_ASSISTANCE", "GENERAL_SERVICE"], incidentalWorkMode: "NEVER" };
  }
  if (baseTitle === "Tæknimaður") {
    const maintenance = occurrence % 2 === 1;
    return maintenance
      ? { jobTitle: "Tæknimaður", departmentCode: "LT_VIDHALD", workScopeCodes: ["ELECTRICAL_WORK", "HEATING", "MAINTENANCE_TRADE", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" }
      : { jobTitle: "Tæknimaður", departmentCode: "LT_EFTIRLIT", workScopeCodes: ["TECHNICAL_INSPECTION", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" };
  }
  if (baseTitle === "Vélamaður") {
    return occurrence % 2 === 0
      ? { jobTitle: "Vélamaður", departmentCode: "LT_VELAR", workScopeCodes: ["MACHINE_OPERATION", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" }
      : { jobTitle: "Vélamaður", departmentCode: "LT_FLUTNINGAR", workScopeCodes: ["LOGISTICS", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" };
  }
  if (baseTitle === "Þjónustufulltrúi") {
    const environment = occurrence % 2 === 1;
    return { jobTitle: "Þjónustufulltrúi", departmentCode: environment ? "LT_UMHVERFI" : "LT_THJONUSTA", workScopeCodes: ["GENERAL_SERVICE"], incidentalWorkMode: occurrence % 4 === 0 ? "AUTO_IF_NEEDED" : "NEVER" };
  }
  if (baseTitle === "Umsjónarmaður") {
    return { jobTitle: "Umsjónarmaður", departmentCode: "LT_EFTIRLIT", workScopeCodes: ["TECHNICAL_INSPECTION", "FIRE_SAFETY", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" };
  }
  if (baseTitle === "Lagerstarfsmaður") {
    return { jobTitle: "Lagerstarfsmaður", departmentCode: "LT_LAGER", workScopeCodes: ["WAREHOUSE", "LOGISTICS", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" };
  }
  return { jobTitle: "Iðnaðarmaður", departmentCode: "LT_VIDHALD", workScopeCodes: ["MAINTENANCE_TRADE", "ELECTRICAL_WORK", "FIELD_ASSISTANCE"], incidentalWorkMode: "NEVER" };
}

function qualificationCodesForEmployee(index: number, jobTitle: string) {
  const codes = new Set<string>();

  // Sameiginleg öryggishæfni er víða til staðar en ekki hjá öllum.
  if (index % 2 === 0 || ["Tæknimaður", "Iðnaðarmaður", "Umsjónarmaður"].includes(jobTitle)) {
    codes.add("SITE_SAFETY");
  }

  if (jobTitle === "Tæknimaður") {
    codes.add("ELECTRICAL");
    codes.add("HEATING");
    codes.add("SAFETY_INSPECTION");
    if (employeeSeedProfile(index).departmentCode === "LT_VIDHALD") codes.add("MAINTENANCE");
  } else if (jobTitle === "Vélamaður") {
    codes.add("MACHINE");
    codes.add("DRIVING");
  } else if (jobTitle === "Umsjónarmaður") {
    codes.add("SAFETY_INSPECTION");
    codes.add("FIRE_SAFETY");
  } else if (jobTitle === "Lagerstarfsmaður") {
    codes.add("WAREHOUSE");
    codes.add("FORKLIFT");
    codes.add("DRIVING");
  } else if (jobTitle === "Iðnaðarmaður") {
    codes.add("MAINTENANCE");
    codes.add("ELECTRICAL");
    if (index % 3 === 0) codes.add("FIRE_SAFETY");
  } else if (jobTitle === "Aðstoðarmaður") {
    if (index % 3 === 0) codes.add("DRIVING");
  } else if (jobTitle === "Ræstitæknir") {
    // Ræstingarteymið hefur ekki sjálfkrafa fag-/ökuskírteini í prófunargögnum.
  } else if (jobTitle === "Þjónustufulltrúi") {
    if (index % 4 === 0) codes.add("DRIVING");
  }

  return [...codes];
}

function normalWorkScopeCodesForEmployee(index: number) {
  return employeeSeedProfile(index).workScopeCodes;
}

function responsibleDepartmentCodeForTitle(title: string) {
  if (title.startsWith("Þrif á sameign")) return "LT_RAESTING";
  if (title.startsWith("Taka stöðu á lager")) return "LT_LAGER";
  if (title.startsWith("Flytja efni") || title.startsWith("Sækja tæki") || title.startsWith("Sækja varahlut")) return "LT_FLUTNINGAR";
  if (title.startsWith("Yfirfara vél")) return "LT_VELAR";
  if (title.startsWith("Eftirlit með búnaði") || title.startsWith("Yfirfara öryggisbúnað") || title.startsWith("Athuga brunavarnir")) return "LT_EFTIRLIT";
  if (title.startsWith("Skipta um ljós") || title.startsWith("Skoða hitakerfi") || title.startsWith("Laga hurð") || title.startsWith("Skoða leka") || title.startsWith("Smáviðhald")) return "LT_VIDHALD";
  if (title.startsWith("Yfirfara lóð") || title.startsWith("Setja upp skilti")) return "LT_UMHVERFI";
  return "LT_THJONUSTA";
}

function locationDepartmentCodeForWork(title: string, index: number) {
  const responsible = responsibleDepartmentCodeForTitle(title);
  if (["LT_RAESTING", "LT_VIDHALD", "LT_EFTIRLIT"].includes(responsible)) {
    const locations = ["LT_LAGER", "LT_THJONUSTA", "LT_VELAR", "LT_UMHVERFI", "LT_FLUTNINGAR", "LT_EFTIRLIT"];
    return locations[bucket(index, 71) % locations.length];
  }
  return responsible;
}

function workScopeCodeForTitle(title: string) {
  if (title.startsWith("Þrif á sameign")) return "CLEANING";
  if (title.startsWith("Taka stöðu á lager")) return "WAREHOUSE";
  if (title.startsWith("Skipta um ljós")) return "ELECTRICAL_WORK";
  if (title.startsWith("Eftirlit með búnaði") || title.startsWith("Yfirfara öryggisbúnað")) return "TECHNICAL_INSPECTION";
  if (title.startsWith("Yfirfara vél")) return "MACHINE_OPERATION";
  if (title.startsWith("Flytja efni") || title.startsWith("Sækja tæki") || title.startsWith("Sækja varahlut")) return "LOGISTICS";
  if (title.startsWith("Skoða hitakerfi")) return "HEATING";
  if (title.startsWith("Athuga brunavarnir")) return "FIRE_SAFETY";
  if (title.startsWith("Laga hurð") || title.startsWith("Skoða leka") || title.startsWith("Smáviðhald")) return "MAINTENANCE_TRADE";
  return "GENERAL_SERVICE";
}

type StaffingRequirementSeed = {
  roleCode: "SPECIALIST" | "ASSISTANT" | "GENERAL" | "DRIVER" | "OPERATOR";
  quantity: number;
  workScopeCode?: string;
  requiredQualificationCodes: string[];
  preferredQualificationCodes: string[];
};

function staffingProfileFor(title: string, requiredPeople: number, index: number) {
  const commonQualificationCodes = index % 19 === 0 ? ["SITE_SAFETY"] : [];
  let specialist: StaffingRequirementSeed | null = null;

  if (title.startsWith("Eftirlit með búnaði") || title.startsWith("Yfirfara öryggisbúnað")) {
    specialist = { roleCode: "SPECIALIST", quantity: 1, requiredQualificationCodes: ["SAFETY_INSPECTION"], preferredQualificationCodes: [] };
  } else if (title.startsWith("Skipta um ljós")) {
    specialist = { roleCode: "SPECIALIST", quantity: 1, requiredQualificationCodes: ["ELECTRICAL"], preferredQualificationCodes: ["MAINTENANCE"] };
  } else if (title.startsWith("Yfirfara vél")) {
    specialist = { roleCode: "OPERATOR", quantity: 1, requiredQualificationCodes: ["MACHINE"], preferredQualificationCodes: ["MAINTENANCE"] };
  } else if (title.startsWith("Laga hurð") || title.startsWith("Skoða leka") || title.startsWith("Smáviðhald")) {
    specialist = { roleCode: "SPECIALIST", quantity: 1, requiredQualificationCodes: ["MAINTENANCE"], preferredQualificationCodes: [] };
  } else if (title.startsWith("Skoða hitakerfi")) {
    specialist = { roleCode: "SPECIALIST", quantity: 1, requiredQualificationCodes: ["HEATING"], preferredQualificationCodes: ["MAINTENANCE"] };
  } else if (title.startsWith("Athuga brunavarnir")) {
    specialist = { roleCode: "SPECIALIST", quantity: 1, requiredQualificationCodes: ["FIRE_SAFETY"], preferredQualificationCodes: ["SAFETY_INSPECTION"] };
  } else if (title.startsWith("Flytja efni") || title.startsWith("Sækja tæki") || title.startsWith("Sækja varahlut")) {
    specialist = { roleCode: "DRIVER", quantity: 1, requiredQualificationCodes: ["DRIVING"], preferredQualificationCodes: [] };
  }

  const requirements: StaffingRequirementSeed[] = [];
  if (specialist) {
    requirements.push(specialist);
    if (requiredPeople > 1) {
      requirements.push({
        roleCode: "ASSISTANT",
        quantity: requiredPeople - 1,
        workScopeCode: "FIELD_ASSISTANCE",
        requiredQualificationCodes: [],
        preferredQualificationCodes: [],
      });
    }
  } else {
    const preferredQualificationCodes = title.startsWith("Taka stöðu á lager")
      ? ["WAREHOUSE"]
      : title.startsWith("Setja upp skilti") || title.startsWith("Yfirfara lóð")
        ? ["MAINTENANCE"]
        : [];
    requirements.push({
      roleCode: "GENERAL",
      quantity: requiredPeople,
      workScopeCode: workScopeCodeForTitle(title),
      requiredQualificationCodes: [],
      preferredQualificationCodes,
    });
  }

  return { commonQualificationCodes, requirements };
}

async function cleanupExisting(companyId: number) {
  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      OR: [
        { employeeNumber: { startsWith: EMPLOYEE_PREFIX } },
        { employeeNumber: { startsWith: LEGACY_EMPLOYEE_PREFIX } },
      ],
    },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);

  const deletedWorks = await prisma.workOrder.deleteMany({
    where: {
      companyId,
      OR: [
        { externalId: { startsWith: WORK_EXTERNAL_PREFIX } },
        { externalId: { startsWith: LEGACY_WORK_EXTERNAL_PREFIX } },
      ],
    },
  });

  if (employeeIds.length > 0) {
    await prisma.workPartAssignment.deleteMany({
      where: { companyId, employeeId: { in: employeeIds } },
    });
    await prisma.workPartLaborFact.deleteMany({
      where: { companyId, employeeId: { in: employeeIds } },
    });
  }

  const deletedEmployees = await prisma.employee.deleteMany({
    where: { id: { in: employeeIds } },
  });

  return { works: deletedWorks.count, employees: deletedEmployees.count };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reset = process.argv.includes("--reset");
  const workCount = parseWorkCount();

  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error(`Fann ekki fyrirtækið „${COMPANY_NAME}“. Engin gögn voru stofnuð.`);
  }

  const [existingEmployees, existingWorks, legacyEmployees, legacyWorks] = await Promise.all([
    prisma.employee.count({ where: { companyId: company.id, employeeNumber: { startsWith: EMPLOYEE_PREFIX } } }),
    prisma.workOrder.count({ where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX } } }),
    prisma.employee.count({ where: { companyId: company.id, employeeNumber: { startsWith: LEGACY_EMPLOYEE_PREFIX } } }),
    prisma.workOrder.count({ where: { companyId: company.id, externalId: { startsWith: LEGACY_WORK_EXTERNAL_PREFIX } } }),
  ]);

  const priorityCounts = Array.from({ length: workCount }, (_, index) => priorityFor(index)).reduce<Record<string, number>>(
    (counts, priority) => {
      counts[priority] = (counts[priority] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const departmentPlanCounts = Array.from({ length: workCount }, (_, index) => balancedWeekDepartmentCodeFor(index))
    .reduce<Record<string, number>>((counts, departmentCode) => {
      counts[departmentCode] = (counts[departmentCode] ?? 0) + 1;
      return counts;
    }, {});

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Á að stofna: ${EMPLOYEE_COUNT} starfsmenn + ${workCount} ótímasett Verk.`);
  console.log(`Merki prófunargagna: ${TEST_MARKER}`);
  console.log(
    `Forgangsdreifing: Brýnt ${priorityCounts.URGENT ?? 0}, Hátt ${priorityCounts.HIGH ?? 0}, Venjulegt ${priorityCounts.NORMAL ?? 0}, Lágt ${priorityCounts.LOW ?? 0}.`,
  );
  console.log(
    "Ábyrgðardeildir í 5 daga jafnvægisprófi: " +
      balancedWeekDepartmentWeights
        .map(([code]) => `${departmentSeeds.find(([departmentCode]) => departmentCode === code)?.[1] ?? code} ${departmentPlanCounts[code] ?? 0}`)
        .join(", ") +
      ".",
  );
  console.log("Aldur verkbeiðna dreifist yfir 0–60 daga án þess að aldur breyti sjálfkrafa forgangi.");
  console.log(`Nýtt sett nú þegar til: ${existingEmployees} starfsmenn + ${existingWorks} Verk.`);
  console.log(`Gamla 20.09-settið: ${legacyEmployees} starfsmenn + ${legacyWorks} Verk.`);

  if (!apply) {
    console.log("\nDRY RUN — engum gögnum var breytt.");
    console.log("Keyrðu aftur með --reset --apply til að skipta gamla 300-verka settinu út fyrir þetta safn.");
    console.log(`Sjálfgefið eru ${DEFAULT_WORK_COUNT} Verk. Nota má --count=500 ... --count=1000.`);
    return;
  }

  if ((existingEmployees > 0 || existingWorks > 0 || legacyEmployees > 0 || legacyWorks > 0) && !reset) {
    throw new Error("Prófunargögn eru þegar til. Notaðu --reset --apply til að endurgera settið hreint.");
  }

  if (reset) {
    const deleted = await cleanupExisting(company.id);
    console.log(`Hreinsaði eldri prófunargögn: ${deleted.employees} starfsmenn + ${deleted.works} Verk.`);
  }

  const departmentRows: Array<{ id: number; code: string; name: string }> = [];
  let rootDepartmentId: number | null = null;
  for (let index = 0; index < departmentSeeds.length; index += 1) {
    const [code, name, unitType, parentCode] = departmentSeeds[index];
    const parentId: number | null =
      parentCode === null
        ? null
        : departmentRows.find((row) => row.code === parentCode)?.id ?? rootDepartmentId;
    const department: { id: number; code: string; name: string } = await prisma.companyDepartment.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, code, name, unitType, parentId, sortOrder: index, notes: TEST_MARKER },
      update: { name, unitType, parentId, sortOrder: index, isActive: true, notes: TEST_MARKER },
    });
    departmentRows.push(department);
    if (code === "LT_REKSTUR") rootDepartmentId = department.id;
  }
  const departmentIdByCode = new Map(departmentRows.map((row) => [row.code, row.id]));
  const departmentNameByCode = new Map(departmentRows.map((row) => [row.code, row.name]));

  const operationalLocations: Array<{ id: number; code: string; name: string }> = [];
  for (const seed of operationalLocationSeeds) {
    const location = await prisma.operationalLocation.upsert({
      where: { companyId_code: { companyId: company.id, code: seed.code } },
      create: {
        companyId: company.id, code: seed.code, name: seed.name, address: seed.address, postalCode: seed.postalCode,
        city: seed.city, zoneCode: seed.zoneCode, latitude: seed.latitude, longitude: seed.longitude,
        locationKind: seed.locationKind, notes: `${TEST_MARKER} TEST_PROJECTION rekstrarstaður.`,
      },
      update: {
        name: seed.name, address: seed.address, postalCode: seed.postalCode, city: seed.city, zoneCode: seed.zoneCode,
        latitude: seed.latitude, longitude: seed.longitude, locationKind: seed.locationKind, isActive: true,
        notes: `${TEST_MARKER} TEST_PROJECTION rekstrarstaður.`,
      },
    });
    operationalLocations.push(location);
  }
  const operationalLocationIdByCode = new Map(operationalLocations.map((location) => [location.code, location.id]));
  const operationalLocationSeedByCode = new Map<string, OperationalLocationSeed>(operationalLocationSeeds.map((location) => [location.code, location]));

  const defaultLocationByDepartmentCode: Record<string, string> = {
    LT_REKSTUR: "LT_LOC_RNB", LT_VIDHALD: "LT_LOC_RNB", LT_RAESTING: "LT_LOC_RNB", LT_LAGER: "LT_LOC_RNB",
    LT_THJONUSTA: "LT_LOC_GAR", LT_VELAR: "LT_LOC_RNB", LT_UMHVERFI: "LT_LOC_GAR", LT_FLUTNINGAR: "LT_LOC_RNB", LT_EFTIRLIT: "LT_LOC_RNB",
  };
  for (const department of departmentRows) {
    const locationCode = defaultLocationByDepartmentCode[department.code];
    const defaultOperationalLocationId = locationCode ? operationalLocationIdByCode.get(locationCode) ?? null : null;
    await prisma.companyDepartment.update({ where: { id: department.id }, data: { defaultOperationalLocationId } });
  }

  const routeRows: Array<{ id: number }> = [];
  for (const from of operationalLocationSeeds) {
    for (const to of operationalLocationSeeds) {
      if (from.code === to.code) continue;
      const fromLocationId = operationalLocationIdByCode.get(from.code);
      const toLocationId = operationalLocationIdByCode.get(to.code);
      if (!fromLocationId || !toLocationId) continue;
      const distanceKm = projectedRoadDistanceKm(from, to);
      const defaultMinutes = defaultTravelMinutes(from, to, distanceKm);
      const route = await prisma.operationalTravelRoute.upsert({
        where: { companyId_fromLocationId_toLocationId: { companyId: company.id, fromLocationId, toLocationId } },
        create: { companyId: company.id, fromLocationId, toLocationId, distanceKm, defaultMinutes, source: "TEST_PROJECTION", notes: TEST_MARKER },
        update: { distanceKm, defaultMinutes, source: "TEST_PROJECTION", isActive: true, notes: TEST_MARKER },
      });
      routeRows.push(route);
      await prisma.operationalTravelTimeWindow.deleteMany({ where: { routeId: route.id, source: "TEST_PROJECTION" } });
      const morningMinutes = Math.max(defaultMinutes, Math.ceil(defaultMinutes * peakTravelMultiplier(from, to, "MORNING_PEAK")));
      const afternoonMinutes = Math.max(defaultMinutes, Math.ceil(defaultMinutes * peakTravelMultiplier(from, to, "AFTERNOON_PEAK")));
      await prisma.operationalTravelTimeWindow.createMany({ data: [
        { companyId: company.id, routeId: route.id, dayType: "WEEKDAY", startMinutes: 7 * 60, endMinutes: 9 * 60 + 30, travelMinutes: morningMinutes, ruleCode: "MORNING_PEAK", source: "TEST_PROJECTION", sortOrder: 1 },
        { companyId: company.id, routeId: route.id, dayType: "WEEKDAY", startMinutes: 15 * 60 + 30, endMinutes: 18 * 60, travelMinutes: afternoonMinutes, ruleCode: "AFTERNOON_PEAK", source: "TEST_PROJECTION", sortOrder: 2 },
      ] });
    }
  }

  const teamRows = [];
  for (const [code, name, departmentCode] of fixedTeamSeeds) {
    const departmentId = departmentIdByCode.get(departmentCode);
    if (!departmentId) throw new Error(`Vantar deild fyrir teymi ${code}.`);
    const team = await prisma.employeeTeam.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, departmentId, code, name, teamType: "FIXED", notes: TEST_MARKER },
      update: { departmentId, name, teamType: "FIXED", isActive: true, notes: TEST_MARKER },
    });
    teamRows.push(team);
  }

  const employeeRows = Array.from({ length: EMPLOYEE_COUNT }, (_, index) => {
    const number = index + 1;
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[(index * 3) % lastNames.length];
    const profile = employeeSeedProfile(index);
    const departmentId = departmentIdByCode.get(profile.departmentCode);
    if (!departmentId) throw new Error(`Vantar deild ${profile.departmentCode}.`);
    return {
      companyId: company.id,
      employeeNumber: `${EMPLOYEE_PREFIX}${pad(number, 2)}`,
      fullName: `Prófun ${pad(number, 2)} – ${firstName} ${lastName}`,
      email: `gloggt-loadtest-${pad(number, 2)}@example.invalid`,
      preferredLanguage: languages[index % languages.length],
      jobTitle: profile.jobTitle,
      department: departmentNameByCode.get(profile.departmentCode) ?? null,
      departmentId,
      baseOperationalLocationId: operationalLocationIdByCode.get(employeeBaseLocationCode(index, profile.departmentCode)) ?? null,
      employmentKind: "EMPLOYEE",
      employmentPercent: index % 7 === 0 ? 50 : index % 5 === 0 ? 80 : 100,
      incidentalWorkMode: profile.incidentalWorkMode,
      incidentalWorkNotes: profile.incidentalWorkMode === "AUTO_IF_NEEDED"
        ? `${TEST_MARKER} Prófun á ákvæði um önnur tilfallandi störf innan ábyrgðardeildar.`
        : null,
      isActive: true,
      notes: `${TEST_MARKER} Sjálfvirkt prófunargagn fyrir Verk/Dagskipulag.`,
    };
  });

  const createdEmployees = await prisma.employee.createMany({ data: employeeRows });

  const workScopeRows = [];
  for (const [code, name, description] of workScopeSeeds) {
    const scope = await prisma.workScope.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      create: { companyId: company.id, code, name, description },
      update: { name, description, isActive: true },
    });
    workScopeRows.push(scope);
  }
  const workScopeIdByCode = new Map(workScopeRows.map((scope) => [scope.code, scope.id]));

  const seededEmployees = await prisma.employee.findMany({
    where: { companyId: company.id, employeeNumber: { startsWith: EMPLOYEE_PREFIX } },
    select: { id: true, employeeNumber: true, jobTitle: true, departmentId: true },
    orderBy: { employeeNumber: "asc" },
  });

  const qualificationRows = seededEmployees
    .map((employee, index) => {
      const codes = qualificationCodesForEmployee(index, employee.jobTitle ?? "Starfsmaður");
      if (codes.length === 0) return null;
      return {
        companyId: company.id,
        employeeId: employee.id,
        qualificationType: "TEST_PROFILE",
        title: `Prófunarhæfni – ${codes.join(", ")}`,
        qualificationCodes: codes.join(";"),
        notes: TEST_MARKER,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const createdQualifications = qualificationRows.length > 0
    ? await prisma.employeeQualification.createMany({ data: qualificationRows })
    : { count: 0 };

  const employeeWorkScopeRows = seededEmployees.flatMap((employee) => {
    const employeeIndex = Number((employee.employeeNumber ?? "").slice(-2)) - 1;
    const codes = normalWorkScopeCodesForEmployee(employeeIndex);
    return codes.flatMap((code, index) => {
      const workScopeId = workScopeIdByCode.get(code);
      if (!workScopeId) return [];
      return [{
        companyId: company.id,
        employeeId: employee.id,
        workScopeId,
        isPrimary: index === 0,
        isActive: true,
        notes: TEST_MARKER,
      }];
    });
  });
  const createdEmployeeWorkScopes = employeeWorkScopeRows.length > 0
    ? await prisma.employeeWorkScope.createMany({ data: employeeWorkScopeRows })
    : { count: 0 };

  const teamsByDepartmentId = new Map<number, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByDepartmentId.get(team.departmentId) ?? [];
    list.push(team);
    teamsByDepartmentId.set(team.departmentId, list);
  }
  const employeeTeamRows = seededEmployees.flatMap((employee, index) => {
    const teams = teamsByDepartmentId.get(employee.departmentId ?? -1) ?? [];
    if (teams.length === 0) return [];
    const team = teams[index % teams.length];
    return [{ companyId: company.id, employeeId: employee.id, teamId: team.id, isPrimary: true, isActive: true, notes: TEST_MARKER }];
  });
  const createdEmployeeTeams = employeeTeamRows.length > 0
    ? await prisma.employeeTeamMembership.createMany({ data: employeeTeamRows })
    : { count: 0 };

  const workRows = Array.from({ length: workCount }, (_, index) => {
    const number = index + 1;
    const template = balancedWorkTemplateFor(index);
    const requiredPeople = requiredPeopleFor(index);
    const estimatedMinutes = estimatedDurations[bucket(index, 59) % estimatedDurations.length];
    const ageDays = Math.round((Date.now() - createdAtFor(index).getTime()) / 86400000);
    const title = `${template[0]} ${pad(number, 4)}`;
    const responsibleDepartmentCode = responsibleDepartmentCodeForTitle(title);
    const locationDepartmentCode = locationDepartmentCodeForWork(title, index);
    const operationalLocationCode = workLocationCode(index);
    const operationalLocation = operationalLocationSeedByCode.get(operationalLocationCode);
    const completionDeadline = completionDeadlineFor(index);
    return {
      companyId: company.id,
      sourceLanguage: "is",
      workNumber: null,
      workKey: WORK_KEY,
      externalId: `${WORK_EXTERNAL_PREFIX}${pad(number, 4)}`,
      title,
      description: `${template[1]} Beiðni er um ${ageDays} daga gömul. ${TEST_MARKER}`,
      address: operationalLocation?.address ?? null,
      responsibleDepartmentId: departmentIdByCode.get(responsibleDepartmentCode) ?? null,
      locationDepartmentId: departmentIdByCode.get(locationDepartmentCode) ?? null,
      operationalLocationId: operationalLocationIdByCode.get(operationalLocationCode) ?? null,
      priority: priorityFor(index),
      requiredPeople,
      estimatedMinutes,
      plannedDate: null,
      plannedStartMinutes: null,
      completionDeadlineDate: completionDeadline?.date ?? null,
      completionDeadlineMinutes: completionDeadline?.minutes ?? null,
      allowAfterWorkdayEnd: completionDeadline?.allowAfterWorkdayEnd ?? false,
      workdayEndExceptionReason: completionDeadline?.reason ?? null,
      photoRequirement: "NONE",
      status: "NEW",
      createdAt: createdAtFor(index),
    };
  });

  const createdWorks = await prisma.workOrder.createMany({ data: workRows });

  const seededWorks = await prisma.workOrder.findMany({
    where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX } },
    select: {
      id: true,
      externalId: true,
      title: true,
      description: true,
      requiredPeople: true,
      estimatedMinutes: true,
    },
    orderBy: { externalId: "asc" },
  });

  if (seededWorks.length !== workCount) {
    throw new Error(`Vænti ${workCount} Verka en fann ${seededWorks.length}. Hætti áður en Verkþættir eru stofnaðir.`);
  }

  const workPartRows = seededWorks.map((work, index) => {
    const staffingProfile = staffingProfileFor(work.title, work.requiredPeople, index);
    const workScopeId = workScopeIdByCode.get(workScopeCodeForTitle(work.title)) ?? null;
    return {
      companyId: company.id,
      workOrderId: work.id,
      sequence: 1,
      sourceLanguage: "is",
      title: work.title,
      description: work.description,
      status: "PLANNED",
      requiredPeople: work.requiredPeople,
      estimatedMinutes: work.estimatedMinutes,
      photoRequirement: "INHERIT",
      workScopeId,
      requiredQualificationCodes: staffingProfile.commonQualificationCodes.length > 0
        ? staffingProfile.commonQualificationCodes.join(";")
        : null,
    };
  });

  const createdParts = await prisma.workPart.createMany({ data: workPartRows });

  const seededParts = await prisma.workPart.findMany({
    where: { companyId: company.id, workOrder: { externalId: { startsWith: WORK_EXTERNAL_PREFIX } } },
    select: {
      id: true,
      workOrder: {
        select: { externalId: true, title: true, requiredPeople: true },
      },
    },
    orderBy: { workOrder: { externalId: "asc" } },
  });

  const staffingRequirementRows = seededParts.flatMap((part, index) => {
    const profile = staffingProfileFor(part.workOrder.title, part.workOrder.requiredPeople, index);
    return profile.requirements.map((requirement, requirementIndex) => ({
      companyId: company.id,
      workPartId: part.id,
      sequence: requirementIndex + 1,
      roleCode: requirement.roleCode,
      quantity: requirement.quantity,
      workScopeId: requirement.workScopeCode ? workScopeIdByCode.get(requirement.workScopeCode) ?? null : null,
      requiredQualificationCodes: requirement.requiredQualificationCodes.length > 0
        ? requirement.requiredQualificationCodes.join(";")
        : null,
      preferredQualificationCodes: requirement.preferredQualificationCodes.length > 0
        ? requirement.preferredQualificationCodes.join(";")
        : null,
    }));
  });

  const createdStaffingRequirements = staffingRequirementRows.length > 0
    ? await prisma.workPartStaffingRequirement.createMany({ data: staffingRequirementRows })
    : { count: 0 };

  const [employeeTotal, workTotal, partTotal, qualificationTotal, employeeWorkScopeTotal, employeeTeamTotal, staffingRequirementTotal, deadlineTotal, exceptionTotal] = await Promise.all([
    prisma.employee.count({ where: { companyId: company.id, employeeNumber: { startsWith: EMPLOYEE_PREFIX } } }),
    prisma.workOrder.count({ where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX } } }),
    prisma.workPart.count({ where: { companyId: company.id, workOrder: { externalId: { startsWith: WORK_EXTERNAL_PREFIX } } } }),
    prisma.employeeQualification.count({ where: { companyId: company.id, employee: { employeeNumber: { startsWith: EMPLOYEE_PREFIX } } } }),
    prisma.employeeWorkScope.count({ where: { companyId: company.id, employee: { employeeNumber: { startsWith: EMPLOYEE_PREFIX } }, isActive: true } }),
    prisma.employeeTeamMembership.count({ where: { companyId: company.id, employee: { employeeNumber: { startsWith: EMPLOYEE_PREFIX } }, isActive: true } }),
    prisma.workPartStaffingRequirement.count({ where: { companyId: company.id, workPart: { workOrder: { externalId: { startsWith: WORK_EXTERNAL_PREFIX } } } } }),
    prisma.workOrder.count({ where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX }, completionDeadlineDate: { not: null } } }),
    prisma.workOrder.count({ where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX }, allowAfterWorkdayEnd: true } }),
  ]);

  console.log("\nTilbúið.");
  console.log(`Starfsmenn stofnaðir í þessari keyrslu: ${createdEmployees.count}`);
  console.log(`Hæfniskráningar stofnaðar: ${createdQualifications.count}`);
  console.log(`Starfssviðstengingar stofnaðar: ${createdEmployeeWorkScopes.count}`);
  console.log(`Fastar teymistengingar stofnaðar: ${createdEmployeeTeams.count}`);
  console.log(`Verk stofnuð í þessari keyrslu: ${createdWorks.count}`);
  console.log(`Verkþættir stofnaðir í þessari keyrslu: ${createdParts.count}`);
  console.log(`Mönnunarkröfur stofnaðar: ${createdStaffingRequirements.count}`);
  console.log(`Staðfest heild: ${employeeTotal} starfsmenn, ${qualificationTotal} hæfniskráningar, ${employeeWorkScopeTotal} starfssviðstengingar, ${employeeTeamTotal} teymistengingar, ${workTotal} Verk, ${partTotal} Verkþættir, ${staffingRequirementTotal} mönnunarkröfur.`);
  console.log(`Skipulag: ${departmentRows.length} deildir/einingar og ${teamRows.length} föst teymi. Ræsting og Viðhald geta unnið á öðrum staðdeildum en bera áfram sína eigin ábyrgðardeild.`);
  console.log(`Ferðalag: ${operationalLocations.length} rekstrarstaðir og ${routeRows.length} stefnuvirkar TEST_PROJECTION leiðir. Höfuðborgarleiðir hafa sérstakt morgun-/síðdegisálag; Suðurnes eru vægari.`);
  console.log(`Lokatímar: ${deadlineTotal} Verk með „Klárað fyrir“, þar af ${exceptionTotal} með meðvitaða dagsloka-undantekningu.`);
  console.log("Öll Verkin eru án plannedDate og plannedStartMinutes svo Dagskipulag velji úr stórum sameiginlegum verkabanka yfir daginn.");
  console.log("Prófaðu t.d. 08:00, 10:30, 13:00 og 15:00 eftir því sem úthlutanir og staða breytast.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
