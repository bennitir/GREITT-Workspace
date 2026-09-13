import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/locale";
import { formatNumber } from "@/app/banki/_lib/formatting/numbers";
import { bankAnalysisLanguage } from "@/app/banki/_lib/i18n/analysis-text";
import { annualAnalysisText } from "@/app/banki/_lib/i18n/annual-analysis-text";
import { analyzeExpenseEvidence, buildAccountBankAnalysis, buildAnnualBankAnalysis, buildGrantFlowSources } from "@/app/banki/_lib/analysis/annual";
import { parseRawBankData } from "@/app/banki/_lib/analysis/transactions";

type Props = {
  searchParams: Promise<{
    year?: string;
    flow?: string;
    group?: string;
    account?: string;
    incomeSort?: string;
    incomeConfidence?: string;
    expenseSort?: string;
    expenseConfidence?: string;
    expenseCategory?: string;
    q?: string;
    view?: string;
  }>;
};

type SortableGroup = {
  label: string;
  count: number;
  amount: number;
  confidence: string;
};

const confidenceSortRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function sortGroups<T extends SortableGroup>(groups: T[], sort: string) {
  return [...groups].sort((a, b) => {
    if (sort === "count-desc") return b.count - a.count || b.amount - a.amount;
    if (sort === "name-asc") return a.label.localeCompare(b.label, "is");
    if (sort === "confidence-low") {
      return (confidenceSortRank[a.confidence] ?? 9) - (confidenceSortRank[b.confidence] ?? 9) || b.amount - a.amount;
    }
    return b.amount - a.amount || b.count - a.count;
  });
}

function filterGroupsByConfidence<T extends SortableGroup>(groups: T[], confidence: string) {
  if (!["LOW", "MEDIUM", "HIGH"].includes(confidence)) return groups;
  return groups.filter((group) => group.confidence === confidence);
}

function filterGroupsBySearch<T extends SortableGroup>(groups: T[], q: string) {
  const needle = q.trim().toLocaleLowerCase("is");
  if (!needle) return groups;
  return groups.filter((group) => group.label.toLocaleLowerCase("is").includes(needle));
}


async function getContext() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const companyId = Number(store.get("activeCompanyId")?.value);

  if (!token) redirect("/innskraning?next=/banki/arsgreining");
  if (!Number.isInteger(companyId) || companyId < 1) redirect("/fyrirtaeki");

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    redirect("/innskraning?next=/banki/arsgreining");
  }

  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!access?.isActive) redirect("/fyrirtaeki");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });

  return { companyId, language: bankAnalysisLanguage(userSettings?.interfaceLanguage) };
}

