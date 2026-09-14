import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/app/banki/_lib/formatting/numbers";
import { bankAnalysisLanguage } from "@/app/banki/_lib/i18n/analysis-text";
import { annualStatementText } from "@/app/banki/_lib/i18n/annual-statement-text";
import { buildAnnualBankAnalysis } from "@/app/banki/_lib/analysis/annual";
import { buildAnnualStatement, type ExcludedFlowKey, type StatementRowKey } from "@/app/banki/_lib/analysis/annual-statement";

type Props = { searchParams: Promise<{ year?: string }> };

async function getContext() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const companyId = Number(store.get("activeCompanyId")?.value);
  if (!token) redirect("/innskraning?next=/banki/arsreikningur");
  if (!Number.isInteger(companyId) || companyId < 1) redirect("/fyrirtaeki");

  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    redirect("/innskraning?next=/banki/arsreikningur");
  }
  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: session.user.id, companyId } } });
    if (!access?.isActive) redirect("/fyrirtaeki");
  }
  const settings = await prisma.userSettings.findUnique({ where: { userId: session.user.id }, select: { interfaceLanguage: true } });
  return { companyId, language: bankAnalysisLanguage(settings?.interfaceLanguage) };
}

function amount(value: number | null) {
  return value === null ? "—" : `${formatNumber(Math.round(value))} kr.`;
}

