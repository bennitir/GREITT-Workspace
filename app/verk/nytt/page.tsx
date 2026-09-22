import { getEffectiveUser, requireCompanyWriteAccess } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import IcelandicTimeInput from "@/components/ui/IcelandicTimeInput";
import { workText } from "@/lib/i18n/work";
import { workKeyText } from "@/lib/i18n/work-keys";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { parseWork10CompletionDeadline, parseWork10PlannedDate, parseWork10PlannedStartParts } from "@/lib/work10/scheduling";

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
  const requestedWorkKeyId = Number(formData.get("workKeyId") ?? 0);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const priority = String(formData.get("priority") ?? "NORMAL");
  const requiredPeopleRaw = Number(formData.get("requiredPeople") ?? 1);
  const estimatedHours = Number(formData.get("estimatedHours") ?? 0);
  const estimatedMinutePart = Number(formData.get("estimatedMinutePart") ?? 0);
  const plannedDate = parseWork10PlannedDate(String(formData.get("plannedDate") ?? ""));
  const plannedStartMinutes = parseWork10PlannedStartParts(formData.get("plannedStartHour")?.toString(), formData.get("plannedStartMinute")?.toString());
  const completionDeadline = parseWork10CompletionDeadline(
    String(formData.get("completionDeadlineDate") ?? ""),
    formData.get("completionDeadlineHour")?.toString(),
    formData.get("completionDeadlineMinute")?.toString(),
  );
  const allowAfterWorkdayEnd = formData.get("allowAfterWorkdayEnd") === "on";
  const workdayEndExceptionReason = String(formData.get("workdayEndExceptionReason") ?? "").trim();
  if (plannedStartMinutes !== null && !plannedDate) {
    throw new Error("Veldu áætlaðan dag áður en upphafstími er skráður.");
  }
  if (allowAfterWorkdayEnd && !workdayEndExceptionReason) {
    throw new Error("Skrá þarf ástæðu ef heimilt er að fara fram yfir dagslok.");
  }
  const photoRequirement = String(formData.get("photoRequirement") ?? "NONE");
  const allowedPhotoRequirements = new Set(["NONE", "START", "PROGRESS", "PART_COMPLETE", "WORK_COMPLETE"]);
  if (!Number.isInteger(requiredPeopleRaw) || requiredPeopleRaw < 1 || requiredPeopleRaw > 100) {
    throw new Error("Fjöldi starfsmanna þarf að vera á bilinu 1–100.");
  }
  if (
    !Number.isInteger(estimatedHours) ||
    !Number.isInteger(estimatedMinutePart) ||
    estimatedHours < 0 ||
    estimatedHours > 999 ||
    estimatedMinutePart < 0 ||
    estimatedMinutePart > 59
  ) {
    throw new Error("Áætlaður tími er ógildur.");
  }
  if (!allowedPhotoRequirements.has(photoRequirement)) {
    throw new Error("Ógild myndakrafa.");
  }
  const estimatedMinutes = estimatedHours * 60 + estimatedMinutePart;
  const sourceLanguage = normalizeUiLanguage(
    String(formData.get("sourceLanguage") ?? "is"),
  );
  const workKeyT = workKeyText(sourceLanguage);
  if (!title) throw new Error("Heiti verks vantar.");
  const createdById = activeUserId ? Number(activeUserId) : null;

  if (requestedWorkNumber) {
    const existing = await prisma.workOrder.findFirst({
      where: { companyId, workNumber: requestedWorkNumber },
      select: { id: true },
    });
    if (existing) throw new Error("Verknúmerið er þegar í notkun hjá fyrirtækinu.");
  }

  const selectedWorkKey = requestedWorkKeyId
    ? await prisma.workKey.findFirst({
        where: { id: requestedWorkKeyId, companyId, isActive: true },
        select: { id: true, code: true },
      })
    : null;
  if (requestedWorkKeyId && !selectedWorkKey) {
    throw new Error(workKeyT.errors.notFound);
  }

  const created = await prisma.workOrder.create({
    data: {
      companyId,
      createdById: createdById && Number.isInteger(createdById) ? createdById : null,
      sourceLanguage,
      workNumber: requestedWorkNumber || null,
      workKey: selectedWorkKey?.code ?? null,
      workKeyId: selectedWorkKey?.id ?? null,
      title,
      description: description || null,
      address: address || null,
      priority,
      requiredPeople: requiredPeopleRaw,
      estimatedMinutes: estimatedMinutes > 0 ? estimatedMinutes : null,
      plannedDate,
      plannedStartMinutes,
      completionDeadlineDate: completionDeadline.date,
      completionDeadlineMinutes: completionDeadline.minutes,
      allowAfterWorkdayEnd,
      workdayEndExceptionReason: allowAfterWorkdayEnd ? workdayEndExceptionReason : null,
      photoRequirement,
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
  const [userSettings, workKeys] = await Promise.all([
    effectiveUser ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } }) : Promise.resolve(null),
    prisma.workKey.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }],
    }),
  ]);
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = workText(language);
  const workKeyT = workKeyText(language);

  return (
    <main className="space-y-6 p-8">
      <PageHeader title={t.newTitle} description={t.newDescription} />
      <Card>
        <form action={createWorkOrder} className="space-y-6">
          <input type="hidden" name="sourceLanguage" value={language} />
          <div className="grid gap-4 md:grid-cols-2">
            <div><label htmlFor="workNumber" className="block font-medium">{t.workNumber}</label><input id="workNumber" name="workNumber" type="text" maxLength={80} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.workNumberPlaceholder} /></div>
            <div>
              <label htmlFor="workKeyId" className="block font-medium">{t.workKey}</label>
              <select id="workKeyId" name="workKeyId" defaultValue="" className="mt-2 w-full rounded-lg border bg-white px-4 py-3">
                <option value="">{workKeyT.selectNone}</option>
                {workKeys.map((key) => <option key={key.id} value={key.id}>{key.code}{key.name !== key.code ? ` · ${key.name}` : ""}</option>)}
              </select>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{workKeyT.selectHelp}</span>
                <a href="/verk/lyklar" className="font-semibold text-blue-700 hover:underline">{workKeyT.manageKeys}</a>
              </div>
            </div>
          </div>
          <div><label htmlFor="title" className="block font-medium">{t.workTitle}</label><input id="title" name="title" type="text" required className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.workTitlePlaceholder} /></div>
          <div><label htmlFor="address" className="block font-medium">{t.address}</label><input id="address" name="address" type="text" className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.addressPlaceholder} /></div>
          <div><label htmlFor="description" className="block font-medium">{t.description}</label><textarea id="description" name="description" rows={5} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder={t.descriptionPlaceholder} /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><label htmlFor="requiredPeople" className="block font-medium">{t.requiredPeople}</label><input id="requiredPeople" name="requiredPeople" type="number" min={1} max={100} defaultValue={1} required className="mt-2 w-full rounded-lg border px-4 py-3" /><p className="mt-1 text-xs text-slate-500">{t.requiredPeopleHelp}</p></div>
            <div>
              <label className="block font-medium">{t.estimatedTime}</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">{t.estimatedHours}<input name="estimatedHours" type="number" min={0} max={999} defaultValue={0} className="mt-1 w-full rounded-lg border px-4 py-3 text-base text-slate-900" /></label>
                <label className="text-xs text-slate-500">{t.estimatedMinutes}<input name="estimatedMinutePart" type="number" min={0} max={59} defaultValue={0} className="mt-1 w-full rounded-lg border px-4 py-3 text-base text-slate-900" /></label>
              </div>
            </div>
            <div>
              <IcelandicDateInput
                name="plannedDate"
                label={t.plannedDate}
                submitFormat="iso"
                calendarButtonLabel={t.plannedDate}
                labelClassName="block font-medium"
                inputClassName="min-w-0 flex-1 rounded-lg border px-4 py-3 text-base text-slate-900"
                buttonClassName="rounded-lg border px-4 py-3 hover:bg-slate-50"
              />
              <p className="mt-1 text-xs text-slate-500">{t.plannedDateHelp}</p>
            </div>
            <fieldset>
              <legend className="block font-medium">{t.plannedStartTime}</legend>
              <IcelandicTimeInput
                hourName="plannedStartHour"
                minuteName="plannedStartMinute"
                pickerLabel={t.plannedStartTime}
                hourLabel={t.estimatedHours}
                minuteLabel={t.estimatedMinutes}
                inputClassName="w-full rounded-l-lg border border-r-0 px-4 py-3 text-base text-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500">{t.plannedStartTimeHelp}</p>
            </fieldset>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <IcelandicDateInput
                name="completionDeadlineDate"
                label={t.completionDeadlineDate}
                submitFormat="iso"
                calendarButtonLabel={t.completionDeadlineDate}
                labelClassName="block font-medium"
                inputClassName="min-w-0 flex-1 rounded-lg border bg-white px-4 py-3 text-base text-slate-900"
                buttonClassName="rounded-lg border bg-white px-4 py-3 hover:bg-slate-50"
              />
              <fieldset>
                <legend className="block font-medium">{t.completionDeadlineTime}</legend>
                <IcelandicTimeInput
                  hourName="completionDeadlineHour"
                  minuteName="completionDeadlineMinute"
                  pickerLabel={t.completionDeadlineTime}
                  hourLabel={t.estimatedHours}
                  minuteLabel={t.estimatedMinutes}
                  inputClassName="w-full rounded-l-lg border border-r-0 bg-white px-4 py-3 text-base text-slate-900"
                />
              </fieldset>
            </div>
            <p className="mt-2 text-xs text-slate-600">{t.completionDeadlineHelp}</p>
            <label className="mt-4 flex items-start gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" name="allowAfterWorkdayEnd" className="mt-1" />
              <span>{t.allowAfterWorkdayEnd}</span>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              {t.workdayEndExceptionReason}
              <input name="workdayEndExceptionReason" type="text" maxLength={500} className="mt-1 w-full rounded-lg border bg-white px-4 py-3 text-base text-slate-900" placeholder={t.workdayEndExceptionReasonPlaceholder} />
            </label>
            <p className="mt-1 text-xs text-slate-600">{t.allowAfterWorkdayEndHelp}</p>
          </div>
          <div><label htmlFor="photoRequirement" className="block font-medium">{t.photoRequirement}</label><select id="photoRequirement" name="photoRequirement" defaultValue="NONE" className="mt-2 w-full rounded-lg border px-4 py-3"><option value="NONE">{t.photoNone}</option><option value="START">{t.photoStart}</option><option value="PROGRESS">{t.photoProgress}</option><option value="PART_COMPLETE">{t.photoPartComplete}</option><option value="WORK_COMPLETE">{t.photoWorkComplete}</option></select><p className="mt-1 text-xs text-slate-500">{t.photoRequirementHelp}</p></div>
          <div><label htmlFor="priority" className="block font-medium">{t.priority}</label><select id="priority" name="priority" defaultValue="NORMAL" className="mt-2 w-full rounded-lg border px-4 py-3"><option value="LOW">{t.priorityLow}</option><option value="NORMAL">{t.priorityNormal}</option><option value="HIGH">{t.priorityHigh}</option><option value="URGENT">{t.priorityUrgent}</option></select></div>
          <div className="flex gap-3"><Button type="submit">{t.saveWork}</Button><a href="/verk" className="rounded-lg border px-4 py-2 font-medium">{t.cancel}</a></div>
        </form>
      </Card>
    </main>
  );
}
