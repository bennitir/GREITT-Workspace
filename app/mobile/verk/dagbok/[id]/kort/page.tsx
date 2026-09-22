import Link from "next/link";
import { notFound } from "next/navigation";

import WorkTrackMap from "@/components/work/WorkTrackMap";
import { workGpsText } from "@/lib/i18n/work-gps";
import { workMobileText } from "@/lib/i18n/work-mobile";
import { prisma } from "@/lib/prisma";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";

type Props = {
  params: Promise<{ id: string }>;
};

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

function formatDateTime(value: Date | null, language: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatDistance(distanceM: number, language: string) {
  const locale = localeFor(language);
  if (distanceM >= 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(distanceM / 1_000)} km`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceM)} m`;
}

export default async function MobileDiaryTrackMapPage({ params }: Props) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  const actor = await getMobileWorkActor();
  if (!actor.employee) notFound();
  const t = workMobileText(actor.language);
  const gps = workGpsText(actor.language);

  const entry = await prisma.employeeWorkDiaryEntry.findFirst({
    where: {
      id: entryId,
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      voidedAt: null,
    },
    select: {
      id: true,
      title: true,
      workKey: true,
      startedAt: true,
      endedAt: true,
      locationText: true,
      travelToLabelSnapshot: true,
      workResourceCodeSnapshot: true,
      workResourceNameSnapshot: true,
      workTrackSession: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          pointCount: true,
          totalDistanceM: true,
          points: {
            select: {
              sequence: true,
              recordedAt: true,
              latitude: true,
              longitude: true,
              accuracyM: true,
            },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  });

  if (!entry) notFound();
  const session = entry.workTrackSession;
  const points = session?.points ?? [];
  const equipment = [entry.workResourceCodeSnapshot, entry.workResourceNameSnapshot].filter(Boolean).join(" · ");
  const location = entry.travelToLabelSnapshot ?? entry.locationText ?? null;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <Link href="/mobile/verk/dagbok" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm">
          ← {t.diaryBack}
        </Link>

        <header className="mt-5">
          <p className="text-sm font-bold text-blue-700">{gps.mapTitle}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{entry.title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{gps.mapHelp}</p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.pointsLabel}</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{session?.pointCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.distance}</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{session ? formatDistance(session.totalDistanceM, actor.language) : "—"}</p>
          </div>
          <div className="col-span-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
            <p><span className="font-semibold">{gps.started}:</span> {formatDateTime(session?.startedAt ?? entry.startedAt, actor.language)}</p>
            <p className="mt-1"><span className="font-semibold">{gps.ended}:</span> {formatDateTime(session?.endedAt ?? entry.endedAt, actor.language)}</p>
            {entry.workKey ? <p className="mt-1"><span className="font-semibold">{t.diaryWorkKey}:</span> {entry.workKey}</p> : null}
            {equipment ? <p className="mt-1"><span className="font-semibold">{t.diaryEquipment}:</span> {equipment}</p> : null}
            {location ? <p className="mt-1"><span className="font-semibold">{t.diaryLocation}:</span> {location}</p> : null}
          </div>
        </section>

        <section className="mt-5">
          {points.length > 0 ? (
            <WorkTrackMap
              points={points.map((point) => ({
                sequence: point.sequence,
                latitude: point.latitude,
                longitude: point.longitude,
                accuracyM: point.accuracyM,
                recordedAt: point.recordedAt.toISOString(),
              }))}
              startLabel={gps.startPoint}
              endLabel={gps.endPoint}
              zoomInLabel={gps.zoomIn}
              zoomOutLabel={gps.zoomOut}
              fitLabel={gps.fitMap}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">{gps.noMapPoints}</div>
          )}
        </section>

        <p className="mt-3 text-xs leading-5 text-slate-500">{gps.mapCredit}</p>
      </div>
    </main>
  );
}
