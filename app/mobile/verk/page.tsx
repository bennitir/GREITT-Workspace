import Link from "next/link";

import MobileOperationalTranslationSync from "@/components/MobileOperationalTranslationSync";

import { work10PriorityText, work10StatusText, work10Text } from "@/lib/i18n/work10";
import { workMobileText } from "@/lib/i18n/work-mobile";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { prisma } from "@/lib/prisma";
import { projectWorkPartsForDisplay } from "@/lib/work10/display-parts";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import { deriveWork10Status, isWork10ReadyToClose } from "@/lib/work10/status";
import { isWork10PartTerminalStatus } from "@/lib/work10/workflow";
import ResourceQrScanner from "./ResourceQrScanner";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

function priorityRank(priority: string) {
  if (priority === "URGENT") return 0;
  if (priority === "HIGH") return 1;
  if (priority === "NORMAL") return 2;
  return 3;
}


function priorityCardClass(priority: string) {
  if (priority === "URGENT") return "bg-rose-100 text-rose-800 ring-1 ring-rose-200";
  if (priority === "HIGH") return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
  return "bg-slate-50 text-slate-600";
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return values.some((value) => value?.toLocaleLowerCase().includes(normalized));
}

export default async function MobileVerkPage({ searchParams }: Props) {
  const actor = await getMobileWorkActor();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const t = workMobileText(actor.language);
  const workT = work10Text(actor.language);
  const ops = workResourceOperationsText(actor.language);

  const [workOrders, activeFact, activeDiary] = await Promise.all([
    prisma.workOrder.findMany({
      where: actor.access.canManage
        ? {
            companyId: actor.companyId,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          }
        : {
            companyId: actor.companyId,
            OR: [
              { workParts: { some: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } },
              { workParts: { none: {} }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
            ],
          },
      include: {
        translations: true,
        workParts: {
          include: {
            translations: true,
            predecessorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
            successorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
            assignments: {
              where: { removedAt: null },
              select: {
                employeeId: true,
                userId: true,
                workResourceId: true,
                resourceKind: true,
              },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    actor.employee
      ? prisma.workPartLaborFact.findFirst({
          where: {
            companyId: actor.companyId,
            employeeId: actor.employee.id,
            voidedAt: null,
            startedAt: { not: null },
            endedAt: null,
          },
          include: {
            workPart: {
              select: {
                id: true,
                title: true,
                workOrder: { select: { id: true, title: true } },
              },
            },
          },
          orderBy: { startedAt: "desc" },
        })
      : Promise.resolve(null),
    actor.employee
      ? prisma.employeeWorkDiaryEntry.findFirst({
          where: {
            companyId: actor.companyId,
            employeeId: actor.employee.id,
            voidedAt: null,
            endedAt: null,
          },
          select: {
            id: true,
            title: true,
            startedAt: true,
            workKey: true,
          },
          orderBy: { startedAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const cards = workOrders
    .map((work) => {
      const operationalText = projectPersistedWorkOrderText(work);
      const localizedTitle = resolveWork10LocalizedText(operationalText.title, actor.language)?.text ?? work.title;
      const parts = projectWorkPartsForDisplay(work, actor.language);
      const persistedById = new Map(work.workParts.map((part) => [part.id, part]));
      const assignedPartIds = new Set<number>();
      let directAssignedCount = 0;
      let teamAssignedCount = 0;

      for (const part of work.workParts) {
        const direct = part.assignments.some(
          (assignment) =>
            (actor.employee && assignment.employeeId === actor.employee.id) ||
            assignment.userId === actor.user.id,
        );
        const team = part.assignments.some(
          (assignment) =>
            assignment.resourceKind === "TEAM" &&
            assignment.workResourceId !== null &&
            actor.teamResourceIds.includes(assignment.workResourceId),
        );
        if (direct || team) assignedPartIds.add(part.id);
        if (direct) directAssignedCount += 1;
        else if (team) teamAssignedCount += 1;
      }

      const openPartCount = work.workParts.filter((part) => !isWork10PartTerminalStatus(part.status)).length;
      const effectiveStatus = deriveWork10Status(work.status, work.workParts);
      const readyToClose = isWork10ReadyToClose(work.status, work.workParts);
      const searchablePartTitles = parts.map((part) => part.title);
      const matches = matchesQuery(
        [localizedTitle, work.workNumber, work.workKey, work.address, ...searchablePartTitles],
        query,
      );

      return {
        id: work.id,
        localizedTitle,
        workNumber: work.workNumber,
        workKey: work.workKey,
        address: work.address,
        priority: work.priority,
        status: effectiveStatus,
        readyToClose,
        openPartCount,
        assignedCount: assignedPartIds.size,
        directAssignedCount,
        teamAssignedCount,
        matches,
        hasPersistedParts: persistedById.size > 0,
      };
    })
    .filter((card) => card.matches)
    .sort((a, b) => {
      const assignedDiff = Number(b.assignedCount > 0) - Number(a.assignedCount > 0);
      if (assignedDiff !== 0) return assignedDiff;
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return b.id - a.id;
    });

  const myWork = cards.filter((card) => card.assignedCount > 0);
  const otherWork = cards.filter((card) => card.assignedCount === 0);

  const activeDisplay = activeFact
    ? (() => {
        const activeWork = workOrders.find((work) => work.id === activeFact.workPart.workOrder.id);
        if (!activeWork) {
          return {
            workTitle: activeFact.workPart.workOrder.title,
            partTitle: activeFact.workPart.title,
          };
        }
        const workText = projectPersistedWorkOrderText(activeWork);
        const workTitle = resolveWork10LocalizedText(workText.title, actor.language)?.text ?? activeWork.title;
        const partTitle =
          projectWorkPartsForDisplay(activeWork, actor.language).find(
            (part) => part.source.kind === "WORK_PART" && Number(part.source.sourceId) === activeFact.workPart.id,
          )?.title ?? activeFact.workPart.title;
        return { workTitle, partTitle };
      })()
    : null;

  const diaryEnabled = Boolean(
    actor.employee &&
    (actor.employee.workExecutionMode === "SELF_DIRECTED" || actor.employee.workExecutionMode === "MIXED"),
  );

  const renderCard = (card: (typeof cards)[number]) => (
    <Link
      key={card.id}
      href={`/mobile/verk/${card.id}`}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">{card.localizedTitle}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {t.workNumber}: {card.workNumber || `#${card.id}`}
            {card.workKey ? ` · ${t.workKey}: ${card.workKey}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {card.readyToClose ? workT.readyToCloseBadge : work10StatusText(card.status, actor.language)}
        </span>
      </div>

      {card.address ? <p className="mt-2 text-sm text-slate-700">{card.address}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className={`rounded-xl p-2.5 ${priorityCardClass(card.priority)}`}>
          <div>{t.priority}</div>
          <div className="mt-1 font-bold">{work10PriorityText(card.priority, actor.language)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 text-slate-600">
          <div>{t.openParts}</div>
          <div className="mt-1 font-semibold text-slate-900">{card.openPartCount}</div>
        </div>
      </div>

      {card.assignedCount > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {card.directAssignedCount > 0 ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{t.assignedToYou}</span>
          ) : null}
          {card.teamAssignedCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{t.assignedToTeam}</span>
          ) : null}
        </div>
      ) : null}

      {!card.hasPersistedParts ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{t.legacyPart}</p>
      ) : null}

      <div className="mt-3 text-right text-sm font-semibold text-blue-700">{t.open} →</div>
    </Link>
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <MobileOperationalTranslationSync />
        <header>
          <Link
            href="/mobile"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm"
          >
            ← {t.backMobile}
          </Link>
          <h1 className="mt-5 text-3xl font-bold text-slate-950">{t.title}</h1>
          <p className="mt-1 text-base text-slate-600">{t.subtitle}</p>

          {!actor.employee ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-950">{t.employeeLinkMissingTitle}</p>
              <p className="mt-2 text-sm leading-6 text-amber-900">{t.employeeLinkMissingHelp}</p>
            </div>
          ) : null}

          {actor.access.canManage ? (
            <div className="mt-4 rounded-2xl bg-slate-100 p-4">
              <p className="font-bold text-slate-900">{t.managerView}</p>
              <p className="mt-1 text-sm text-slate-600">{t.allWorkVisible}</p>
            </div>
          ) : null}

          {actor.employee ? (
            <Link
              href="/mobile/verk/dagbok"
              className={`mt-4 block rounded-2xl border p-4 ${
                activeDiary
                  ? "border-emerald-200 bg-emerald-50"
                  : diaryEnabled
                    ? "border-blue-200 bg-blue-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-bold ${activeDiary ? "text-emerald-800" : diaryEnabled ? "text-blue-800" : "text-slate-600"}`}>
                    {activeDiary ? t.diaryActive : t.diary}
                  </p>
                  <p className={`mt-1 font-bold ${activeDiary ? "text-emerald-950" : "text-slate-950"}`}>
                    {activeDiary?.title ?? t.executionModes[actor.employee.workExecutionMode as keyof typeof t.executionModes] ?? actor.employee.workExecutionMode}
                  </p>
                  {activeDiary?.workKey ? <p className="mt-1 text-sm text-emerald-900">{t.diaryWorkKey}: {activeDiary.workKey}</p> : null}
                  {!activeDiary ? <p className="mt-1 text-sm leading-5 text-slate-600">{diaryEnabled ? t.diaryHelp : t.diaryNotEnabledHelp}</p> : null}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${activeDiary ? "bg-white text-emerald-800" : "bg-white text-slate-600"}`}>
                  {t.diaryOpen} →
                </span>
              </div>
            </Link>
          ) : null}

          {activeFact ? (
            <Link
              href={`/mobile/verk/${activeFact.workPart.workOrder.id}`}
              className="mt-4 block rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
            >
              <p className="text-sm font-bold text-emerald-800">{t.activeNow}</p>
              <p className="mt-1 font-bold text-emerald-950">{activeDisplay?.workTitle ?? activeFact.workPart.workOrder.title}</p>
              <p className="mt-1 text-sm text-emerald-900">{activeDisplay?.partTitle ?? activeFact.workPart.title}</p>
              <p className="mt-3 text-sm font-semibold text-emerald-800">{t.continue} →</p>
            </Link>
          ) : null}

          <ResourceQrScanner labels={ops} />

          <form className="mt-5" method="get">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              <span>{t.search}</span>
              <input
                name="q"
                defaultValue={query}
                placeholder={t.searchPlaceholder}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
              />
            </label>
          </form>
        </header>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">{t.myWork}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{myWork.length}</span>
          </div>
          {myWork.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{t.noAssignedWork}</p>
          ) : (
            <div className="mt-3 space-y-3">{myWork.map(renderCard)}</div>
          )}
        </section>

        <section className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">{t.otherWork}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{otherWork.length}</span>
          </div>
          {otherWork.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">{cards.length === 0 ? t.noWork : t.noAssignedWork}</p>
          ) : (
            <div className="mt-3 space-y-3">{otherWork.map(renderCard)}</div>
          )}
        </section>
      </div>
    </main>
  );
}
