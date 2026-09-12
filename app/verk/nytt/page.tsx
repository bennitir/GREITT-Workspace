import { getEffectiveUser, requireCompanyWriteAccess } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { workText } from "@/lib/i18n/work";

async function createWorkOrder(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  const activeUserId = cookieStore.get("activeUserId")?.value;
  if (!activeCompanyId) redirect("/fyrirtaeki");
  const companyId = Number(activeCompanyId);
  if (!Number.isInteger(companyId)) redirect("/fyrirtaeki");
  await requireCompanyWriteAccess(companyId);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const priority = String(formData.get("priority") ?? "NORMAL");
  if (!title) throw new Error("Heiti verks vantar.");
  const createdById = activeUserId ? Number(activeUserId) : null;
  await prisma.workOrder.create({ data: { companyId, createdById: createdById && Number.isInteger(createdById) ? createdById : null, title, description: description || null, address: address || null, priority, status: "NEW" } });
  revalidatePath("/verk");
  redirect("/verk");
}

export default async function NýttVerkPage() {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  if (!activeCompanyId) redirect("/fyrirtaeki");
  const companyId = Number(activeCompanyId);
  if (!Number.isInteger(companyId)) redirect("/fyrirtaeki");
  await requireCompanyWriteAccess(companyId);
  const effectiveUser = await getEffectiveUser();
  const userSettings = effectiveUser ? await prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } }) : null;
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = workText(language);

  return (
    <main className="space-y-6 p-8">
      <PageHeader title={t.newTitle} description={t.newDescription} />
      <Card>
        <form action={createWorkOrder} className="space-y-6">
          <div><label htmlFor="title" className="block font-medium">{t.workTitle}</label><input id="title" name="title" type="text" required className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.workTitlePlaceholder} /></div>
          <div><label htmlFor="address" className="block font-medium">{t.address}</label><input id="address" name="address" type="text" className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.addressPlaceholder} /></div>
          <div><label htmlFor="description" className="block font-medium">{t.description}</label><textarea id="description" name="description" rows={5} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.descriptionPlaceholder} /></div>
          <div><label htmlFor="priority" className="block font-medium">{t.priority}</label><select id="priority" name="priority" defaultValue="NORMAL" className="mt-2 w-full rounded-lg border px-4 py-3"><option value="LOW">{t.priorityLow}</option><option value="NORMAL">{t.priorityNormal}</option><option value="HIGH">{t.priorityHigh}</option><option value="URGENT">{t.priorityUrgent}</option></select></div>
          <div className="flex gap-3"><Button type="submit">{t.saveWork}</Button><a href="/verk" className="rounded-lg border px-4 py-2 font-medium">{t.cancel}</a></div>
        </form>
      </Card>
    </main>
  );
}
