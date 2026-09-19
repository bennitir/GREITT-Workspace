import { getEffectiveUser, requireCompanyWriteAccess } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { workText } from "@/lib/i18n/work";
import { normalizeUiLanguage } from "@/lib/i18n/ui";

async function createWorkOrder(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  const activeUserId = cookieStore.get("activeUserId")?.value;
  if (!activeCompanyId) redirect("/fyrirtaeki");
  const companyId = Number(activeCompanyId);
  if (!Number.isInteger(companyId)) redirect("/fyrirtaeki");
  await requireCompanyWriteAccess(companyId);
  const requestedWorkNumber = String(formData.get("workNumber") ?? "").trim();
  const workKey = String(formData.get("workKey") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const priority = String(formData.get("priority") ?? "NORMAL");
  const sourceLanguage = normalizeUiLanguage(
    String(formData.get("sourceLanguage") ?? "is"),
  );
  if (!title) throw new Error("Heiti verks vantar.");
  const createdById = activeUserId ? Number(activeUserId) : null;

  if (requestedWorkNumber) {
    const existing = await prisma.workOrder.findFirst({
      where: { companyId, workNumber: requestedWorkNumber },
      select: { id: true },
    });
    if (existing) throw new Error("Verknúmerið er þegar í notkun hjá fyrirtækinu.");
  }

  const created = await prisma.workOrder.create({
    data: {
      companyId,
      createdById: createdById && Number.isInteger(createdById) ? createdById : null,
      sourceLanguage,
      workNumber: requestedWorkNumber || null,
      workKey: workKey || null,
      title,
      description: description || null,
      address: address || null,
      priority,
      status: "NEW",
    },
    select: { id: true, workNumber: true },
  });

  // Ný Verk fá alltaf raunverulegt verknúmer. Innra id er öruggur fallback
  // þegar fyrirtækið velur ekki eigið/ytra verknúmer við stofnun.
  if (!created.workNumber) {
    await prisma.workOrder.update({
      where: { id: created.id },
      data: { workNumber: String(created.id) },
    });
  }
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
          <input type="hidden" name="sourceLanguage" value={language} />
          <div className="grid gap-4 md:grid-cols-2">
            <div><label htmlFor="workNumber" className="block font-medium">{t.workNumber}</label><input id="workNumber" name="workNumber" type="text" maxLength={80} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.workNumberPlaceholder} /></div>
            <div><label htmlFor="workKey" className="block font-medium">{t.workKey}</label><input id="workKey" name="workKey" type="text" maxLength={120} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.workKeyPlaceholder} /></div>
          </div>
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
