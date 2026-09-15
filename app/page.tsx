import Greeting from "@/components/Greeting";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import Link from "next/link";
import { uiOptions, uiText } from "@/lib/i18n/ui";
import { homeText } from "@/lib/i18n/home";
import { setActiveCompany } from "@/app/actions/companyActions";
import { ensureCompanyStatutoryTasks } from "@/lib/core/statutory-tasks";
import { markCompanyMessageRead } from "@/app/actions/messageActions";

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
  const ht = homeText(language);

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

  const companyAccess = company ? await getCompanyAccess(company.id) : null;

  if (company) {
    await ensureCompanyStatutoryTasks(company.id, now);
  }

  const activeCompanyTasks = company && effectiveUser
    ? await prisma.companyTask.findMany({
        where: {
          companyId: company.id,
          status: "OPEN",
          OR: [{ assigneeUserId: null }, { assigneeUserId: effectiveUser.id }],
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const activeCompanyMessages = company && effectiveUser
    ? await prisma.companyMessage.findMany({
        where: {
          companyId: company.id,
          recipientUserId: effectiveUser.id,
          readAt: null,
          archivedAt: null,
          trashedAt: null,
        },
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      })
    : [];

  const unreadCompanyMessageCount = company && effectiveUser
    ? await prisma.companyMessage.count({
        where: {
          companyId: company.id,
          recipientUserId: effectiveUser.id,
          readAt: null,
          archivedAt: null,
          trashedAt: null,
        },
      })
    : 0;

  const allCompanyWork = !company && effectiveUser
    ? await prisma.company.findMany({
        where: {
          isActive: true,
          ...(effectiveUser.role !== "ADMIN"
            ? {
                users: {
                  some: {
                    userId: effectiveUser.id,
                    isActive: true,
                    OR: [
                      { canPrepareBookkeeping: true },
                      { canReviewBookkeeping: true },
                      { canBookEntries: true },
                    ],
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          receipts: {
            select: {
              status: true,
              aiDetectedDocuments: {
                select: { approvedAt: true },
              },
            },
          },
          tasks: {
            where: {
              status: "OPEN",
              OR: [{ assigneeUserId: null }, { assigneeUserId: effectiveUser.id }],
            },
            select: { id: true, dueAt: true },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const allCompanyDocumentTasks = allCompanyWork
    .map((workCompany) => {
      const pending = workCompany.receipts.reduce((total, receipt) => {
        if (receipt.aiDetectedDocuments.length === 0) {
          return total + (receipt.status === "APPROVED" ? 0 : 1);
        }
        return total + receipt.aiDetectedDocuments.filter((document) => document.approvedAt === null).length;
      }, 0);
      return { id: workCompany.id, name: workCompany.name, pending, taskCount: workCompany.tasks.length };
    })
    .filter((item) => item.pending > 0 || item.taskCount > 0);

  const allCompanyPendingTotal = allCompanyDocumentTasks.reduce((sum, item) => sum + item.pending, 0);
  const allCompanyTaskTotal = allCompanyDocumentTasks.reduce((sum, item) => sum + item.taskCount, 0);
  const activeOverdueTasks = activeCompanyTasks.filter((task) => task.dueAt && task.dueAt < todayStart).length;
  const activeDueTodayTasks = activeCompanyTasks.filter((task) => task.dueAt && task.dueAt >= todayStart && task.dueAt < new Date(todayStart.getTime() + 86400000)).length;
  const activeDueSoonTasks = activeCompanyTasks.filter((task) => task.dueAt && task.dueAt >= new Date(todayStart.getTime() + 86400000) && task.dueAt < new Date(todayStart.getTime() + 4 * 86400000)).length;

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

  

  const mayWorkWithDocuments = Boolean(
    companyAccess?.canPrepareBookkeeping ||
      companyAccess?.canReviewBookkeeping ||
      companyAccess?.canBookEntries
  );

  const showPendingDocumentTask = mayWorkWithDocuments && pendingDocuments > 0;
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

          {company && (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {ht.myWork}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{ht.myWorkHelp}</p>
                </div>
                <Link href="/verkefni" className="text-sm font-semibold text-blue-700">{ht.deadlines} →</Link>
              </div>

              <div className="mt-5 space-y-3">
                {showPendingDocumentTask && (
                  <Link
                    href="/fylgiskjol"
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {pendingDocuments} {ht.documentsNeedWork}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {ht.documentsNeedWorkHelp}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-blue-700">
                      {ht.openWork} →
                    </span>
                  </Link>
                )}

                {activeCompanyTasks.length > 0 && (
                  <Link href="/verkefni" className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition ${activeOverdueTasks > 0 ? "border-red-300 bg-red-50 hover:bg-red-100/60" : activeDueTodayTasks > 0 ? "border-amber-300 bg-amber-50 hover:bg-amber-100/60" : activeDueSoonTasks > 0 ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                    <div>
                      <p className="font-semibold text-slate-900">{activeCompanyTasks.length} {ht.deadlines}</p>
                      <p className="mt-1 text-sm text-slate-500">{ht.deadlinesHelp}</p>
                      {(activeOverdueTasks > 0 || activeDueTodayTasks > 0 || activeDueSoonTasks > 0) && <p className={`mt-1 text-sm font-semibold ${activeOverdueTasks > 0 ? "text-red-700" : "text-amber-700"}`}>{activeOverdueTasks > 0 ? `${activeOverdueTasks} ${ht.overdue}` : ""}{activeOverdueTasks > 0 && (activeDueTodayTasks > 0 || activeDueSoonTasks > 0) ? " · " : ""}{activeDueTodayTasks > 0 ? `${activeDueTodayTasks} ${ht.dueToday}` : ""}{activeDueTodayTasks > 0 && activeDueSoonTasks > 0 ? " · " : ""}{activeDueSoonTasks > 0 ? `${activeDueSoonTasks} ${ht.dueSoon}` : ""}</p>}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-blue-700">{ht.openWork} →</span>
                  </Link>
                )}

                {activeCompanyMessages.length > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{ht.messages} · {unreadCompanyMessageCount} {ht.unreadMessages}</p>
                        <p className="mt-1 text-sm text-slate-500">{ht.messagesHelp}</p>
                      </div>
                      <Link href="/skilabod" className="text-sm font-semibold text-blue-700">{ht.openMailbox} →</Link>
                    </div>
                    <div className="mt-3 divide-y divide-blue-100 rounded-lg border border-blue-100 bg-white">
                      {activeCompanyMessages.map((message) => (
                        <div key={message.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-900">{message.subject}</p><span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{ht.newMessage}</span></div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{ht.from}: {message.createdBy.name} · {message.body}</p>
                          </div>
                          <form action={markCompanyMessageRead.bind(null,message.id)}><button className="shrink-0 text-xs font-semibold text-blue-700">{ht.markRead}</button></form>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!showPendingDocumentTask && activeCompanyTasks.length === 0 && activeCompanyMessages.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    {ht.noWorkWaiting}
                  </div>
                )}
              </div>
            </section>
          )}

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
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {ht.allCompaniesWork}
                </p>
                <p className="mt-1 text-sm text-slate-600">{ht.allCompaniesWorkHelp}</p>
              </div>

              <div className="mt-5 space-y-3">
                {allCompanyDocumentTasks.length > 0 ? (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      {allCompanyPendingTotal} {ht.documentsNeedWork} · {allCompanyTaskTotal} {ht.deadlines.toLowerCase()} · {allCompanyDocumentTasks.length} {ht.companiesWithWork}
                    </p>
                    {allCompanyDocumentTasks.map((item) => (
                      <form key={item.id} action={setActiveCompany.bind(null, item.id)}>
                        <button
                          type="submit"
                          className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{item.name}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {item.pending} {ht.documentsNeedWork}{item.taskCount > 0 ? ` · ${item.taskCount} ${ht.deadlines.toLowerCase()}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-blue-700">
                            {ht.openWork} →
                          </span>
                        </button>
                      </form>
                    ))}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    {ht.noWorkAcrossCompanies}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}