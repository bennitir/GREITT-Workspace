import Link from "next/link";

import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workResourceKindText, workResourceStatusText, workResourceText, workResourceTravelModeText } from "@/lib/i18n/work-resources";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { work10FormatCurrencyIsk, work10UnitText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import { WORK10_EQUIPMENT_KINDS, WORK10_RESOURCE_STATUSES, WORK10_RESOURCE_TRAVEL_MODES } from "@/lib/work10/resources";
import { deriveWorkMaintenanceState } from "@/lib/work10/maintenance";
import { workResourceQrDataUrl } from "@/lib/work10/qr";
import { signedWorkResourceMediaUrl } from "@/lib/work10/resource-media";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import {
  addWorkResourceMeterReading,
  completeWorkResourceMaintenance,
  createWorkResource,
  createWorkResourceMaintenanceKey,
  updateWorkResourceDetails,
  updateWorkResourceStatus,
} from "./actions";
import WorkEquipmentUnitFields from "./WorkEquipmentUnitFields";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatReadingDate(value: Date, language: string) {
  if (language === "is") {
    const day = String(value.getUTCDate()).padStart(2, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${day}.${month}.${value.getUTCFullYear()}`;
  }

  return value.toLocaleDateString(
    language === "pl" ? "pl-PL" : language === "sr" ? "sr-RS" : "en-GB",
  );
}

type WorkResourcesPageProps = {
  searchParams?: Promise<{ createError?: string }>;
};

export default async function WorkResourcesPage({ searchParams }: WorkResourcesPageProps) {
  const params = await searchParams;
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();
  const [access, settings, resources] = await Promise.all([
    getCompanyAccess(companyId),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
    prisma.workResource.findMany({
      where: { companyId, kind: { in: [...WORK10_EQUIPMENT_KINDS] } },
      include: {
        meterReadings: { orderBy: { readingAt: "desc" }, take: 5 },
        maintenanceKeys: {
          where: { isActive: true },
          include: { logs: { orderBy: { completedAt: "desc" }, take: 3 } },
          orderBy: [{ name: "asc" }],
        },
        assignments: { where: { removedAt: null }, select: { id: true } },
      },
      orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }],
    }),
  ]);

  const language = settings?.interfaceLanguage ?? "is";
  const t = workResourceText(language);
  const ops = workResourceOperationsText(language);
  const createError = params?.createError === "duplicateCode" ? t.errors.duplicateCode : null;
  const photoPairs = await Promise.all(
    resources.flatMap((resource) =>
      resource.meterReadings
        .filter((reading) => Boolean(reading.photoPath))
        .map(async (reading) => [reading.id, await signedWorkResourceMediaUrl(reading.photoPath)] as const),
    ),
  );
  const meterPhotoUrlById = new Map(photoPairs.filter((pair): pair is readonly [number, string] => Boolean(pair[1])));

  const maintenanceStateText = (state: ReturnType<typeof deriveWorkMaintenanceState>) => {
    if (state === "DUE") return ops.maintenanceDue;
    if (state === "SOON") return ops.maintenanceSoon;
    if (state === "OK") return ops.maintenanceOk;
    return ops.maintenanceUnscheduled;
  };

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title={t.title} description={t.subtitle} />
      <div>
        <Link href="/verk" className="text-sm font-semibold text-blue-700 hover:underline">← {t.back}</Link>
      </div>

      {createError ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {createError}
        </div>
      ) : null}

      {access.canWrite && (
        <Card>
          <h2 className="text-lg font-bold text-slate-950">{t.newResource}</h2>
          <form action={createWorkResource} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.kind}</span>
              <select name="kind" defaultValue="MACHINE" className="rounded-lg border bg-white px-3 py-2">
                {WORK10_EQUIPMENT_KINDS.map((kind) => <option key={kind} value={kind}>{workResourceKindText(kind, language)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.code}</span>
              <input name="code" required maxLength={60} className="rounded-lg border px-3 py-2" placeholder={t.codePlaceholder} />
              <span className="text-xs font-normal leading-5 text-slate-500">{t.codeHelp}</span>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              <span>{t.name}</span>
              <input name="name" required maxLength={160} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">
              <span>{t.description}</span>
              <textarea name="description" rows={2} maxLength={1000} className="rounded-lg border px-3 py-2" />
            </label>
            <WorkEquipmentUnitFields
              language={language}
              baseUnitLabel={t.baseUnit}
              customUnitLabel={t.customUnit}
              defaultUnitLabel={t.resourceDefaultUnit}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.costRate}</span>
              <input name="costRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.saleRate}</span>
              <input name="saleRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.meterUnit}</span>
              <input name="meterUnit" maxLength={40} className="rounded-lg border px-3 py-2" placeholder="HOUR / KM" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.travelMode}</span>
              <select name="travelMode" defaultValue="" className="rounded-lg border bg-white px-3 py-2">
                <option value="">{t.travelModeAuto}</option>
                {WORK10_RESOURCE_TRAVEL_MODES.map((mode) => <option key={mode} value={mode}>{workResourceTravelModeText(mode, language)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.planningTravelSpeed}</span>
              <input name="planningTravelSpeedKmh" inputMode="decimal" className="rounded-lg border px-3 py-2" placeholder="25" />
            </label>
            <p className="text-xs leading-5 text-slate-500 md:col-span-2 xl:col-span-4">{t.planningTravelSpeedHelp}</p>
            <div className="flex items-end">
              <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700" type="submit">{t.create}</button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950">{t.resources}</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{resources.length}</span>
        </div>
        {resources.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t.noResources}</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {resources.map((resource) => {
              const latestReading = resource.meterReadings[0] ?? null;
              return (
                <article key={resource.id} className={`rounded-2xl border p-4 ${resource.isActive ? "bg-white" : "bg-slate-50 opacity-75"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{workResourceKindText(resource.kind, language)}</span>
                        <span className="text-xs font-semibold text-slate-400">{resource.code}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{resource.name}</h3>
                      {resource.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{resource.description}</p> : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{workResourceStatusText(resource.status, language)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.baseUnit}</div><div className="mt-1 font-semibold text-slate-900">{resource.baseUnit ? work10UnitText(resource.baseUnit, resource.customUnit, language) : "—"}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.activeAssignments}</div><div className="mt-1 font-semibold text-slate-900">{resource.assignments.length}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.costRate}</div><div className="mt-1 font-semibold text-slate-900">{resource.costRateIsk !== null ? work10FormatCurrencyIsk(resource.costRateIsk, language) : "—"}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.saleRate}</div><div className="mt-1 font-semibold text-slate-900">{resource.saleRateIsk !== null ? work10FormatCurrencyIsk(resource.saleRateIsk, language) : "—"}</div></div>
                  </div>
                  <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    <div>{t.travelMode}</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {workResourceTravelModeText(resource.travelMode, language)}
                      {resource.planningTravelSpeedKmh !== null ? ` · ${resource.planningTravelSpeedKmh} ${t.speedUnit}` : ""}
                    </div>
                  </div>

                  {access.canWrite && (
                    <details className="mt-3 rounded-xl border bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t.editDetails}</summary>
                      <form action={updateWorkResourceDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.code}</span>
                          <input name="code" required maxLength={60} defaultValue={resource.code} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                          <span className="font-normal leading-5 text-slate-500">{t.codeHelp}</span>
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.name}</span>
                          <input name="name" required maxLength={160} defaultValue={resource.name} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.description}</span>
                          <textarea name="description" rows={2} maxLength={1000} defaultValue={resource.description ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <WorkEquipmentUnitFields
                          language={language}
                          baseUnitLabel={t.baseUnit}
                          customUnitLabel={t.customUnit}
                          initialUnit={resource.baseUnit ?? (resource.kind === "VEHICLE" ? "KM" : resource.kind === "MACHINE" ? "HOUR" : "PCS")}
                          initialCustomUnit={resource.customUnit}
                          compact
                        />
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.costRate}</span>
                          <input name="costRateIsk" inputMode="decimal" defaultValue={resource.costRateIsk ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.saleRate}</span>
                          <input name="saleRateIsk" inputMode="decimal" defaultValue={resource.saleRateIsk ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.meterUnit}</span>
                          <input name="meterUnit" maxLength={40} defaultValue={resource.meterUnit ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.travelMode}</span>
                          <select name="travelMode" defaultValue={resource.travelMode} className="rounded-lg border bg-white px-3 py-2 text-sm">
                            {WORK10_RESOURCE_TRAVEL_MODES.map((mode) => <option key={mode} value={mode}>{workResourceTravelModeText(mode, language)}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.planningTravelSpeed}</span>
                          <input name="planningTravelSpeedKmh" inputMode="decimal" defaultValue={resource.planningTravelSpeedKmh ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t.planningTravelSpeedHelp}</p>
                        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t.historicalCostHelp}</p>
                        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:col-span-2">{t.saveDetails}</button>
                      </form>
                    </details>
                  )}

                  {access.canWrite && (
                    <form action={updateWorkResourceStatus} className="mt-3 flex gap-2">
                      <input type="hidden" name="resourceId" value={resource.id} />
                      <select name="status" defaultValue={resource.status} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                        {WORK10_RESOURCE_STATUSES.map((status) => <option key={status} value={status}>{workResourceStatusText(status, language)}</option>)}
                      </select>
                      <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.updateStatus}</button>
                    </form>
                  )}

                  {["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind) && resource.qrToken ? (
                    <details className="mt-3 rounded-xl border bg-white p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">{ops.qrTitle}</summary>
                      <div className="mt-3 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
                        {workResourceQrDataUrl(resource.qrToken) ? (
                          <img src={workResourceQrDataUrl(resource.qrToken)!} alt={ops.qrTitle} className="aspect-square w-40 rounded-lg border bg-white p-2" />
                        ) : null}
                        <div>
                          <p className="text-sm leading-6 text-slate-600">{ops.qrHelp}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-500">{ops.qrToken}</p>
                          <code className="mt-1 block break-all rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">{resource.qrToken}</code>
                          <Link href={`/verk/tilfong/${resource.id}/qr`} className="mt-3 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{ops.printQr}</Link>
                        </div>
                      </div>
                    </details>
                  ) : null}

                  {["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind) && (
                    <div className="mt-4 border-t pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-slate-900">{t.meterReading}</h4>
                        {resource.qrToken ? <span className="text-xs font-semibold text-emerald-700">{t.qrReady}</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{t.latestMeter}: <strong>{latestReading ? `${latestReading.value} ${latestReading.unit}` : resource.meterValue !== null ? `${resource.meterValue} ${resource.meterUnit ?? ""}` : "—"}</strong></p>
                      {access.canWrite && resource.isActive && (
                        <form action={addWorkResourceMeterReading} className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{t.readingDate}</span><input type="date" name="readingAt" defaultValue={todayIso()} required className="rounded-lg border px-3 py-2 text-sm" /></label>
                          <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{t.readingValue}</span><input name="value" inputMode="decimal" required className="rounded-lg border px-3 py-2 text-sm" /></label>
                          <input name="note" maxLength={500} placeholder={t.readingNote} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
                          <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                            <span>{ops.meterPhoto}</span>
                            <input type="file" name="photo" accept="image/*" capture="environment" className="rounded-lg border bg-white px-3 py-2 text-sm" />
                            <span className="font-normal text-slate-500">{ops.meterPhotoHelp}</span>
                          </label>
                          <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50 sm:col-span-2">{t.saveReading}</button>
                        </form>
                      )}

                      {resource.meterReadings.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">{ops.latestPhotos}</h5>
                          {resource.meterReadings.map((reading) => {
                            const photoUrl = meterPhotoUrlById.get(reading.id);
                            return (
                              <div key={reading.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                                {photoUrl ? <a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt={ops.meterPhoto} className="h-14 w-14 rounded-md object-cover" /></a> : null}
                                <div><strong className="text-slate-900">{reading.value} {reading.unit}</strong><div>{formatReadingDate(reading.readingAt, language)}</div>{reading.note ? <div className="mt-1">{reading.note}</div> : null}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-5 border-t pt-4">
                        <h4 className="text-sm font-bold text-slate-900">{ops.maintenanceKeys}</h4>
                        {resource.maintenanceKeys.length === 0 ? <p className="mt-2 text-sm text-slate-500">{ops.noMaintenanceKeys}</p> : (
                          <div className="mt-3 space-y-3">
                            {resource.maintenanceKeys.map((key) => {
                              const state = deriveWorkMaintenanceState(key, resource.meterValue);
                              const stateClass = state === "DUE" ? "bg-rose-50 text-rose-800" : state === "SOON" ? "bg-amber-50 text-amber-800" : state === "OK" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
                              return (
                                <div key={key.id} className="rounded-xl border bg-white p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div><div className="text-xs font-semibold text-slate-400">{key.code}</div><div className="font-bold text-slate-900">{key.name}</div>{key.description ? <p className="mt-1 text-xs leading-5 text-slate-600">{key.description}</p> : null}</div>
                                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${stateClass}`}>{maintenanceStateText(state)}</span>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                    <div className="rounded-lg bg-slate-50 p-2"><div>{ops.nextDue}</div><strong className="mt-1 block text-slate-900">{key.nextDueMeterValue !== null ? `${key.nextDueMeterValue} ${resource.meterUnit ?? resource.baseUnit ?? ""}` : "—"}</strong></div>
                                    <div className="rounded-lg bg-slate-50 p-2"><div>{ops.lastDone}</div><strong className="mt-1 block text-slate-900">{key.lastCompletedMeterValue !== null ? `${key.lastCompletedMeterValue} ${resource.meterUnit ?? resource.baseUnit ?? ""}` : ops.neverDone}</strong></div>
                                  </div>
                                  {access.canWrite ? (
                                    <form action={completeWorkResourceMaintenance} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                                      <input type="hidden" name="maintenanceKeyId" value={key.id} />
                                      <input name="note" maxLength={1000} placeholder={ops.maintenanceNote} className="rounded-lg border px-3 py-2 text-sm" />
                                      <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{ops.completeMaintenance}</button>
                                    </form>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {access.canWrite && resource.isActive ? (
                          <details className="mt-3 rounded-xl bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">{ops.addMaintenanceKey}</summary>
                            <form action={createWorkResourceMaintenanceKey} className="mt-3 grid gap-2 sm:grid-cols-2">
                              <input type="hidden" name="resourceId" value={resource.id} />
                              <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{ops.maintenanceCode}</span><input name="code" required maxLength={60} placeholder="OLIA-250" className="rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{ops.maintenanceName}</span><input name="name" required maxLength={160} className="rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{ops.maintenanceInterval}</span><input name="intervalValue" inputMode="decimal" className="rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                              <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{ops.maintenanceWarning}</span><input name="warningLeadValue" inputMode="decimal" className="rounded-lg border bg-white px-3 py-2 text-sm" /></label>
                              <textarea name="description" rows={2} maxLength={1000} placeholder={ops.maintenanceDescription} className="rounded-lg border bg-white px-3 py-2 text-sm sm:col-span-2" />
                              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{ops.maintenanceIntervalHelp}</p>
                              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white sm:col-span-2">{ops.createMaintenanceKey}</button>
                            </form>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
