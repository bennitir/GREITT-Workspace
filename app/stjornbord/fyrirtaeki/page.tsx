import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminText } from "@/lib/i18n/admin";

export default async function AdminCompaniesPage() {
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

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { receipts: true, users: true } } },
  });

  return <main className="mx-auto max-w-7xl p-6">
    <div className="mb-6 flex items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold">{t.companiesPage.title}</h1><p className="mt-1 text-slate-600">{t.companiesPage.subtitle}</p></div>
      <Link href="/fyrirtaeki/nytt" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{t.companiesPage.newCompany}</Link>
    </div>
    <div className="overflow-hidden rounded-2xl border bg-white">
      {companies.map((company) => <div key={company.id} className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-b-0">
        <div><div className="font-bold">{company.name}</div><div className="text-sm text-slate-500">{t.companiesPage.idNumberShort} {company.kennitala} · {t.companiesPage.receipts}: {company._count.receipts} · {t.companiesPage.users}: {company._count.users}</div></div>
        <Link href={`/stjornbord/fyrirtaeki/${company.id}`} className="rounded-lg border px-4 py-2 font-semibold">{t.companiesPage.open}</Link>
      </div>)}
    </div>
  </main>;
}
