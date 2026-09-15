import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  archiveCompanyMessage,
  markCompanyMessageRead,
  markCompanyMessageUnread,
  restoreCompanyMessage,
  trashCompanyMessage,
} from "@/app/actions/messageActions";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { messagesText } from "@/lib/i18n/messages";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ box?: string; q?: string }>;

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");

  const cookieStore = await cookies();
  const companyId = Number(cookieStore.get("activeCompanyId")?.value ?? 0);
  if (!companyId) redirect("/fyrirtaeki");
  const access = await getCompanyAccess(companyId);
  if (!access.allowed) redirect("/fyrirtaeki");

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } });
  const language = settings?.interfaceLanguage ?? "is";
  const t = messagesText(language);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) redirect("/fyrirtaeki");

  const params = await searchParams;
  const box = ["inbox", "sent", "archived", "trash"].includes(params.box ?? "") ? params.box! : "inbox";
  const q = (params.q ?? "").trim();
  const searchWhere = q ? { OR: [{ subject: { contains: q, mode: "insensitive" as const } }, { body: { contains: q, mode: "insensitive" as const } }] } : {};

  const where = box === "sent"
    ? { companyId, createdByUserId: user.id, ...searchWhere }
    : box === "archived"
      ? { companyId, recipientUserId: user.id, archivedAt: { not: null }, trashedAt: null, ...searchWhere }
      : box === "trash"
        ? { companyId, recipientUserId: user.id, trashedAt: { not: null }, ...searchWhere }
        : { companyId, recipientUserId: user.id, archivedAt: null, trashedAt: null, ...searchWhere };

  const [messages, unreadCount] = await Promise.all([
    prisma.companyMessage.findMany({
      where,
      include: { createdBy: { select: { name: true } }, recipient: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.companyMessage.count({ where: { companyId, recipientUserId: user.id, readAt: null, archivedAt: null, trashedAt: null } }),
  ]);

  const locale = language === "en" ? "en-GB" : language === "pl" ? "pl-PL" : language === "sr" ? "sr-RS" : "is-IS";
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const tabs = [
    ["inbox", `${t.inbox}${unreadCount ? ` (${unreadCount})` : ""}`],
    ["sent", t.sentBox],
    ["archived", t.archived],
    ["trash", t.trashBox],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-slate-900">{t.mailbox}</h1><p className="mt-1 text-slate-600">{company.name} · {t.mailboxHelp}</p></div>
          <div className="flex gap-4"><Link href="/verkefni" className="font-semibold text-blue-700">{t.newMessage}</Link><Link href="/" className="font-semibold text-blue-700">← GLÖGGT</Link></div>
        </div>

        <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map(([key,label]) => <Link key={key} href={`/skilabod?box=${key}`} className={`rounded-lg px-3 py-2 text-sm font-semibold ${box===key?"bg-slate-900 text-white":"bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}</Link>)}
          </div>
          <form className="mt-4 flex gap-2" action="/skilabod">
            <input type="hidden" name="box" value={box}/>
            <input name="q" defaultValue={q} placeholder={t.search} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"/>
            <button className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white">{t.searchButton}</button>
            {q && <Link href={`/skilabod?box=${box}`} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700">{t.clearSearch}</Link>}
          </form>
          <p className="mt-3 text-xs text-slate-500">{t.historyNote}</p>
        </section>

        <section className="mt-5 space-y-3">
          {messages.length === 0 ? <div className="rounded-2xl bg-white p-6 text-slate-500 shadow-sm">{t.noMessages}</div> : messages.map(message => (
            <article key={message.id} className={`rounded-2xl border p-5 shadow-sm ${!message.readAt && box==="inbox"?"border-blue-200 bg-blue-50":"border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{message.subject}</h2>{!message.readAt && box!=="sent" && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{t.unread}</span>}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
                  <p className="mt-3 text-xs text-slate-500">{box==="sent" ? `${t.to}: ${message.recipient.name}` : `${t.from}: ${message.createdBy.name}`} · {fmt.format(message.createdAt)}</p>
                </div>
                {box!=="sent" && <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm font-semibold">
                  {box==="inbox" && (!message.readAt ? <form action={markCompanyMessageRead.bind(null,message.id)}><button className="text-blue-700">{t.markRead}</button></form> : <form action={markCompanyMessageUnread.bind(null,message.id)}><button className="text-blue-700">{t.markUnread}</button></form>)}
                  {box==="inbox" && <form action={archiveCompanyMessage.bind(null,message.id)}><button className="text-slate-700">{t.archive}</button></form>}
                  {box==="archived" && <form action={restoreCompanyMessage.bind(null,message.id)}><button className="text-blue-700">{t.restore}</button></form>}
                  {box==="trash" && <form action={restoreCompanyMessage.bind(null,message.id)}><button className="text-blue-700">{t.restoreFromTrash}</button></form>}
                  {box!=="trash" && <form action={trashCompanyMessage.bind(null,message.id)}><button className="text-slate-500">{t.trash}</button></form>}
                </div>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
