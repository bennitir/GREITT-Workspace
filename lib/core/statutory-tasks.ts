import { prisma } from "@/lib/prisma";
import {
  nextIcelandicBusinessDay,
  vatGeneralDueDate,
  vatGeneralPeriodDates,
  type VatGeneralPeriod,
} from "@/lib/core/task-schedules";

type CompanyRegistration = {
  id: number;
  vatRegistered: boolean | null;
  vatRegistrationDate: Date | null;
  vatSettlementType: string | null;
  payrollRegistered: boolean | null;
  payrollRegistrationDate: Date | null;
};

const VAT_PERIOD_BY_END_MONTH: Record<number, VatGeneralPeriod> = {
  1: "JAN_FEB",
  3: "MAR_APR",
  5: "MAY_JUN",
  7: "JUL_AUG",
  9: "SEP_OCT",
  11: "NOV_DEC",
};

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function currentMonthPeriod(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
  return { start, end };
}

function latestEndedBimonthlyPeriod(now: Date) {
  let year = now.getFullYear();
  let endMonth = now.getMonth() - 1;
  if (endMonth < 0) {
    year -= 1;
    endMonth = 11;
  }
  if (endMonth % 2 === 0) endMonth -= 1;
  if (endMonth < 0) {
    year -= 1;
    endMonth = 11;
  }
  const period = VAT_PERIOD_BY_END_MONTH[endMonth];
  return { year, period };
}

function isOnOrAfterRegistration(periodEnd: Date, registrationDate: Date | null) {
  return !registrationDate || periodEnd >= atNoon(registrationDate);
}

async function createOnce(data: {
  companyId: number;
  taskType: string;
  title: string;
  details: string;
  dueAt: Date;
  priority: string;
  sourceType: string;
  sourceId: string;
  actionPath: string;
  scheduleRule: string;
  periodStart: Date;
  periodEnd: Date;
  dataRequestStatus?: string;
  dataDueAt?: Date | null;
  reminderStartAt?: Date | null;
  reminderIntervalDays?: number;
}) {
  const existing = await prisma.companyTask.findFirst({
    where: {
      companyId: data.companyId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
    },
    select: { id: true },
  });
  if (existing) return;

  try {
    await prisma.companyTask.create({
      data: {
        ...data,
        status: "OPEN",
        recurrenceFrequency: "NONE",
        recurrenceInterval: 1,
      },
    });
  } catch (error) {
    // Samhliða síðuhleðslur geta reynt að stofna sama kerfisverkefnið.
    // Gagnagrunns-unique vörnin sér þá um að aðeins eitt verði til.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return;
    throw error;
  }
}

export async function ensureCompanyStatutoryTasks(companyId: number, now = new Date()) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      vatRegistered: true,
      vatRegistrationDate: true,
      vatSettlementType: true,
      payrollRegistered: true,
      payrollRegistrationDate: true,
    },
  }) as CompanyRegistration | null;
  if (!company) return;

  // Launagreiðendaskrá er sjálfstæð skilaskylda. Engin laun afnema ekki
  // verkefnið; núllskil eru áfram skil fyrir skráðan launagreiðanda.
  // Verkefnið er stofnað fyrir yfirstandandi mánuð svo GLÖGGT geti sýnt
  // skylduna og minnt á hana áður en skilafresturinn rennur upp.
  if (company.payrollRegistered === true) {
    const { start, end } = currentMonthPeriod(now);
    if (isOnOrAfterRegistration(end, company.payrollRegistrationDate)) {
      const dueAt = nextIcelandicBusinessDay(new Date(end.getFullYear(), end.getMonth() + 1, 15, 12));
      const sourceId = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      await createOnce({
        companyId,
        taskType: "PAYROLL",
        title: `Staðgreiðsla og tryggingagjald – ${sourceId}`,
        details: "Mánaðarleg skil samkvæmt skráningu á launagreiðendaskrá. Skilaskyldan gildir einnig þegar engin laun voru greidd.",
        dueAt,
        priority: "HIGH",
        sourceType: "PAYROLL_WITHHOLDING_OBLIGATION",
        sourceId,
        actionPath: "/verkefni",
        scheduleRule: "PAYROLL_MONTHLY",
        periodStart: start,
        periodEnd: end,
      });
    }
  }

  // Fyrsti sjálfvirki VSK-ferillinn styður staðfesta almenna tveggja mánaða
  // uppgjörsreglu. Aðrar uppgjörstegundir eru látnar ósnertar þar til þeirra
  // sérreglur hafa verið staðfestar.
  if (company.vatRegistered === true && company.vatSettlementType === "BIMONTHLY") {
    const latest = latestEndedBimonthlyPeriod(now);
    const dates = vatGeneralPeriodDates(latest.year, latest.period);
    if (isOnOrAfterRegistration(dates.end, company.vatRegistrationDate)) {
      const sourceId = `${latest.year}-${latest.period}`;
      // Sjálfgefið gagnaskilamarkmið er 15. dagur mánaðarins eftir lok
      // VSK-tímabils og fyrsta áminning 5 dögum fyrr. Þetta er aðeins
      // upphafsgildi á verkefninu og má stilla fyrir viðskiptavininn.
      const dataDueAt = new Date(dates.end.getFullYear(), dates.end.getMonth() + 1, 15, 12);
      const reminderStartAt = new Date(dataDueAt);
      reminderStartAt.setDate(reminderStartAt.getDate() - 5);

      await createOnce({
        companyId,
        taskType: "VAT",
        title: `VSK – ${sourceId}`,
        details: "VSK-skil samkvæmt staðfestri tveggja mánaða uppgjörsskráningu fyrirtækisins.",
        dueAt: vatGeneralDueDate(latest.year, latest.period),
        priority: "HIGH",
        sourceType: "VAT_OBLIGATION",
        sourceId,
        actionPath: "/vsk",
        scheduleRule: "VAT_GENERAL_BIMONTHLY",
        periodStart: dates.start,
        periodEnd: dates.end,
        dataRequestStatus: "REQUESTED",
        dataDueAt,
        reminderStartAt,
        reminderIntervalDays: 3,
      });
    }
  }
}
