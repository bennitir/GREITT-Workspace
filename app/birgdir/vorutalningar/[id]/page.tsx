import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCompanyModule } from "@/lib/core/require-company-module";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { stocktakeMobileText, stocktakeSessionStatusText } from "@/lib/i18n/stocktake-mobile";
import { inventoryText } from "@/lib/i18n/inventory";
import { work10UnitText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import { approveHandheldStocktake, requestHandheldRecount } from "./actions";

type Props = { params: Promise<{ id: string }> };

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
}

export default async function InventoryCountReviewPage({ params }: Props) {
  const companyId = await requireCompanyModule("birgdir");
  const access = await getCompanyAccess(companyId);
  if (!access.canWrite) throw new Error("Þú hefur ekki heimild til að yfirfara vörutalningar.");

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) notFound();

  const user = await getEffectiveUser();
  const settings = user
    ? await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } })
    : null;
  const language = normalizeUiLanguage(settings?.interfaceLanguage ?? "is");
  const t = stocktakeMobileText(language);
  const invT = inventoryText(language);
  const locale = localeFor(language);

  const session = await prisma.inventoryCountSession.findFirst({
    where: { id: sessionId, companyId },
    include: {
      location: { select: { id: true, name: true, code: true, kind: true } },
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      lines: {
        where: { voidedAt: null, status: { not: "VOIDED" } },
        include: { countedBy: { select: { name: true } } },
        orderBy: { countedAt: "asc" },
      },
    },
  });
  if (!session) notFound();

  const rows = await Promise.all(
    session.lines.map(async (line) => {
      const [movementSum, commitments, approvedStocktake] = await Promise.all([
        prisma.inventoryMovement.aggregate({
          where: {
            companyId,
            itemId: line.itemId,
            locationId: session.locationId,
            voidedAt: null,
            movementAt: { lte: line.countedAt },
          },
          _sum: { quantityDelta: true },
        }),
        prisma.inventoryCommitment.findMany({
          where: {
            companyId,
            itemId: line.itemId,
            locationId: session.locationId,
            createdAt: { lte: line.countedAt },
            OR: [{ releasedAt: null }, { releasedAt: { gt: line.countedAt } }],
          },
          select: { quantity: true },
        }),
        line.stocktakeId
          ? prisma.inventoryStocktake.findUnique({
              where: { id: line.stocktakeId },
              select: { expectedQuantity: true, countedQuantity: true, varianceQuantity: true },
            })
          : Promise.resolve(null),
      ]);
      const expected = approvedStocktake?.expectedQuantity ?? movementSum._sum.quantityDelta ?? 0;
      const counted = approvedStocktake?.countedQuantity ?? line.countedQuantity;
      const variance = approvedStocktake?.varianceQuantity ?? counted - expected;
      const committed = commitments.reduce((sum, commitment) => sum + commitment.quantity, 0);
      return {
        line,
        expected,
        counted,
        committed,
        variance,
      };
    }),
  );

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{invT.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.reviewTitle}</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">{t.reviewHelp}</p>
        </div>
        <Link href="/birgdir/vorutalningar" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          ← {t.reviewList}
        </Link>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">{t.location}</p>
          <p className="mt-1 font-bold">{session.location.name}</p>
          <p className="text-sm text-slate-500">{session.location.code}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">{t.counter}</p>
          <p className="mt-1 font-bold">{session.createdBy?.name ?? "—"}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">{t.started}</p>
          <p className="mt-1 font-bold">{session.startedAt.toLocaleString(locale)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">{t.status}</p>
          <p className="mt-1 font-bold">{stocktakeSessionStatusText(session.status, language)}</p>
        </div>
      </section>

      {session.status === "COUNTING" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          {t.recountInProgress}
        </div>
      ) : null}

      <form action={approveHandheldStocktake} className="space-y-4">
        <input type="hidden" name="sessionId" value={session.id} />

        {rows.map(({ line, expected, counted, committed, variance }) => (
          <section key={line.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{line.nameSnapshot}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {line.skuSnapshot}{line.barcodeSnapshot ? ` · ${line.barcodeSnapshot}` : ""}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {line.countedBy?.name ?? "—"} · {line.countedAt.toLocaleString(locale)}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{line.status === "RECOUNT_REQUESTED" ? t.recountRequested : line.status}</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{t.expectedPhysical}</p>
                <p className="mt-1 text-xl font-bold">{formatNumber(expected, locale)} {work10UnitText(line.unit, null, language)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{t.counted}</p>
                <p className="mt-1 text-xl font-bold">{formatNumber(counted, locale)} {work10UnitText(line.unit, null, language)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{t.variance}</p>
                <p className={`mt-1 text-xl font-bold ${Math.abs(variance) > 1e-9 ? "text-amber-700" : "text-emerald-700"}`}>
                  {variance > 0 ? "+" : ""}{formatNumber(variance, locale)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{t.commitmentsContext}</p>
                <p className="mt-1 text-xl font-bold">{formatNumber(committed, locale)}</p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">{t.commitmentsHelp}</p>

            {session.status === "REVIEW" && line.status === "COUNTED" ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.reason}</span>
                  <select name={`reason_${line.id}`} defaultValue="COUNT_VARIANCE" className="min-h-11 rounded-xl border bg-white px-3">
                    <option value="COUNT_VARIANCE">{t.countVariance}</option>
                    <option value="SHRINKAGE">{t.shrinkage}</option>
                    <option value="DAMAGE">{t.damage}</option>
                    <option value="SPOILAGE">{t.spoilage}</option>
                    <option value="THEFT">{t.theft}</option>
                    <option value="OBSOLETE">{t.obsolete}</option>
                    <option value="OTHER">{t.other}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.note}</span>
                  <input name={`note_${line.id}`} defaultValue={line.note ?? ""} className="min-h-11 rounded-xl border px-3" />
                </label>
                <button
                  formAction={requestHandheldRecount}
                  name="lineId"
                  value={line.id}
                  className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-800"
                >
                  {t.recount}
                </button>
              </div>
            ) : null}
          </section>
        ))}

        {session.status === "REVIEW" ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm leading-6 text-emerald-900">{t.approveHelp}</p>
            <button className="mt-4 min-h-12 rounded-xl bg-emerald-700 px-5 font-bold text-white">
              {t.approveSession}
            </button>
          </section>
        ) : null}
      </form>
    </main>
  );
}
