import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCompanyAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";
import { inventoryText } from "@/lib/i18n/inventory";
import { workResourceKindText, workResourceStatusText, workResourceText } from "@/lib/i18n/work-resources";
import { workGpsText } from "@/lib/i18n/work-gps";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import IcelandicTimeInput from "@/components/ui/IcelandicTimeInput";
import {
  work10FormatDate,
  work10FormatDuration,
  work10FormatCurrencyIsk,
  work10FormatQuantity,
  work10UnitText,
  work10PriorityText,
  work10StatusText,
  work10Text,
} from "@/lib/i18n/work10";
import { projectWorkPartsForDisplay } from "@/lib/work10/display-parts";
import {
  deriveWork10LaborEffectCandidates,
  deriveWork10UsageEffectCandidates,
} from "@/lib/work10/effects";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { effectiveWork10Status, isWork10EffectivelyCompleted, isWork10ReadyToClose } from "@/lib/work10/status";
import {
  WORK10_PART_STATUSES,
  isWork10PartTerminalStatus,
  work10DependencyWouldCreateCycle,
  work10StatusRequiresResolvedDependencies,
} from "@/lib/work10/workflow";
import { resolveLaborFactNote } from "@/lib/work10/labor-text";
import { work10ClockFromMinutes, work10PlannedEndMinutes } from "@/lib/work10/scheduling";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import MaterialUsageForm from "./MaterialUsageForm";
import WorkOrderLifecycleControls from "./WorkOrderLifecycleControls";
import {
  addWorkPartDependency,
  assignPersonToWorkPart,
  assignWorkResourceToWorkPart,
  createWorkPart,
  ensureWork10OperationalTranslations,
  moveWorkPart,
  persistLegacyFirstWorkPart,
  removePersonFromWorkPart,
  removeWorkResourceFromWorkPart,
  removeWorkPartDependency,
  recordPersonLaborFact,
  recordWorkResourceUsageFact,
  updateWorkOrderPlanning,
  updateWorkOrderPriority,
  updateWorkPartStatus,
  voidPersonLaborFact,
  voidWorkPartUsageFact,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function Verk10DetailPage({ params }: Props) {
  const { id } = await params;
  const workOrderId = Number(id);

  if (!Number.isInteger(workOrderId)) {
    notFound();
  }

  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();

  const [work, userSettings, companyAccess, companyEmployees, companyResources, inventoryItems, inventoryLocations, gpsTrackSummary] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId },
      include: {
        createdBy: true,
        translations: true,
        workLogs: {
          include: { user: true },
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        },
        workParts: {
          include: {
            translations: true,
            predecessorDependencies: {
              select: { id: true, predecessorPartId: true, successorPartId: true, relationType: true },
            },
            successorDependencies: {
              select: { id: true, predecessorPartId: true, successorPartId: true, relationType: true },
            },
            assignments: {
              where: { removedAt: null },
              include: { employee: true, user: true, workResource: true },
              orderBy: { createdAt: "asc" },
            },
            laborFacts: {
              include: {
                employee: { include: { compensations: true } },
                user: true,
                voidedBy: true,
                translations: true,
              },
              orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
            },
            usageFacts: {
              include: {
                inventoryItem: { select: { id: true, sku: true, name: true } },
                inventoryLocation: { select: { id: true, code: true, name: true } },
                inventoryMovement: { select: { id: true, voidedAt: true, unitCost: true } },
                workResource: { select: { id: true, kind: true, code: true, name: true, baseUnit: true, customUnit: true, costRateIsk: true, saleRateIsk: true } },
                voidedBy: true,
              },
              orderBy: [{ usageDate: "desc" }, { createdAt: "desc" }],
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
    getCompanyAccess(companyId),
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, fullName: true, userId: true, jobTitle: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.workResource.findMany({
      where: { companyId, isActive: true },
      select: { id: true, kind: true, code: true, name: true, status: true, baseUnit: true, customUnit: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.inventoryItem.findMany({
      where: { companyId, isActive: true, isStockTracked: true },
      include: {
        movements: {
          where: { voidedAt: null },
          select: { locationId: true, quantityDelta: true },
        },
        commitments: {
          where: { status: "ACTIVE" },
          select: { locationId: true, quantity: true },
        },
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
    }),
    prisma.inventoryLocation.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.workTrackSession.aggregate({
      where: {
        companyId,
        workOrderId,
        pointCount: { gt: 0 },
      },
      _count: { _all: true },
      _sum: { pointCount: true, totalDistanceM: true },
    }),
  ]);

  if (!work) {
    notFound();
  }

  const language = userSettings?.interfaceLanguage ?? "is";
  const t = work10Text(language);
  const gps = workGpsText(language);
  const gpsSessionCount = gpsTrackSummary._count._all;
  const gpsPointCount = gpsTrackSummary._sum.pointCount ?? 0;
  const gpsDistanceM = gpsTrackSummary._sum.totalDistanceM ?? 0;
  const gpsDistanceText = gpsDistanceM >= 1_000
    ? `${work10FormatQuantity(gpsDistanceM / 1_000, language)} km`
    : `${work10FormatQuantity(gpsDistanceM, language)} m`;
  const effectiveWorkStatus = effectiveWork10Status(work.status, work.workParts);
  const workIsCompleted = isWork10EffectivelyCompleted(work.status, work.workParts);
  const workReadyToClose = isWork10ReadyToClose(work.status, work.workParts);
  const activeLaborCount = work.workParts.reduce(
    (sum, part) =>
      sum +
      part.laborFacts.filter(
        (fact) => fact.voidedAt === null && fact.startedAt !== null && fact.endedAt === null,
      ).length,
    0,
  );
  const inventoryT = inventoryText(language);
  const resourceT = workResourceText(language);
  const persistedOperationalText = projectPersistedWorkOrderText(work);
  const legacyOperationalText = projectLegacyOperationalText(work);
  const operationalText =
    work.translations.length > 0 ? persistedOperationalText : legacyOperationalText;
  const localizedTitle = resolveWork10LocalizedText(
    operationalText.title,
    language,
  )!;
  const localizedDescription = resolveWork10LocalizedText(
    operationalText.description,
    language,
  );
  const workParts = projectWorkPartsForDisplay(work, language);
  const hasPersistedWorkParts = work.workParts.length > 0;
  const hasCanonicalLaborFacts = work.workParts.some((part) =>
    part.laborFacts.some((fact) => fact.voidedAt === null),
  );
  const companyPeople = companyEmployees.map((employee) => ({
    id: employee.id,
    name: employee.fullName,
    userId: employee.userId,
    jobTitle: employee.jobTitle,
  }));
  const inventoryPickerItems = inventoryItems.map((item) => {
    const stockByLocation = new Map<number, number>();
    const committedByLocation = new Map<number, number>();
    for (const movement of item.movements) {
      stockByLocation.set(
        movement.locationId,
        (stockByLocation.get(movement.locationId) ?? 0) + movement.quantityDelta,
      );
    }
    for (const commitment of item.commitments) {
      committedByLocation.set(
        commitment.locationId,
        (committedByLocation.get(commitment.locationId) ?? 0) + commitment.quantity,
      );
    }
    const locations = inventoryLocations.map((location) => ({
      ...location,
      available: (stockByLocation.get(location.id) ?? 0) - (committedByLocation.get(location.id) ?? 0),
    }));
    return {
      id: item.id,
      sku: item.sku,
      barcode: item.barcode,
      name: item.name,
      baseUnit: item.baseUnit,
      customUnit: item.customUnit,
      totalStock: locations.reduce((sum, location) => sum + location.available, 0),
      locations,
    };
  });
  const displayPartByPersistedId = new Map(
    workParts
      .filter((part) => part.source.kind === "WORK_PART")
      .map((part) => [Number(part.source.sourceId), part]),
  );
  const persistedPartById = new Map(work.workParts.map((part) => [part.id, part]));
  const allDependencyEdges = work.workParts.flatMap((part) =>
    part.predecessorDependencies.map((dependency) => ({
      predecessorPartId: dependency.predecessorPartId,
      successorPartId: dependency.successorPartId,
    })),
  );
  const openPartCount = work.workParts.filter((part) => !isWork10PartTerminalStatus(part.status)).length;
  const completedPartCount = work.workParts.filter((part) => part.status === "COMPLETED").length;
  const unresolvedDependencyCount = work.workParts.reduce((total, part) => {
    const unresolved = part.successorDependencies.filter((dependency) => {
      const predecessor = persistedPartById.get(dependency.predecessorPartId);
      return !predecessor || !isWork10PartTerminalStatus(predecessor.status);
    });
    return total + unresolved.length;
  }, 0);

  const effectGroups = work.workParts.map((part) => ({
    partId: part.id,
    title: displayPartByPersistedId.get(part.id)?.title ?? part.title,
    effects: [
      ...deriveWork10LaborEffectCandidates(part.id, part.laborFacts),
      ...deriveWork10UsageEffectCandidates(part.id, part.usageFacts),
    ],
  }));

  return (
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/verk"
          className="font-medium text-blue-700 hover:underline"
        >
          ← {t.backToWork10}
        </Link>
      </div>

      <PageHeader title={localizedTitle.text} description={t.detailDescription} />

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{gps.managerOverview}</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">{gps.managerMapTitle}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{gps.managerMapHelp}</p>
            {gpsSessionCount > 0 ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                <span><strong className="text-slate-900">{gpsSessionCount}</strong> {gps.sessionsLabel.toLowerCase()}</span>
                <span><strong className="text-slate-900">{gpsPointCount}</strong> {gps.points}</span>
                <span><strong className="text-slate-900">{gpsDistanceText}</strong> {gps.totalDistance.toLowerCase()}</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{gps.managerNoSessions}</p>
            )}
          </div>
          <Link
            href={`/verk/${work.id}/kort`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {gps.managerOpenMap}
          </Link>
        </div>
      </Card>

      {(workReadyToClose || workIsCompleted) && (
        <Card>
          <div id="lifsferill" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.workLifecycleTitle}</p>
              <h2 className={`mt-1 text-lg font-bold ${workIsCompleted ? "text-emerald-900" : "text-amber-900"}`}>
                {workIsCompleted ? t.completedWorkTitle : t.readyToCloseTitle}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {workIsCompleted ? t.completedWorkHelp : t.readyToCloseHelp}
              </p>
              {!workIsCompleted && activeLaborCount > 0 ? (
                <p className="mt-2 text-sm font-semibold text-rose-700">{t.activeLaborBlocksClose}</p>
              ) : null}
            </div>

            {companyAccess.canWrite ? (
              workIsCompleted ? (
                <WorkOrderLifecycleControls
                  workOrderId={work.id}
                  mode="reopen"
                  actionLabel={t.reopenWorkAction}
                  confirmText={t.reopenWorkConfirm}
                />
              ) : (
                <WorkOrderLifecycleControls
                  workOrderId={work.id}
                  mode="complete"
                  actionLabel={t.completeWorkAction}
                  confirmText={t.completeWorkConfirm}
                  disabled={activeLaborCount > 0}
                />
              )
            ) : null}
          </div>
        </Card>
      )}

      {companyAccess.canWrite && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-bold">{t.operationalTranslationsTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t.operationalTranslationsHelp}
              </p>
            </div>
            <form action={ensureWork10OperationalTranslations} className="shrink-0">
              <input type="hidden" name="workOrderId" value={work.id} />
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t.operationalTranslationsAction}
              </button>
            </form>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <Card>
          <h2 className="text-lg font-bold">{t.currentFacts}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">{t.workNumber}</dt>
              <dd className="mt-1 font-semibold">#{work.workNumber ?? work.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.workKey}</dt>
              <dd className="mt-1 font-semibold text-slate-500">{work.workKey || t.unknown}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.status}</dt>
              <dd className="mt-1 font-semibold">
                {work10StatusText(effectiveWorkStatus, language)}
              </dd>
            </div>
            <div id="forgangur">
              <dt className="text-slate-500">{t.priority}</dt>
              {companyAccess.canWrite && !workIsCompleted ? (
                <form action={updateWorkOrderPriority} className="mt-2 space-y-2">
                  <input type="hidden" name="workOrderId" value={work.id} />
                  <div className="flex gap-2">
                    <select name="priority" defaultValue={work.priority} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
                      {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((priority) => (
                        <option key={priority} value={priority}>{work10PriorityText(priority, language)}</option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{t.savePriority}</button>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">{t.priorityAlertHelp}</p>
                </form>
              ) : (
                <dd className="mt-1 font-semibold">{work10PriorityText(work.priority, language)}</dd>
              )}
            </div>
            <div>
              <dt className="text-slate-500">{t.address}</dt>
              <dd className="mt-1 font-semibold">
                {work.address || t.unknown}
              </dd>
              {work.address ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(work.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  ⌖ {t.openDirections}
                </a>
              ) : null}
            </div>
            <div>
              <dt className="text-slate-500">{t.requiredPeople}</dt>
              <dd className="mt-1 font-semibold">{work.requiredPeople}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.estimatedTime}</dt>
              <dd className="mt-1 font-semibold">
                {work.estimatedMinutes ? work10FormatDuration(work.estimatedMinutes, language) : t.notRegistered}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.plannedDate}</dt>
              <dd className="mt-1 font-semibold">{work.plannedDate ? work10FormatDate(work.plannedDate, language) : t.notRegistered}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.plannedStartTime}</dt>
              <dd className="mt-1 font-semibold">
                {work.plannedStartMinutes !== null
                  ? (() => {
                      const start = work10ClockFromMinutes(work.plannedStartMinutes);
                      const end = work10ClockFromMinutes(work10PlannedEndMinutes(work.plannedStartMinutes, work.estimatedMinutes));
                      return end ? `${start}–${end}` : start;
                    })()
                  : work.plannedDate ? t.timeNotDecided : t.notRegistered}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.completionDeadline}</dt>
              <dd className="mt-1 font-semibold">
                {work.completionDeadlineDate && work.completionDeadlineMinutes !== null
                  ? `${work10FormatDate(work.completionDeadlineDate, language)} · ${work10ClockFromMinutes(work.completionDeadlineMinutes)}`
                  : t.notRegistered}
              </dd>
              {work.allowAfterWorkdayEnd ? (
                <p className="mt-1 text-xs font-semibold text-amber-700">{t.allowAfterWorkdayEnd}{work.workdayEndExceptionReason ? ` · ${work.workdayEndExceptionReason}` : ""}</p>
              ) : null}
            </div>
            <div>
              <dt className="text-slate-500">{t.descriptionLabel}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6">
                {localizedDescription?.text || t.unknown}
              </dd>
            </div>
          </dl>

          {companyAccess.canWrite && !workIsCompleted ? (
            <form action={updateWorkOrderPlanning} className="mt-5 space-y-3 border-t pt-4">
              <input type="hidden" name="workOrderId" value={work.id} />
              <div>
                <h3 className="font-bold text-slate-900">{t.planningTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t.planningHelp}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  {t.requiredPeople}
                  <input name="requiredPeople" type="number" min={1} max={100} defaultValue={work.requiredPeople} required className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" />
                </label>
                <div>
                  <span className="text-xs font-semibold text-slate-600">{t.estimatedTime}</span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-slate-500">{t.estimatedHours}<input name="estimatedHours" type="number" min={0} max={999} defaultValue={Math.floor((work.estimatedMinutes ?? 0) / 60)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" /></label>
                    <label className="text-[11px] text-slate-500">{t.estimatedMinutes}<input name="estimatedMinutePart" type="number" min={0} max={59} defaultValue={(work.estimatedMinutes ?? 0) % 60} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" /></label>
                  </div>
                </div>
                <IcelandicDateInput
                  name="plannedDate"
                  label={t.plannedDate}
                  defaultValue={work.plannedDate ? work.plannedDate.toISOString().slice(0, 10) : ""}
                  submitFormat="iso"
                  calendarButtonLabel={t.plannedDate}
                  labelClassName="text-xs font-semibold text-slate-600"
                  inputClassName="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                  buttonClassName="rounded-lg border bg-white px-3 py-2 hover:bg-slate-50"
                />
                <fieldset className="text-xs font-semibold text-slate-600">
                  <legend>{t.plannedStartTime}</legend>
                  <IcelandicTimeInput
                    hourName="plannedStartHour"
                    minuteName="plannedStartMinute"
                    defaultValue={work.plannedStartMinutes !== null ? work10ClockFromMinutes(work.plannedStartMinutes) ?? "" : ""}
                    pickerLabel={t.plannedStartTime}
                    hourLabel={t.estimatedHours}
                    minuteLabel={t.estimatedMinutes}
                    inputClassName="w-full rounded-l-lg border border-r-0 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                  <span className="mt-1 block font-normal text-slate-500">{t.plannedStartTimeHelp}</span>
                </fieldset>
                <IcelandicDateInput
                  name="completionDeadlineDate"
                  label={t.completionDeadlineDate}
                  defaultValue={work.completionDeadlineDate ? work.completionDeadlineDate.toISOString().slice(0, 10) : ""}
                  submitFormat="iso"
                  calendarButtonLabel={t.completionDeadlineDate}
                  labelClassName="text-xs font-semibold text-slate-600"
                  inputClassName="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                  buttonClassName="rounded-lg border bg-white px-3 py-2 hover:bg-slate-50"
                />
                <fieldset className="text-xs font-semibold text-slate-600">
                  <legend>{t.completionDeadlineTime}</legend>
                  <IcelandicTimeInput
                    hourName="completionDeadlineHour"
                    minuteName="completionDeadlineMinute"
                    defaultValue={work.completionDeadlineMinutes !== null ? work10ClockFromMinutes(work.completionDeadlineMinutes) ?? "" : ""}
                    pickerLabel={t.completionDeadlineTime}
                    hourLabel={t.estimatedHours}
                    minuteLabel={t.estimatedMinutes}
                    inputClassName="w-full rounded-l-lg border border-r-0 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </fieldset>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" name="allowAfterWorkdayEnd" defaultChecked={work.allowAfterWorkdayEnd} className="mt-0.5" />
                  <span>{t.allowAfterWorkdayEnd}</span>
                </label>
                <label className="mt-2 block text-xs font-semibold text-slate-600">
                  {t.workdayEndExceptionReason}
                  <input name="workdayEndExceptionReason" type="text" maxLength={500} defaultValue={work.workdayEndExceptionReason ?? ""} placeholder={t.workdayEndExceptionReasonPlaceholder} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" />
                </label>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{t.allowAfterWorkdayEndHelp}</p>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                {t.photoRequirement}
                <select name="photoRequirement" defaultValue={work.photoRequirement} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900">
                  <option value="NONE">{t.photoNone}</option>
                  <option value="START">{t.photoStart}</option>
                  <option value="PROGRESS">{t.photoProgress}</option>
                  <option value="PART_COMPLETE">{t.photoPartComplete}</option>
                  <option value="WORK_COMPLETE">{t.photoWorkComplete}</option>
                </select>
              </label>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{t.savePlanning}</button>
            </form>
          ) : null}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{t.workParts}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t.workPartsHelp}
                </p>
              </div>
              {hasPersistedWorkParts && (
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    {t.workflowOpenParts}: {openPartCount}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    {t.workflowCompletedParts}: {completedPartCount}
                  </span>
                  {unresolvedDependencyCount > 0 && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                      {t.workflowUnresolvedDependencies}: {unresolvedDependencyCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            {!hasPersistedWorkParts ? (
              <div className="mt-4 space-y-2">
                {workParts.map((part) => (
                  <div key={part.id} className="rounded-xl border bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{part.title}</p>
                        {part.description && (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">
                            {part.description}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          {t.partOrder}: {part.order} · {t.projectedFromCurrentWork}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {work10StatusText(part.status, language)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {work.workParts.map((part, partIndex) => {
                  const displayPart = displayPartByPersistedId.get(part.id);
                  const incomingDependencies = part.successorDependencies;
                  const incomingPredecessorIds = new Set(
                    incomingDependencies.map((dependency) => dependency.predecessorPartId),
                  );
                  const unresolvedDependencies = incomingDependencies.filter((dependency) => {
                    const predecessor = persistedPartById.get(dependency.predecessorPartId);
                    return !predecessor || !isWork10PartTerminalStatus(predecessor.status);
                  });
                  const predecessorOptions = work.workParts.filter(
                    (candidate) =>
                      candidate.id !== part.id &&
                      !incomingPredecessorIds.has(candidate.id) &&
                      !work10DependencyWouldCreateCycle(candidate.id, part.id, allDependencyEdges),
                  );

                  return (
                    <div id={`verkthattur-${part.id}`} key={part.id} className="scroll-mt-24 rounded-xl border bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {displayPart?.title ?? part.title}
                            </p>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {work10StatusText(part.status, language)}
                            </span>
                            {unresolvedDependencies.length > 0 && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                                {t.workflowBlockedByDependency}
                              </span>
                            )}
                          </div>
                          {displayPart?.description && (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">
                              {displayPart.description}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-slate-500">
                            {t.partOrder}: {part.sequence} · {t.persistedInNewCore}
                          </p>
                        </div>

                        {companyAccess.canWrite && (
                          <div className="flex gap-1">
                            <form action={moveWorkPart}>
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <input type="hidden" name="direction" value="UP" />
                              <button
                                type="submit"
                                disabled={partIndex === 0}
                                className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                ↑ {t.workflowMoveUp}
                              </button>
                            </form>
                            <form action={moveWorkPart}>
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <input type="hidden" name="direction" value="DOWN" />
                              <button
                                type="submit"
                                disabled={partIndex === work.workParts.length - 1}
                                className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                ↓ {t.workflowMoveDown}
                              </button>
                            </form>
                          </div>
                        )}
                      </div>

                      {companyAccess.canWrite && (
                        <form action={updateWorkPartStatus} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <input type="hidden" name="workOrderId" value={work.id} />
                          <input type="hidden" name="workPartId" value={part.id} />
                          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                            {t.workflowStatusLabel}
                            <select
                              key={`${part.id}:${part.status}`}
                              name="status"
                              defaultValue={part.status}
                              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal text-slate-900"
                            >
                              {WORK10_PART_STATUSES.map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={
                                    unresolvedDependencies.length > 0 &&
                                    work10StatusRequiresResolvedDependencies(status)
                                  }
                                >
                                  {work10StatusText(status, language)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="submit"
                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            {t.workflowSaveStatus}
                          </button>
                        </form>
                      )}

                      <div className="mt-4 rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {t.workflowDependencies}
                          </h3>
                          {part.predecessorDependencies.length > 0 && (
                            <span className="text-xs text-slate-500">
                              {t.workflowBlocks}: {part.predecessorDependencies.length}
                            </span>
                          )}
                        </div>

                        {incomingDependencies.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500">{t.workflowNoDependencies}</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {incomingDependencies.map((dependency) => {
                              const predecessor = persistedPartById.get(dependency.predecessorPartId);
                              const predecessorDisplay = predecessor
                                ? displayPartByPersistedId.get(predecessor.id)
                                : null;
                              const resolved = predecessor
                                ? isWork10PartTerminalStatus(predecessor.status)
                                : false;

                              return (
                                <div
                                  key={dependency.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                                >
                                  <div className="min-w-0 text-xs">
                                    <span className="font-semibold text-slate-800">
                                      {predecessorDisplay?.title ?? predecessor?.title ?? t.unknown}
                                    </span>
                                    <span className={resolved ? "ml-2 text-emerald-700" : "ml-2 text-amber-800"}>
                                      {resolved ? t.workflowDependencySatisfied : t.workflowDependencyPending}
                                    </span>
                                  </div>
                                  {companyAccess.canWrite && (
                                    <form action={removeWorkPartDependency}>
                                      <input type="hidden" name="workOrderId" value={work.id} />
                                      <input type="hidden" name="dependencyId" value={dependency.id} />
                                      <button
                                        type="submit"
                                        className="text-xs font-semibold text-slate-500 hover:text-rose-700"
                                      >
                                        {t.workflowRemoveDependency}
                                      </button>
                                    </form>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {companyAccess.canWrite && predecessorOptions.length > 0 && (
                          <form action={addWorkPartDependency} className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="successorPartId" value={part.id} />
                            <select
                              name="predecessorPartId"
                              required
                              defaultValue=""
                              className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                            >
                              <option value="" disabled>{t.workflowChoosePredecessor}</option>
                              {predecessorOptions.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {displayPartByPersistedId.get(candidate.id)?.title ?? candidate.title} · {work10StatusText(candidate.status, language)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              {t.workflowAddDependency}
                            </button>
                          </form>
                        )}
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {t.workflowDependencyHelp}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {companyAccess.canWrite && !hasPersistedWorkParts && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-semibold text-slate-900">{t.activateWorkPartsTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t.activateWorkPartsHelp}</p>
                <form action={persistLegacyFirstWorkPart} className="mt-3">
                  <input type="hidden" name="workOrderId" value={work.id} />
                  <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    {t.activateWorkPartsAction}
                  </button>
                </form>
              </div>
            )}

            {companyAccess.canWrite && hasPersistedWorkParts && (
              <div className="mt-4 rounded-xl border bg-white p-4">
                <h3 className="font-semibold text-slate-900">{t.addWorkPartTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t.addWorkPartHelp}</p>
                <form action={createWorkPart} className="mt-4 space-y-3">
                  <input type="hidden" name="workOrderId" value={work.id} />
                  <div>
                    <label htmlFor="workPartTitle" className="text-sm font-medium">{t.workPartTitleLabel}</label>
                    <input id="workPartTitle" name="title" required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder={t.workPartTitlePlaceholder} />
                  </div>
                  <div>
                    <label htmlFor="workPartDescription" className="text-sm font-medium">{t.workPartDescriptionLabel}</label>
                    <textarea id="workPartDescription" name="description" rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder={t.workPartDescriptionPlaceholder} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm font-medium">{t.requiredPeople}<input name="requiredPeople" type="number" min={1} max={100} defaultValue={1} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                    <div>
                      <span className="text-sm font-medium">{t.estimatedTime}</span>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <label className="text-xs text-slate-500">{t.estimatedHours}<input name="estimatedHours" type="number" min={0} max={999} defaultValue={0} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label>
                        <label className="text-xs text-slate-500">{t.estimatedMinutes}<input name="estimatedMinutePart" type="number" min={0} max={59} defaultValue={0} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label>
                      </div>
                    </div>
                    <label className="text-sm font-medium">{t.photoRequirement}
                      <select name="photoRequirement" defaultValue="INHERIT" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
                        <option value="INHERIT">{t.photoInherit}</option>
                        <option value="NONE">{t.photoNone}</option>
                        <option value="START">{t.photoStart}</option>
                        <option value="PROGRESS">{t.photoProgress}</option>
                        <option value="PART_COMPLETE">{t.photoPartComplete}</option>
                        <option value="WORK_COMPLETE">{t.photoWorkComplete}</option>
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    {t.addWorkPartAction}
                  </button>
                </form>
              </div>
            )}
          </Card>

          <Card>
            <div id="uthlutun" className="scroll-mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{t.assignments}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{t.assignmentsPersistentHelp}</p>
              </div>
              <Link href="/verk/tilfong" className="text-sm font-semibold text-blue-700 hover:underline">
                {resourceT.manageResources}
              </Link>
            </div>

            {!hasPersistedWorkParts ? (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-950">{t.assignmentNeedsPart}</p>
                {companyAccess.canWrite && !workIsCompleted && companyPeople.length > 0 ? (
                  <form action={persistLegacyFirstWorkPart} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="workOrderId" value={work.id} />
                    <select name="employeeId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                      <option value="" disabled>{t.choosePerson}</option>
                      {companyPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t.savePartAndAssign}</button>
                  </form>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {work.workParts.map((part) => {
                  const displayPart = displayPartByPersistedId.get(part.id);
                  const assignedEmployeeIds = new Set(
                    part.assignments.map((assignment) => assignment.employeeId).filter((employeeId): employeeId is number => employeeId !== null),
                  );
                  const assignedResourceIds = new Set(
                    part.assignments.map((assignment) => assignment.workResourceId).filter((resourceId): resourceId is number => resourceId !== null),
                  );
                  const availablePeople = companyPeople.filter((person) => !assignedEmployeeIds.has(person.id));
                  const assignableResources = companyResources.filter(
                    (resource) =>
                      !assignedResourceIds.has(resource.id) &&
                      (resource.status === "AVAILABLE" || resource.status === "IN_USE"),
                  );
                  const availableTeams = assignableResources.filter((resource) => resource.kind === "TEAM");
                  const availableContractors = assignableResources.filter((resource) => resource.kind === "CONTRACTOR");
                  const availableEquipment = assignableResources.filter((resource) =>
                    ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind),
                  );

                  return (
                    <div key={part.id} className="rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{displayPart?.title ?? part.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{t.partOrder}: {part.sequence}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{part.assignments.length}</span>
                      </div>

                      {part.assignments.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">{t.noAssignmentsOnPart}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {part.assignments.map((assignment) => {
                            const isPerson = assignment.resourceKind === "PERSON";
                            const label = isPerson
                              ? assignment.employee?.fullName ?? assignment.user?.name ?? assignment.resourceLabel ?? t.unknown
                              : assignment.workResource?.name ?? assignment.resourceLabel ?? t.unknown;
                            return (
                              <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-slate-900">{label}</span>
                                  {!isPerson ? (
                                    <span className="ml-2 text-xs text-slate-500">{workResourceKindText(assignment.resourceKind, language)}{assignment.workResource?.code ? ` · ${assignment.workResource.code}` : ""}{assignment.workResource?.status ? ` · ${workResourceStatusText(assignment.workResource.status, language)}` : ""}</span>
                                  ) : null}
                                </div>
                                {companyAccess.canWrite && (
                                  <form action={isPerson ? removePersonFromWorkPart : removeWorkResourceFromWorkPart}>
                                    <input type="hidden" name="workOrderId" value={work.id} />
                                    <input type="hidden" name="assignmentId" value={assignment.id} />
                                    <button type="submit" className="text-xs font-semibold text-slate-500 hover:text-rose-700">{t.removeAssignment}</button>
                                  </form>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {companyAccess.canWrite && (
                        <div className="mt-3 grid gap-2 lg:grid-cols-2">
                          {availablePeople.length > 0 && (
                            <div className="rounded-lg border border-blue-100 bg-white p-2 lg:col-span-2">
                              <p className="px-1 text-xs font-semibold text-blue-800">{t.assignPersonTitle}</p>
                              <form action={assignPersonToWorkPart} className="mt-2 flex min-w-0 gap-2">
                                <input type="hidden" name="workOrderId" value={work.id} />
                                <input type="hidden" name="workPartId" value={part.id} />
                                <select name="employeeId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                                  <option value="" disabled>{t.choosePerson}</option>
                                  {availablePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                                </select>
                                <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t.assignPersonAction}</button>
                              </form>
                            </div>
                          )}

                          {availableTeams.length > 0 && (
                            <form action={assignWorkResourceToWorkPart} className="flex min-w-0 gap-2">
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <select name="workResourceId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                                <option value="" disabled>{resourceT.chooseTeam}</option>
                                {availableTeams.map((resource) => (
                                  <option key={resource.id} value={resource.id}>{resource.name} · {resource.code}</option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">{resourceT.assignTeam}</button>
                            </form>
                          )}

                          {availableEquipment.length > 0 && (
                            <form action={assignWorkResourceToWorkPart} className="flex min-w-0 gap-2">
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <select name="workResourceId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                                <option value="" disabled>{resourceT.chooseResource}</option>
                                {availableEquipment.map((resource) => (
                                  <option key={resource.id} value={resource.id}>{workResourceKindText(resource.kind, language)} · {resource.name} · {resource.code}{resource.baseUnit ? ` · ${work10UnitText(resource.baseUnit, resource.customUnit, language)}` : ""}</option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">{resourceT.assignResource}</button>
                            </form>
                          )}

                          {availableContractors.length > 0 && (
                            <form action={assignWorkResourceToWorkPart} className="flex min-w-0 gap-2">
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <select name="workResourceId" required defaultValue="" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                                <option value="" disabled>{resourceT.chooseContractor}</option>
                                {availableContractors.map((resource) => (
                                  <option key={resource.id} value={resource.id}>{resource.name} · {resource.code}</option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">{resourceT.assignContractor}</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <p className="text-xs leading-5 text-slate-500">{t.assignmentHistoryHelp}</p>
              </div>
            )}
            </div>
          </Card>

          <Card>
            <h2 className="font-bold">{t.usage}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t.actualUsagePersistentHelp}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t.laborNotAssignmentHelp}
            </p>

            {!hasPersistedWorkParts ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                {t.assignmentNeedsPart}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {work.workParts.map((part) => {
                  const displayPart = displayPartByPersistedId.get(part.id);
                  const activeFacts = part.laborFacts.filter((fact) => !fact.voidedAt);
                  const voidedLaborFacts = part.laborFacts.filter((fact) => Boolean(fact.voidedAt));
                  const activeMaterialFacts = part.usageFacts.filter((fact) => !fact.voidedAt && fact.kind === "MATERIAL");
                  const voidedMaterialFacts = part.usageFacts.filter((fact) => Boolean(fact.voidedAt) && fact.kind === "MATERIAL");
                  const activeResourceFacts = part.usageFacts.filter((fact) => !fact.voidedAt && fact.kind !== "MATERIAL");
                  const voidedResourceFacts = part.usageFacts.filter((fact) => Boolean(fact.voidedAt) && fact.kind !== "MATERIAL");
                  const usableResources = companyResources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind));
                  const totalMinutes = activeFacts.reduce(
                    (sum, fact) => sum + fact.durationMinutes,
                    0,
                  );

                  return (
                    <div key={part.id} className="rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {displayPart?.title ?? part.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t.totalActual}: {work10FormatDuration(totalMinutes, language)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {activeFacts.length + activeMaterialFacts.length + activeResourceFacts.length}
                        </span>
                      </div>

                      <h3 className="mt-4 text-sm font-semibold text-slate-800">{t.laborSectionTitle}</h3>

                      {activeFacts.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">{t.noLaborFacts}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeFacts.map((fact) => (
                            <div key={fact.id} className="rounded-lg border bg-white px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-900">
                                    {fact.employee?.fullName ?? fact.user?.name ?? fact.resourceLabel ?? t.unknown}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {work10FormatDate(fact.workDate, language)} · {work10FormatDuration(fact.durationMinutes, language)} · {t.manualSource}
                                  </p>
                                  {(() => {
                                    const localizedNote = resolveLaborFactNote(fact, language);
                                    return localizedNote ? (
                                      <p className="mt-1 text-sm text-slate-600">
                                        {localizedNote.text}
                                      </p>
                                    ) : null;
                                  })()}
                                </div>
                                {companyAccess.canWrite && (
                                  <details className="shrink-0 text-right">
                                    <summary className="cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-rose-700">
                                      {workIsCompleted ? t.voidLaborFact : t.deleteFact}
                                    </summary>
                                    <div className="mt-2 w-72 rounded-xl border bg-white p-3 text-left shadow-lg">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {workIsCompleted ? t.voidFactQuestion : t.deleteFactQuestion}
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {workIsCompleted ? t.voidFactHelp : t.deleteFactHelp}
                                      </p>
                                      <form action={voidPersonLaborFact} className="mt-3 grid gap-2">
                                        <input type="hidden" name="workOrderId" value={work.id} />
                                        <input type="hidden" name="factId" value={fact.id} />
                                        {workIsCompleted ? (
                                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                                            <span>{t.correctionReason}</span>
                                            <textarea
                                              name="reason"
                                              required
                                              minLength={2}
                                              maxLength={500}
                                              rows={2}
                                              placeholder={t.correctionReasonPlaceholder}
                                              className="rounded-lg border px-2.5 py-2 text-sm"
                                            />
                                          </label>
                                        ) : null}
                                        <button
                                          type="submit"
                                          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                                        >
                                          {workIsCompleted ? t.confirmVoidFact : t.confirmDeleteFact}
                                        </button>
                                      </form>
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {voidedLaborFacts.length > 0 ? (
                        <details className="mt-3 rounded-lg border border-dashed bg-white px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                            {t.correctionHistory} ({voidedLaborFacts.length})
                          </summary>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{t.correctionHistoryHelp}</p>
                          <div className="mt-2 space-y-2">
                            {voidedLaborFacts.map((fact) => (
                              <div key={fact.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                <p className="font-semibold text-slate-800">
                                  {fact.employee?.fullName ?? fact.user?.name ?? fact.resourceLabel ?? t.unknown} · {t.voided}
                                </p>
                                <p className="mt-1">
                                  {work10FormatDate(fact.workDate, language)} · {work10FormatDuration(fact.durationMinutes, language)}
                                </p>
                                {fact.voidedAt ? (
                                  <p className="mt-1">
                                    {t.correctionBy}: {fact.voidedBy?.name ?? t.unknown} · {work10FormatDate(fact.voidedAt, language)}
                                  </p>
                                ) : null}
                                {fact.voidReason ? (
                                  <p className="mt-1">{t.correctionReasonLabel}: {fact.voidReason}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}

                      {companyAccess.canWrite && !workIsCompleted && (
                        <form action={recordPersonLaborFact} className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="workOrderId" value={work.id} />
                          <input type="hidden" name="workPartId" value={part.id} />
                          <select
                            name="employeeId"
                            required
                            defaultValue=""
                            className="rounded-lg border bg-white px-3 py-2 text-sm"
                          >
                            <option value="" disabled>{t.choosePerson}</option>
                            {companyPeople.map((person) => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            <span>{t.laborDate}</span>
                            <input
                              type="date"
                              name="workDate"
                              required
                              defaultValue={new Date().toISOString().slice(0, 10)}
                              aria-label={t.laborDate}
                              className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                              <span>{t.laborHours}</span>
                              <select
                                name="durationHours"
                                defaultValue="0"
                                aria-label={t.laborHours}
                                className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                              >
                                {Array.from({ length: 25 }, (_, hour) => (
                                  <option key={hour} value={hour}>{hour}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                              <span>{t.laborMinutePart}</span>
                              <select
                                name="durationMinutePart"
                                defaultValue="0"
                                aria-label={t.laborMinutePart}
                                className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                              >
                                {Array.from({ length: 60 }, (_, minute) => (
                                  <option key={minute} value={minute}>{minute}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <input
                            type="text"
                            name="note"
                            placeholder={t.laborNotePlaceholder}
                            aria-label={t.laborNote}
                            className="rounded-lg border bg-white px-3 py-2 text-sm"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:col-span-2"
                          >
                            {t.recordLaborAction}
                          </button>
                        </form>
                      )}


                      <div className="mt-4 border-t pt-4">
                        <h3 className="text-sm font-semibold text-slate-800">{resourceT.resourceUsage}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{resourceT.resourceUsageHelp}</p>

                        {activeResourceFacts.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">{resourceT.noResourceUsage}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {activeResourceFacts.map((fact) => (
                              <div key={fact.id} className="rounded-lg border bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900">
                                      {fact.resourceLabel}
                                      {fact.resourceCode ? <span className="ml-2 font-normal text-slate-500">{fact.resourceCode}</span> : null}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {fact.workResource ? `${workResourceKindText(fact.workResource.kind, language)} · ` : ""}
                                      {work10FormatDate(fact.usageDate, language)} · {work10FormatQuantity(fact.quantity, language)} {work10UnitText(fact.unit, fact.customUnit, language)} · {t.manualSource}
                                    </p>
                                    {fact.note ? <p className="mt-1 text-sm text-slate-600">{fact.note}</p> : null}
                                  </div>
                                  {companyAccess.canWrite && (
                                    <details className="shrink-0 text-right">
                                      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-rose-700">
                                        {workIsCompleted ? t.voidUsageFact : t.deleteFact}
                                      </summary>
                                      <div className="mt-2 w-72 rounded-xl border bg-white p-3 text-left shadow-lg">
                                        <p className="text-sm font-semibold text-slate-900">
                                          {workIsCompleted ? t.voidFactQuestion : t.deleteFactQuestion}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                          {workIsCompleted ? t.voidFactHelp : t.deleteFactHelp}
                                        </p>
                                        <form action={voidWorkPartUsageFact} className="mt-3 grid gap-2">
                                          <input type="hidden" name="workOrderId" value={work.id} />
                                          <input type="hidden" name="factId" value={fact.id} />
                                          {workIsCompleted ? (
                                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                                              <span>{t.correctionReason}</span>
                                              <textarea
                                                name="reason"
                                                required
                                                minLength={2}
                                                maxLength={500}
                                                rows={2}
                                                placeholder={t.correctionReasonPlaceholder}
                                                className="rounded-lg border px-2.5 py-2 text-sm"
                                              />
                                            </label>
                                          ) : null}
                                          <button
                                            type="submit"
                                            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                                          >
                                            {workIsCompleted ? t.confirmVoidFact : t.confirmDeleteFact}
                                          </button>
                                        </form>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {voidedResourceFacts.length > 0 ? (
                          <details className="mt-3 rounded-lg border border-dashed bg-white px-3 py-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600">{t.correctionHistory} ({voidedResourceFacts.length})</summary>
                            <div className="mt-2 space-y-2">
                              {voidedResourceFacts.map((fact) => (
                                <div key={fact.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  <p className="font-semibold text-slate-800">{fact.resourceLabel} · {t.voided}</p>
                                  <p className="mt-1">{work10FormatDate(fact.usageDate, language)} · {work10FormatQuantity(fact.quantity, language)} {work10UnitText(fact.unit, fact.customUnit, language)}</p>
                                  {fact.voidReason ? <p className="mt-1">{t.correctionReasonLabel}: {fact.voidReason}</p> : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}

                        {companyAccess.canWrite && !workIsCompleted && usableResources.length > 0 && (
                          <form action={recordWorkResourceUsageFact} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="workPartId" value={part.id} />
                            <select name="workResourceId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                              <option value="" disabled>{resourceT.chooseResource}</option>
                              {usableResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>{workResourceKindText(resource.kind, language)} · {resource.name} · {resource.code}{resource.baseUnit ? ` · ${work10UnitText(resource.baseUnit, resource.customUnit, language)}` : ""}</option>
                              ))}
                            </select>
                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                              <span>{resourceT.usageDate}</span>
                              <input type="date" name="usageDate" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                            </label>
                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                              <span>{resourceT.quantity}</span>
                              <input name="quantity" required inputMode="decimal" className="rounded-lg border bg-white px-3 py-2 text-sm" />
                            </label>
                            <input name="note" maxLength={1000} placeholder={resourceT.note} className="rounded-lg border bg-white px-3 py-2 text-sm lg:col-span-2" />
                            <button type="submit" className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 sm:col-span-2 lg:col-span-3">{resourceT.recordUsage}</button>
                          </form>
                        )}
                      </div>

                      <div className="mt-4 border-t pt-4">
                        <h3 className="text-sm font-semibold text-slate-800">{t.materialUsageTitle}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{t.materialUsageHelp}</p>

                        {activeMaterialFacts.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">{t.noMaterialFacts}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {activeMaterialFacts.map((fact) => (
                              <div key={fact.id} className="rounded-lg border bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900">
                                      {fact.resourceLabel}
                                      {fact.resourceCode ? (
                                        <span className="ml-2 font-normal text-slate-500">{fact.resourceCode}</span>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {work10FormatDate(fact.usageDate, language)} · {work10FormatQuantity(fact.quantity, language)} {work10UnitText(fact.unit, fact.customUnit, language)} · {t.manualSource}
                                      {fact.inventoryItem && fact.inventoryLocation
                                        ? ` · ${inventoryT.linkedToInventory} · ${fact.inventoryLocation.name}`
                                        : ` · ${inventoryT.freeTextMaterial}`}
                                    </p>
                                    {fact.note ? (
                                      <p className="mt-1 text-sm text-slate-600">{fact.note}</p>
                                    ) : null}
                                  </div>
                                  {companyAccess.canWrite && (
                                    <details className="shrink-0 text-right">
                                      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-rose-700">
                                        {workIsCompleted ? t.voidUsageFact : t.deleteFact}
                                      </summary>
                                      <div className="mt-2 w-72 rounded-xl border bg-white p-3 text-left shadow-lg">
                                        <p className="text-sm font-semibold text-slate-900">
                                          {workIsCompleted ? t.voidFactQuestion : t.deleteFactQuestion}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                          {workIsCompleted ? t.voidFactHelp : t.deleteFactHelp}
                                        </p>
                                        <form action={voidWorkPartUsageFact} className="mt-3 grid gap-2">
                                          <input type="hidden" name="workOrderId" value={work.id} />
                                          <input type="hidden" name="factId" value={fact.id} />
                                          {workIsCompleted ? (
                                            <label className="grid gap-1 text-xs font-medium text-slate-600">
                                              <span>{t.correctionReason}</span>
                                              <textarea
                                                name="reason"
                                                required
                                                minLength={2}
                                                maxLength={500}
                                                rows={2}
                                                placeholder={t.correctionReasonPlaceholder}
                                                className="rounded-lg border px-2.5 py-2 text-sm"
                                              />
                                            </label>
                                          ) : null}
                                          <button
                                            type="submit"
                                            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                                          >
                                            {workIsCompleted ? t.confirmVoidFact : t.confirmDeleteFact}
                                          </button>
                                        </form>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {voidedMaterialFacts.length > 0 ? (
                          <details className="mt-3 rounded-lg border border-dashed bg-white px-3 py-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                              {t.correctionHistory} ({voidedMaterialFacts.length})
                            </summary>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{t.correctionHistoryHelp}</p>
                            <div className="mt-2 space-y-2">
                              {voidedMaterialFacts.map((fact) => (
                                <div key={fact.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  <p className="font-semibold text-slate-800">
                                    {fact.resourceLabel}{fact.resourceCode ? ` ${fact.resourceCode}` : ""} · {t.voided}
                                  </p>
                                  <p className="mt-1">
                                    {work10FormatDate(fact.usageDate, language)} · {work10FormatQuantity(fact.quantity, language)} {work10UnitText(fact.unit, fact.customUnit, language)}
                                  </p>
                                  {fact.voidedAt ? (
                                    <p className="mt-1">
                                      {t.correctionBy}: {fact.voidedBy?.name ?? t.unknown} · {work10FormatDate(fact.voidedAt, language)}
                                    </p>
                                  ) : null}
                                  {fact.voidReason ? (
                                    <p className="mt-1">{t.correctionReasonLabel}: {fact.voidReason}</p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}

                        {companyAccess.canWrite && !workIsCompleted && (
                          <MaterialUsageForm
                            workOrderId={work.id}
                            workPartId={part.id}
                            language={language}
                            items={inventoryPickerItems}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-bold">{t.effects}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t.effectsHelp}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t.effectsDerivedHelp}
            </p>

            {!hasPersistedWorkParts ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                {t.notStoredYet}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {effectGroups.map((group) => (
                  <div key={group.partId} className="rounded-xl border bg-slate-50 p-3">
                    <p className="font-semibold text-slate-900">{group.title}</p>

                    {group.effects.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        {t.noEffectBasis}
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-2">
                        {group.effects.map((effect) => {
                          const isLabor = effect.sourceFactKind === "LABOR";
                          const isInventory = effect.kind === "MATERIAL_INVENTORY_BASIS";
                          const isCost = effect.kind === "LABOR_COST_BASIS" || effect.kind === "MATERIAL_COST_BASIS" || effect.kind === "RESOURCE_COST_BASIS";
                          const title =
                            effect.kind === "LABOR_COST_BASIS"
                              ? t.laborCostBasis
                              : effect.kind === "LABOR_SALES_BASIS"
                                ? t.laborSalesBasis
                                : effect.kind === "MATERIAL_INVENTORY_BASIS"
                                  ? t.materialInventoryBasis
                                  : effect.kind === "MATERIAL_COST_BASIS"
                                    ? t.materialCostBasis
                                    : effect.kind === "MATERIAL_SALES_BASIS"
                                      ? t.materialSalesBasis
                                      : effect.kind === "RESOURCE_COST_BASIS"
                                        ? t.resourceCostBasis
                                        : t.resourceSalesBasis;
                          const inventoryApplied = isInventory && effect.status === "APPLIED";
                          const laborRateReady = effect.kind === "LABOR_COST_BASIS" && effect.status === "RATE_READY";
                          const materialCostReady = effect.kind === "MATERIAL_COST_BASIS" && effect.status === "COST_READY";
                          const materialCostMissing = effect.kind === "MATERIAL_COST_BASIS" && effect.status === "COST_MISSING";
                          const resourceCostReady = effect.kind === "RESOURCE_COST_BASIS" && effect.status === "COST_READY";
                          const resourceCostMissing = effect.kind === "RESOURCE_COST_BASIS" && effect.status === "COST_MISSING";
                          const laborRateMissing =
                            effect.kind === "LABOR_COST_BASIS" &&
                            effect.status === "RULE_REQUIRED" &&
                            (effect.rateCoverage?.missingFactCount ?? 0) > 0;
                          const statusText = inventoryApplied
                            ? inventoryT.stockMoved
                            : laborRateReady
                              ? t.effectRateReady
                              : materialCostReady
                                ? t.effectMaterialCostReady
                                : resourceCostReady
                                  ? t.effectResourceCostReady
                                  : laborRateMissing
                                    ? t.effectInternalCostMissing
                                    : materialCostMissing
                                      ? t.effectMaterialCostMissing
                                      : resourceCostMissing
                                        ? t.effectResourceCostMissing
                                        : isInventory
                                          ? t.effectInventoryLinkMissing
                                          : t.effectRuleMissing;
                          const bottomText = inventoryApplied
                            ? inventoryT.movementFromWork
                            : isInventory
                              ? t.effectNotMovedFromInventory
                              : isCost
                                ? t.effectNotBooked
                                : t.effectNotInvoiced;

                          return (
                            <div
                              key={effect.id}
                              className="rounded-lg border bg-white px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {title}
                                </span>
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${inventoryApplied || laborRateReady || materialCostReady || resourceCostReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                                  {statusText}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">
                                {isLabor ? t.basedOnActualLabor : effect.kind.startsWith("RESOURCE_") ? t.basedOnResourceUsage : t.basedOnMaterialUsage}:{" "}
                                <span className="font-semibold">
                                  {isLabor
                                    ? work10FormatDuration(effect.quantity.value, language)
                                    : `${effect.resourceLabel ? `${effect.resourceLabel}: ` : ""}${work10FormatQuantity(effect.quantity.value, language)} ${work10UnitText(effect.quantity.unit, effect.quantity.customUnit, language)}`}
                                </span>
                              </p>
                              {laborRateReady && effect.amountIsk !== null && effect.amountIsk !== undefined && (
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {t.effectInternalCost}: {work10FormatCurrencyIsk(effect.amountIsk, language)}
                                </p>
                              )}
                              {materialCostReady && effect.amountIsk !== null && effect.amountIsk !== undefined && (
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {t.effectMaterialCost}: {work10FormatCurrencyIsk(effect.amountIsk, language)}
                                </p>
                              )}
                              {resourceCostReady && effect.amountIsk !== null && effect.amountIsk !== undefined && (
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {t.effectResourceCost}: {work10FormatCurrencyIsk(effect.amountIsk, language)}
                                </p>
                              )}
                              {materialCostMissing && (
                                <p className="mt-1 text-xs leading-5 text-amber-800">
                                  {t.effectMissingMaterialCostHelp}
                                </p>
                              )}
                              {resourceCostMissing && (
                                <p className="mt-1 text-xs leading-5 text-amber-800">
                                  {t.effectMissingResourceCostHelp}
                                </p>
                              )}
                              {laborRateMissing && effect.rateCoverage && (
                                <div className="mt-1 text-xs leading-5 text-amber-800">
                                  <p>
                                    {t.effectRateCoverage}: {effect.rateCoverage.resolvedFactCount} / {effect.rateCoverage.totalFactCount}
                                  </p>
                                  <p>{t.effectMissingInternalCostHelp}</p>
                                </div>
                              )}
                              <p className="mt-1 text-xs text-slate-500">{bottomText}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {!hasCanonicalLaborFacts && work.workLogs.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">{t.workHistory}</h2>
          <div className="mt-4 divide-y rounded-xl border">
            {work.workLogs.map((log) => (
              <div
                key={log.id}
                className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-semibold">{log.user?.name || t.unknown}</p>
                  {log.description && (
                    <p className="mt-1 text-slate-600">{log.description}</p>
                  )}
                </div>
                <div className="text-slate-500 md:text-right">
                  <p>{work10FormatDate(log.workDate, language)}</p>
                  <p>
                    {log.durationMinutes ?? 0} {t.minutesShort}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}
