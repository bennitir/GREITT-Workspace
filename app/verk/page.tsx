import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workPriorityText, workStatusText, workText } from "@/lib/i18n/work";

export default async function VerkPage() {
  const companyId = await requireCompanyModule("verk");
  const access = await getCompanyAccess(companyId);
  const effectiveUser = await getEffectiveUser();
  const userSettings = effectiveUser
    ? await prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
    : null;
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = workText(language);

  const workOrders = await prisma.workOrder.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  const newCount = workOrders.filter((work) => work.status === "NEW").length;
  const inProgressCount = workOrders.filter((work) => work.status === "IN_PROGRESS").length;
  const completedCount = workOrders.filter((work) => work.status === "COMPLETED").length;

  return (
    <main className="space-y-6 p-8">
      <PageHeader title={t.title} description={t.overviewDescription}>
        {access.canWrite && <Link href="/verk/nytt"><Button>{t.newWork}</Button></Link>}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">{t.allWork}</p><p className="mt-2 text-3xl font-bold">{workOrders.length}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.newWorks}</p><p className="mt-2 text-3xl font-bold">{newCount}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.inProgress}</p><p className="mt-2 text-3xl font-bold">{inProgressCount}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.completed}</p><p className="mt-2 text-3xl font-bold">{completedCount}</p></Card>
      </div>

      <Card>
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{t.workList}</h2><p className="mt-1 text-slate-600">{t.newestFirst}</p></div></div>
        {workOrders.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
            <p className="text-lg font-semibold">{t.noWork}</p><p className="mt-2 text-slate-600">{t.noWorkHelp}</p>
            {access.canWrite && <div className="mt-4"><Link href="/verk/nytt"><Button>{t.createFirst}</Button></Link></div>}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {workOrders.map((work) => (
              <div key={work.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{work.title}</h3>
                    {work.address && <p className="mt-1 text-slate-600">{work.address}</p>}
                    {work.description && <p className="mt-2 text-sm text-slate-500">{work.description}</p>}
                    <p className="mt-2 text-sm text-slate-500">{t.priority}: <span className="font-medium text-slate-700">{workPriorityText(work.priority, language)}</span></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border px-3 py-1 text-sm">{workStatusText(work.status, language)}</span>
                    <Link href={`/verk/${work.id}`}><Button>{t.openWork}</Button></Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
