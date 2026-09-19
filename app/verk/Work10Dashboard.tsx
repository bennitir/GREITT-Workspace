"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { work10FormatDate, work10PriorityText, work10StatusText, work10Text } from "@/lib/i18n/work10";
import { workResourceKindText, workResourceStatusText, workResourceText } from "@/lib/i18n/work-resources";

type ActualLaborData = {
  id: string;
  userId: number | null;
  employeeId: number | null;
  userName: string | null;
  workDate: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  description: string | null;
  source: "WORK_PART_FACT" | "LEGACY_WORK_LOG";
  workPartId: number | null;
};

type WorkPartData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  order: number;
  dependencies: Array<{ predecessorPartId: string; successorPartId: string }>;
  source:
    | { kind: "LEGACY_WORK_ORDER"; sourceId: string }
    | { kind: "WORK_PART"; sourceId: string };
  persistedInWork10: boolean;
  assignedEmployeeIds: number[];
};

type WorkOrderData = {
  id: number;
  workNumber: string;
  workKey: string | null;
  externalId: string | null;
  title: string;
  description: string | null;
  address: string | null;
  priority: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  workParts: WorkPartData[];
  actualLabor: ActualLaborData[];
};

type PersonData = {
  id: number;
  name: string;
  jobTitle: string | null;
  userId: number | null;
};

type ResourceData = {
  id: number;
  kind: string;
  code: string;
  name: string;
  status: string;
  baseUnit: string | null;
  customUnit: string | null;
  meterValue: number | null;
  meterUnit: string | null;
  activeAssignmentCount: number;
  memberCount: number;
};

export type Work10DashboardData = {
  language: string;
  capabilities: {
    machines: boolean;
  };
  workOrders: WorkOrderData[];
  people: PersonData[];
  resources: ResourceData[];
  initialDate: string;
};

type MainTab = "schedule" | "list" | "queue" | "map" | "machines" | "docs" | "reports";
type ResourceTab = "people" | "machines" | "teams";
type CalendarMode = "day" | "week" | "month";

const hours = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function dateFromIsoDate(value: string | null | undefined) {
  if (!value) return new Date(Date.UTC(2000, 0, 1, 12, 0, 0, 0));

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Date.UTC(2000, 0, 1, 12, 0, 0, 0));

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function isoDateFromDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sameLocalDay(iso: string, selected: Date) {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === selected.getUTCFullYear() &&
    d.getUTCMonth() === selected.getUTCMonth() &&
    d.getUTCDate() === selected.getUTCDate()
  );
}

function minutesSinceSeven(value: string) {
  const d = new Date(value);
  return (d.getUTCHours() - 7) * 60 + d.getUTCMinutes();
}

function schedulePosition(startedAt: string, endedAt: string | null, durationMinutes: number | null) {
  const start = Math.max(0, Math.min(540, minutesSinceSeven(startedAt)));
  let duration = durationMinutes ?? 60;
  if (endedAt) {
    const diff = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    if (diff > 0) duration = diff;
  }
  const left = (start / 540) * 100;
  const width = (Math.max(30, Math.min(duration, 540 - start)) / 540) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />;
}

