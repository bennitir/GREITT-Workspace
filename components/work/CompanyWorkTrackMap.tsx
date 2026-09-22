"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import WorkOrderTrackMap from "@/components/work/WorkOrderTrackMap";
import { workGpsText } from "@/lib/i18n/work-gps";

type ApiPoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

type ApiSession = {
  id: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  pointCount: number;
  totalDistanceM: number;
  employeeId: number;
  employeeName: string;
  workOrderId: number | null;
  workOrderTitle: string | null;
  workNumber: string | null;
  workPartTitle: string | null;
  points: ApiPoint[];
};

type ApiResponse = {
  date: string;
  sessions: ApiSession[];
};

type Props = {
  dateIso: string;
  language: string;
};

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

function formatTime(value: string | null, language: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDistance(distanceM: number, language: string) {
  const locale = localeFor(language);
  if (distanceM >= 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(distanceM / 1_000)} km`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceM)} m`;
}

export default function CompanyWorkTrackMap({ dateIso, language }: Props) {
  const gps = workGpsText(language);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    fetch(`/api/verk/gps-tracks?date=${encodeURIComponent(dateIso)}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ApiResponse>;
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [dateIso]);

  const sessions = data?.sessions ?? [];
  const summary = useMemo(() => {
    return sessions.reduce(
      (result, session) => ({
        points: result.points + session.pointCount,
        distanceM: result.distanceM + session.totalDistanceM,
        active: result.active + (session.status === "TRACKING" ? 1 : 0),
      }),
      { points: 0, distanceM: 0, active: 0 },
    );
  }, [sessions]);

  const tracks = useMemo(
    () =>
      sessions.map((session) => {
        const workLabel = session.workOrderTitle
          ? `${session.workOrderTitle}${session.workNumber ? ` · #${session.workNumber}` : ""}`
          : gps.unlinkedWork;
        const detail = `${session.employeeName} · ${formatTime(session.startedAt, language)}–${formatTime(session.endedAt, language)} · ${formatDistance(session.totalDistanceM, language)}`;
        return {
          id: session.id,
          label: workLabel,
          detail,
          points: session.points,
        };
      }),
    [gps.unlinkedWork, language, sessions],
  );

  if (loading) {
    return <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">{gps.companyMapLoading}</div>;
  }

  if (error) {
    return <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{gps.companyMapError}</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">{gps.companyMapTitle}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{gps.companyNoSessions}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <h3 className="text-sm font-bold text-blue-950">{gps.companyMapTitle}</h3>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-blue-800">{gps.companyMapHelp}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{sessions.length}</span>{gps.sessionsLabel}</div>
          <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{summary.active}</span>{gps.activeSessions}</div>
          <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{summary.points}</span>{gps.pointsLabel}</div>
          <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{formatDistance(summary.distanceM, language)}</span>{gps.totalDistance}</div>
        </div>
      </div>

      <WorkOrderTrackMap
        tracks={tracks}
        zoomInLabel={gps.zoomIn}
        zoomOutLabel={gps.zoomOut}
        fitLabel={gps.fitMap}
        startLabel={gps.startPoint}
        endLabel={gps.endPoint}
      />

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="font-bold text-slate-950">{gps.sessionListTitle}</h3>
        </div>
        <div className="divide-y">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{session.employeeName}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${session.status === "TRACKING" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {session.status === "TRACKING" ? gps.activeSession : gps.completedSession}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {session.workOrderTitle ? (
                    <>
                      {session.workOrderTitle}{session.workNumber ? ` · #${session.workNumber}` : ""}
                      {session.workPartTitle ? ` · ${session.workPartTitle}` : ""}
                    </>
                  ) : (
                    <span className="font-semibold text-amber-700">{gps.unlinkedWork}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatTime(session.startedAt, language)}–{formatTime(session.endedAt, language)} · {session.pointCount} {gps.points.toLowerCase()} · {formatDistance(session.totalDistanceM, language)}
                </p>
              </div>
              {session.workOrderId ? (
                <Link href={`/verk/${session.workOrderId}/kort`} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                  {gps.managerOpenMap}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
