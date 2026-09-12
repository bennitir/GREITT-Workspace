import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getBookkeepingWorkflowSettings } from "@/lib/core/bookkeeping-workflow";
import { saveCompanyWorkflowSettings } from "@/app/actions/companyWorkflowActions";
import { saveCompanyUserPermissions } from "@/app/actions/companyPermissionActions";

export default async function CompanySettingsPage() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const activeCompanyId = Number(store.get("activeCompanyId")?.value);
  const session = token ? await prisma.session.findUnique({ where: { token }, include: { user: true } }) : null;
  if (!session || session.expiresAt < new Date() || !session.user.isActive) redirect("/innskraning?next=%2Fstillingar%2Ffyrirtaeki");
  if (!Number.isInteger(activeCompanyId)) redirect("/fyrirtaeki");
  const access = session.user.role === "ADMIN" ? null : await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: session.user.id, companyId: activeCompanyId } } });
  const mayManage = session.user.role === "ADMIN" || (!!access?.isActive && (access.accessRole === "OWNER" || access.accessRole === "MANAGER" || access.canManageCompanySettings));
  if (!mayManage) redirect("/stillingar");
  const company = await prisma.company.findUnique({ where: { id: activeCompanyId }, include: { users: { where: { isActive: true }, include: { user: true }, orderBy: { user: { name: "asc" } } } } });
  if (!company) redirect("/fyrirtaeki");
  const workflow = await getBookkeepingWorkflowSettings(company.id);
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <div><h1 className="text-3xl font-bold">Fyrirtækisstillingar</h1><p className="mt-2 text-slate-600">{company.name} · Reglur fyrirtækisins ganga framar persónulegum óskum notenda.</p></div>
    <form action={saveCompanyWorkflowSettings} className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm"><input type="hidden" name="companyId" value={company.id}/><h2 className="text-xl font-bold">Bókhaldsferli</h2><p className="text-sm text-slate-600">AI og handskráning segja hvernig gögn verða til. Stjórnskrefin hér segja hvað þarf að gerast áður en bóka má.</p>
      <label className="block space-y-2"><span className="font-semibold">Undirbúningur</span><select name="preparationMode" defaultValue={workflow.preparationMode} className="w-full rounded-lg border p-3"><option value="HYBRID">Blandað – handvirkt og AI</option><option value="AI">AI aðstoð að jafnaði</option><option value="MANUAL">Handvirkt að jafnaði</option></select></label>
      <div className="space-y-3"><label className="flex gap-3"><input type="checkbox" name="requireReviewBeforeBooking" defaultChecked={workflow.requireReviewBeforeBooking}/><span>Krefjast yfirferðar fyrir bókun</span></label><label className="flex gap-3"><input type="checkbox" name="requireReconciliationBeforeBooking" defaultChecked={workflow.requireReconciliationBeforeBooking}/><span>Krefjast afstemmingar fyrir bókun</span></label><label className="flex gap-3"><input type="checkbox" name="requireApprovalBeforeBooking" defaultChecked={workflow.requireApprovalBeforeBooking}/><span>Krefjast samþykkis fyrir bókun</span></label></div>
      <label className="block space-y-2"><span className="font-semibold">Þegar öllum kröfum er lokið</span><select name="completionMode" defaultValue={workflow.completionMode} className="w-full rounded-lg border p-3"><option value="MANUAL_CONFIRMATION">Notandi ýtir á Bóka</option><option value="AUTO_BOOK">Sjálfvirk bókun</option></select></label><button className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white">Vista bókhaldsferli</button>
    </form>
    <section className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm"><div><h2 className="text-xl font-bold">Notendur og heimildir</h2><p className="text-sm text-slate-600">Aðskilið frá verkferlinu: hér ákveðum við hver má framkvæma hvert stjórnskref.</p></div>{company.users.map((link) => <form key={link.id} action={saveCompanyUserPermissions} className="rounded-xl border p-4"><input type="hidden" name="companyId" value={company.id}/><input type="hidden" name="userId" value={link.userId}/><div className="mb-3 font-semibold">{link.user.name} <span className="font-normal text-slate-500">· {link.accessRole}</span></div><div className="grid gap-2 md:grid-cols-2">{[["canPrepareBookkeeping","Undirbúa bókun",link.canPrepareBookkeeping],["canReviewBookkeeping","Yfirfara bókhald",link.canReviewBookkeeping],["canReconcileBookkeeping","Afstemma",link.canReconcileBookkeeping],["canApproveExpenses","Samþykkja kostnað",link.canApproveExpenses],["canBookEntries","Bóka færslur",link.canBookEntries],["canManageCompanySettings","Breyta fyrirtækisstillingum",link.canManageCompanySettings]].map(([name,label,checked]) => <label key={String(name)} className="flex gap-3"><input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)}/><span>{String(label)}</span></label>)}</div><button className="mt-4 rounded-lg border px-4 py-2 font-semibold">Vista heimildir</button></form>)}</section>
  </main>;
}
