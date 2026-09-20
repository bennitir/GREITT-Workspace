import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { createVatPeriod } from "@/app/actions/vatActions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import { getEffectiveUser } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { vatMonthNames, vatText } from "@/lib/i18n/vat";

const formatKr = (amount: number) =>
  formatNumber(amount, {
    maximumFractionDigits: 0,
  });

type SettlementType =
  | "BIMONTHLY"
  | "MONTHLY"
  | "ANNUAL";

type PeriodOption = {
  value: number;
  label: string;
  startMonth: number;
  monthCount: number;
};

function getSettlementLabel(
  settlementType: string | null,
  t: ReturnType<typeof vatText>,
) {
  switch (settlementType) {
    case "BIMONTHLY":
      return t.bimonthly;
    case "MONTHLY":
      return t.monthly;
    case "ANNUAL":
      return t.annual;
    default:
      return t.notConfirmed;
  }
}

function getPeriodOptions(
  settlementType: string | null,
  t: ReturnType<typeof vatText>,
  monthNames: readonly string[],
): PeriodOption[] {
  if (settlementType === "MONTHLY") {
    return monthNames.map((label, index) => ({
      value: index + 1,
      label,
      startMonth: index,
      monthCount: 1,
    }));
  }

  if (settlementType === "ANNUAL") {
    return [{ value: 1, label: t.wholeYear, startMonth: 0, monthCount: 12 }];
  }

  const short = monthNames.map((name) => name.slice(0, 3));
  return [
    { value: 1, label: `${short[0]}–${short[1]}`, startMonth: 0, monthCount: 2 },
    { value: 2, label: `${short[2]}–${short[3]}`, startMonth: 2, monthCount: 2 },
    { value: 3, label: `${short[4]}–${short[5]}`, startMonth: 4, monthCount: 2 },
    { value: 4, label: `${short[6]}–${short[7]}`, startMonth: 6, monthCount: 2 },
    { value: 5, label: `${short[8]}–${short[9]}`, startMonth: 8, monthCount: 2 },
    { value: 6, label: `${short[10]}–${short[11]}`, startMonth: 10, monthCount: 2 },
  ];
}

function getDefaultPeriod(
  settlementType: string | null,
  month: number
) {
  if (settlementType === "MONTHLY") {
    return month + 1;
  }

  if (settlementType === "ANNUAL") {
    return 1;
  }

  return Math.floor(month / 2) + 1;
}

function formatOptionalDate(date: Date | null, t: ReturnType<typeof vatText>) {
  return date ? formatDate(date) : t.notRegisteredValue;
}

