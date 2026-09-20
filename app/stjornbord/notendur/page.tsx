import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminRoleLabel, adminText } from "@/lib/i18n/admin";

export default async function AdminUsersPage() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where: { token }, include: { user: true } }) : null;
  if (!session || session.expiresAt < new Date() || !session.user.isActive) redirect("/innskraning");
  if (session.user.role !== "ADMIN") redirect("/");

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });
  const language = settings?.interfaceLanguage ?? "is";
  const t = adminText(language);

  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, include: { companies: { where: { isActive: true }, include: { company: true } } } });
  return <main className="mx-auto max-w-7xl p-6">
    <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">{t.usersPage.title}</h1><p className="mt-1 text-slate-600">{t.usersPage.subtitle}</p></div><Link href="/stjornbord/nyr" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{t.usersPage.newUser}</Link></div>
    <div className="overflow-hidden rounded-2xl border bg-white">{users.map((user) => <div key={user.id} className="border-b p-5 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold">{user.name}</div><div className="text-sm text-slate-500">{user.email} · {adminRoleLabel(user.role, language)}</div></div><span className={user.isActive ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{user.isActive ? t.usersPage.active : t.usersPage.inactive}</span></div><div className="mt-2 text-sm text-slate-600">{user.companies.length ? user.companies.map((x) => `${x.company.name} (${adminRoleLabel(x.accessRole, language)})`).join(" · ") : t.usersPage.noCompanyConnection}</div></div>)}</div>
  </main>;
}
