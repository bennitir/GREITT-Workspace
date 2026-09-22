import Link from "next/link";

import { workMobileText } from "@/lib/i18n/work-mobile";
import { prisma } from "@/lib/prisma";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import { startMobileDiaryEntry, stopMobileDiaryEntry } from "../actions";

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

function displayDate(value: Date, language: string) {
  return new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function displayTime(value: Date | null, language: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatMinutes(total: number, language: string) {
  const safe = Math.max(0, Math.round(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (language === "en") return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  if (language === "pl") return hours > 0 ? `${hours} godz. ${minutes} min` : `${minutes} min`;
  if (language === "sr") return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  return hours > 0 ? `${hours} klst. ${minutes} mín.` : `${minutes} mín.`;
}

function workDateFromNow(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

export default async function MobileWorkDiaryPage() {
  const actor = await getMobileWorkActor();
  const t = workMobileText(actor.language);

  if (!actor.employee) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
          <Link href="/mobile/verk" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm">← {t.diaryBack}</Link>
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h1 className="text-xl font-bold text-amber-950">{t.employeeLinkMissingTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-amber-900">{t.employeeLinkMissingHelp}</p>
          </div>
        </div>
      </main>
    );
  }

  const enabled = actor.employee.workExecutionMode === "SELF_DIRECTED" || actor.employee.workExecutionMode === "MIXED";
  const now = new Date();
  const today = workDateFromNow(now);

  const [locations, entries, activeWork] = await Promise.all([
    prisma.operationalLocation.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ locationKind: "asc" }, { name: "asc" }],
    }),
    prisma.employeeWorkDiaryEntry.findMany({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
      },
      include: {
        operationalLocation: { select: { id: true, code: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.workPartLaborFact.findFirst({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
        startedAt: { not: null },
        endedAt: null,
      },
      select: { id: true },
    }),
  ]);

  const activeEntry = entries.find((entry) => !entry.endedAt) ?? null;
  const todayEntries = entries.filter((entry) => entry.workDate.getTime() === today.getTime());
  const todayMinutes = todayEntries.reduce((sum, entry) => {
    if (entry.endedAt) return sum + entry.durationMinutes;
    return sum + Math.max(1, Math.round((now.getTime() - entry.startedAt.getTime()) / 60_000));
  }, 0);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <Link href="/mobile/verk" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm">← {t.diaryBack}</Link>

        <header className="mt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-950">{t.diary}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t.diaryHelp}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {t.executionModes[actor.employee.workExecutionMode as keyof typeof t.executionModes] ?? actor.employee.workExecutionMode}
            </span>
          </div>
        </header>

        {!enabled ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-bold text-amber-950">{t.diaryNotEnabledTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">{t.diaryNotEnabledHelp}</p>
          </section>
        ) : null}

        <section className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t.diaryToday}</p>
          <p className="mt-1 text-3xl font-bold">{formatMinutes(todayMinutes, actor.language)}</p>
          <p className="mt-1 text-xs text-slate-300">{displayDate(today, actor.language)}</p>
        </section>

        {enabled && activeEntry ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">{t.diaryActive}</p>
            <h2 className="mt-1 text-xl font-bold text-emerald-950">{activeEntry.title}</h2>
            <p className="mt-1 text-sm text-emerald-900">{t.diaryStarted}: {displayTime(activeEntry.startedAt, actor.language)}</p>
            {activeEntry.workKey ? <p className="mt-2 text-sm text-emerald-900">{t.diaryWorkKey}: {activeEntry.workKey}</p> : null}
            {activeEntry.operationalLocation ? <p className="mt-1 text-sm text-emerald-900">{t.diaryLocation}: {activeEntry.operationalLocation.name}</p> : activeEntry.locationText ? <p className="mt-1 text-sm text-emerald-900">{t.diaryLocation}: {activeEntry.locationText}</p> : null}
            {activeEntry.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{activeEntry.note}</p> : null}
            <form action={stopMobileDiaryEntry} className="mt-4">
              <input type="hidden" name="entryId" value={activeEntry.id} />
              <button type="submit" className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-base font-bold text-white">{t.diaryStop}</button>
            </form>
          </section>
        ) : enabled ? (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{t.diaryStartTitle}</h2>
            {activeWork ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.errors.alreadyActiveElsewhere}</p> : null}
            <form action={startMobileDiaryEntry} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryActivity}</span>
                <input name="title" required maxLength={200} disabled={Boolean(activeWork)} placeholder={t.diaryActivityPlaceholder} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryWorkKey}</span>
                <input name="workKey" maxLength={100} disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryLocation}</span>
                <select name="operationalLocationId" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-base disabled:bg-slate-100">
                  <option value="">—</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ""}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryCustomLocation}</span>
                <input name="locationText" maxLength={240} disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.diaryTravelMinutes}</span>
                  <input name="travelMinutes" type="number" min="0" step="1" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.diaryTravelKm}</span>
                  <input name="travelKm" type="number" min="0" step="0.1" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryNote}</span>
                <textarea name="note" maxLength={2000} rows={4} disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
              </label>
              <button type="submit" disabled={Boolean(activeWork)} className="rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t.diaryStart}</button>
            </form>
          </section>
        ) : null}

        <section className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">{t.diaryHistory}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{entries.length}</span>
          </div>
          {entries.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{t.diaryNoHistory}</p>
          ) : (
            <div className="mt-3 space-y-3">
              {entries.map((entry) => {
                const duration = entry.endedAt ? entry.durationMinutes : Math.max(1, Math.round((now.getTime() - entry.startedAt.getTime()) / 60_000));
                return (
                  <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-950">{entry.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{displayDate(entry.workDate, actor.language)} · {displayTime(entry.startedAt, actor.language)}–{entry.endedAt ? displayTime(entry.endedAt, actor.language) : "…"}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{formatMinutes(duration, actor.language)}</span>
                    </div>
                    {entry.workKey ? <p className="mt-2 text-sm text-slate-700">{t.diaryWorkKey}: {entry.workKey}</p> : null}
                    {entry.operationalLocation ? <p className="mt-1 text-sm text-slate-700">{t.diaryLocation}: {entry.operationalLocation.name}</p> : entry.locationText ? <p className="mt-1 text-sm text-slate-700">{t.diaryLocation}: {entry.locationText}</p> : null}
                    {entry.travelMinutes !== null || entry.travelKm !== null ? <p className="mt-1 text-sm text-slate-700">{t.diaryTravelMinutes}: {entry.travelMinutes ?? 0} · {t.diaryTravelKm}: {entry.travelKm ?? 0}</p> : null}
                    {entry.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.note}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
