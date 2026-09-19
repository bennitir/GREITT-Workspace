import Link from "next/link";

import { requireCompanyModule } from "@/lib/core/require-company-module";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { stocktakeMobileText, stocktakeSessionStatusText } from "@/lib/i18n/stocktake-mobile";
import { inventoryText } from "@/lib/i18n/inventory";
import { prisma } from "@/lib/prisma";

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

export default async function InventoryCountReviewListPage() {
  const companyId = await requireCompanyModule("birgdir");
  const access = await getCompanyAccess(companyId);
  if (!access.canWrite) throw new Error("Þú hefur ekki heimild til að yfirfara vörutalningar.");

  const user = await getEffectiveUser();
  const settings = user
    ? await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } })
    : null;
  const language = normalizeUiLanguage(settings?.interfaceLanguage ?? "is");
  const t = stocktakeMobileText(language);
  const invT = inventoryText(language);
  const locale = localeFor(language);

  const sessions = await prisma.inventoryCountSession.findMany({
    where: { companyId, status: { in: ["REVIEW", "COUNTING", "COMPLETED"] } },
    include: {
      location: { select: { name: true, code: true } },
      createdBy: { select: { name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{invT.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.reviewList}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{t.reviewHelp}</p>
        </div>
        <Link href="/birgdir" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          ← {invT.title}
        </Link>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-slate-600">{t.noPendingSessions}</div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/birgdir/vorutalningar/${session.id}`}
              className="rounded-2xl border bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{session.location.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{session.location.code}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {t.counter}: {session.createdBy?.name ?? "—"} · {session.startedAt.toLocaleString(locale)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{stocktakeSessionStatusText(session.status, language)}</span>
                  <p className="mt-3 text-sm font-semibold text-blue-700">{session._count.lines} · {t.openReview} →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
