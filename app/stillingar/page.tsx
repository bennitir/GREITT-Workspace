import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { saveMySettings } from "@/app/actions/userSettingsActions";
import { addManualServiceTime } from "@/app/actions/serviceTimeActions";
import { EXPLANATION_LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS, uiOptions, uiText } from "@/lib/i18n/ui";

const categoryValues = [
  ["Skjalavinna", "SKJALAVINNA"], ["Bókhald", "BOKHALD"], ["Launavinnsla", "LAUN"], ["Innheimta", "INNHEIMTA"],
  ["Afstemming", "AFSTEMMING"], ["Símtal", "SIMTAL"], ["Fundur", "FUNDUR"], ["Annað", "ANNAD"],
] as const;

export default async function MySettingsPage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where: { token }, include: { user: true } }) : null;
  if (!session || session.expiresAt < new Date() || !session.user.isActive) redirect("/innskraning?next=%2Fstillingar");
  const settings = await prisma.userSettings.findUnique({ where: { userId: session.user.id } });
  const t = uiText(settings?.interfaceLanguage);
  const o = uiOptions(settings?.interfaceLanguage);
  const selectedUiLanguage = UI_LANGUAGE_OPTIONS.some(([value]) => value === settings?.interfaceLanguage) ? settings!.interfaceLanguage : "is";

  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{t.settingsTitle}</h1><p className="mt-2 text-slate-600">{t.settingsHelp}</p></div>
    {params.saved === "1" ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-800">{t.saved}</div> : null}
    <form action={saveMySettings} className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2"><span className="font-semibold">{t.interfaceLanguage}</span><select name="interfaceLanguage" defaultValue={selectedUiLanguage} className="w-full rounded-lg border p-3">{UI_LANGUAGE_OPTIONS.map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="space-y-2"><span className="font-semibold">{t.aiLanguage}</span><select name="aiExplanationLanguage" defaultValue={settings?.aiExplanationLanguage ?? "is"} className="w-full rounded-lg border p-3">{EXPLANATION_LANGUAGE_OPTIONS.map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label className="space-y-2"><span className="font-semibold">{t.aiSupport}</span><select name="aiSupportLevel" defaultValue={settings?.aiSupportLevel ?? "STANDARD"} className="w-full rounded-lg border p-3"><option value="OFF">{o.ai.OFF}</option><option value="LOW">{o.ai.LOW}</option><option value="STANDARD">{o.ai.STANDARD}</option><option value="HIGH">{o.ai.HIGH}</option></select></label>
        <label className="space-y-2"><span className="font-semibold">{t.aiDetail}</span><select name="aiExplanationDetail" defaultValue={settings?.aiExplanationDetail ?? "NORMAL"} className="w-full rounded-lg border p-3"><option value="SHORT">{o.detail.SHORT}</option><option value="NORMAL">{o.detail.NORMAL}</option><option value="DETAILED">{o.detail.DETAILED}</option></select></label>
      </div>
      <div className="rounded-xl border bg-slate-50 p-4 space-y-4"><div><h2 className="text-lg font-bold">{t.timeTracking}</h2><p className="text-sm text-slate-600">{t.timeTrackingHelp}</p></div><div className="grid gap-4 md:grid-cols-2"><label className="space-y-2"><span className="font-semibold">{t.timeMode}</span><select name="timeTrackingMode" defaultValue={settings?.timeTrackingMode ?? "OFF"} className="w-full rounded-lg border p-3"><option value="OFF">{o.mode.OFF}</option><option value="MANUAL">{o.mode.MANUAL}</option><option value="AUTO">{o.mode.AUTO}</option><option value="AUTO_PROMPT">{o.mode.AUTO_PROMPT}</option></select></label><label className="space-y-2"><span className="font-semibold">{t.idleAfter}</span><select name="timeTrackingIdleMinutes" defaultValue={settings?.timeTrackingIdleMinutes ?? 10} className="w-full rounded-lg border p-3">{[5,10,15,30].map(v => <option key={v} value={v}>{v} {o.minute}</option>)}</select></label></div></div>
      <div className="space-y-3"><label className="flex gap-3"><input type="checkbox" name="autoOpenNextDocument" defaultChecked={settings?.autoOpenNextDocument ?? true}/><span>{t.autoOpenNext}</span></label><label className="flex gap-3"><input type="checkbox" name="showHelpText" defaultChecked={settings?.showHelpText ?? true}/><span>{t.showHelp}</span></label></div>
      <div className="flex gap-3"><button className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white">{t.save}</button><Link href="/stillingar/fyrirtaeki" className="rounded-lg border px-5 py-3 font-semibold">{t.companySettings}</Link></div>
    </form>
    <form action={addManualServiceTime} className="rounded-2xl border bg-white p-6 shadow-sm space-y-4"><div><h2 className="text-xl font-bold">{t.manualTimeTitle}</h2><p className="text-sm text-slate-600">{t.manualTimeHelp}</p></div><div className="grid gap-4 md:grid-cols-3"><select name="category" className="rounded-lg border p-3">{categoryValues.map(([value,key]) => <option key={key} value={value}>{o.categories[key]}</option>)}</select><input name="minutes" type="number" min="1" required placeholder={t.minutesPlaceholder} className="rounded-lg border p-3"/><input name="description" placeholder={t.descriptionPlaceholder} className="rounded-lg border p-3"/></div><button className="rounded-lg border px-5 py-3 font-semibold">{t.recordTime}</button></form>
  </main>;
}
