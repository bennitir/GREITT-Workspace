import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminText } from "@/lib/i18n/admin";

export default async function SystemSettingsPage() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where: { token }, include: { user: true } }) : null;
  if (!session || session.expiresAt < new Date() || !session.user.isActive) redirect("/innskraning");
  if (session.user.role !== "ADMIN") redirect("/");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });
  const t = adminText(settings?.interfaceLanguage);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t.systemSettings.title}</h1>
        <p className="mt-2 text-slate-600">{t.systemSettings.subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t.systemSettings.adminTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{t.systemSettings.adminText}</p>
        </section>
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t.systemSettings.separationTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{t.systemSettings.separationText}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/stillingar" className="rounded-lg border px-4 py-2 font-semibold">{t.systemSettings.mySettings}</Link>
            <Link href="/stillingar/fyrirtaeki" className="rounded-lg border px-4 py-2 font-semibold">{t.systemSettings.companySettings}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
