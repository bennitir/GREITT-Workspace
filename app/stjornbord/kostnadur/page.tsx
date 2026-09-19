import { formatNumber } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { adminText } from "@/lib/i18n/admin";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";

export default async function KostnadurPage({
  searchParams,
}: {
  searchParams: Promise<{ timabil?: string }>;
}) {
  const { timabil = "manudur" } = await searchParams;
  const language = await getCurrentInterfaceLanguage();
  const t = adminText(language);

  const now = new Date();
  let fromDate: Date | undefined;

  if (timabil === "dagur") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (timabil === "manudur") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timabil === "sidasti-manudur") {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      aiUsage: {
        where:
          timabil === "allt"
            ? undefined
            : timabil === "sidasti-manudur"
              ? { createdAt: { gte: fromDate, lt: new Date(now.getFullYear(), now.getMonth(), 1) } }
              : { createdAt: { gte: fromDate } },
      },
    },
  });

  const totalActions = companies.reduce((sum, company) => sum + company.aiUsage.length, 0);
  const totalAiCost = companies.reduce(
    (sum, company) => sum + company.aiUsage.reduce((companySum, item) => companySum + item.costIsk, 0),
    0,
  );
  const overallAverageCost = totalActions > 0 ? totalAiCost / totalActions : 0;

  const allUsage = companies.flatMap((company) =>
    company.aiUsage.map((usage) => ({ ...usage, companyName: company.name })),
  );

  const usageBreakdownMap = new Map<
    string,
    { pipelineStage: string; action: string; count: number; cost: number }
  >();

  for (const usage of allUsage) {
    const pipelineStage = usage.pipelineStage ?? "OTHER";
    const action = usage.action || "OTHER";
    const key = `${pipelineStage}::${action}`;
    const current = usageBreakdownMap.get(key) ?? {
      pipelineStage,
      action,
      count: 0,
      cost: 0,
    };
    current.count += 1;
    current.cost += usage.costIsk;
    usageBreakdownMap.set(key, current);
  }

  const usageBreakdown = Array.from(usageBreakdownMap.values()).sort(
    (a, b) => b.cost - a.cost || b.count - a.count,
  );

  const stageLabel = (stage: string) => {
    if (stage === "RECEIPT_INGEST") return t.cost.stageReceipt;
    if (stage === "INSIGHT_DEEP") return t.cost.stageInsight;
    if (stage.startsWith("BANK")) return t.cost.stageBank;
    if (stage.includes("TRANSLAT")) return t.cost.stageTranslation;
    return t.cost.stageOther;
  };

  const actionLabel = (action: string) => {
    if (action === "RECEIPT_ANALYSIS") return t.cost.actionReceiptAnalysis;
    if (action === "INSIGHT_DOCUMENT_ANALYSIS") return t.cost.actionInsightDocumentAnalysis;
    return `${t.cost.actionOther} · ${action}`;
  };

  const interfaceLocale =
    language === "en" ? "en-GB" : language === "pl" ? "pl-PL" : language === "sr" ? "sr-RS" : "is-IS";

  const recentUsage = [...allUsage]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);

  const usageDocumentLabel = (usage: (typeof recentUsage)[number]) => {
    const metadata =
      usage.metadata && typeof usage.metadata === "object" && !Array.isArray(usage.metadata)
        ? (usage.metadata as Record<string, unknown>)
        : null;
    const documentId =
      typeof metadata?.documentId === "number" && Number.isFinite(metadata.documentId)
        ? Math.trunc(metadata.documentId)
        : null;

    if (usage.receiptId && documentId) return `#${usage.receiptId} · skjal ${documentId}`;
    if (usage.receiptId) return `#${usage.receiptId}`;
    if (documentId) return `skjal ${documentId}`;
    return "—";
  };

  const periodLink = (value: string, label: string) => (
    <a
      href={`?timabil=${value}`}
      className={`rounded border px-3 py-2 ${timabil === value ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
    >
      {label}
    </a>
  );

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">{t.cost.title}</h1>
      <p className="mt-2 text-slate-600">{t.cost.subtitle}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {periodLink("dagur", t.cost.today)}
        {periodLink("manudur", t.cost.thisMonth)}
        {periodLink("sidasti-manudur", t.cost.lastMonth)}
        {periodLink("allt", t.cost.allTime)}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">{t.cost.aiActions}</div>
          <div className="mt-1 text-2xl font-bold">{totalActions}</div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">{t.cost.aiCostTotal}</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(totalAiCost, { maximumFractionDigits: 2 })} kr.</div>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">{t.cost.averageCost}</div>
          <div className="mt-1 text-2xl font-bold">{formatNumber(overallAverageCost, { maximumFractionDigits: 2 })} kr.</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b p-3">{t.cost.company}</th>
              <th className="border-b p-3">{t.cost.aiActions}</th>
              <th className="border-b p-3">{t.cost.aiCost}</th>
              <th className="border-b p-3">{t.cost.averagePerAction}</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const totalCost = company.aiUsage.reduce((sum, item) => sum + item.costIsk, 0);
              const averageCost = company.aiUsage.length > 0 ? totalCost / company.aiUsage.length : 0;
              return (
                <tr key={company.id}>
                  <td className="border-b p-3 font-semibold">{company.name}</td>
                  <td className="border-b p-3">{company.aiUsage.length}</td>
                  <td className="border-b p-3">{formatNumber(totalCost, { maximumFractionDigits: 2 })} kr.</td>
                  <td className="border-b p-3">{formatNumber(averageCost, { maximumFractionDigits: 2 })} kr.</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="border-t p-3">{t.common.total}</td>
              <td className="border-t p-3">{totalActions}</td>
              <td className="border-t p-3">{formatNumber(totalAiCost, { maximumFractionDigits: 2 })} kr.</td>
              <td className="border-t p-3">{formatNumber(overallAverageCost, { maximumFractionDigits: 2 })} kr.</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">{t.cost.breakdownTitle}</h2>
        <div className="mt-3 overflow-x-auto rounded border bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-100">
              <tr>
                <th className="border-b p-3">{t.cost.stage}</th>
                <th className="border-b p-3">{t.cost.action}</th>
                <th className="border-b p-3">{t.cost.aiActions}</th>
                <th className="border-b p-3">{t.cost.aiCost}</th>
                <th className="border-b p-3">{t.cost.averagePerAction}</th>
              </tr>
            </thead>
            <tbody>
              {usageBreakdown.map((row) => (
                <tr key={`${row.pipelineStage}:${row.action}`}>
                  <td className="border-b p-3 font-semibold">{stageLabel(row.pipelineStage)}</td>
                  <td className="border-b p-3">{actionLabel(row.action)}</td>
                  <td className="border-b p-3">{row.count}</td>
                  <td className="border-b p-3">{formatNumber(row.cost, { maximumFractionDigits: 2 })} kr.</td>
                  <td className="border-b p-3">
                    {formatNumber(row.count > 0 ? row.cost / row.count : 0, { maximumFractionDigits: 2 })} kr.
                  </td>
                </tr>
              ))}
              {usageBreakdown.length === 0 && (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold">{t.cost.recentTitle}</h2>
        <div className="mt-3 overflow-x-auto rounded border bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border-b p-3">{t.cost.time}</th>
                <th className="border-b p-3">{t.cost.company}</th>
                <th className="border-b p-3">{t.cost.stage}</th>
                <th className="border-b p-3">{t.cost.action}</th>
                <th className="border-b p-3">{t.cost.document}</th>
                <th className="border-b p-3">{t.cost.model}</th>
                <th className="border-b p-3">{t.cost.tokens}</th>
                <th className="border-b p-3">{t.cost.aiCost}</th>
                <th className="border-b p-3">{t.cost.status}</th>
              </tr>
            </thead>
            <tbody>
              {recentUsage.map((usage) => (
                <tr key={usage.id}>
                  <td className="whitespace-nowrap border-b p-3">
                    {usage.createdAt.toLocaleString(interfaceLocale, { hour12: false })}
                  </td>
                  <td className="border-b p-3 font-medium">{usage.companyName}</td>
                  <td className="border-b p-3">{stageLabel(usage.pipelineStage ?? "OTHER")}</td>
                  <td className="border-b p-3">
                    <div>{actionLabel(usage.action)}</div>
                    {usage.operationKey && (
                      <div className="mt-1 max-w-[24rem] break-all text-xs text-slate-500" title={t.cost.operationKey}>
                        {usage.operationKey}
                      </div>
                    )}
                  </td>
                  <td className="border-b p-3">
                    <div>{usageDocumentLabel(usage)}</div>
                    {usage.receiptId && (
                      <a
                        href={`/fylgiskjol/${usage.receiptId}`}
                        className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
                      >
                        {t.cost.openReceipt}
                      </a>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b p-3">{usage.model}</td>
                  <td className="whitespace-nowrap border-b p-3">{formatNumber(usage.totalTokens)}</td>
                  <td className="whitespace-nowrap border-b p-3">
                    {formatNumber(usage.costIsk, { maximumFractionDigits: 2 })} kr.
                  </td>
                  <td className="border-b p-3">
                    <span className={usage.success ? "text-emerald-700" : "text-red-700"}>
                      {usage.success ? t.cost.success : t.cost.failed}
                    </span>
                    {!usage.success && usage.errorMessage && (
                      <div className="mt-1 max-w-[28rem] break-words text-xs text-red-700">
                        {usage.errorMessage}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {recentUsage.length === 0 && (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={9}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}