export default async function VskPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    period?: string;
  }>;
}) {
  const cookieStore = await cookies();
  const language = await getCurrentInterfaceLanguage();
  const t = vatText(language);
  const monthNames = vatMonthNames(language);

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  if (activeUser.role !== "ADMIN") {
    const access =
      await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: activeUser.id,
            companyId: activeCompanyId,
          },
        },
      });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  /*
   * Fyrst sækjum við fyrirtækið.
   *
   * Uppgjörstegund fyrirtækisins ræður síðan hvaða
   * VSK-tímabil eru í boði.
   */
  const company = await prisma.company.findUnique({
    where: {
      id: activeCompanyId,
    },
    select: {
      name: true,
      kennitala: true,

      vatRegistered: true,
      vatNumber: true,
      vatRegistrationDate: true,
      vatSettlementType: true,
      vatDataSource: true,
      vatDataUpdatedAt: true,
      vatConfirmedAt: true,
      vatConfirmedBy: true,
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const params = await searchParams;

  const now = new Date();

  const defaultYear = now.getUTCFullYear();

  const periodOptions = getPeriodOptions(
    company.vatSettlementType,
    t,
    monthNames,
  );

  const defaultPeriod = getDefaultPeriod(
    company.vatSettlementType,
    now.getUTCMonth()
  );

  const selectedYearCandidate = Number(
    params.year ?? String(defaultYear)
  );

  const selectedYear = Number.isInteger(
    selectedYearCandidate
  )
    ? selectedYearCandidate
    : defaultYear;

  const requestedPeriod = Number(
    params.period ?? String(defaultPeriod)
  );

  const selectedPeriodOption =
    periodOptions.find(
      (option) => option.value === requestedPeriod
    ) ??
    periodOptions.find(
      (option) => option.value === defaultPeriod
    ) ??
    periodOptions[0];

  const selectedPeriod =
    selectedPeriodOption.value;

  const periodStart = new Date(
    Date.UTC(
      selectedYear,
      selectedPeriodOption.startMonth,
      1
    )
  );

  const periodEnd = new Date(
    Date.UTC(
      selectedYear,
      selectedPeriodOption.startMonth +
        selectedPeriodOption.monthCount,
      1
    )
  );

  const [accounts, receipts] =
    await Promise.all([
      prisma.account.findMany({
        where: {
          companyId: activeCompanyId,
          isActive: true,
        },
        select: {
          number: true,
          name: true,
          type: true,
        },
      }),

      prisma.receipt.findMany({
        where: {
          companyId: activeCompanyId,
          status: "APPROVED",
        },

        select: {
          id: true,
          voucherNumber: true,
          aiDate: true,
          date: true,
          description: true,

          entries: {
            select: {
              account: true,
              debit: true,
              credit: true,
            },
          },

          aiDetectedDocuments: {
            where: {
              approvedAt: {
                not: null,
              },
            },

            select: {
              id: true,
              date: true,
              voucherNumber: true,
              merchantName: true,
              summary: true,
              approvedAt: true,

              bookingEntries: {
                select: {
                  account: true,
                  debit: true,
                  credit: true,
                },
              },
            },
          },
        },
      }),
    ]);

  /*
   * Núverandi VatPeriod gagnalíkan notar year + period.
   * period fær hér merkingu samkvæmt uppgjörstegund:
   *
   * BIMONTHLY: 1–6
   * MONTHLY:   1–12
   * ANNUAL:    1
   */
  const vatPeriod =
    await prisma.vatPeriod.findUnique({
      where: {
        companyId_year_period: {
          companyId: activeCompanyId,
          year: selectedYear,
          period: selectedPeriod,
        },
      },
      include: {
        submissions: {
          orderBy: {
            version: "desc",
          },
        },
      },
    });

  /*
   * Núverandi bókhaldsgrunnur.
   *
   * 2510 = útskattur
   * 2520 = innskattur
   *
   * Þetta er varðveitt óbreytt í þessum áfanga.
   */
  const output = new Set(
    accounts
      .filter(
        (account) => account.number === "2510"
      )
      .map((account) => account.number)
  );

  const input = new Set(
    accounts
      .filter(
        (account) => account.number === "2520"
      )
      .map((account) => account.number)
  );

  let outputVat = 0;
  let inputVat = 0;

  const rows: {
    id: number;
    voucher: number | null;
    date: Date | null;
    text: string;
    output: number;
    input: number;
  }[] = [];

  let taxableSales24 = 0;

  for (const receipt of receipts) {
    const approvedDocuments =
      receipt.aiDetectedDocuments;

    for (const document of approvedDocuments) {
      const documentDate = document.date;

      if (!documentDate) continue;

      const isInSelectedPeriod =
        documentDate >= periodStart &&
        documentDate < periodEnd;

      if (!isInSelectedPeriod) continue;

      const isVatSettlement =
        document.bookingEntries.some(
          (entry) => entry.account === "2590"
        );

      if (isVatSettlement) continue;

      let rowOutput = 0;
      let rowInput = 0;

      for (const entry of document.bookingEntries) {
        if (entry.account === "3000") {
          taxableSales24 +=
            entry.credit - entry.debit;
        }

        if (output.has(entry.account)) {
          rowOutput +=
            entry.credit - entry.debit;
        }

        if (input.has(entry.account)) {
          rowInput +=
            entry.debit - entry.credit;
        }
      }

      outputVat += rowOutput;
      inputVat += rowInput;

      if (rowOutput || rowInput) {
        rows.push({
          id: document.id,
          voucher: document.voucherNumber,
          date: documentDate,
          text:
            document.merchantName ??
            document.summary,
          output: rowOutput,
          input: rowInput,
        });
      }
    }

    /*
     * Ef receipt hefur samþykkt undirskjöl eru þau
     * sannleikurinn. Þá teljum við ekki receipt sjálft
     * aftur og forðumst tvítalningu.
     */
    if (approvedDocuments.length > 0) {
      continue;
    }

    const receiptDate =
      receipt.aiDate ?? receipt.date;

    if (!receiptDate) continue;

    const isInSelectedPeriod =
      receiptDate >= periodStart &&
      receiptDate < periodEnd;

    if (!isInSelectedPeriod) continue;

    const isVatSettlement =
      receipt.entries.some(
        (entry) => entry.account === "2590"
      );

    if (isVatSettlement) continue;

    let rowOutput = 0;
    let rowInput = 0;

    for (const entry of receipt.entries) {
      if (entry.account === "3000") {
        taxableSales24 +=
          entry.credit - entry.debit;
      }

      if (output.has(entry.account)) {
        rowOutput +=
          entry.credit - entry.debit;
      }

      if (input.has(entry.account)) {
        rowInput +=
          entry.debit - entry.credit;
      }
    }

    outputVat += rowOutput;
    inputVat += rowInput;

    if (rowOutput || rowInput) {
      rows.push({
        id: receipt.id,
        voucher: receipt.voucherNumber,
        date: receiptDate,
        text: receipt.description,
        output: rowOutput,
        input: rowInput,
      });
    }
  }

  rows.sort((a, b) => {
    const aTime = a.date?.getTime() ?? 0;
    const bTime = b.date?.getTime() ?? 0;

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return (a.voucher ?? 0) - (b.voucher ?? 0);
  });

  const balance = outputVat - inputVat;

  const settlementType =
    company.vatSettlementType as
      | SettlementType
      | null;

  const vatStatusConfirmed =
    company.vatRegistered !== null;

  const isVatRegistered =
    company.vatRegistered === true;

  const isNotVatRegistered =
    company.vatRegistered === false;

  const settlementTypeConfirmed =
    settlementType === "BIMONTHLY" ||
    settlementType === "MONTHLY" ||
    settlementType === "ANNUAL";

  const missingVatNumber =
    isVatRegistered && !company.vatNumber;

  const missingSettlementType =
    isVatRegistered &&
    !settlementTypeConfirmed;

  const missingRegistrationDate =
    isVatRegistered &&
    !company.vatRegistrationDate;

  const hasVatSetupWarning =
    !vatStatusConfirmed ||
    missingVatNumber ||
    missingSettlementType ||
    missingRegistrationDate;

  /*
   * Við leyfum ekki stofnun VSK-tímabils fyrr en
   * kerfið veit að fyrirtækið sé VSK-skráð og
   * uppgjörstegundin sé staðfest.
   *
   * VSK-númer og skráningardagur eru mikilvæg
   * stofngögn og eru sýnd sem viðvörun ef þau vantar,
   * en við látum þau ekki ein og sér stjórna stöðunni.
   */
  const canCreateVatPeriod =
    isVatRegistered &&
    settlementTypeConfirmed;

  return (
    <main className="p-8">
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {/* VSK-STAÐA FYRIRTÆKIS */}
      <section className="mt-6 max-w-6xl rounded-xl border bg-white shadow-sm">
        <div className="border-b p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t.activeCompany}
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                {company.name}
              </h2>

              <p className="mt-1 text-slate-600">
                {t.idNumberShort} {company.kennitala}
              </p>
            </div>

            <div
              className={`rounded-lg px-4 py-3 font-semibold ${
                isVatRegistered
                  ? hasVatSetupWarning
                    ? "bg-amber-50 text-amber-800"
                    : "bg-green-50 text-green-800"
                  : isNotVatRegistered
                    ? "bg-slate-100 text-slate-700"
                    : "bg-amber-50 text-amber-800"
              }`}
            >
              {isVatRegistered
                ? hasVatSetupWarning
                  ? t.vatRegisteredIncomplete
                  : t.vatRegistered
                : isNotVatRegistered
                  ? t.notVatRegistered
                  : t.vatUnknown}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">
                {t.vatNumber}
              </p>

              <p className="mt-1 font-semibold">
                {company.vatNumber ||
                  t.notRegisteredValue}
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">
                {t.registeredFrom}
              </p>

              <p className="mt-1 font-semibold">
                {formatOptionalDate(
                  company.vatRegistrationDate,
                  t,
                )}
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">
                {t.settlementType}
              </p>

              <p className="mt-1 font-semibold">
                {getSettlementLabel(
                  company.vatSettlementType,
                  t,
                )}
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">
                {t.confirmation}
              </p>

              <p className="mt-1 font-semibold">
                {company.vatConfirmedAt
                  ? formatDate(
                      company.vatConfirmedAt
                    )
                  : t.notConfirmed}
              </p>

              {company.vatConfirmedBy && (
                <p className="mt-1 text-sm text-slate-500">
                  {company.vatConfirmedBy}
                </p>
              )}
            </div>
          </div>

          {company.vatDataSource && (
            <p className="mt-4 text-sm text-slate-500">
              {t.source}:{" "}
              <span className="font-medium text-slate-700">
                {company.vatDataSource}
              </span>

              {company.vatDataUpdatedAt
                ? ` · ${t.updated} ${formatDate(
                    company.vatDataUpdatedAt
                  )}`
                : ""}
            </p>
          )}
        </div>

        {/* STOFNGAGNAVIÐVARANIR */}
        {hasVatSetupWarning && (
          <div className="border-b bg-amber-50 p-6">
            <p className="font-bold text-amber-900">
              {t.checkSetup}
            </p>

            <div className="mt-2 space-y-1 text-sm text-amber-900">
              {!vatStatusConfirmed && (
                <p>
                  {t.warningStatus}
                </p>
              )}

              {missingVatNumber && (
                <p>{t.warningNumber}</p>
              )}

              {missingRegistrationDate && (
                <p>
                  {t.warningDate}
                </p>
              )}

              {missingSettlementType && (
                <p>
                  {t.warningSettlement}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* EKKI VSK-SKRÁÐ */}
      {isNotVatRegistered && (
        <section className="mt-6 max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">
            {t.vatNotApplicable}
          </h2>

          <p className="mt-2 text-slate-600">
            {t.vatNotApplicableText}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {t.vatNotApplicableHelp}
          </p>
        </section>
      )}

      {/* VSK-STAÐA ÓSTAÐFEST */}
      {!vatStatusConfirmed && (
        <section className="mt-6 max-w-6xl rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">
            {t.vatNeedsConfirmation}
          </h2>

          <p className="mt-2 text-amber-900">
            {t.vatNeedsConfirmationText}
          </p>

          <p className="mt-2 text-sm text-amber-800">
            {t.vatNeedsConfirmationHelp}
          </p>
        </section>
      )}

      {/* VSK-UPPGJÖR */}
      {isVatRegistered && (
        <>
          <section className="mt-6 max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">
                {t.year}:
              </span>

              <a
                href={`/vsk?year=${
                  selectedYear - 1
                }&period=${selectedPeriod}`}
                className="rounded-lg border bg-white px-3 py-2"
              >
                ← {selectedYear - 1}
              </a>

              <span className="rounded-lg border bg-slate-100 px-4 py-2 font-bold">
                {selectedYear}
              </span>

              <a
                href={`/vsk?year=${
                  selectedYear + 1
                }&period=${selectedPeriod}`}
                className="rounded-lg border bg-white px-3 py-2"
              >
                {selectedYear + 1} →
              </a>
            </div>

            <div className="mt-4">
              <p className="font-semibold">
                {t.vatPeriod}:
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {periodOptions.map((option) => (
                  <a
                    key={option.value}
                    href={`/vsk?year=${selectedYear}&period=${option.value}`}
                    className={`rounded-lg border px-3 py-2 ${
                      selectedPeriod ===
                      option.value
                        ? "bg-blue-600 text-white"
                        : "bg-white"
                    }`}
                  >
                    {option.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">
                    {t.periodStatus}
                  </p>

                  <p className="mt-1 text-lg font-bold">
                    {vatPeriod
                      ? vatPeriod.status
                      : t.notCreated}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {selectedPeriodOption.label}{" "}
                    {selectedYear}
                  </p>
                </div>

                <div className="text-right text-sm text-slate-500">
                  <p>
                    {getSettlementLabel(
                      company.vatSettlementType,
                      t,
                    )}
                  </p>

                  <p className="mt-1">
                    {formatDate(periodStart)} –{" "}
                    {formatDate(
                      new Date(
                        periodEnd.getTime() - 1
                      )
                    )}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                {vatPeriod
                  ? `${vatPeriod.submissions.length} ${t.submissions}`
                  : t.periodNotCreated}
              </p>
            </div>

            {!vatPeriod &&
              canCreateVatPeriod && (
                <form
                  action={async () => {
                    "use server";

                    await createVatPeriod(
                      activeCompanyId,
                      selectedYear,
                      selectedPeriod
                    );
                  }}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
                  >
                    {t.createPeriod}
                  </button>
                </form>
              )}

            {!settlementTypeConfirmed && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {t.createBlocked}
              </div>
            )}
          </section>

          {/* VSK-ÚTREIKNINGUR */}
          <section className="mt-6 max-w-6xl rounded-xl border bg-white shadow-sm">
            <div className="border-b p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {t.calculation}
                  </p>

                  <h2 className="mt-1 text-2xl font-bold">
                    {selectedPeriodOption.label}{" "}
                    {selectedYear}
                  </h2>

                  <p className="mt-1 text-slate-600">
                    {t.calculationHelp}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                  {getSettlementLabel(
                    company.vatSettlementType,
                    t,
                  )}
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold text-slate-500">
                    {t.taxable24}
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {formatKr(taxableSales24)} kr.
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold text-slate-500">
                    {t.taxable11}
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    0 kr.
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm font-semibold text-slate-500">
                    {t.exempt}
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    0 kr.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-0 border-y md:grid-cols-3">
              <div className="p-6 md:border-r">
                <p className="text-slate-500">
                  {t.outputVat}
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {formatKr(outputVat)} kr.
                </p>
              </div>

              <div className="p-6 md:border-r">
                <p className="text-slate-500">
                  {t.inputVat}
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {formatKr(inputVat)} kr.
                </p>
              </div>

              <div className="p-6">
                <p className="text-slate-500">
                  {t.assessment}
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {formatKr(balance)} kr.
                </p>
              </div>

              <div className="p-6 md:border-r md:border-t">
                <p className="text-slate-500">
                  {t.surcharge}
                </p>

                <p className="mt-2 text-3xl font-bold">
                  0 kr.
                </p>
              </div>

              <div className="p-6 md:col-span-2 md:border-t">
                <p className="text-slate-500">
                  {t.payableCredit}
                </p>

                <p
                  className={`mt-2 text-3xl font-bold ${
                    balance > 0
                      ? "text-red-700"
                      : balance < 0
                        ? "text-green-700"
                        : ""
                  }`}
                >
                  {formatKr(Math.abs(balance))} kr.
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {balance > 0
                    ? t.payable
                    : balance < 0
                      ? t.credit
                      : t.zeroBalance}
                </p>
              </div>
            </div>

            <details open className="p-6">
              <summary className="cursor-pointer text-xl font-bold">
                {t.breakdown} (
                {rows.length})
              </summary>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="p-3">
                        {t.dateShort}
                      </th>

                      <th className="p-3">
                        {t.voucher}
                      </th>

                      <th className="p-3">
                        {t.descriptionCol}
                      </th>

                      <th className="p-3 text-right">
                        {t.outputVat}
                      </th>

                      <th className="p-3 text-right">
                        {t.inputVat}
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.id}-${row.voucher ?? "x"}`}
                        className="border-b"
                      >
                        <td className="p-3">
                          {row.date
                            ? formatDate(row.date)
                            : "—"}
                        </td>

                        <td className="p-3">
                          {row.voucher ?? "—"}
                        </td>

                        <td className="p-3">
                          {row.text}
                        </td>

                        <td className="p-3 text-right">
                          {row.output
                            ? `${formatKr(
                                row.output
                              )} kr.`
                            : "—"}
                        </td>

                        <td className="p-3 text-right">
                          {row.input
                            ? `${formatKr(
                                row.input
                              )} kr.`
                            : "—"}
                        </td>
                      </tr>
                    ))}

                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-6 text-center text-slate-500"
                        >
                          {t.noRows}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </main>
  );
}