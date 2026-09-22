import Link from "next/link";

import LiveDiaryTotal from "@/components/work/LiveDiaryTotal";
import OperationalLocationAutocomplete, { type LocationOption } from "@/components/work/OperationalLocationAutocomplete";

import { workMobileText } from "@/lib/i18n/work-mobile";
import { workKeyText } from "@/lib/i18n/work-keys";
import { prisma } from "@/lib/prisma";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import { operationalLocationAddress, operationalLocationLabel } from "@/lib/work10/location-format";
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

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function travelSummary(minutes: number | null, km: number | null, language: string) {
  const parts: string[] = [];
  if (km !== null) {
    parts.push(`${new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 1 }).format(km)} km`);
  }
  if (minutes !== null) parts.push(formatMinutes(minutes, language));
  return parts.join(" · ");
}

export default async function MobileWorkDiaryPage() {
  const actor = await getMobileWorkActor();
  const t = workMobileText(actor.language);
  const workKeyT = workKeyText(actor.language);

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

  const [locations, workKeys, entries, activeWork, company] = await Promise.all([
    prisma.operationalLocation.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, code: true, name: true, address: true, postalCode: true, city: true },
      orderBy: [{ locationKind: "asc" }, { name: "asc" }],
    }),
    prisma.workKey.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, code: true, name: true, address: true, postalCode: true, city: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.employeeWorkDiaryEntry.findMany({
      where: {
        companyId: actor.companyId,
        employeeId: actor.employee.id,
        voidedAt: null,
      },
      include: {
        operationalLocation: { select: { id: true, code: true, name: true } },
        travelFromOperationalLocation: { select: { id: true, code: true, name: true } },
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
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: {
        defaultOperationalLocation: {
          select: { id: true, code: true, name: true, address: true, postalCode: true, city: true },
        },
      },
    }),
  ]);

  const defaultBaseLocation =
    actor.employee.baseOperationalLocation ??
    actor.employee.departmentUnit?.defaultOperationalLocation ??
    company?.defaultOperationalLocation ??
    null;

  const activeEntry = entries.find((entry) => !entry.endedAt) ?? null;
  const todayKey = dateKey(now);
  const todayEntries = entries.filter((entry) => dateKey(entry.workDate) === todayKey);
  const completedTodayMinutes = todayEntries.reduce((sum, entry) => entry.endedAt ? sum + entry.durationMinutes : sum, 0);
  const locationOptions: LocationOption[] = [
    ...locations.map((location) => ({
      id: location.id,
      name: location.name,
      code: location.code,
      address: location.address,
      postalCode: location.postalCode,
      city: location.city,
      displayText: operationalLocationLabel(location),
      inputText: operationalLocationAddress(location) || location.name,
      searchText: [location.name, location.code, location.address, location.postalCode, location.city].filter(Boolean).join(" "),
    })),
    ...[...new Set(entries.map((entry) => entry.locationText?.trim()).filter((value): value is string => Boolean(value)))]
      .filter((text) => !locations.some((location) => operationalLocationLabel(location).includes(text)))
      .slice(0, 8)
      .map((text) => ({ id: null, name: text, displayText: text, searchText: text })),
  ];

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
          <p className="mt-1 text-3xl font-bold"><LiveDiaryTotal completedMinutes={completedTodayMinutes} activeStartedAt={activeEntry?.startedAt.toISOString() ?? null} language={actor.language} /></p>
          <p className="mt-1 text-xs text-slate-300">{displayDate(today, actor.language)}</p>
        </section>

        {enabled && activeEntry ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">{t.diaryActive}</p>
            <h2 className="mt-1 text-xl font-bold text-emerald-950">{activeEntry.title}</h2>
            <p className="mt-1 text-sm text-emerald-900">{t.diaryStarted}: {displayTime(activeEntry.startedAt, actor.language)}</p>
            {activeEntry.workKey ? <p className="mt-2 text-sm text-emerald-900">{t.diaryWorkKey}: {activeEntry.workKey}</p> : null}
            {activeEntry.travelFromLabelSnapshot || activeEntry.travelFromOperationalLocation ? (
              <p className="mt-1 text-sm text-emerald-900">{t.diaryTravelFrom}: {activeEntry.travelFromLabelSnapshot ?? activeEntry.travelFromOperationalLocation?.name}</p>
            ) : null}
            {activeEntry.travelToLabelSnapshot || activeEntry.operationalLocation || activeEntry.locationText ? (
              <p className="mt-1 text-sm text-emerald-900">{t.diaryLocation}: {activeEntry.travelToLabelSnapshot ?? activeEntry.operationalLocation?.name ?? activeEntry.locationText}</p>
            ) : null}
            {(activeEntry.estimatedTravelMinutes !== null || activeEntry.estimatedTravelKm !== null) ? (
              <p className="mt-1 text-sm text-emerald-900">{t.diaryEstimatedTravel}: {travelSummary(activeEntry.estimatedTravelMinutes, activeEntry.estimatedTravelKm, actor.language)}</p>
            ) : null}
            {(activeEntry.travelMinutes !== null || activeEntry.travelKm !== null) ? (
              <p className="mt-1 text-sm text-emerald-900">{t.diaryRecordedTravel}: {travelSummary(activeEntry.travelMinutes, activeEntry.travelKm, actor.language)}</p>
            ) : null}
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.diaryTravelFrom}</p>
                <p className="mt-1 font-semibold text-slate-900">{defaultBaseLocation?.name ?? "—"}</p>
                {defaultBaseLocation?.address ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {operationalLocationAddress(defaultBaseLocation)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs leading-5 text-slate-500">{t.diaryDefaultBaseHelp}</p>
              </div>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryActivity}</span>
                <input name="title" required maxLength={200} disabled={Boolean(activeWork)} placeholder={t.diaryActivityPlaceholder} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                <span>{t.diaryWorkKey}</span>
                <select name="workKeyId" defaultValue="" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-base disabled:bg-slate-100">
                  <option value="">{workKeyT.selectNone}</option>
                  {workKeys.map((key) => <option key={key.id} value={key.id}>{key.code}{key.name !== key.code ? ` · ${key.name}` : ""}</option>)}
                </select>
              </label>
              <OperationalLocationAutocomplete
                label={t.diaryLocation}
                placeholder={t.diaryCustomLocation}
                help={t.diaryLocationSearchHelp}
                textName="locationText"
                options={locationOptions}
                disabled={Boolean(activeWork)}
                labelClassName="grid gap-1 text-sm font-semibold text-slate-700"
                inputClassName="rounded-xl border border-slate-300 px-3 py-3 text-base font-normal"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.diaryTravelMinutes}</span>
                  <input name="travelMinutes" type="number" min="0" step="1" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.diaryTravelKm}</span>
                  <input name="travelKm" type="number" min="0" step="0.1" disabled={Boolean(activeWork)} className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
                </label>
                <p className="col-span-2 text-xs leading-5 text-slate-500">{t.diaryTravelActualHelp}</p>
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
                    {entry.travelFromLabelSnapshot || entry.travelFromOperationalLocation ? (
                      <p className="mt-1 text-sm text-slate-700">{t.diaryTravelFrom}: {entry.travelFromLabelSnapshot ?? entry.travelFromOperationalLocation?.name}</p>
                    ) : null}
                    {entry.travelToLabelSnapshot || entry.operationalLocation || entry.locationText ? (
                      <p className="mt-1 text-sm text-slate-700">{t.diaryLocation}: {entry.travelToLabelSnapshot ?? entry.operationalLocation?.name ?? entry.locationText}</p>
                    ) : null}
                    {(entry.estimatedTravelMinutes !== null || entry.estimatedTravelKm !== null) ? (
                      <p className="mt-1 text-sm text-slate-700">{t.diaryEstimatedTravel}: {travelSummary(entry.estimatedTravelMinutes, entry.estimatedTravelKm, actor.language)}</p>
                    ) : null}
                    {(entry.travelMinutes !== null || entry.travelKm !== null) ? (
                      <p className="mt-1 text-sm text-slate-700">{t.diaryRecordedTravel}: {travelSummary(entry.travelMinutes, entry.travelKm, actor.language)}</p>
                    ) : null}
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
