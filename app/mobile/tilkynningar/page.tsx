import Link from "next/link";
import { redirect } from "next/navigation";

import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { mobileNotificationText } from "@/lib/i18n/mobile-notifications";
import { prisma } from "@/lib/prisma";
import { markAllMobileNotificationsRead, openMobileNotification } from "./actions";

export default async function MobileNotificationsPage() {
  const companyId = await requireCompanyModule("verk");
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile/tilkynningar");

  const [settings, notifications] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { interfaceLanguage: true },
    }),
    prisma.userNotification.findMany({
      where: { userId: user.id, companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const language = settings?.interfaceLanguage ?? "is";
  const t = mobileNotificationText(language);
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <header>
          <Link href="/mobile" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold text-slate-700">
            ← Mobile
          </Link>
          <div className="mt-5 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-950">{t.notifications}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t.notificationsHelp}</p>
            </div>
            {unread > 0 ? (
              <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                {unread} {t.unread}
              </span>
            ) : null}
          </div>
          {unread > 0 ? (
            <form action={markAllMobileNotificationsRead} className="mt-4">
              <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                {t.markAllRead}
              </button>
            </form>
          ) : null}
        </header>

        <section className="mt-6 space-y-3">
          {notifications.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-sm text-slate-600">{t.noNotifications}</p>
          ) : (
            notifications.map((item) => (
              <form action={openMobileNotification} key={item.id}>
                <input type="hidden" name="notificationId" value={item.id} />
                <button
                  type="submit"
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm ${item.readAt ? "bg-white" : "border-rose-200 bg-rose-50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-950">{item.title}</p>
                      {item.body ? <p className="mt-1 text-sm leading-5 text-slate-700">{item.body}</p> : null}
                    </div>
                    {!item.readAt ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600" /> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{item.createdAt.toLocaleString(language === "is" ? "is-IS" : undefined)}</span>
                    <span className="font-semibold text-blue-700">{t.open} →</span>
                  </div>
                </button>
              </form>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
