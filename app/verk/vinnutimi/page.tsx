import Link from "next/link";
import { redirect } from "next/navigation";

import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workTimeText } from "@/lib/i18n/work-time";
import { prisma } from "@/lib/prisma";
import { createLaborAgreementProfile, saveEmployeeWorkdayProfiles, saveWorkplaceBreak, saveWorkplaceProfile } from "./actions";

function clock(minutes: number) {
  const normalized = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export default async function WorkTimeSettingsPage() {
  const companyId = await requireCompanyModule("verk");
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=%2Fverk%2Fvinnutimi");

  const [access, settings, workplaces, agreements, employees] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } }),
    prisma.workplaceScheduleProfile.findMany({
      where: { companyId, isActive: true },
      include: { breaks: { orderBy: { sequence: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.laborAgreementProfile.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, fullName: true, jobTitle: true, workplaceScheduleProfileId: true, laborAgreementProfileId: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const mayManage = access.role === "ADMIN" || access.role === "OWNER" || access.role === "MANAGER" || access.canManageCompanySettings;
  if (!mayManage) redirect("/verk");
  const t = workTimeText(settings?.interfaceLanguage ?? "is");

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header>
        <Link href="/verk" className="text-sm font-semibold text-blue-700 hover:underline">← {t.back}</Link>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">{t.title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t.subtitle}</p>
      </header>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t.workplaceTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{t.workplaceHelp}</p>

        <div className="mt-5 space-y-5">
          {workplaces.map((profile) => (
            <div key={profile.id} className="rounded-2xl border bg-slate-50 p-4">
              <form action={saveWorkplaceProfile} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input type="hidden" name="id" value={profile.id} />
                <label className="text-xs font-semibold text-slate-600">{t.name}<input name="name" defaultValue={profile.name} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600 md:col-span-2">{t.address}<input name="address" defaultValue={profile.address ?? ""} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">{t.dayStart}<input name="dayStart" defaultValue={clock(profile.dayStartMinutes)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">{t.standardWorkMinutes}<input name="standardWorkMinutes" type="number" min={1} max={1440} defaultValue={profile.standardWorkMinutes} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="isDefault" type="checkbox" defaultChecked={profile.isDefault} />{t.defaultProfile}</label>
                <div className="md:col-span-2 xl:col-span-4"><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">{t.save}</button></div>
              </form>

              <div className="mt-5 border-t pt-4">
                <h3 className="font-bold text-slate-900">{t.breaks}</h3>
                {profile.breaks.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.noBreaks}</p> : null}
                <div className="mt-3 space-y-3">
                  {profile.breaks.map((rule) => (
                    <form key={rule.id} action={saveWorkplaceBreak} className="grid gap-2 rounded-xl border bg-white p-3 md:grid-cols-4 xl:grid-cols-8">
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="workplaceScheduleProfileId" value={profile.id} />
                      <label className="text-[11px] text-slate-500">{t.code}<input name="code" defaultValue={rule.code} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.label}<input name="label" defaultValue={rule.label} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.targetTime}<input name="targetTime" defaultValue={clock(rule.targetStartMinutes)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.duration}<input name="durationMinutes" type="number" min={1} max={240} defaultValue={rule.durationMinutes} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.flexBefore}<input name="flexibleBeforeMinutes" type="number" min={0} max={240} defaultValue={rule.flexibleBeforeMinutes} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.flexAfter}<input name="flexibleAfterMinutes" type="number" min={0} max={240} defaultValue={rule.flexibleAfterMinutes} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">{t.finishThreshold}<input name="finishNearCompleteThresholdMinutes" type="number" min={0} max={240} defaultValue={rule.finishNearCompleteThresholdMinutes} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                      <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="allowFinishNearCompleteWork" defaultChecked={rule.allowFinishNearCompleteWork} />{t.allowFinishNearComplete}</label><button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">{t.save}</button></div>
                    </form>
                  ))}
                </div>

                <form action={saveWorkplaceBreak} className="mt-3 grid gap-2 rounded-xl border border-dashed bg-white/70 p-3 md:grid-cols-4 xl:grid-cols-8">
                  <input type="hidden" name="workplaceScheduleProfileId" value={profile.id} />
                  <label className="text-[11px] text-slate-500">{t.code}<input name="code" placeholder="MORNING" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.label}<input name="label" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.targetTime}<input name="targetTime" placeholder="09:40" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.duration}<input name="durationMinutes" type="number" min={1} max={240} defaultValue={20} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.flexBefore}<input name="flexibleBeforeMinutes" type="number" min={0} max={240} defaultValue={0} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.flexAfter}<input name="flexibleAfterMinutes" type="number" min={0} max={240} defaultValue={30} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">{t.finishThreshold}<input name="finishNearCompleteThresholdMinutes" type="number" min={0} max={240} defaultValue={15} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" /></label>
                  <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="allowFinishNearCompleteWork" defaultChecked />{t.allowFinishNearComplete}</label><button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">{t.addBreak}</button></div>
                </form>
              </div>
            </div>
          ))}

          <form action={saveWorkplaceProfile} className="grid gap-3 rounded-2xl border border-dashed p-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">{t.name}<input name="name" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">{t.address}<input name="address" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">{t.dayStart}<input name="dayStart" defaultValue="08:00" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-600">{t.standardWorkMinutes}<input name="standardWorkMinutes" type="number" min={1} max={1440} defaultValue={480} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input name="isDefault" type="checkbox" defaultChecked={workplaces.length === 0} />{t.defaultProfile}</label>
            <div className="md:col-span-2 xl:col-span-4"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">{t.addWorkplace}</button></div>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t.agreementTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{t.agreementHelp}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {agreements.map((agreement) => (
            <div key={agreement.id} className="rounded-xl border bg-slate-50 p-4">
              <div className="font-bold text-slate-950">{agreement.name}</div>
              <div className="mt-1 text-xs text-slate-500">{agreement.code ?? "—"} · {t.unverified}</div>
              {agreement.notes ? <p className="mt-2 text-sm text-slate-600">{agreement.notes}</p> : null}
            </div>
          ))}
        </div>
        <form action={createLaborAgreementProfile} className="mt-4 grid gap-3 rounded-xl border border-dashed p-4 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">{t.name}<input name="name" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t.agreementCode}<input name="code" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t.notes}<input name="notes" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <div className="md:col-span-3"><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">{t.addAgreement}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t.employeesTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{t.employeesHelp}</p>
        <div className="mt-4 divide-y rounded-xl border">
          {employees.map((employee) => (
            <form key={employee.id} action={saveEmployeeWorkdayProfiles} className="grid gap-3 p-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
              <input type="hidden" name="employeeId" value={employee.id} />
              <div><div className="font-semibold text-slate-900">{employee.fullName}</div><div className="text-xs text-slate-500">{employee.jobTitle ?? "—"}</div></div>
              <label className="text-xs text-slate-500">{t.workplace}<select name="workplaceScheduleProfileId" defaultValue={employee.workplaceScheduleProfileId ?? ""} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"><option value="">{t.none}</option>{workplaces.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <label className="text-xs text-slate-500">{t.agreement}<select name="laborAgreementProfileId" defaultValue={employee.laborAgreementProfileId ?? ""} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"><option value="">{t.none}</option>{agreements.map((agreement) => <option key={agreement.id} value={agreement.id}>{agreement.name}</option>)}</select></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">{t.save}</button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