export default async function AnnualBankAnalysisPage({ searchParams }: Props) {
  const query = await searchParams;
  const { companyId, language } = await getContext();
  const t = annualAnalysisText(language);

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId, isActive: true },
    orderBy: { id: "asc" },
  });
  const accountIds = accounts.map((account) => account.id);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const allTransactions = accountIds.length
    ? await prisma.bankTransaction.findMany({
        where: { bankAccountId: { in: accountIds } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      })
    : [];

  const years = Array.from(new Set(allTransactions.map((item) => item.date.getFullYear()))).sort((a, b) => b - a);
  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && years.includes(requestedYear)
    ? requestedYear
    : years[0] ?? new Date().getFullYear();

  const yearTransactions = allTransactions
    .filter((item) => item.date.getFullYear() === year)
    .map((item) => ({
      id: item.id,
      bankAccountId: item.bankAccountId,
      bankAccountName: accountById.get(item.bankAccountId)?.name ?? null,
      date: item.date,
      text: item.text,
      amount: Number(item.amount),
      sourceRawData: item.sourceRawData,
    }));

  const analysis = buildAnnualBankAnalysis(yearTransactions);
  const grantAccountIds = new Set(
    accounts
      .filter((account) => /styrk|grant|dotac|грант/i.test(account.name))
      .map((account) => account.id),
  );
  const grantFlows = buildGrantFlowSources(
    yearTransactions,
    analysis.classifiedIncomeGroups,
    analysis.flowThroughSuggestions,
    grantAccountIds,
  );
  const grantFlowIncomingTotal = grantFlows.reduce((sum, item) => sum + item.incomingAmount, 0);
  const grantFlowMatchedTotal = grantFlows.reduce((sum, item) => sum + item.strongMatchedAmount, 0);
  const grantFlowUnmatchedTotal = grantFlows.reduce((sum, item) => sum + item.unmatchedAmount, 0);

  const classificationLabel = (value: string) => ({
    OPERATING_REVENUE: t.operatingRevenue,
    GRANT_CONTRIBUTION: t.grantContribution,
    PAYMENT_SETTLEMENT: t.paymentSettlement,
    LOAN_CAPITAL: t.loanCapital,
    REFUND: t.refunds,
    OTHER: t.other,
    UNKNOWN: t.unknown,
  }[value] ?? value);
  const confidenceLabel = (value: string) => ({ HIGH: t.high, MEDIUM: t.medium, LOW: t.low }[value] ?? value);
  const expenseClassificationLabel = (value: string) => ({
    OPERATING_EXPENSE: t.operatingExpense,
    PREMISES: t.premises,
    UTILITIES: t.utilities,
    TELECOM: t.telecom,
    SOFTWARE: t.software,
    INSURANCE: t.insurance,
    VEHICLE: t.vehicle,
    TRAVEL: t.travel,
    ADVERTISING: t.advertising,
    TRANSPORT: t.transport,
    GOODS_SERVICES: t.goodsServices,
    DINING: t.dining,
    GROCERY_PURCHASE: t.groceryPurchase,
    OFFICE_SUPPLIES: t.officeSupplies,
    RESALE_GOODS: t.resaleGoods,
    EVENT_HOSPITALITY: t.eventHospitality,
    SPORTS_EVENT: t.sportsEvent,
    SPORTS_EQUIPMENT: t.sportsEquipment,
    TELECOM_EQUIPMENT: t.telecomEquipment,
    POS_PAYMENT_SERVICE: t.posPaymentService,
    ADMIN_REGISTRATION_FEE: t.adminRegistrationFee,
    RELATED_ENTITY_FLOW: t.relatedEntityFlow,
    GRANT: t.grants,
    COST_ALLOWANCE: t.costAllowances,
    WAGES: t.wages,
    PAYROLL_RELATED: t.payrollRelated,
    PERSON_PAYMENT: t.personPayments,
    BANK_FEE: t.bankFee,
    CASH_WITHDRAWAL: t.cashWithdrawal,
    ASSET_INVESTMENT: t.assetInvestment,
    LOAN_CAPITAL: t.loanCapital,
    REFUND: t.refunds,
    TAX_FINANCIAL: t.taxFinancial,
    OTHER: t.other,
    MIXED: t.mixedExpense,
    UNKNOWN: t.expenseUnknown,
  }[value] ?? value);

  const incomeSort = ["amount-desc", "count-desc", "name-asc", "confidence-low"].includes(query.incomeSort ?? "")
    ? query.incomeSort!
    : "amount-desc";
  const expenseSort = ["amount-desc", "count-desc", "name-asc", "confidence-low"].includes(query.expenseSort ?? "")
    ? query.expenseSort!
    : "amount-desc";
  const incomeConfidence = ["LOW", "MEDIUM", "HIGH"].includes(query.incomeConfidence ?? "")
    ? query.incomeConfidence!
    : "ALL";
  const expenseConfidence = ["LOW", "MEDIUM", "HIGH"].includes(query.expenseConfidence ?? "")
    ? query.expenseConfidence!
    : "ALL";
  const expenseCategory = ["WAGES", "PAYROLL_RELATED", "PERSON_PAYMENT", "PREMISES", "UTILITIES", "TELECOM", "SOFTWARE", "INSURANCE", "VEHICLE", "TRAVEL", "ADVERTISING", "TRANSPORT", "GOODS_SERVICES", "DINING", "GROCERY_PURCHASE", "OFFICE_SUPPLIES", "RESALE_GOODS", "EVENT_HOSPITALITY", "SPORTS_EVENT", "SPORTS_EQUIPMENT", "TELECOM_EQUIPMENT", "POS_PAYMENT_SERVICE", "ADMIN_REGISTRATION_FEE", "RELATED_ENTITY_FLOW", "GRANT", "CONTRIBUTION", "COST_ALLOWANCE", "BANK_FEE", "CASH_WITHDRAWAL", "ASSET_INVESTMENT", "LOAN_CAPITAL", "REFUND", "TAX_FINANCIAL", "OPERATING_EXPENSE", "OTHER", "MIXED", "UNKNOWN"].includes(query.expenseCategory ?? "")
    ? query.expenseCategory!
    : "ALL";
  const searchQuery = (query.q ?? "").trim();
  const requestedView = query.view ?? "overview";
  const view = ["overview", "summary", "income", "expenses", "flows", "patterns", "accounts"].includes(requestedView)
    ? requestedView
    : "overview";

  const visibleIncomeGroups = sortGroups(
    filterGroupsBySearch(filterGroupsByConfidence(analysis.classifiedIncomeGroups, incomeConfidence), searchQuery),
    incomeSort,
  );
  const expenseCategoryGroups = expenseCategory === "ALL"
    ? analysis.classifiedExpenseGroups
    : analysis.classifiedExpenseGroups.filter((group) =>
        group.classification === expenseCategory ||
        group.breakdown.some((item) => item.classification === expenseCategory)
      );
  const visibleExpenseGroups = sortGroups(
    filterGroupsBySearch(filterGroupsByConfidence(expenseCategoryGroups, expenseConfidence), searchQuery),
    expenseSort,
  );

  const selectedFlow = query.flow === "out" ? "out" : query.flow === "in" ? "in" : null;
  const selectedGroupKey = query.group ?? null;
  const selectedIncomeGroup = selectedFlow === "in"
    ? analysis.classifiedIncomeGroups.find((group) => group.key === selectedGroupKey) ?? null
    : null;
  const selectedExpenseGroup = selectedFlow === "out"
    ? analysis.classifiedExpenseGroups.find((group) => group.key === selectedGroupKey) ?? null
    : null;
  const selectedGroup = selectedIncomeGroup ?? selectedExpenseGroup;
  const selectedCategoryBreakdown = selectedExpenseGroup && expenseCategory !== "ALL"
    ? selectedExpenseGroup.breakdown.find((item) => item.classification === expenseCategory) ?? null
    : null;
  const selectedTransactionIds = new Set(
    selectedCategoryBreakdown?.transactionIds ?? selectedGroup?.transactionIds ?? [],
  );
  const requestedDrilldownAccountId = Number(query.account);
  const selectedTransactions = yearTransactions.filter((item) =>
    selectedTransactionIds.has(item.id) &&
    (!Number.isInteger(requestedDrilldownAccountId) || item.bankAccountId === requestedDrilldownAccountId)
  );
  const baseSelectedRecurringPattern = selectedFlow === "out" && selectedGroup
    ? analysis.recurringExpensePatterns.find((pattern) => pattern.groupKey === selectedGroup.key) ?? null
    : null;

  // A category drilldown must not show a recurring pattern calculated from the
  // counterparty's other transactions. Recalculate the visible pattern from the
  // transactions that are actually in the current research selection.
  const selectedRecurringItems = baseSelectedRecurringPattern
    ? selectedTransactions.filter((item) => baseSelectedRecurringPattern.transactionIds.includes(item.id))
    : [];
  const selectedRecurringMonths = new Set(
    selectedRecurringItems.map((item) => `${item.date.getFullYear()}-${item.date.getMonth() + 1}`),
  );
  const selectedRecurringAmounts = selectedRecurringItems.map((item) => Math.abs(item.amount));
  const selectedRecurringPattern = baseSelectedRecurringPattern && selectedRecurringItems.length >= 2 && selectedRecurringMonths.size >= 2
    ? {
        ...baseSelectedRecurringPattern,
        transactionIds: selectedRecurringItems.map((item) => item.id),
        count: selectedRecurringItems.length,
        monthCount: selectedRecurringMonths.size,
        amount: selectedRecurringAmounts.reduce((sum, amount) => sum + amount, 0),
        averageAmount: selectedRecurringAmounts.reduce((sum, amount) => sum + amount, 0) / selectedRecurringItems.length,
        minAmount: Math.min(...selectedRecurringAmounts),
        maxAmount: Math.max(...selectedRecurringAmounts),
      }
    : null;
  const recurringTransactionIds = new Set(selectedRecurringPattern?.transactionIds ?? []);

  // Deterministic source-account trace for the selected group. This answers
  // which of the company's own bank accounts the payments actually moved
  // through without inferring the economic purpose or recipient bank account.
  const selectedAccountTrace = Array.from(
    selectedTransactions.reduce((groups, item) => {
      const current = groups.get(item.bankAccountId) ?? { bankAccountId: item.bankAccountId, count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(item.amount);
      groups.set(item.bankAccountId, current);
      return groups;
    }, new Map<number, { bankAccountId: number; count: number; amount: number }>()).values(),
  ).sort((a, b) => b.amount - a.amount || b.count - a.count);

  const drilldownHref = (flow: "in" | "out", key: string) => {
    const categoryParam = flow === "out" && expenseCategory !== "ALL"
      ? `&expenseCategory=${encodeURIComponent(expenseCategory)}`
      : "";
    return `/banki/arsgreining?year=${year}&view=${flow === "in" ? "income" : "expenses"}&flow=${flow}&group=${encodeURIComponent(key)}${categoryParam}#faerslur`;
  };

  const byAccount = accounts.map((account) => {
    const tx = yearTransactions.filter((item) => item.bankAccountId === account.id);
    return {
      account,
      count: tx.length,
      inflows: tx.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
      outflows: Math.abs(tx.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)),
    };
  }).filter((row) => row.count > 0);

  const requestedAccountId = Number(query.account);
  const selectedAccount = Number.isInteger(requestedAccountId)
    ? accounts.find((account) => account.id === requestedAccountId) ?? null
    : null;
  const selectedAccountAnalysis = selectedAccount
    ? buildAccountBankAnalysis(yearTransactions, selectedAccount.id)
    : null;
  const accountAnalysisHref = (accountId: number) =>
    `/banki/arsgreining?year=${year}&view=accounts&account=${accountId}#reikningsgreining`;
  const accountFlowDrilldownHref = (flow: "in" | "out", key: string) =>
    `/banki/arsgreining?year=${year}&view=accounts&account=${selectedAccount?.id ?? ""}&flow=${flow}&group=${encodeURIComponent(key)}#faerslur`;

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📊 {t.title}</h1>
          <p className="mt-2 max-w-4xl text-gray-600">{t.subtitle}</p>
        </div>
        <Link href="/banki" className="rounded-lg border px-4 py-2 font-medium">← {t.back}</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="font-medium">{t.year}:</span>
        {years.length ? years.map((candidateYear) => (
          <Link
            key={candidateYear}
            href={`/banki/arsgreining?year=${candidateYear}&view=${view}`}
            className={`rounded-lg border px-3 py-1.5 ${candidateYear === year ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            {candidateYear}
          </Link>
        )) : <span>{year}</span>}
      </div>

      <nav className="sticky top-0 z-20 mt-5 flex flex-wrap gap-2 border-y bg-white/95 py-3 backdrop-blur" aria-label="Ársgreining – hlutar">
        {[
          ["overview", "Yfirlit"],
          ["summary", "Samantekt"],
          ["income", "Tekjur"],
          ["expenses", "Gjöld"],
          ["flows", "Peningaflæði"],
          ["patterns", "Mynstur"],
          ["accounts", "Reikningar"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/banki/arsgreining?year=${year}&view=${key}`}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${view === key ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {yearTransactions.length === 0 ? (
        <div className="mt-6 rounded-lg border bg-gray-50 p-6">{t.noData}</div>
      ) : (
        <>
          <section className={`${view === "summary" ? "" : "hidden"} mt-6 space-y-6`}>
            <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ársgreining {year}</p>
                  <h2 className="mt-1 text-2xl font-bold">Brú að ársreikningi</h2>
                  <p className="mt-2 max-w-4xl text-sm text-slate-600">
                    Samantektin byggir á því sem bankagögnin styðja nú þegar. Hún er ekki ársreikningur og reynir ekki að laga niðurstöðuna að fyrirliggjandi ársreikningstölum. Óvissa og fjárflæði sem ekki er rekstrarkostnaður eru sýnd sérstaklega.
                  </p>
                </div>
                <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-600">Gögn fyrst · AI 0 kr.</span>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label="Innborganir alls" value={`${formatNumber(Math.round(analysis.grossInflows))} kr.`} />
                <Stat label="Útborganir alls" value={`${formatNumber(Math.round(analysis.grossOutflows))} kr.`} />
                <Stat label="Líkleg velta / greiðsluuppgjör" value={`${formatNumber(Math.round(analysis.likelyTurnover))} kr.`} />
                <Stat label="Óflokkað útstreymi" value={`${formatNumber(Math.round(analysis.outflowStillToClassify))} kr.`} href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=UNKNOWN&expenseSort=amount-desc#utgjaldalisti`} hint="Skoða óflokkað →" />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-xl border p-6">
                <h3 className="text-lg font-semibold">Tekjuhlið</h3>
                <p className="mt-1 text-sm text-gray-500">Bankagreiningin heldur rekstrartekjum, greiðsluuppgjörum og öðrum innstreymum aðskildum þar til gögn staðfesta eðli þeirra.</p>
                <div className="mt-4 space-y-3">
                  <BridgeRow label="Sterkt merkt rekstrartekjuinnstreymi" value={analysis.classificationTotals.OPERATING_REVENUE} />
                  <BridgeRow label="Greiðslumiðlunaruppgjör" value={analysis.classificationTotals.PAYMENT_SETTLEMENT} />
                  <BridgeRow label="Styrkir / framlög" value={analysis.classificationTotals.GRANT_CONTRIBUTION} />
                  <BridgeRow label="Lán / fjármagnshreyfingar" value={analysis.classificationTotals.LOAN_CAPITAL} />
                  <BridgeRow label="Endurgreiðslur" value={analysis.classificationTotals.REFUND} />
                  <div className="border-t pt-3"><BridgeRow label="Óflokkað / óvíst innstreymi" value={analysis.classificationTotals.UNKNOWN} strong /></div>
                </div>
              </div>

              <div className="rounded-xl border p-6">
                <h3 className="text-lg font-semibold">Gjaldahlið</h3>
                <p className="mt-1 text-sm text-gray-500">Rekstrarkostnaður er dreginn saman, en laun, tengdar einingar og aðrir sérstakir fjárstraumar standa sér.</p>
                <div className="mt-4 space-y-3">
                  <BridgeRow label="Greindur rekstrarkostnaður" value={analysis.expenseClassificationTotals.OPERATING_EXPENSE} />
                  <BridgeRow label="Laun" value={analysis.expenseClassificationTotals.WAGES} />
                  <BridgeRow label="Launatengd gjöld" value={analysis.expenseClassificationTotals.PAYROLL_RELATED} />
                  <BridgeRow label="Greiðslur til einstaklinga" value={analysis.expenseClassificationTotals.PERSON_PAYMENT} />
                  <BridgeRow label="Fjárflæði til tengdrar einingar / deildar" value={analysis.expenseClassificationTotals.RELATED_ENTITY_FLOW} />
                  <BridgeRow label="Bankakostnaður" value={analysis.expenseClassificationTotals.BANK_FEE} />
                  <div className="border-t pt-3"><BridgeRow label="Óflokkað útstreymi" value={analysis.outflowStillToClassify} strong /></div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Rekstrarkostnaður eftir eðli</h3>
                  <p className="mt-1 text-sm text-gray-500">Þetta er vinnubrú úr bankagögnum yfir í ársreikningsliði. Fylgiskjöl og bókhald geta síðar staðfest eða fært einstaka liði.</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=expenses`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Opna gjaldagreiningu →</Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500"><tr><th className="p-2">Liður</th><th className="p-2 text-right">Greint úr bankagögnum</th><th className="p-2">Staða</th></tr></thead>
                  <tbody>
                    {[
                      ["PREMISES", t.premises], ["UTILITIES", t.utilities], ["TELECOM", t.telecom], ["SOFTWARE", t.software],
                      ["INSURANCE", t.insurance], ["VEHICLE", t.vehicle], ["TRAVEL", t.travel], ["ADVERTISING", t.advertising],
                      ["TRANSPORT", t.transport], ["GOODS_SERVICES", t.goodsServices], ["DINING", t.dining], ["GROCERY_PURCHASE", t.groceryPurchase],
                      ["OFFICE_SUPPLIES", t.officeSupplies], ["RESALE_GOODS", t.resaleGoods], ["EVENT_HOSPITALITY", t.eventHospitality],
                      ["SPORTS_EVENT", t.sportsEvent], ["SPORTS_EQUIPMENT", t.sportsEquipment], ["TELECOM_EQUIPMENT", t.telecomEquipment],
                      ["POS_PAYMENT_SERVICE", t.posPaymentService], ["ADMIN_REGISTRATION_FEE", t.adminRegistrationFee],
                    ].map(([category, label]) => {
                      const amount = analysis.expenseClassificationTotals[category as keyof typeof analysis.expenseClassificationTotals];
                      if (!amount) return null;
                      return <tr key={String(category)} className="border-b last:border-0"><td className="p-2 font-medium">{label}</td><td className="p-2 text-right font-semibold">{formatNumber(Math.round(amount))} kr.</td><td className="p-2 text-slate-600">Greint úr bankagögnum</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <strong>Ekki lokaársreikningur.</strong> Næsta staðfestingarlag er bókhald og fylgiskjöl. Þegar fyrirliggjandi ársreikningur er tengdur við greininguna má bæta við dálkunum „Ársreikningur“, „Frávik“ og rekjanlegri skýringu án þess að nota ársreikningstölurnar til að þvinga flokkun bankagagnanna.
            </div>
          </section>

          <div className={`${view === "overview" ? "" : "hidden"} mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6`}>
            <Stat label={t.accounts} value={formatNumber(byAccount.length)} />
            <Stat label={t.transactions} value={formatNumber(analysis.transactionCount)} />
            <Stat label={t.inflows} value={`${formatNumber(Math.round(analysis.grossInflows))} kr.`} />
            <Stat label={t.outflows} value={`${formatNumber(Math.round(analysis.grossOutflows))} kr.`} />
            <Stat label={t.net} value={`${formatNumber(Math.round(analysis.netCashFlow))} kr.`} />
            <Stat label={t.aiCost} value={t.zero} />
          </div>

          <section className={`${view === "overview" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.turnoverBridge}</h2>
            <div className="mt-5 max-w-3xl space-y-3">
              <BridgeRow label={t.grossInflows} value={analysis.grossInflows} />
              <BridgeRow label={t.internalTransfers} value={-analysis.likelyInternalInflows} />
              <BridgeRow label={t.interestIncome} value={-analysis.interestIncome} />
              <div className="border-t pt-3">
                <BridgeRow label={t.remaining} value={analysis.inflowStillToClassify} strong />
              </div>
            </div>
            <p className="mt-4 max-w-4xl rounded-lg bg-amber-50 p-4 text-amber-950">{t.remainingHelp}</p>
            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-gray-500">{t.confirmedTurnover}</p>
              <p className="mt-1 text-lg font-semibold">{t.notYetConfirmed}</p>
            </div>
          </section>

          <section className={`${view === "income" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.incomeClassification}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.incomeClassificationHelp}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label={t.confirmedFromBankText} value={`${formatNumber(Math.round(analysis.confirmedTurnover))} kr.`} />
              <Stat label={t.paymentSettlement} value={`${formatNumber(Math.round(analysis.classificationTotals.PAYMENT_SETTLEMENT))} kr.`} />
              <Stat label={t.grantContribution} value={`${formatNumber(Math.round(analysis.classificationTotals.GRANT_CONTRIBUTION))} kr.`} />
              <Stat label={t.unknown} value={`${formatNumber(Math.round(analysis.classificationTotals.UNKNOWN))} kr.`} />
            </div>
            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-gray-500">{t.likelyTurnover}</p>
              <p className="mt-1 text-xl font-bold">{formatNumber(Math.round(analysis.likelyTurnover))} kr.</p>
            </div>
            <div id="utgjaldalisti" className="mt-5 scroll-mt-24 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="view" value="income" />
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.sortBy}</span>
                  <select name="incomeSort" defaultValue={incomeSort} className="rounded-lg border bg-white px-3 py-2">
                    <option value="amount-desc">{t.sortAmount}</option>
                    <option value="count-desc">{t.sortCount}</option>
                    <option value="name-asc">{t.sortName}</option>
                    <option value="confidence-low">{t.sortUncertainFirst}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterConfidence}</span>
                  <select name="incomeConfidence" defaultValue={incomeConfidence} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allConfidence}</option>
                    <option value="LOW">{t.low}</option>
                    <option value="MEDIUM">{t.medium}</option>
                    <option value="HIGH">{t.high}</option>
                  </select>
                </label>
                <button className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-50" type="submit">{t.apply}</button>
              </form>
              <span className="ml-auto text-sm text-gray-500">{formatNumber(visibleIncomeGroups.length)} / {formatNumber(analysis.classifiedIncomeGroups.length)}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2">{t.classification}</th><th className="p-2">{t.confidence}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {visibleIncomeGroups.slice(0, 40).map((group) => (
                    <tr key={group.key} className="border-b last:border-0">
                      <td className="p-2 font-medium">
                        <Link className="text-blue-700 hover:underline" href={drilldownHref("in", group.key)}>
                          {group.label}
                        </Link>
                      </td>
                      <td className="p-2">{classificationLabel(group.classification)}</td>
                      <td className="p-2">{confidenceLabel(group.confidence)}</td>
                      <td className="p-2 text-right">{formatNumber(group.count)}</td>
                      <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>


          <section className={`${view === "income" ? "" : "hidden"} mt-8 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/40`}>
            <div className="border-b border-emerald-200 bg-emerald-100/70 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-emerald-950">{t.grantFlowTitle}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-emerald-900/80">{t.grantFlowHelp}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">{t.grantFlowCandidateTotal}</p>
                  <p className="mt-1 text-xl font-bold text-emerald-950">{formatNumber(Math.round(grantFlowIncomingTotal))} kr.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <GrantFlowStat label={t.grantFlowIncoming} value={grantFlowIncomingTotal} />
                <GrantFlowStat label={t.grantFlowStrongMatched} value={grantFlowMatchedTotal} />
                <GrantFlowStat label={t.grantFlowUnmatched} value={grantFlowUnmatchedTotal} />
              </div>
            </div>

            {grantFlows.length === 0 ? (
              <p className="p-6 text-sm text-gray-600">{t.noGrantFlow}</p>
            ) : (
              <div className="space-y-5 p-6">
                {grantFlows.slice(0, 30).map((flow) => (
                  <div key={flow.key} className="rounded-xl border bg-white p-5 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.35fr)] lg:items-center">
                      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-sky-700">{t.grantFlowFrom}</p>
                        <Link className="mt-1 block font-semibold text-blue-700 hover:underline" href={drilldownHref("in", flow.key)}>
                          {flow.label}
                        </Link>
                        <p className="mt-2 text-2xl font-bold">{formatNumber(Math.round(flow.incomingAmount))} kr.</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {formatNumber(flow.incomingCount)} {t.grantFlowPayments} · {flow.basis === "BANK_TEXT" ? t.grantFlowBasisBankText : flow.basis === "BOTH" ? t.grantFlowBasisBoth : t.grantFlowBasisAccount}
                        </p>
                      </div>

                      <div className="hidden px-2 text-3xl text-emerald-600 lg:block" aria-hidden="true">→</div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.grantFlowWhere}</p>
                        {flow.destinations.length ? flow.destinations.map((destination) => (
                          <div key={`${flow.key}-${destination.label}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <div>
                              <p className="font-semibold text-emerald-950">{destination.label}</p>
                              <p className="text-xs text-emerald-800">{t.grantFlowStrongPair} · {formatNumber(destination.count)} {t.grantFlowPairs}</p>
                            </div>
                            <p className="font-bold text-emerald-950">{formatNumber(Math.round(destination.amount))} kr.</p>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed p-3 text-sm text-gray-600">{t.grantFlowNoDestination}</div>
                        )}
                        {flow.unmatchedAmount > 0 ? (
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                            <span className="text-sm font-medium">{t.grantFlowUnmatched}</span>
                            <strong>{formatNumber(Math.round(flow.unmatchedAmount))} kr.</strong>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="rounded-lg bg-white/70 p-4 text-sm text-gray-700">{t.grantFlowCaution}</p>
              </div>
            )}
          </section>

          <section className={`${view === "expenses" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.expenseClassification}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.expenseClassificationHelp}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Stat label={t.operatingExpense} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.OPERATING_EXPENSE))} kr.`} />
              <Stat label={t.wages} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.WAGES))} kr.`} />
              <Stat label={t.payrollRelated} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.PAYROLL_RELATED))} kr.`} />
              <Stat
                label={t.personPayments}
                value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.PERSON_PAYMENT))} kr.`}
                href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=PERSON_PAYMENT&expenseSort=amount-desc#utgjaldalisti`}
              />
              <Stat label={t.bankFee} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.BANK_FEE))} kr.`} />
              <Stat label={t.cashWithdrawal} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.CASH_WITHDRAWAL))} kr.`} />
              <Stat label={t.assetInvestment} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.ASSET_INVESTMENT))} kr.`} />
              <Stat label={t.taxFinancial} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.TAX_FINANCIAL))} kr.`} />
              <Stat
                label={t.expenseUnknown}
                value={`${formatNumber(Math.round(analysis.outflowStillToClassify))} kr.`}
                href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=UNKNOWN&expenseSort=amount-desc#utgjaldalisti`}
                hint="Skoða hvað myndar þessa tölu →"
              />
            </div>
            <div className="mt-4 rounded-lg border bg-slate-50 p-4">
              <div className="mb-3 text-sm font-semibold text-gray-700">{t.operatingExpense}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["PREMISES", t.premises, analysis.expenseClassificationTotals.PREMISES],
                  ["UTILITIES", t.utilities, analysis.expenseClassificationTotals.UTILITIES],
                  ["TELECOM", t.telecom, analysis.expenseClassificationTotals.TELECOM],
                  ["SOFTWARE", t.software, analysis.expenseClassificationTotals.SOFTWARE],
                  ["INSURANCE", t.insurance, analysis.expenseClassificationTotals.INSURANCE],
                  ["VEHICLE", t.vehicle, analysis.expenseClassificationTotals.VEHICLE],
                  ["TRAVEL", t.travel, analysis.expenseClassificationTotals.TRAVEL],
                  ["ADVERTISING", t.advertising, analysis.expenseClassificationTotals.ADVERTISING],
                  ["TRANSPORT", t.transport, analysis.expenseClassificationTotals.TRANSPORT],
                  ["GOODS_SERVICES", t.goodsServices, analysis.expenseClassificationTotals.GOODS_SERVICES],
                  ["DINING", t.dining, analysis.expenseClassificationTotals.DINING],
                  ["GROCERY_PURCHASE", t.groceryPurchase, analysis.expenseClassificationTotals.GROCERY_PURCHASE],
                  ["OFFICE_SUPPLIES", t.officeSupplies, analysis.expenseClassificationTotals.OFFICE_SUPPLIES],
                  ["RESALE_GOODS", t.resaleGoods, analysis.expenseClassificationTotals.RESALE_GOODS],
                  ["EVENT_HOSPITALITY", t.eventHospitality, analysis.expenseClassificationTotals.EVENT_HOSPITALITY],
                  ["SPORTS_EVENT", t.sportsEvent, analysis.expenseClassificationTotals.SPORTS_EVENT],
                  ["SPORTS_EQUIPMENT", t.sportsEquipment, analysis.expenseClassificationTotals.SPORTS_EQUIPMENT],
                  ["TELECOM_EQUIPMENT", t.telecomEquipment, analysis.expenseClassificationTotals.TELECOM_EQUIPMENT],
                  ["POS_PAYMENT_SERVICE", t.posPaymentService, analysis.expenseClassificationTotals.POS_PAYMENT_SERVICE],
                  ["ADMIN_REGISTRATION_FEE", t.adminRegistrationFee, analysis.expenseClassificationTotals.ADMIN_REGISTRATION_FEE],
                  ["GRANT", t.grants, analysis.expenseClassificationTotals.GRANT],
                  ["CONTRIBUTION", t.contributions, analysis.expenseClassificationTotals.CONTRIBUTION],
                  ["COST_ALLOWANCE", t.costAllowances, analysis.expenseClassificationTotals.COST_ALLOWANCE],
                ].map(([category, label, amount]) => (
                  <Link
                    key={String(category)}
                    href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=${category}&expenseSort=amount-desc#utgjaldalisti`}
                    className="block rounded-lg bg-white px-3 py-2 text-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title={`Skoða færslur í ${String(label)}`}
                  >
                    <div className="text-gray-500">{label}</div>
                    <div className="mt-1 font-semibold">{formatNumber(Math.round(Number(amount)))} kr.</div>
                    <div className="mt-1 text-xs font-medium text-blue-700">Skoða færslur →</div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="view" value="expenses" />
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.searchCounterparty}</span>
                  <input name="q" defaultValue={searchQuery} placeholder={t.searchPlaceholder} className="w-64 rounded-lg border bg-white px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.sortBy}</span>
                  <select name="expenseSort" defaultValue={expenseSort} className="rounded-lg border bg-white px-3 py-2">
                    <option value="amount-desc">{t.sortAmount}</option>
                    <option value="count-desc">{t.sortCount}</option>
                    <option value="name-asc">{t.sortName}</option>
                    <option value="confidence-low">{t.sortUncertainFirst}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterConfidence}</span>
                  <select name="expenseConfidence" defaultValue={expenseConfidence} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allConfidence}</option>
                    <option value="LOW">{t.low}</option>
                    <option value="MEDIUM">{t.medium}</option>
                    <option value="HIGH">{t.high}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterCategory}</span>
                  <select key={expenseCategory} name="expenseCategory" defaultValue={expenseCategory} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allCategories}</option>
                    <option value="WAGES">{t.wages}</option>
                    <option value="PAYROLL_RELATED">{t.payrollRelated}</option>
                    <option value="PERSON_PAYMENT">{t.personPayments}</option>
                    <option value="PREMISES">{t.premises}</option>
                    <option value="UTILITIES">{t.utilities}</option>
                    <option value="TELECOM">{t.telecom}</option>
                    <option value="SOFTWARE">{t.software}</option>
                    <option value="INSURANCE">{t.insurance}</option>
                    <option value="VEHICLE">{t.vehicle}</option>
                    <option value="TRAVEL">{t.travel}</option>
                    <option value="ADVERTISING">{t.advertising}</option>
                    <option value="TRANSPORT">{t.transport}</option>
                    <option value="GOODS_SERVICES">{t.goodsServices}</option>
                    <option value="DINING">{t.dining}</option>
                    <option value="GROCERY_PURCHASE">{t.groceryPurchase}</option>
                    <option value="OFFICE_SUPPLIES">{t.officeSupplies}</option>
                    <option value="RESALE_GOODS">{t.resaleGoods}</option>
                    <option value="EVENT_HOSPITALITY">{t.eventHospitality}</option>
                    <option value="SPORTS_EVENT">{t.sportsEvent}</option>
                    <option value="SPORTS_EQUIPMENT">{t.sportsEquipment}</option>
                    <option value="TELECOM_EQUIPMENT">{t.telecomEquipment}</option>
                    <option value="RELATED_ENTITY_FLOW">{t.relatedEntityFlow}</option>
                    <option value="GRANT">{t.grants}</option>
                    <option value="CONTRIBUTION">{t.contributions}</option>
                    <option value="COST_ALLOWANCE">{t.costAllowances}</option>
                    <option value="BANK_FEE">{t.bankFee}</option>
                    <option value="CASH_WITHDRAWAL">{t.cashWithdrawal}</option>
                    <option value="ASSET_INVESTMENT">{t.assetInvestment}</option>
                    <option value="TAX_FINANCIAL">{t.taxFinancial}</option>
                    <option value="UNKNOWN">{t.expenseUnknown}</option>
                    <option value="MIXED">{t.mixedExpense}</option>
                  </select>
                </label>
                <button className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-50" type="submit">{t.apply}</button>
              </form>
              <span className="ml-auto text-sm text-gray-500">{formatNumber(visibleExpenseGroups.length)} / {formatNumber(analysis.classifiedExpenseGroups.length)}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2">{t.classification}</th><th className="p-2">{t.confidence}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {visibleExpenseGroups.slice(0, 50).map((group) => {
                    const filteredBreakdown = expenseCategory !== "ALL"
                      ? group.breakdown.find((item) => item.classification === expenseCategory) ?? null
                      : null;
                    const shownCount = filteredBreakdown?.count ?? group.count;
                    const shownAmount = filteredBreakdown?.amount ?? group.amount;
                    const shownClassification = filteredBreakdown?.classification ?? group.classification;

                    return (
                      <tr key={group.key} className="border-b last:border-0">
                        <td className="p-2 font-medium">
                          <Link className="text-blue-700 hover:underline" href={drilldownHref("out", group.key)}>
                            {group.label}
                          </Link>
                        </td>
                        <td className="p-2">{expenseClassificationLabel(shownClassification)}</td>
                        <td className="p-2">{confidenceLabel(group.confidence)}</td>
                        <td className="p-2 text-right">{formatNumber(shownCount)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(shownAmount))} kr.</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {analysis.recurringExpensePatterns.length ? (
            <section className={`${view === "patterns" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
              <h2 className="text-xl font-semibold">{t.recurringTitle}</h2>
              <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.recurringHelp}</p>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.recurringMonths}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.recurringAverage}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.recurringExpensePatterns.slice(0, 30).map((pattern) => (
                      <tr key={pattern.groupKey} className="border-b last:border-0">
                        <td className="p-2 font-medium">
                          <Link className="text-blue-700 hover:underline" href={drilldownHref("out", pattern.groupKey)}>
                            {pattern.label}
                          </Link>
                        </td>
                        <td className="p-2 text-right">{formatNumber(pattern.monthCount)}</td>
                        <td className="p-2 text-right">{formatNumber(pattern.count)}</td>
                        <td className="p-2 text-right">{formatNumber(Math.round(pattern.averageAmount))} kr.</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pattern.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedGroup ? (
            <section id="faerslur" className={`${(selectedFlow === "in" && view === "income") || (selectedFlow === "out" && (view === "expenses" || view === "accounts")) ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border border-blue-200 bg-blue-50/40 p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{t.drilldown}: {selectedGroup.label}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.drilldownHelp}</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=${selectedFlow === "in" ? "income" : "expenses"}`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">
                  {t.closeDrilldown}
                </Link>
              </div>
              {selectedAccountTrace.length ? (
                <div className="mt-4 rounded-lg border bg-white p-4">
                  <p className="font-semibold">{selectedFlow === "out" ? t.whereMoneyWent : t.whereMoneyCameFrom}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500">
                        <tr><th className="p-2">{t.account}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                      </thead>
                      <tbody>
                        {selectedAccountTrace.map((row) => (
                          <tr key={row.bankAccountId} className="border-b last:border-0">
                            <td className="p-2 font-medium">
                              <Link className="text-blue-700 hover:underline" href={`/banki/${row.bankAccountId}`}>
                                {accountById.get(row.bankAccountId)?.name ?? row.bankAccountId}
                              </Link>
                            </td>
                            <td className="p-2 text-right">{formatNumber(row.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(row.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {selectedRecurringPattern ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                  <p className="font-semibold">{t.recurringTitle}</p>
                  <p className="mt-1 text-sm">{t.recurringHelp}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <span><strong>{t.recurringMonths}:</strong> {formatNumber(selectedRecurringPattern.monthCount)}</span>
                    <span><strong>{t.count}:</strong> {formatNumber(selectedRecurringPattern.count)}</span>
                    <span><strong>{t.recurringAverage}:</strong> {formatNumber(Math.round(selectedRecurringPattern.averageAmount))} kr.</span>
                    <span><strong>{t.recurringRange}:</strong> {formatNumber(Math.round(selectedRecurringPattern.minAmount))}–{formatNumber(Math.round(selectedRecurringPattern.maxAmount))} kr.</span>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.date}</th><th className="p-2">{t.account}</th><th className="p-2">{t.text}</th><th className="p-2">{t.paymentNature}</th><th className="p-2">{t.purposeIndication}</th><th className="p-2">{t.bankDetails}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {selectedTransactions.map((item) => {
                      const raw = parseRawBankData(item.sourceRawData);
                      const details = [raw.paymentExplanation, raw.textKey, raw.reference, raw.counterparty]
                        .filter(Boolean)
                        .filter((value, index, values) => values.indexOf(value) === index)
                        .join(" · ");
                      const isRecurring = recurringTransactionIds.has(item.id);
                      const evidence = item.amount < 0 ? analyzeExpenseEvidence(item) : null;
                      const natureLabel = evidence ? ({
                        CARD_PURCHASE: t.natureCardPurchase, TRANSFER: t.natureTransfer, REFUND: t.natureRefund,
                        GRANT: t.natureGrant, CONTRIBUTION: t.natureContribution, COST_ALLOWANCE: t.natureCostAllowance, BANK_FEE: t.natureBankFee, CASH_WITHDRAWAL: t.natureCashWithdrawal, COLLECTION_FEE: t.natureCollectionFee, OTHER: t.natureOther,
                      } as const)[evidence.paymentNature] : "—";
                      const purposeLabel = evidence ? ({
                        PREMISES: t.premises, UTILITIES: t.utilities, TELECOM: t.telecom, SOFTWARE: t.software,
                        INSURANCE: t.insurance, VEHICLE: t.vehicle, TRAVEL: t.travel, ADVERTISING: t.advertising, TRANSPORT: t.transport, DINING: t.dining, GROCERY_PURCHASE: t.groceryPurchase, OFFICE_SUPPLIES: t.officeSupplies, RESALE_GOODS: t.resaleGoods, EVENT_HOSPITALITY: t.eventHospitality, SPORTS: t.sportsPurpose, SPORTS_EQUIPMENT: t.sportsEquipment, TELECOM_EQUIPMENT: t.telecomEquipment, POS_PAYMENT_SERVICE: t.posPaymentService, ADMIN_REGISTRATION_FEE: t.adminRegistrationFee, PREMIUM_UNSPECIFIED: t.premiumUnspecified,
                        WAGES: t.wages, PAYROLL_RELATED: t.payrollRelated, PERSON_PAYMENT: t.personPayments,
                        GOODS_SERVICES: t.goodsServices, ASSET_INVESTMENT: t.assetInvestment, LOAN_CAPITAL: t.loanCapital, UNKNOWN: t.purposeUnknown,
                      } as const)[evidence.purpose] : "—";
                      const confidenceLabel = (value: string) => value === "HIGH" ? t.high : value === "MEDIUM" ? t.medium : t.low;
                      return (
                        <tr key={item.id} className={`border-b last:border-0 ${isRecurring ? "bg-emerald-50/60" : ""}`}>
                          <td className="p-2 whitespace-nowrap">{formatDate(item.date)}</td>
                          <td className="p-2">
                            <Link className="text-blue-700 hover:underline" href={`/banki/${item.bankAccountId}`}>
                              {accountById.get(item.bankAccountId)?.name ?? item.bankAccountId}
                            </Link>
                          </td>
                          <td className="p-2">{item.text || "—"}</td>
                          <td className="p-2 whitespace-nowrap">{natureLabel}<div className="text-xs text-gray-500">{evidence ? confidenceLabel(evidence.paymentNatureConfidence) : ""}</div></td>
                          <td className="p-2 whitespace-nowrap">{purposeLabel}<div className="text-xs text-gray-500">{evidence ? confidenceLabel(evidence.purposeConfidence) : ""}</div></td>
                          <td className="p-2 text-gray-600">{details || "—"}</td>
                          <td className="p-2 text-right font-medium whitespace-nowrap">{formatNumber(Math.round(item.amount))} kr.</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={`${view === "flows" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.flowThroughTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.flowThroughHelp}</p>
            {analysis.flowThroughSuggestions.length === 0 ? (
              <p className="mt-4 text-gray-600">{t.noFlowThrough}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.account}</th><th className="p-2">{t.incomingFrom}</th><th className="p-2">{t.outgoingTo}</th><th className="p-2">{t.dates}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.flowThroughSuggestions.slice(0, 50).map((pair) => (
                      <tr key={`${pair.incomingId}-${pair.outgoingId}`} className="border-b last:border-0">
                        <td className="p-2">{accountById.get(pair.bankAccountId)?.name ?? pair.bankAccountId}</td>
                        <td className="p-2">{pair.incomingLabel}</td>
                        <td className="p-2">{pair.outgoingLabel}</td>
                        <td className="p-2">{formatDate(pair.incomingDate)} → {formatDate(pair.outgoingDate)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pair.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${view === "flows" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.internalTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.internalHelp}</p>
            {analysis.internalPairs.length === 0 ? (
              <p className="mt-4 text-gray-600">{t.noInternal}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.from}</th><th className="p-2">{t.to}</th><th className="p-2">{t.dates}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.internalPairs.slice(0, 50).map((pair) => (
                      <tr key={`${pair.outgoingId}-${pair.incomingId}`} className="border-b last:border-0">
                        <td className="p-2">{accountById.get(pair.outgoingAccountId)?.name ?? pair.outgoingAccountId}</td>
                        <td className="p-2">{accountById.get(pair.incomingAccountId)?.name ?? pair.incomingAccountId}</td>
                        <td className="p-2">{formatDate(pair.outgoingDate)} → {formatDate(pair.incomingDate)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pair.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${view === "income" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.incomeSources}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.incomeSourcesHelp}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {analysis.incomeGroups.slice(0, 30).map((group) => (
                    <tr key={group.key} className="border-b last:border-0">
                      <td className="p-2">
                        <Link className="text-blue-700 hover:underline" href={drilldownHref("in", group.key)}>
                          {group.label}
                        </Link>
                      </td>
                      <td className="p-2 text-right">{formatNumber(group.count)}</td>
                      <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="reikningar" className={`${view === "accounts" ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.accounts}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.accounts}</th><th className="p-2 text-right">{t.transactions}</th><th className="p-2 text-right">{t.inflows}</th><th className="p-2 text-right">{t.outflows}</th></tr>
                </thead>
                <tbody>
                  {byAccount.map((row) => (
                    <tr key={row.account.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Link className="font-medium text-blue-700 hover:underline" href={accountAnalysisHref(row.account.id)}>
                          {row.account.name}
                        </Link>
                      </td>
                      <td className="p-2 text-right">{formatNumber(row.count)}</td>
                      <td className="p-2 text-right">{formatNumber(Math.round(row.inflows))} kr.</td>
                      <td className="p-2 text-right">{formatNumber(Math.round(row.outflows))} kr.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>



          {selectedAccount && selectedAccountAnalysis ? (
            <section id="reikningsgreining" className={`${view === "accounts" ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border-2 border-slate-300 bg-slate-50 p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t.accountAnalysis}</p>
                  <h2 className="mt-1 text-2xl font-bold">{selectedAccount.name}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.accountAnalysisHelp}</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=accounts#reikningar`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">
                  {t.closeAccountAnalysis}
                </Link>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label={t.accountInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.inflows))} kr.`} />
                <Stat label={t.accountOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.outflows))} kr.`} />
                <Stat label={t.accountNet} value={`${formatNumber(Math.round(selectedAccountAnalysis.netCashFlow))} kr.`} />
                <Stat label={t.transactions} value={formatNumber(selectedAccountAnalysis.transactionCount)} />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label={t.externalInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.externalInflows))} kr.`} />
                <Stat label={t.externalOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.externalOutflows))} kr.`} />
                <Stat label={t.ownAccountInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.internalInflows))} kr.`} />
                <Stat label={t.ownAccountOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.internalOutflows))} kr.`} />
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.whereMoneyCameFrom}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.incomingGroups.slice(0, 20).map((group) => (
                          <tr key={group.key} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("in", group.key)}>{group.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(group.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.whereMoneyWent}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.outgoingGroups.slice(0, 20).map((group) => (
                          <tr key={group.key} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("out", group.key)}>{group.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(group.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selectedAccountAnalysis.recurringPatterns.length ? (
                <div className="mt-6 rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.accountRecurring}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.accountRecurringHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.recurringMonths}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.recurringPatterns.slice(0, 15).map((pattern) => (
                          <tr key={pattern.groupKey} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("out", pattern.groupKey)}>{pattern.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(pattern.monthCount)}</td>
                            <td className="p-2 text-right">{formatNumber(pattern.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(pattern.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">{t.accountAnalysisCaution}</p>
            </section>
          ) : null}

          <section className={`${view === "overview" ? "" : "hidden"} mt-8 rounded-xl border bg-blue-50 p-6 text-blue-950`}>
            <h2 className="font-semibold">{t.next}</h2>
            <p className="mt-2 max-w-4xl">{t.nextHelp}</p>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const content = (
    <>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint ? <p className="mt-2 text-xs font-medium text-blue-700">{hint}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className="block rounded-lg border p-4 transition hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500">
      {content}
    </Link>
  ) : (
    <div className="rounded-lg border p-4">{content}</div>
  );
}

function GrantFlowStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-emerald-950">{formatNumber(Math.round(value))} kr.</p>
    </div>
  );
}

function BridgeRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "text-lg font-bold" : ""}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value < 0 ? "−" : ""}{formatNumber(Math.round(Math.abs(value)))} kr.</span>
    </div>
  );
}