export default async function AnnualStatementPage({ searchParams }: Props) {
  const query = await searchParams;
  const { companyId, language } = await getContext();
  const t = annualStatementText(language);

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, kennitala: true } });
  if (!company) redirect("/fyrirtaeki");

  const accounts = await prisma.bankAccount.findMany({ where: { companyId, isActive: true }, orderBy: { id: "asc" } });
  const accountIds = accounts.map((item) => item.id);
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  const transactions = accountIds.length ? await prisma.bankTransaction.findMany({
    where: { bankAccountId: { in: accountIds } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  }) : [];

  const years = Array.from(new Set(transactions.map((item) => item.date.getFullYear()))).sort((a, b) => b - a);
  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && years.includes(requestedYear) ? requestedYear : years[0] ?? new Date().getFullYear();
  const priorYear = year - 1;
  const hasPriorYear = years.includes(priorYear);

  const mapped = transactions.map((item) => ({
    id: item.id,
    bankAccountId: item.bankAccountId,
    bankAccountName: accountById.get(item.bankAccountId)?.name ?? null,
    date: item.date,
    text: item.text,
    amount: Number(item.amount),
    sourceRawData: item.sourceRawData,
  }));

  const currentAnalysis = buildAnnualBankAnalysis(mapped.filter((item) => item.date.getFullYear() === year));
  const priorAnalysis = hasPriorYear ? buildAnnualBankAnalysis(mapped.filter((item) => item.date.getFullYear() === priorYear)) : null;
  const current = buildAnnualStatement(currentAnalysis);
  const prior = priorAnalysis ? buildAnnualStatement(priorAnalysis) : null;

  const rowLabel = (key: StatementRowKey | ExcludedFlowKey) => t[key];
  const priorStatementRow = (key: StatementRowKey) => prior?.revenueRows.find((row) => row.key === key)?.amount
    ?? prior?.operatingExpenseRows.find((row) => row.key === key)?.amount
    ?? prior?.financeRows.find((row) => row.key === key)?.amount
    ?? 0;
  const priorExcluded = (key: ExcludedFlowKey) => prior?.excludedFlows.find((row) => row.key === key)?.amount ?? 0;

  const allRevenueKeys = Array.from(new Set([...current.revenueRows.map((row) => row.key), ...(prior?.revenueRows.map((row) => row.key) ?? [])]));
  const allExpenseKeys = Array.from(new Set([...current.operatingExpenseRows.map((row) => row.key), ...(prior?.operatingExpenseRows.map((row) => row.key) ?? [])]));
  const allFinanceKeys = Array.from(new Set([...current.financeRows.map((row) => row.key), ...(prior?.financeRows.map((row) => row.key) ?? [])]));
  const allExcludedKeys = Array.from(new Set([...current.excludedFlows.map((row) => row.key), ...(prior?.excludedFlows.map((row) => row.key) ?? [])]));
  const currentStatementRow = (key: StatementRowKey) => current.revenueRows.find((row) => row.key === key)?.amount
    ?? current.operatingExpenseRows.find((row) => row.key === key)?.amount
    ?? current.financeRows.find((row) => row.key === key)?.amount
    ?? 0;
  const currentExcluded = (key: ExcludedFlowKey) => current.excludedFlows.find((row) => row.key === key)?.amount ?? 0;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{company.name}{company.kennitala ? ` · ${company.kennitala}` : ""}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.title} {year}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{t.subtitle}</p>
        </div>
        <Link href={`/banki/arsgreining?year=${year}`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">← {t.backToAnalysis}</Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {years.map((candidate) => <Link key={candidate} href={`/banki/arsreikningur?year=${candidate}`} className={`rounded-full border px-3 py-1.5 text-sm ${candidate === year ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}>{candidate}</Link>)}
      </div>

      <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t.draftStatus}</p>
            <h2 className="mt-1 text-lg font-semibold text-amber-950">{t.draftNotReady}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-950">{t.draftNotReadyText}</p>
          </div>
          <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900">VINNUSKJAL</span>
        </div>
      </section>

      <section className="mt-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold text-slate-950">{t.formalStructure}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t.formalStructureText}</p>
      </section>

      <section className="mt-4 rounded-xl border bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">{t.dataBasis}</h2>
        <p className="mt-2 text-sm leading-6 text-amber-950">{t.dataBasisText}</p>
        <p className="mt-1 text-sm leading-6 text-amber-900">{t.comparisonText}</p>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4"><h2 className="text-xl font-semibold">{t.incomeStatement}</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 text-left"></th><th className="px-5 py-3 text-right">{year}</th><th className="px-5 py-3 text-right">{priorYear}</th></tr></thead>
          <tbody>
            <tr className="border-t bg-slate-50/60"><td colSpan={3} className="px-5 py-3 font-semibold">{t.operatingIncome}</td></tr>
            {allRevenueKeys.map((key) => <tr key={key} className="border-t"><td className="px-5 py-3">{rowLabel(key)}</td><td className="px-5 py-3 text-right tabular-nums">{amount(currentStatementRow(key))}</td><td className="px-5 py-3 text-right tabular-nums">{hasPriorYear ? amount(priorStatementRow(key)) : "—"}</td></tr>)}
            <tr className="border-t font-semibold"><td className="px-5 py-3">{t.operatingIncome}</td><td className="px-5 py-3 text-right">{amount(current.operatingRevenue)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(prior!.operatingRevenue) : "—"}</td></tr>
            <tr className="border-t bg-slate-50/60"><td colSpan={3} className="px-5 py-3 font-semibold">{t.operatingExpenses}</td></tr>
            {allExpenseKeys.map((key) => <tr key={key} className="border-t"><td className="px-5 py-3">{rowLabel(key)}</td><td className="px-5 py-3 text-right tabular-nums">{amount(-currentStatementRow(key))}</td><td className="px-5 py-3 text-right tabular-nums">{hasPriorYear ? amount(-priorStatementRow(key)) : "—"}</td></tr>)}
            <tr className="border-t font-semibold"><td className="px-5 py-3">{t.operatingExpenses}</td><td className="px-5 py-3 text-right">{amount(-current.operatingExpenses)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(-prior!.operatingExpenses) : "—"}</td></tr>
            <tr className="border-y bg-slate-100 font-bold"><td className="px-5 py-3">{t.operatingResult}</td><td className="px-5 py-3 text-right">{amount(current.operatingResult)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(prior!.operatingResult) : "—"}</td></tr>
            <tr className="border-t bg-slate-50/60"><td colSpan={3} className="px-5 py-3 font-semibold">{t.financeItems}</td></tr>
            {allFinanceKeys.map((key) => <tr key={key} className="border-t"><td className="px-5 py-3">{rowLabel(key)}</td><td className="px-5 py-3 text-right tabular-nums">{amount(currentStatementRow(key))}</td><td className="px-5 py-3 text-right tabular-nums">{hasPriorYear ? amount(priorStatementRow(key)) : "—"}</td></tr>)}
            <tr className="border-y-2 border-slate-900 bg-slate-50 text-base font-bold"><td className="px-5 py-4">{t.yearResult}</td><td className="px-5 py-4 text-right">{amount(current.resultFromClassifiedData)}</td><td className="px-5 py-4 text-right">{hasPriorYear ? amount(prior!.resultFromClassifiedData) : "—"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4"><h2 className="text-xl font-semibold">{t.movementReview}</h2><p className="mt-1 text-sm text-slate-600">{t.movementReviewHelp}</p></div>
        <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 text-left"></th><th className="px-5 py-3 text-right">{year}</th><th className="px-5 py-3 text-right">{priorYear}</th></tr></thead><tbody>
          {allExcludedKeys.map((key) => <tr key={key} className="border-t"><td className="px-5 py-3">{rowLabel(key)}</td><td className="px-5 py-3 text-right tabular-nums">{amount(currentExcluded(key))}</td><td className="px-5 py-3 text-right tabular-nums">{hasPriorYear ? amount(priorExcluded(key)) : "—"}</td></tr>)}
        </tbody></table>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4"><h2 className="text-xl font-semibold">{t.cashFlow}</h2><p className="mt-1 text-sm text-slate-500">{formatNumber(current.transactionCount)} {t.transactions}</p></div>
        <table className="w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 text-left"></th><th className="px-5 py-3 text-right">{year}</th><th className="px-5 py-3 text-right">{priorYear}</th></tr></thead><tbody>
          <tr className="border-t"><td className="px-5 py-3">{t.grossInflows}</td><td className="px-5 py-3 text-right">{amount(current.grossInflows)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(prior!.grossInflows) : "—"}</td></tr>
          <tr className="border-t"><td className="px-5 py-3">{t.grossOutflows}</td><td className="px-5 py-3 text-right">{amount(-current.grossOutflows)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(-prior!.grossOutflows) : "—"}</td></tr>
          <tr className="border-y font-bold"><td className="px-5 py-3">{t.netCashFlow}</td><td className="px-5 py-3 text-right">{amount(current.netCashFlow)}</td><td className="px-5 py-3 text-right">{hasPriorYear ? amount(prior!.netCashFlow) : "—"}</td></tr>
        </tbody></table>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">{t.balanceSheet}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t.balanceUnavailable}</p>
      </section>
    </main>
  );
}
