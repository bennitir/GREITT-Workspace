import Link from "next/link";
import { notFound } from "next/navigation";

import { workResourceKindText, workResourceStatusText } from "@/lib/i18n/work-resources";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { work10FormatQuantity, work10StatusText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import { deriveWorkMaintenanceState } from "@/lib/work10/maintenance";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import { signedWorkResourceMediaUrl } from "@/lib/work10/resource-media";
import {
  completeMobileResourceMaintenance,
  recordScannedResourceMeterReading,
} from "../../actions";

type Props = { params: Promise<{ token: string }> };

function localeFor(language: string) {
  if (language === "is") return "is-IS";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "en-GB";
}

export default async function MobileWorkResourcePage({ params }: Props) {
  const { token: rawToken } = await params;
  const token = String(rawToken ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(token)) notFound();

  const actor = await getMobileWorkActor();
  const ops = workResourceOperationsText(actor.language);

  const resource = await prisma.workResource.findFirst({
    where: {
      companyId: actor.companyId,
      qrToken: token,
      kind: { in: ["MACHINE", "VEHICLE", "TOOL"] },
    },
    include: {
      assignments: {
        where: {
          removedAt: null,
          workPart: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        },
        include: {
          workPart: {
            select: {
              id: true,
              title: true,
              status: true,
              sequence: true,
              workOrder: {
                select: { id: true, title: true, workNumber: true, workKey: true, status: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      meterReadings: { orderBy: { readingAt: "desc" }, take: 8 },
      maintenanceKeys: {
        where: { isActive: true },
        include: { logs: { orderBy: { completedAt: "desc" }, take: 3 } },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!resource) notFound();

  const photoPairs = await Promise.all(
    resource.meterReadings
      .filter((reading) => Boolean(reading.photoPath))
      .map(async (reading) => [reading.id, await signedWorkResourceMediaUrl(reading.photoPath)] as const),
  );
  const photoUrlByReadingId = new Map(photoPairs.filter((pair): pair is readonly [number, string] => Boolean(pair[1])));

  const maintenanceStateText = (state: ReturnType<typeof deriveWorkMaintenanceState>) => {
    if (state === "DUE") return ops.maintenanceDue;
    if (state === "SOON") return ops.maintenanceSoon;
    if (state === "OK") return ops.maintenanceOk;
    return ops.maintenanceUnscheduled;
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <Link href="/mobile/verk" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm">
          ← {ops.scanResource}
        </Link>

        <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-blue-700">{workResourceKindText(resource.kind, actor.language)} · {resource.code}</div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">{resource.name}</h1>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{workResourceStatusText(resource.status, actor.language)}</span>
          </div>
          {resource.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{resource.description}</p> : null}
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
            <span className="text-slate-500">{ops.currentMeter}</span>
            <strong className="ml-2 text-slate-950">{resource.meterValue !== null ? `${work10FormatQuantity(resource.meterValue, actor.language)} ${resource.meterUnit ?? resource.baseUnit ?? ""}` : "—"}</strong>
          </div>
        </header>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{ops.resourceAssignments}</h2>
          {resource.assignments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{ops.noAssignments}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {resource.assignments.map((assignment) => (
                <Link key={assignment.id} href={`/mobile/verk/${assignment.workPart.workOrder.id}`} className="block rounded-xl bg-slate-50 p-3 active:bg-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{assignment.workPart.workOrder.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{assignment.workPart.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assignment.workPart.workOrder.workNumber || `#${assignment.workPart.workOrder.id}`}{assignment.workPart.workOrder.workKey ? ` · ${assignment.workPart.workOrder.workKey}` : ""}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{work10StatusText(assignment.workPart.status, actor.language)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {actor.employee ? (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{ops.currentMeter}</h2>
            <form action={recordScannedResourceMeterReading} className="mt-3 grid gap-3">
              <input type="hidden" name="qrToken" value={token} />
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{ops.currentMeter}</span>
                <input name="value" required inputMode="decimal" className="rounded-xl border bg-white px-4 py-3 text-base" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{ops.meterPhoto}</span>
                <input type="file" name="photo" accept="image/*" capture="environment" className="rounded-xl border bg-white px-3 py-3 text-sm" />
                <span className="text-xs font-normal leading-5 text-slate-500">{ops.meterPhotoHelp}</span>
              </label>
              <input name="note" maxLength={500} placeholder={ops.maintenanceNote} className="rounded-xl border bg-white px-4 py-3 text-sm" />
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">{ops.save}</button>
            </form>
          </section>
        ) : null}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{ops.maintenanceKeys}</h2>
          {resource.maintenanceKeys.length === 0 ? <p className="mt-3 text-sm text-slate-500">{ops.noMaintenanceKeys}</p> : (
            <div className="mt-3 space-y-3">
              {resource.maintenanceKeys.map((key) => {
                const state = deriveWorkMaintenanceState(key, resource.meterValue);
                const stateClass = state === "DUE" ? "bg-rose-50 text-rose-800" : state === "SOON" ? "bg-amber-50 text-amber-800" : state === "OK" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
                return (
                  <article key={key.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-xs font-bold text-slate-400">{key.code}</p><h3 className="font-bold text-slate-900">{key.name}</h3></div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${stateClass}`}>{maintenanceStateText(state)}</span>
                    </div>
                    {key.description ? <p className="mt-2 text-xs leading-5 text-slate-600">{key.description}</p> : null}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-50 p-2 text-slate-600"><div>{ops.nextDue}</div><strong className="mt-1 block text-slate-900">{key.nextDueMeterValue !== null ? `${work10FormatQuantity(key.nextDueMeterValue, actor.language)} ${resource.meterUnit ?? resource.baseUnit ?? ""}` : "—"}</strong></div>
                      <div className="rounded-lg bg-slate-50 p-2 text-slate-600"><div>{ops.lastDone}</div><strong className="mt-1 block text-slate-900">{key.lastCompletedMeterValue !== null ? `${work10FormatQuantity(key.lastCompletedMeterValue, actor.language)} ${resource.meterUnit ?? resource.baseUnit ?? ""}` : ops.neverDone}</strong></div>
                    </div>
                    {actor.employee ? (
                      <form action={completeMobileResourceMaintenance} className="mt-3 grid gap-2">
                        <input type="hidden" name="maintenanceKeyId" value={key.id} />
                        <input type="hidden" name="qrToken" value={token} />
                        <input name="note" maxLength={1000} placeholder={ops.maintenanceNote} className="rounded-lg border px-3 py-2 text-sm" />
                        <button type="submit" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">{ops.completeMaintenance}</button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {resource.meterReadings.length > 0 ? (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{ops.latestPhotos}</h2>
            <div className="mt-3 space-y-2">
              {resource.meterReadings.map((reading) => {
                const photoUrl = photoUrlByReadingId.get(reading.id);
                return (
                  <div key={reading.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                    {photoUrl ? <a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt={ops.meterPhoto} className="h-20 w-20 rounded-lg object-cover" /></a> : null}
                    <div className="min-w-0 text-sm text-slate-600">
                      <p className="font-bold text-slate-900">{work10FormatQuantity(reading.value, actor.language)} {reading.unit}</p>
                      <p className="mt-1 text-xs">{new Intl.DateTimeFormat(localeFor(actor.language), { dateStyle: "medium", timeStyle: "short", hour12: false }).format(reading.readingAt)}</p>
                      {reading.note ? <p className="mt-1 text-xs leading-5">{reading.note}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