export default function Work10Dashboard({ data }: { data: Work10DashboardData }) {
  const t = work10Text(data.language);
  const resourceT = workResourceText(data.language);
  const [mainTab, setMainTab] = useState<MainTab>("schedule");
  const [resourceTab, setResourceTab] = useState<ResourceTab>("people");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("day");
  const fallbackInitialDate = data.initialDate ?? data.workOrders[0]?.createdAt?.slice(0, 10) ?? "2000-01-01";
  const [selectedDate, setSelectedDate] = useState(() => dateFromIsoDate(fallbackInitialDate));
  const [selectedWorkId, setSelectedWorkId] = useState<number | null>(() => data.workOrders[0]?.id ?? null);
  const [search, setSearch] = useState("");

  const machinesEnabled = data.capabilities.machines;
  const resourceTabs: ResourceTab[] = machinesEnabled
    ? ["people", "machines", "teams"]
    : ["people", "teams"];

  const selectedWork = data.workOrders.find((work) => work.id === selectedWorkId) ?? data.workOrders[0] ?? null;

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.people;
    return data.people.filter((person) => person.name.toLowerCase().includes(q));
  }, [data.people, search]);

  const filteredResources = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.resources;
    return data.resources.filter((resource) =>
      `${resource.name} ${resource.code}`.toLowerCase().includes(q),
    );
  }, [data.resources, search]);

  const machineResources = filteredResources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind));
  const teamResources = filteredResources.filter((resource) => resource.kind === "TEAM");

  const selectedDayLabor = useMemo(
    () =>
      data.workOrders.flatMap((work) =>
        work.actualLabor
          .filter((entry) => sameLocalDay(entry.workDate, selectedDate))
          .map((entry) => ({ ...entry, workId: work.id, workTitle: work.title }))
      ),
    [data.workOrders, selectedDate],
  );

  const timelineLabor = useMemo(
    () => selectedDayLabor.filter((entry) => entry.startedAt),
    [selectedDayLabor],
  );

  const activeEmployeeIds = new Set(
    data.workOrders.flatMap((work) => work.actualLabor.filter((entry) => entry.startedAt && !entry.endedAt).map((entry) => entry.employeeId).filter((id): id is number => id !== null))
  );

  const personWorkRows = useMemo(() => {
    const rows = new Map<number, WorkOrderData[]>();

    for (const person of data.people) {
      const related = data.workOrders.filter((work) => {
        const assigned = work.workParts.some((part) => part.assignedEmployeeIds.includes(person.id));
        const hasActualLabor = work.actualLabor.some((entry) => entry.employeeId === person.id);
        return assigned || hasActualLabor;
      });
      rows.set(person.id, related);
    }

    return rows;
  }, [data.people, data.workOrders]);

  const inProgressCount = data.workOrders.filter((work) => work.status === "IN_PROGRESS").length;
  const newCount = data.workOrders.filter(
    (work) => work.status === "DRAFT" || work.status === "READY",
  ).length;
  const completedCount = data.workOrders.filter((work) => work.status === "COMPLETED").length;
  const uniqueLoggedPeople = new Set(selectedDayLabor.map((entry) => entry.employeeId).filter((id): id is number => id !== null)).size;
  const machineResourceCount = data.resources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind)).length;

  const shiftDate = (days: number) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="w-full space-y-4">
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <label className="relative block max-w-xl">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={machinesEnabled ? t.searchWithMachines : t.searchWithoutMachines}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Link href="/verk/nytt" className="rounded-lg border px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50">
                ＋ {t.newWork}
              </Link>
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">{t.title}</h1>
                <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => shiftDate(-1)} className="rounded-xl border px-3 py-2 text-slate-600 hover:bg-slate-50" type="button">←</button>
                <div className="min-w-[190px] rounded-xl border bg-white px-4 py-2 text-center text-sm font-semibold text-slate-800">
                  {work10FormatDate(selectedDate, data.language)}
                </div>
                <button
                  onClick={() => {
                    const now = new Date();
                    setSelectedDate(dateFromIsoDate(isoDateFromDate(now)));
                  }}
                  className="rounded-xl border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  type="button"
                >
                  {t.today}
                </button>
                <button onClick={() => shiftDate(1)} className="rounded-xl border px-3 py-2 text-slate-600 hover:bg-slate-50" type="button">→</button>
                <div className="ml-1 flex overflow-hidden rounded-xl border bg-slate-50 p-1">
                  {(["day", "week", "month"] as CalendarMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCalendarMode(mode)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${calendarMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
                    >
                      {mode === "day" ? t.calendar.day : mode === "week" ? t.calendar.week : t.calendar.month}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex overflow-x-auto border-b">
              <TabButton active={mainTab === "schedule"} onClick={() => setMainTab("schedule")}>{t.tabs.schedule}</TabButton>
              <TabButton active={mainTab === "list"} onClick={() => setMainTab("list")}>{t.tabs.list}</TabButton>
              <TabButton active={mainTab === "queue"} onClick={() => setMainTab("queue")}>{t.tabs.queue}</TabButton>
              <TabButton active={mainTab === "map"} onClick={() => setMainTab("map")}>{t.tabs.map}</TabButton>
              {machinesEnabled && (
                <TabButton
                  active={mainTab === "machines"}
                  onClick={() => setMainTab("machines")}
                >
                  {t.tabs.machines}
                </TabButton>
              )}
              <TabButton active={mainTab === "docs"} onClick={() => setMainTab("docs")}>{t.tabs.docs}</TabButton>
              <TabButton active={mainTab === "reports"} onClick={() => setMainTab("reports")}>{t.tabs.reports}</TabButton>
            </div>
          </div>

          {mainTab === "schedule" ? (
            <div className="grid min-h-[520px] xl:grid-cols-[270px_minmax(560px,1fr)_380px]">
              <aside className="border-r bg-white p-4">
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {resourceTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setResourceTab(tab)}
                      className={`rounded-lg px-2 py-2 text-sm font-semibold ${resourceTab === tab ? "bg-blue-600 text-white shadow-sm" : "text-slate-600"}`}
                    >
                      {tab === "people" ? `${t.resources.people} (${data.people.length})` : tab === "machines" ? `${t.resources.machines} (${machineResources.length})` : `${t.resources.teams} (${teamResources.length})`}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  {resourceTab === "people" ? (
                    <div className="space-y-1">
                      {filteredPeople.length === 0 ? (
                        <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">{t.noPeopleFound}</p>
                      ) : (
                        filteredPeople.map((person) => {
                          const active = activeEmployeeIds.has(person.id);
                          const relatedWorks = personWorkRows.get(person.id) ?? [];
                          return (
                            <div key={person.id} className="rounded-xl px-2 py-2.5 hover:bg-slate-50">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{initials(person.name)}</div>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/starfsmenn/${person.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">{person.name}</Link>
                                  <p className="text-xs text-slate-500">{person.jobTitle ?? t.roles.DEFAULT}</p>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><StatusDot active={active} />{active ? t.working : t.available}</div>
                              </div>
                              {relatedWorks.length > 0 && (
                                <div className="mt-2 space-y-1 pl-12">
                                  {relatedWorks.slice(0, 2).map((work) => (
                                    <Link
                                      key={work.id}
                                      href={`/verk/${work.id}`}
                                      className="block truncate rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 hover:underline"
                                      title={`${t.openWork}: ${work.title}`}
                                    >
                                      {work.title}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : resourceTab === "machines" ? (
                    <div className="space-y-2">
                      {machineResources.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.machinesEmpty}</div>
                      ) : machineResources.map((resource) => (
                        <Link key={resource.id} href="/verk/tilfong" className="block rounded-xl border bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{resource.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p>
                            </div>
                            <StatusDot active={resource.status === "IN_USE"} />
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{workResourceStatusText(resource.status, data.language)}{resource.meterValue !== null ? ` · ${resource.meterValue} ${resource.meterUnit ?? ""}` : ""}</p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamResources.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.teamResourcePlaceholder}</div>
                      ) : teamResources.map((resource) => (
                        <Link key={resource.id} href="/verk/tilfong" className="block rounded-xl border bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40">
                          <p className="text-sm font-semibold text-slate-900">{resource.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{resource.code} · {resource.memberCount} {t.resources.people.toLowerCase()}</p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              <section className="min-w-0 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900">{t.scheduleTitle}</h2>
                    <p className="text-xs text-slate-500">{t.scheduleHelp}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{calendarMode === "day" ? t.dayView : calendarMode === "week" ? t.weekView : t.monthView}</span>
                </div>

                <div className="overflow-hidden rounded-2xl border">
                  <div className="grid grid-cols-10 border-b bg-slate-50">
                    {hours.map((hour) => <div key={hour} className="border-r px-2 py-2 text-center text-xs font-medium text-slate-500 last:border-r-0">{hour}</div>)}
                  </div>

                  <div className="relative min-h-[430px] bg-white">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: "linear-gradient(to right, rgb(226 232 240) 1px, transparent 1px), linear-gradient(to bottom, rgb(241 245 249) 1px, transparent 1px)",
                        backgroundSize: "10% 100%, 100% 58px",
                      }}
                    />

                    <div className="relative divide-y">
                      <div className="relative h-[58px] bg-amber-50/40 px-2 py-2">
                        <span className="absolute left-2 top-2 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">{t.unassignedInNewCore}</span>
                        {data.workOrders.slice(0, 3).map((work, index) => (
                          <button
                            key={work.id}
                            type="button"
                            onClick={() => setSelectedWorkId(work.id)}
                            style={{ left: `${26 + index * 21}%`, width: "19%" }}
                            className={`absolute top-2 h-11 overflow-hidden rounded-lg border px-3 text-left text-xs shadow-sm transition ${
                              selectedWork?.id === work.id ? "border-blue-500 bg-blue-100 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-300"
                            }`}
                          >
                            <span className="block truncate font-semibold text-slate-900">{work.title}</span>
                            <span className="block truncate text-[10px] text-slate-500">#{work.workNumber} · {work10StatusText(work.status, data.language)}</span>
                          </button>
                        ))}
                      </div>

                      {(data.people.length ? data.people : [{ id: -1, name: t.noPeople, jobTitle: null, userId: null }]).slice(0, 7).map((person) => {
                        const personLogs = timelineLabor.filter((log) => log.employeeId === person.id && log.startedAt);
                        return (
                          <div key={person.id} className="relative h-[58px]">
                            <span className="absolute left-2 top-2 z-10 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm">{person.name}</span>
                            {personLogs.map((log, index) => {
                              const pos = schedulePosition(log.startedAt!, log.endedAt, log.durationMinutes);
                              return (
                                <button
                                  key={log.id}
                                  type="button"
                                  onClick={() => setSelectedWorkId(log.workId)}
                                  style={{ left: pos.left, width: pos.width }}
                                  className={`absolute top-2 h-11 min-w-[88px] overflow-hidden rounded-lg border px-3 text-left text-xs shadow-sm ${
                                    index % 3 === 0 ? "border-emerald-200 bg-emerald-100" : index % 3 === 1 ? "border-sky-200 bg-sky-100" : "border-violet-200 bg-violet-100"
                                  }`}
                                >
                                  <span className="block truncate font-semibold text-slate-900">{log.workTitle}</span>
                                  <span className="block truncate text-[10px] text-slate-600">{formatTime(log.startedAt)}–{formatTime(log.endedAt) ?? "…"}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="border-l bg-slate-50 p-4">
                {selectedWork ? (
                  <div className="sticky top-4 rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.selectedWork}</p>
                        <Link href={`/verk/${selectedWork.id}`} className="group block">
                          <h2 className="mt-1 text-xl font-bold text-slate-950 group-hover:text-blue-700 group-hover:underline">{selectedWork.title}</h2>
                          <p className="mt-1 text-xs text-slate-500">#{selectedWork.workNumber}{selectedWork.workKey ? ` · ${selectedWork.workKey}` : ""}{selectedWork.address ? ` · ${selectedWork.address}` : ""}</p>
                        </Link>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${selectedWork.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : selectedWork.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{work10StatusText(selectedWork.status, data.language)}</span>
                    </div>

                    {selectedWork.description && (
                      <Link
                        href={`/verk/${selectedWork.id}`}
                        className="mt-4 block rounded-lg text-sm leading-6 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        {selectedWork.description}
                      </Link>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">{t.priority}</p><p className="mt-1 font-semibold text-slate-800">{work10PriorityText(selectedWork.priority, data.language)}</p></div>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">{t.timeEntries}</p><p className="mt-1 font-semibold text-slate-800">{selectedWork.actualLabor.length}</p></div>
                    </div>

                    <div className="mt-5 border-b">
                      <div className="flex gap-4 text-xs font-semibold text-slate-500">
                        <span className="border-b-2 border-blue-600 pb-2 text-blue-700">{t.people}</span>
                        {machinesEnabled && <span className="pb-2">{t.machines}</span>}
                        <span className="pb-2">{t.docs}</span>
                        <span className="pb-2">{t.notes}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {Array.from(new Map(selectedWork.actualLabor.filter((log) => log.userId).map((log) => [log.userId, log])).values()).length === 0 ? (
                        <p className="rounded-xl border border-dashed p-3 text-xs leading-5 text-slate-500">{t.noFormalAssignments}</p>
                      ) : (
                        Array.from(new Map(selectedWork.actualLabor.filter((log) => log.userId).map((log) => [log.userId, log])).values()).map((log) => (
                          <div key={log.userId} className="flex items-center gap-3 rounded-xl border p-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{initials(log.userName ?? "?")}</div>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{log.userName ?? t.unknown}</p><p className="text-[11px] text-slate-500">{t.loggedOnWork}</p></div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3"><p className="text-xs text-slate-400">{t.plannedTime}</p><p className="mt-1 font-semibold text-slate-700">{t.notRegistered}</p></div>
                      <div className="rounded-xl border p-3"><p className="text-xs text-slate-400">{t.actualTime}</p><p className="mt-1 font-semibold text-slate-700">{Math.round(selectedWork.actualLabor.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0) / 60 * 10) / 10} {t.hoursShort}</p></div>
                    </div>

                    <div className="mt-5 rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-900">{t.workParts}</h3>
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">{selectedWork.workParts.length}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{t.workPartsHelp}</p>
                      <div className="mt-3 space-y-2">
                        {selectedWork.workParts.map((part) => (
                          <Link
                            key={part.id}
                            href={`/verk/${selectedWork.id}`}
                            className="block rounded-lg border bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{part.title}</p>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {t.partOrder}: {part.order} · {part.persistedInWork10 ? t.persistedInNewCore : t.projectedFromCurrentWork}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{work10StatusText(part.status, data.language)}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <Link href={`/verk/${selectedWork.id}`} className="mt-4 block rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700">{t.openWork}</Link>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-slate-500">{t.noWork}</div>
                )}
              </aside>
            </div>
          ) : (
            <div className="p-5">
              <div className="rounded-2xl border bg-slate-50 p-6">
                <h2 className="text-xl font-bold text-slate-950">
                  {mainTab === "list" ? t.tabs.list : mainTab === "queue" ? t.tabs.queue : mainTab === "map" ? t.tabs.map : mainTab === "machines" ? t.tabs.machines : mainTab === "docs" ? t.tabs.docs : t.tabs.reports}
                </h2>
                {mainTab !== "list" && mainTab !== "machines" ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t.tabPlaceholder}</p> : null}
                {mainTab === "list" && (
                  <div className="mt-5 divide-y overflow-hidden rounded-xl border bg-white">
                    {data.workOrders.map((work) => (
                      <Link key={work.id} href={`/verk/${work.id}`} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50">
                        <div><p className="font-semibold text-slate-900">{work.title}</p><p className="text-sm text-slate-500">#{work.workNumber}{work.workKey ? ` · ${work.workKey}` : ""}{work.address ? ` · ${work.address}` : ""}</p></div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{work10StatusText(work.status, data.language)}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {mainTab === "machines" && (
                  <div className="mt-5">
                    <div className="mb-3 flex justify-end"><Link href="/verk/tilfong" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{resourceT.manageResources}</Link></div>
                    {machineResources.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-500">{t.machinesEmpty}</div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {machineResources.map((resource) => (
                          <Link key={resource.id} href="/verk/tilfong" className="rounded-xl border bg-white p-4 hover:border-blue-300 hover:bg-blue-50/30">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0"><p className="font-semibold text-slate-900">{resource.name}</p><p className="mt-1 text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p></div>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{workResourceStatusText(resource.status, data.language)}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <div className="rounded-lg bg-slate-50 p-2"><div>{resourceT.activeAssignments}</div><strong className="mt-1 block text-slate-900">{resource.activeAssignmentCount}</strong></div>
                              <div className="rounded-lg bg-slate-50 p-2"><div>{resourceT.latestMeter}</div><strong className="mt-1 block text-slate-900">{resource.meterValue !== null ? `${resource.meterValue} ${resource.meterUnit ?? ""}` : "—"}</strong></div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section
          className={`grid gap-4 ${
            machinesEnabled
              ? "xl:grid-cols-[1.15fr_1fr_1fr_0.95fr]"
              : "xl:grid-cols-[1.25fr_1fr_1fr]"
          }`}
        >
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.newWork}</h2><span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">{t.basicInfoStep}</span></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">{t.workTitle}<input disabled placeholder={t.workTitlePlaceholder} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.description}<input disabled placeholder={t.shortDescription} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.workKey}<input disabled placeholder={t.selectedLater} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.priority}<input disabled value={work10PriorityText("NORMAL", data.language)} readOnly className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{t.saveDisabled}</p><button disabled className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-50">{t.nextStep}</button></div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.tabs.queue}</h2><span className="text-xs text-slate-400">{completedCount} {t.completedSuffix}</span></div>
            <div className="mt-3 space-y-2">
              {data.workOrders.slice(0, 6).map((work, index) => (
                <Link key={work.id} href={`/verk/${work.id}`} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${work.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : work.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{work.status === "COMPLETED" ? "✓" : index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{work.title}</span>
                  <span className="text-[11px] text-slate-400">{work10StatusText(work.status, data.language)}</span>
                </Link>
              ))}
              {data.workOrders.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">{t.noWorkToShow}</p>}
            </div>
          </div>

          {machinesEnabled && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-950">{t.tabs.machines}</h2>
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-700"
                  onClick={() => setMainTab("machines")}
                >
                  {t.seeAll}
                </button>
              </div>
              {machineResourceCount === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.machinesEmpty}</div>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.resources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind)).slice(0, 5).map((resource) => (
                    <Link key={resource.id} href="/verk/tilfong" className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 hover:bg-slate-50">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{resource.name}</p><p className="text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p></div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">{workResourceStatusText(resource.status, data.language)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.todayStatus}</h2><span className="text-[11px] text-slate-400">{t.currentData}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-blue-50 p-3"><p className="text-2xl font-bold text-blue-700">{inProgressCount}</p><p className="text-xs text-blue-700">{t.worksInProgress}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-bold text-red-700">{newCount}</p><p className="text-xs text-red-700">{t.newWorks}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{uniqueLoggedPeople}/{data.people.length}</p><p className="text-xs text-emerald-700">{t.peopleWithTimeToday}</p></div>
                {machinesEnabled && (
                  <div className="rounded-xl bg-slate-100 p-3">
                    <p className="text-2xl font-bold text-slate-700">{machineResourceCount}</p>
                    <p className="text-xs text-slate-600">{t.machinesConnected}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="font-bold text-slate-950">{t.quickActions}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
                <Link href="/verk/nytt" className="rounded-xl border px-3 py-3 text-center text-blue-700 hover:bg-blue-50">＋ {t.newWork}</Link>
                <button disabled className="rounded-xl border px-3 py-3 text-slate-400">☷ {t.newQueue}</button>
                <Link href="/starfsmenn" className="rounded-xl border px-3 py-3 text-center text-blue-700 hover:bg-blue-50">＋ {t.addEmployee}</Link>
                <Link href="/verk/tilfong" className="rounded-xl border px-3 py-3 text-center text-violet-700 hover:bg-violet-50">＋ {resourceT.manageResources}</Link>
                <button type="button" onClick={() => setMainTab("map")} className="rounded-xl border px-3 py-3 text-blue-700 hover:bg-blue-50">⌖ {t.viewMap}</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
