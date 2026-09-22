import Link from "next/link";
import { notFound } from "next/navigation";

import WorkOrderTrackMap from "@/components/work/WorkOrderTrackMap";
import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workGpsText } from "@/lib/i18n/work-gps";
import { work10Text } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { projectPersistedWorkPart } from "@/lib/work10/persisted-parts";

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

export default async function WorkOrderManagerTrackMapPage({ params }: Props) {
  const { id } = await params;
  const workOrderId = Number(id);
  if (!Number.isInteger(workOrderId)) notFound();

  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();

  const [work, userSettings, sessions] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId },
      select: {
        id: true,
        title: true,
        description: true,
        sourceLanguage: true,
        workNumber: true,
        workKey: true,
        address: true,
        translations: {
          select: { language: true, title: true, description: true, source: true },
        },
      },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
    prisma.workTrackSession.findMany({
      where: {
        companyId,
        workOrderId,
        pointCount: { gt: 0 },
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        pointCount: true,
        totalDistanceM: true,
        workResourceId: true,
        employee: {
          select: { id: true, fullName: true },
        },
        workPartLaborFact: {
          select: {
            id: true,
            source: true,
            workPart: {
              select: {
                id: true,
                title: true,
                description: true,
                sourceLanguage: true,
                status: true,
                sequence: true,
                translations: {
                  select: { language: true, title: true, description: true, source: true },
                },
              },
            },
          },
        },
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
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    }),
  ]);

  if (!work) notFound();

  const language = userSettings?.interfaceLanguage ?? "is";
  const gps = workGpsText(language);
  const t = work10Text(language);
  const localizedWork = resolveWork10LocalizedText(projectPersistedWorkOrderText(work).title, language)!;

  const resourceIds = Array.from(
    new Set(sessions.map((session) => session.workResourceId).filter((value): value is number => value !== null)),
  );
  const resources = resourceIds.length
    ? await prisma.workResource.findMany({
        where: { companyId, id: { in: resourceIds } },
        select: { id: true, code: true, name: true, kind: true },
      })
    : [];
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));

  const sessionRows = sessions.map((session) => {
    const part = session.workPartLaborFact?.workPart;
    const localizedPart = part
      ? resolveWork10LocalizedText(projectPersistedWorkPart(part).title, language)?.text ?? part.title
      : null;
    const resource = session.workResourceId ? resourceById.get(session.workResourceId) : null;

    return {
      ...session,
      localizedPart,
      resource,
    };
  });

  const totalPoints = sessionRows.reduce((sum, session) => sum + session.pointCount, 0);
  const totalDistanceM = sessionRows.reduce((sum, session) => sum + session.totalDistanceM, 0);
  const activeSessions = sessionRows.filter((session) => !session.endedAt).length;

  return (
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/verk/${work.id}`} className="font-medium text-blue-700 hover:underline">
          ← {gps.backToWork}
        </Link>
      </div>

      <header>
        <p className="text-sm font-bold text-blue-700">{gps.managerOverview}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{localizedWork.text}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{gps.managerMapHelp}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.sessionsLabel}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{sessionRows.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.pointsLabel}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{totalPoints}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.totalDistance}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{formatDistance(totalDistanceM, language)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{gps.activeSessions}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{activeSessions}</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          {work.workNumber ? <p><span className="font-semibold text-slate-800">{t.workNumber}:</span> {work.workNumber}</p> : null}
          {work.workKey ? <p><span className="font-semibold text-slate-800">{t.workKey}:</span> {work.workKey}</p> : null}
          {work.address ? <p><span className="font-semibold text-slate-800">{t.address}:</span> {work.address}</p> : null}
        </div>
      </section>

      {sessionRows.length > 0 ? (
        <section className="space-y-3">
          <WorkOrderTrackMap
            tracks={sessionRows.map((session) => ({
              id: session.id,
              label: session.employee.fullName,
              detail: session.localizedPart ?? session.resource?.name ?? null,
              points: session.points.map((point) => ({
                sequence: point.sequence,
                latitude: point.latitude,
                longitude: point.longitude,
                accuracyM: point.accuracyM,
                recordedAt: point.recordedAt.toISOString(),
              })),
            }))}
            startLabel={gps.startPoint}
            endLabel={gps.endPoint}
            zoomInLabel={gps.zoomIn}
            zoomOutLabel={gps.zoomOut}
            fitLabel={gps.fitMap}
          />
          <p className="text-xs leading-5 text-slate-500">{gps.managerLegendHelp}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          {gps.managerNoSessions}
        </section>
      )}

      {sessionRows.length > 0 ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{gps.sessionListTitle}</h2>
          <div className="mt-4 divide-y rounded-xl border">
            {[...sessionRows].reverse().map((session) => (
              <div key={session.id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{session.employee.fullName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {session.localizedPart ?? gps.unknownWorkPart}
                    {session.resource ? ` · ${session.resource.code} — ${session.resource.name}` : ""}
                  </p>
                </div>
                <div className="text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-800">{gps.started}:</span> {formatDateTime(session.startedAt, language)}</p>
                  <p className="mt-1"><span className="font-semibold text-slate-800">{gps.ended}:</span> {formatDateTime(session.endedAt, language)}</p>
                </div>
                <div className="text-sm lg:text-right">
                  <p className="font-semibold text-slate-900">{session.pointCount} {gps.points}</p>
                  <p className="mt-1 text-slate-600">{formatDistance(session.totalDistanceM, language)}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${session.endedAt ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}>
                    {session.endedAt ? gps.completedSession : gps.activeSession}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-5 text-slate-500">{gps.mapCredit}</p>
    </main>
  );
}
