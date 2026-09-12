import Link from "next/link";
import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";
import { saveMySettings } from "@/app/actions/userSettingsActions";
import { EXPLANATION_LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS, uiOptions, uiText } from "@/lib/i18n/ui";

export default async function MobileSettingsPage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile/stillingar");
  const params = searchParams ? await searchParams : {};
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const t = uiText(settings?.interfaceLanguage);
  const o = uiOptions(settings?.interfaceLanguage);
  const selectedUiLanguage = UI_LANGUAGE_OPTIONS.some(([value]) => value === settings?.interfaceLanguage) ? settings!.interfaceLanguage : "is";

  return <main className="min-h-screen bg-slate-100"><div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-10 pt-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold tracking-wide text-slate-700">GLÖGGT MOBILE</p><h1 className="mt-1 text-2xl font-bold">{t.settingsTitle}</h1></div><Link href="/mobile" className="rounded-xl border px-3 py-2 text-sm font-semibold">← {t.backMobile}</Link></div>
    <p className="mt-3 text-sm text-slate-600">{t.settingsHelp}</p>
    {params.saved === "1" && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-800">{t.saved}</div>}
    <form action={saveMySettings} className="mt-5 space-y-5">
      <input type="hidden" name="returnTo" value="/mobile/stillingar" />
      <label className="block space-y-2"><span className="font-semibold">{t.interfaceLanguage}</span><select name="interfaceLanguage" defaultValue={selectedUiLanguage} className="w-full rounded-xl border p-3">{UI_LANGUAGE_OPTIONS.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
      <label className="block space-y-2"><span className="font-semibold">{t.aiLanguage}</span><select name="aiExplanationLanguage" defaultValue={settings?.aiExplanationLanguage ?? "is"} className="w-full rounded-xl border p-3">{EXPLANATION_LANGUAGE_OPTIONS.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
      <label className="block space-y-2"><span className="font-semibold">{t.aiSupport}</span><select name="aiSupportLevel" defaultValue={settings?.aiSupportLevel ?? "STANDARD"} className="w-full rounded-xl border p-3"><option value="OFF">{o.ai.OFF}</option><option value="LOW">{o.ai.LOW}</option><option value="STANDARD">{o.ai.STANDARD}</option><option value="HIGH">{o.ai.HIGH}</option></select></label>
      <input type="hidden" name="aiExplanationDetail" value={settings?.aiExplanationDetail ?? "NORMAL"} />
      <div className="rounded-2xl border bg-slate-50 p-4"><h2 className="font-bold">{t.timeTracking}</h2><p className="mt-1 text-sm text-slate-600">{t.timeTrackingHelp}</p>
        <label className="mt-4 block space-y-2"><span className="font-semibold">{t.timeMode}</span><select name="timeTrackingMode" defaultValue={settings?.timeTrackingMode ?? "OFF"} className="w-full rounded-xl border bg-white p-3"><option value="OFF">{o.mode.OFF}</option><option value="MANUAL">{o.mode.MANUAL}</option><option value="AUTO">{o.mode.AUTO}</option><option value="AUTO_PROMPT">{o.mode.AUTO_PROMPT}</option></select></label>
        <label className="mt-4 block space-y-2"><span className="font-semibold">{t.idleAfter}</span><select name="timeTrackingIdleMinutes" defaultValue={settings?.timeTrackingIdleMinutes ?? 10} className="w-full rounded-xl border bg-white p-3">{[1,5,10,15,30].map(v => <option key={v} value={v}>{v} {o.minute}</option>)}</select></label>
      </div>
      <input type="hidden" name="autoOpenNextDocument" value={settings?.autoOpenNextDocument ? "on" : ""} />
      <input type="hidden" name="showHelpText" value={settings?.showHelpText ? "on" : ""} />
      <button className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">{t.save}</button>
    </form>
  </div></main>;
}
