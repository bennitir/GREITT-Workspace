import Link from "next/link";

import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workKeyText } from "@/lib/i18n/work-keys";
import { prisma } from "@/lib/prisma";
import { workKeyDisplay } from "@/lib/work10/work-keys";
import { createWorkKey, importWorkKeys, setWorkKeyActive, updateWorkKey } from "./actions";

type WorkKeysPageProps = {
  searchParams?: Promise<{
    createError?: string;
    importError?: string;
    imported?: string;
    updated?: string;
    skipped?: string;
    duplicates?: string;
  }>;
};

function sourceText(source: string, t: ReturnType<typeof workKeyText>) {
  if (source === "IMPORTED") return t.imported;
  if (source === "MIGRATED") return t.migrated;
  return t.manual;
}

export default async function WorkKeysPage({ searchParams }: WorkKeysPageProps) {
  const params = await searchParams;
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();
  const [access, settings, keys] = await Promise.all([
    getCompanyAccess(companyId),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
    prisma.workKey.findMany({
      where: { companyId },
      include: {
        _count: { select: { workOrders: true, diaryEntries: true } },
        startRules: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
  ]);
  const t = workKeyText(settings?.interfaceLanguage ?? "is");
  const importSummary = params?.imported !== undefined || params?.updated !== undefined;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title={t.title} description={t.subtitle} />
      <div className="flex flex-wrap gap-2">
        <Link href="/verk" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">← {t.back}</Link>
        <Link href="/verk/nytt" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">＋ {t.works}</Link>
      </div>

      {params?.createError === "duplicate" ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{t.errors.duplicate}</div>
      ) : null}
      {params?.importError ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950">{params.importError}</div>
      ) : null}
      {importSummary ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="font-bold">{t.importResult}:</span>{" "}
          {params?.imported ?? "0"} {t.created} · {params?.updated ?? "0"} {t.updated} · {params?.skipped ?? "0"} {t.skipped}
          {Number(params?.duplicates ?? 0) > 0 ? ` · ${params?.duplicates} ${t.duplicateRows}` : ""}
        </div>
      ) : null}

      {access.canWrite ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <h2 className="text-lg font-bold text-slate-950">{t.newKey}</h2>
            <form action={createWorkKey} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.code}</span>
                <input name="code" required maxLength={120} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.name}</span>
                <input name="name" required maxLength={200} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
                <span>{t.description}</span>
                <textarea name="description" rows={3} maxLength={2000} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
                <span>{t.externalId}</span>
                <input name="externalId" maxLength={160} className="rounded-lg border px-3 py-2" />
              </label>
              <fieldset className="md:col-span-2 rounded-xl border bg-slate-50 p-3">
                <legend className="px-1 text-sm font-bold text-slate-800">{t.startQuestionsTitle}</legend>
                <p className="mb-3 text-xs leading-5 text-slate-500">{t.startQuestionsHelp}</p>
                <div className="grid gap-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startGpsProgress" value="true" className="mt-1 h-4 w-4" /><span><strong>{t.startGpsProgress}</strong><span className="block text-xs font-normal text-slate-500">{t.startGpsProgressHelp}</span></span></label>
                  <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startChainCount" value="true" className="mt-1 h-4 w-4" /><span><strong>{t.startChainCount}</strong><span className="block text-xs font-normal text-slate-500">{t.startChainCountHelp}</span></span></label>
                  <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startPhoto" value="true" className="mt-1 h-4 w-4" /><span><strong>{t.startPhoto}</strong><span className="block text-xs font-normal text-slate-500">{t.startPhotoHelp}</span></span></label>
                </div>
              </fieldset>
              <div className="md:col-span-2">
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">{t.create}</button>
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-slate-950">{t.importTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t.importHelp}</p>
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-900">{t.importSafety}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{t.importColumns}</p>
            <form action={importWorkKeys} className="mt-4 grid gap-3">
              <input name="file" type="file" accept=".csv,.xlsx,.xls" required className="block w-full rounded-lg border bg-white p-3 text-sm" />
              <button type="submit" className="w-fit rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800">{t.importButton}</button>
            </form>
          </Card>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{t.keys}</h2>
            <p className="mt-1 text-xs text-slate-500">{t.legacyHelp}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{keys.length}</span>
        </div>

        {keys.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-slate-500">{t.noKeys}</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {keys.map((key) => (
              <article key={key.id} className={`rounded-2xl border p-4 ${key.isActive ? "bg-white" : "bg-slate-50 opacity-75"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-950">{workKeyDisplay(key.code, key.name)}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${key.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{key.isActive ? t.active : t.inactive}</span>
                    </div>
                    {key.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{key.description}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {t.source}: {sourceText(key.source, t)}{key.externalId ? ` · ${t.externalId}: ${key.externalId}` : ""} · {t.usage}: {key._count.workOrders} {t.works}, {key._count.diaryEntries} {t.diary}
                    </p>
                    {key.startRules.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {key.startRules.map((rule) => (
                          <span key={rule.id} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                            {rule.kind === "GPS_PROGRESS" ? t.startGpsProgress : rule.kind === "CHAIN_COUNT" ? t.startChainCount : rule.kind === "START_PHOTO" ? t.startPhoto : rule.kind}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {access.canWrite ? (
                    <form action={setWorkKeyActive}>
                      <input type="hidden" name="workKeyId" value={key.id} />
                      <input type="hidden" name="isActive" value={key.isActive ? "false" : "true"} />
                      <button type="submit" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{key.isActive ? t.deactivate : t.activate}</button>
                    </form>
                  ) : null}
                </div>

                {access.canWrite ? (
                  <details className="mt-3 rounded-xl border bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t.save}</summary>
                    <form action={updateWorkKey} className="mt-3 grid gap-3 md:grid-cols-2">
                      <input type="hidden" name="workKeyId" value={key.id} />
                      <label className="grid gap-1 text-sm font-semibold text-slate-700"><span>{t.code}</span><input name="code" defaultValue={key.code} required maxLength={120} className="rounded-lg border bg-white px-3 py-2" /></label>
                      <label className="grid gap-1 text-sm font-semibold text-slate-700"><span>{t.name}</span><input name="name" defaultValue={key.name} required maxLength={200} className="rounded-lg border bg-white px-3 py-2" /></label>
                      <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2"><span>{t.description}</span><textarea name="description" defaultValue={key.description ?? ""} rows={2} maxLength={2000} className="rounded-lg border bg-white px-3 py-2" /></label>
                      <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2"><span>{t.externalId}</span><input name="externalId" defaultValue={key.externalId ?? ""} maxLength={160} className="rounded-lg border bg-white px-3 py-2" /></label>
                      <fieldset className="md:col-span-2 rounded-xl border bg-white p-3">
                        <legend className="px-1 text-sm font-bold text-slate-800">{t.startQuestionsTitle}</legend>
                        <p className="mb-3 text-xs leading-5 text-slate-500">{t.startQuestionsHelp}</p>
                        <div className="grid gap-3">
                          <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startGpsProgress" value="true" defaultChecked={key.startRules.some((rule) => rule.kind === "GPS_PROGRESS")} className="mt-1 h-4 w-4" /><span><strong>{t.startGpsProgress}</strong><span className="block text-xs font-normal text-slate-500">{t.startGpsProgressHelp}</span></span></label>
                          <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startChainCount" value="true" defaultChecked={key.startRules.some((rule) => rule.kind === "CHAIN_COUNT")} className="mt-1 h-4 w-4" /><span><strong>{t.startChainCount}</strong><span className="block text-xs font-normal text-slate-500">{t.startChainCountHelp}</span></span></label>
                          <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="startPhoto" value="true" defaultChecked={key.startRules.some((rule) => rule.kind === "START_PHOTO")} className="mt-1 h-4 w-4" /><span><strong>{t.startPhoto}</strong><span className="block text-xs font-normal text-slate-500">{t.startPhotoHelp}</span></span></label>
                        </div>
                      </fieldset>
                      <div className="md:col-span-2"><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">{t.save}</button></div>
                    </form>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
