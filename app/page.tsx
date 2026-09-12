import Greeting from "@/components/Greeting";
import { getEffectiveUser } from "@/lib/core/access-control";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import Link from "next/link";
import { uiOptions, uiText } from "@/lib/i18n/ui";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

const session = sessionToken
  ? await prisma.session.findUnique({
      where: {
        token: sessionToken,
      },
      include: {
        user: true,
      },
    })
  : null;

  const effectiveUser = await getEffectiveUser();

const loggedInUserName = effectiveUser?.name ?? "notandi";
  const userSettings = effectiveUser ? await prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } }) : null;
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = uiText(language);
  const o = uiOptions(language);

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const myServiceTimes = session?.user.id ? await prisma.serviceTimeEntry.findMany({
    where: { userId: session.user.id, startedAt: { gte: weekStart } },
    select: { durationSeconds:true, startedAt:true, company:{ select:{ name:true } }, module:true, category:true },
  }) : [];
  const serviceToday = myServiceTimes.filter(e=>e.startedAt>=todayStart).reduce((s,e)=>s+e.durationSeconds,0);
  const serviceWeek = myServiceTimes.reduce((s,e)=>s+e.durationSeconds,0);
  const latestService = [...myServiceTimes].sort((a,b)=>b.startedAt.getTime()-a.startedAt.getTime())[0];
  const fmtService=(s:number)=>{ const m=Math.floor(s/60), h=Math.floor(m/60), min=m%60; const units = language === "en" ? ["h","min"] : language === "pl" ? ["godz.","min"] : language === "sr" ? ["ч","мин"] : ["klst.","mín."]; return h ? `${h} ${units[0]} ${min ? `${min} ${units[1]}` : ""}`.trim() : `${m} ${units[1]}`; };
  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

    const activeCompanyAccess =
  session?.user.role === "ADMIN"
    ? true
    : activeCompanyId
      ? await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: session?.user.id ?? 0,
              companyId: Number(activeCompanyId),
            },
          },
        })
      : null;

  const company = activeCompanyId && activeCompanyAccess
    ? await prisma.company.findUnique({
        where: {
          id: Number(activeCompanyId),
        },
        include: {
          receipts: {
            include: {
              aiDetectedDocuments: true,
            },
          },
        },
      })
    : null;

    const moduleSettings = company
  ? await getCompanyModuleSettings(company.id)
  : {};

const enabledModules = getEnabledCompanyModules(moduleSettings);

  const uploadedDocuments =
  company?.receipts.reduce((total, receipt) => {
    return (
      total +
      (receipt.aiDetectedDocuments.length > 0
        ? receipt.aiDetectedDocuments.length
        : 1)
    );
  }, 0) ?? 0;

const pendingDocuments =
  company?.receipts.reduce((total, receipt) => {
    if (receipt.aiDetectedDocuments.length === 0) {
      return total + (receipt.status === "APPROVED" ? 0 : 1);
    }

    return (
      total +
      receipt.aiDetectedDocuments.filter(
        (document) => document.approvedAt === null
      ).length
    );
  }, 0) ?? 0;

  const approvedVouchers =
  company?.receipts.reduce((total, receipt) => {
    if (receipt.aiDetectedDocuments.length === 0) {
      return total + (receipt.voucherNumber !== null ? 1 : 0);
    }

    return (
      total +
      receipt.aiDetectedDocuments.filter(
        (document) =>
          document.approvedAt !== null &&
          document.voucherNumber !== null
      ).length
    );
  }, 0) ?? 0;

  

  const stats = [
    {
      title: t.uploaded,
      value: String(uploadedDocuments),
    },
    {
      title: t.pending,
      value: String(pendingDocuments),
    },
    {
      title: t.booked,
      value: String(approvedVouchers),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="p-10">
        <div className="mx-auto max-w-6xl">
          <Greeting name={loggedInUserName} language={language} />

          <p className="mt-2 text-slate-600">
            {t.welcome}
           </p>
          <div className="mt-10 grid grid-cols-3 gap-6">
            {stats.map((stat) => (
              <StatCard
                key={stat.title}
                title={stat.title}
                value={stat.value}
              />
            ))}
          </div>

          {session?.user && (
            <Link href="/vinnustundir#vinnusaga-bokara" className="mt-8 block rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.serviceTime}</p><h3 className="mt-1 text-xl font-bold text-slate-900">{t.myHistory}</h3></div>
                <span className="text-sm font-semibold text-blue-700">{t.open}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><p className="text-sm text-slate-500">{t.today}</p><p className="text-2xl font-bold">{fmtService(serviceToday)}</p></div>
                <div><p className="text-sm text-slate-500">{t.thisWeek}</p><p className="text-2xl font-bold">{fmtService(serviceWeek)}</p></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{latestService ? `${t.last}: ${latestService.company.name} · ${latestService.module ?? latestService.category}` : t.noService}</p>
            </Link>
          )}

          {company && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">
                {company.name}
              </h3>

              <p className="mt-1 text-slate-500">
                {pendingDocuments} {t.docsWaiting}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                {t.nextVoucher}:{" "}
                {company.nextVoucherNumber}
              </p>

              <p className="mt-3 text-sm text-slate-500">
  {t.activeModules}:{" "}
  {enabledModules.map((module) => o.modules[module.id]).join(", ")}
</p>

            </div>
          )}

          {!company && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-slate-600">
                {t.chooseCompanyToStart}
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}