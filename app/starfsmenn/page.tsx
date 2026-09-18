import Link from "next/link";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { createEmployee, createEmployeeFromUser } from "./actions";
import { getCompanyAccess, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { employeeText } from "@/lib/i18n/employees";
import { prisma } from "@/lib/prisma";

export default async function EmployeesPage() {
  const companyId = await requireActiveCompanyReadAccess();
  const [access, language] = await Promise.all([getCompanyAccess(companyId), getCurrentInterfaceLanguage()]);
  const canManage = access.role === "ADMIN" || access.role === "OWNER" || access.role === "MANAGER" || access.canManageCompanySettings;
  if (!canManage) redirect("/");
  const t = employeeText(language);

  const now = new Date();
  const inSixtyDays = new Date(now);
  inSixtyDays.setDate(inSixtyDays.getDate() + 60);

  const [employees, companyUsers, expiringRights] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        compensations: { orderBy: { validFrom: "desc" }, take: 1 },
        qualifications: { orderBy: [{ validUntil: "asc" }, { title: "asc" }] },
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    }),
    prisma.userCompany.findMany({
      where: { companyId, isActive: true, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeQualification.count({
      where: { companyId, validUntil: { gte: now, lte: inSixtyDays }, employee: { isActive: true } },
    }),
  ]);

  const linkedUserIds = new Set(employees.map((employee) => employee.userId).filter((id): id is number => id !== null));
  const unlinkedUsers = companyUsers.filter((membership) => !linkedUserIds.has(membership.userId));
  const activeEmployees = employees.filter((employee) => employee.isActive).length;
  const withLogin = employees.filter((employee) => employee.userId && employee.user?.isActive).length;

  return (
    <main className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-slate-500">{t.activeEmployees}</p><p className="mt-2 text-3xl font-bold">{activeEmployees}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.linkedLogin}</p><p className="mt-2 text-3xl font-bold">{withLogin}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.expiringRights}</p><p className="mt-2 text-3xl font-bold">{expiringRights}</p></Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{t.workHelp}</p>
          </div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newEmployee}</summary>
            <form action={createEmployee} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.fullName}</span><input name="fullName" required placeholder={t.personPlaceholder} className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.employeeNumber}</span><input name="employeeNumber" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.kennitala}</span><input name="kennitala" inputMode="numeric" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.email}</span><input name="email" type="email" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.phone}</span><input name="phone" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.preferredLanguage}</span><select name="preferredLanguage" defaultValue="is" className="rounded-lg border bg-white px-3 py-2"><option value="is">{t.languages.is}</option><option value="en">{t.languages.en}</option><option value="pl">{t.languages.pl}</option><option value="sr">{t.languages.sr}</option></select></label>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.createEmployee}</button>
            </form>
          </details>
        </div>

        {employees.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed p-5 text-slate-500">{t.noEmployees}</p>
        ) : (
          <div className="mt-5 divide-y overflow-hidden rounded-xl border bg-white">
            {employees.map((employee) => {
              const latest = employee.compensations[0];
              return (
                <Link key={employee.id} href={`/starfsmenn/${employee.id}`} className="flex flex-col gap-2 p-4 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-950">{employee.fullName}</span>{!employee.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{t.inactive}</span>}</div>
                    <p className="mt-1 text-sm text-slate-500">{[employee.employeeNumber, employee.jobTitle, employee.department].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="text-sm text-slate-600 md:text-right">
                    <p>{employee.user ? `${t.linkedLogin}: ${employee.user.email}` : t.noLoginLinked}</p>
                    <p className="mt-1 font-medium text-slate-800">{latest ? t.payTypes[latest.payType as keyof typeof t.payTypes] ?? latest.payType : t.noCompensation}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="bg-slate-50">
        <h2 className="text-xl font-bold">{t.linkedUsersTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.linkedUsersHelp}</p>
        {unlinkedUsers.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noLinkedUsers}</p> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {unlinkedUsers.map((membership) => (
              <div key={membership.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3">
                <div className="min-w-0"><p className="truncate font-semibold">{membership.user.name}</p><p className="truncate text-sm text-slate-500">{membership.user.email}</p></div>
                <form action={createEmployeeFromUser}><input type="hidden" name="userId" value={membership.userId} /><button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.createFromUser}</button></form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
