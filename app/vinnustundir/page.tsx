import { cookies } from "next/headers";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { formatHoursDuration, hoursLocale, hoursText } from "@/lib/i18n/hours";

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d = new Date()) { const x = startOfDay(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }

export default async function VinnustundirPage() {
  await requireCompanyModule("vinnustundir");
  const language = await getCurrentInterfaceLanguage();
  const t = hoursText(language);
  const locale = hoursLocale(language);

  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where:{ token } }) : null;
  const userId = session?.userId ?? null;
  const entries = userId ? await prisma.serviceTimeEntry.findMany({
    where:{ userId, startedAt:{ gte:startOfMonth() } },
    include:{ company:{ select:{ name:true } } },
    orderBy:{ startedAt:"desc" }, take:100,
  }) : [];
  const sumSince=(from:Date)=>entries.filter(e=>e.startedAt>=from).reduce((s,e)=>s+e.durationSeconds,0);
  const today=sumSince(startOfDay()), week=sumSince(startOfWeek()), month=sumSince(startOfMonth());
  const byCompany = Array.from(entries.reduce((m,e)=>{ const k=e.company.name; m.set(k,(m.get(k)??0)+e.durationSeconds); return m; },new Map<string,number>())).sort((a,b)=>b[1]-a[1]);
  const fmt=(seconds:number)=>formatHoursDuration(seconds, language);

  return (
    <main className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">{t.workingNow}</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">{t.livePunch}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.hoursThisWeek}</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">{t.approvedAndPending}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.requests}</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">{t.leaveAndCorrections}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.forApproval}</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">{t.nextPayroll}</p></Card>
      </div>
      <Card className="border-2 border-slate-900"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.employee}</p><h2 className="mt-1 text-2xl font-bold">{t.punchInOut}</h2><p className="mt-1 text-slate-600">{t.punchHelp}</p></div><div className="flex gap-3"><button className="rounded-lg bg-slate-900 px-6 py-3 text-lg font-semibold text-white">{t.punchIn}</button><button className="rounded-lg border px-6 py-3 text-lg font-semibold text-slate-400" disabled>{t.punchOut}</button></div></div></Card>
      <div className="grid gap-4 md:grid-cols-2">{t.items.map(([title,subtitle,text])=><Card key={title}><p className="text-sm font-semibold text-slate-500">{title}</p><h2 className="mt-1 text-xl font-bold">{subtitle}</h2><p className="mt-2 text-slate-600">{text}</p></Card>)}</div>

      <div id="vinnusaga-bokara"><Card className="border-2 border-blue-200 bg-blue-50/40">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{t.devTest}</p><h2 className="mt-1 text-2xl font-bold">{t.bookkeeperHistory}</h2><p className="mt-1 text-slate-600">{t.bookkeeperHistoryHelp}</p></div></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-white p-4"><p className="text-sm text-slate-500">{t.today}</p><p className="mt-1 text-2xl font-bold">{fmt(today)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-sm text-slate-500">{t.thisWeek}</p><p className="mt-1 text-2xl font-bold">{fmt(week)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-sm text-slate-500">{t.thisMonth}</p><p className="mt-1 text-2xl font-bold">{fmt(month)}</p></div></div>
        {byCompany.length>0 && <div className="mt-5"><h3 className="font-bold">{t.byCompany}</h3><div className="mt-2 divide-y rounded-xl border bg-white">{byCompany.map(([name,seconds])=><div key={name} className="flex justify-between px-4 py-3"><span>{name}</span><strong>{fmt(seconds)}</strong></div>)}</div></div>}
        <div className="mt-5"><h3 className="font-bold">{t.latest}</h3>{entries.length===0 ? <p className="mt-2 text-slate-500">{t.noService}</p> : <div className="mt-2 overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">{t.time}</th><th className="p-3">{t.company}</th><th className="p-3">{t.workPart}</th><th className="p-3">{t.source}</th><th className="p-3 text-right">{t.duration}</th></tr></thead><tbody>{entries.slice(0,20).map(e=><tr key={e.id} className="border-t"><td className="p-3">{e.startedAt.toLocaleString(locale)}</td><td className="p-3">{e.company.name}</td><td className="p-3">{e.module ?? e.category}</td><td className="p-3">{e.source==="AUTO"?t.automatic:t.manual}</td><td className="p-3 text-right font-semibold">{fmt(e.durationSeconds)}</td></tr>)}</tbody></table></div>}</div>
      </Card></div>

      <Card className="bg-slate-50"><h2 className="text-xl font-bold">{t.designRule}</h2><p className="mt-2 text-slate-700">{t.designRuleText}</p></Card>
    </main>
  );
}
