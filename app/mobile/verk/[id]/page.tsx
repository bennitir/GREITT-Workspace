import Link from "next/link";

import MobileOperationalTranslationSync from "@/components/MobileOperationalTranslationSync";
import MobileWorkStartDialog from "@/components/work/MobileWorkStartDialog";
import { notFound } from "next/navigation";

import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import { workResourceKindText, workResourceStatusText } from "@/lib/i18n/work-resources";
import {
  work10FormatDuration,
  work10FormatQuantity,
  work10PriorityText,
  work10StatusText,
  work10UnitText,
} from "@/lib/i18n/work10";
import { workMobileText } from "@/lib/i18n/work-mobile";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { prisma } from "@/lib/prisma";
import { projectWorkPartsForDisplay } from "@/lib/work10/display-parts";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import { deriveWork10Status } from "@/lib/work10/status";
import { normalizeWorkStartContext } from "@/lib/work10/work-start-requirements";
import {
  isWork10PartTerminalStatus,
  work10UnresolvedPredecessorIds,
} from "@/lib/work10/workflow";
import {
  completeMobileWorkPart,
  pauseMobileWorkPart,
  recordMobileMaterialUsage,
  recordMobileMeterReading,
  recordMobileResourceUsage,
  recordMobileWorkEvidencePhoto,
  stopMobileWorkPart,
} from "../actions";

type Props = {
  params: Promise<{ id: string }>;
};

function localeFor(language: string) {
  if (language === "is") return "is-IS";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "en-GB";
}

function formatTime(value: Date, language: string) {
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export default async function MobileWorkDetailPage({ params }: Props) {
  const { id } = await params;
  const workOrderId = Number(id);
  if (!Number.isInteger(workOrderId)) notFound();

  const actor = await getMobileWorkActor();
  const t = workMobileText(actor.language);
  const ops = workResourceOperationsText(actor.language);
  const moduleSettings = await getCompanyModuleSettings(actor.companyId);
  const inventoryEnabled = isCompanyModuleEnabled("birgdir", moduleSettings);

  const [work, inventoryItems, inventoryLocations] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id: workOrderId, companyId: actor.companyId },
      include: {
        translations: true,
        workKeyRecord: {
          select: {
            startRules: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              select: { kind: true, required: true, config: true },
            },
          },
        },
        evidencePhotos: {
          orderBy: { createdAt: "desc" },
          take: 40,
        },
        workParts: {
          include: {
            translations: true,
            predecessorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
            successorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
            evidencePhotos: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            assignments: {
              where: { removedAt: null },
              include: {
                employee: { select: { id: true, fullName: true } },
                workResource: {
                  select: {
                    id: true,
                    kind: true,
                    code: true,
                    name: true,
                    status: true,
                    baseUnit: true,
                    customUnit: true,
                    meterUnit: true,
                    meterValue: true,
                    qrToken: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            laborFacts: {
              where: { employeeId: actor.employee?.id ?? -1, voidedAt: null },
              orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
              take: 12,
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
    }),
    inventoryEnabled
      ? prisma.inventoryItem.findMany({
          where: { companyId: actor.companyId, isActive: true, isStockTracked: true },
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
        })
      : Promise.resolve([]),
    inventoryEnabled
      ? prisma.inventoryLocation.findMany({
          where: { companyId: actor.companyId, isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: [{ name: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  if (!work) notFound();

  const operationalText = projectPersistedWorkOrderText(work);
  const localizedTitle = resolveWork10LocalizedText(operationalText.title, actor.language)?.text ?? work.title;
  const localizedDescription = resolveWork10LocalizedText(operationalText.description, actor.language)?.text ?? work.description;
  const displayParts = projectWorkPartsForDisplay(work, actor.language);
  const displayById = new Map(
    displayParts
      .filter((part) => part.source.kind === "WORK_PART")
      .map((part) => [Number(part.source.sourceId), part]),
  );
  const persistedById = new Map(work.workParts.map((part) => [part.id, part]));
  const dependencies = work.workParts.flatMap((part) =>
    part.predecessorDependencies.map((dependency) => ({
      predecessorPartId: dependency.predecessorPartId,
      successorPartId: dependency.successorPartId,
    })),
  );
  const effectiveStatus = deriveWork10Status(work.status, work.workParts);

  const stockByItemAndLocation = new Map<string, number>();
  for (const item of inventoryItems) {
    for (const movement of item.movements) {
      const key = `${item.id}:${movement.locationId}`;
      stockByItemAndLocation.set(key, (stockByItemAndLocation.get(key) ?? 0) + movement.quantityDelta);
    }
    for (const commitment of item.commitments) {
      const key = `${item.id}:${commitment.locationId}`;
      stockByItemAndLocation.set(key, (stockByItemAndLocation.get(key) ?? 0) - commitment.quantity);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <MobileOperationalTranslationSync workOrderId={work.id} />
        <Link
          href="/mobile/verk"
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm"
        >
          ← {t.title}
        </Link>

        <header className="mt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-950">{localizedTitle}</h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {t.workNumber}: {work.workNumber || `#${work.id}`}
                {work.workKey ? ` · ${t.workKey}: ${work.workKey}` : ""}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {work10StatusText(effectiveStatus, actor.language)}
            </span>
          </div>

          {localizedDescription ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{localizedDescription}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 text-slate-600">
              <div>{t.priority}</div>
              <div className="mt-1 font-semibold text-slate-900">{work10PriorityText(work.priority, actor.language)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-600">
              <div>{t.requiredPeople}</div>
              <div className="mt-1 font-semibold text-slate-900">{work.requiredPeople}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-600">
              <div>{t.estimatedTime}</div>
              <div className="mt-1 font-semibold text-slate-900">{work.estimatedMinutes ? work10FormatDuration(work.estimatedMinutes, actor.language) : t.notRegistered}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-600">
              <div>{t.address}</div>
              <div className="mt-1 font-semibold text-slate-900">{work.address || "—"}</div>
            </div>
          </div>
          {work.address ? (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(work.address)}`} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800">
              ⌖ {t.openDirections}
            </a>
          ) : null}
        </header>

        {work.workParts.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            {t.legacyPart}
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-950">{t.workParts}</h2>

            {work.workParts.map((part) => {
              const display = displayById.get(part.id);
              const title = display?.title ?? part.title;
              const description = display?.description ?? part.description;
              const blockers = work10UnresolvedPredecessorIds(part.id, work.workParts, dependencies);
              const blockerNames = blockers.map((blockerId) => displayById.get(blockerId)?.title ?? persistedById.get(blockerId)?.title ?? `#${blockerId}`);
              const directAssigned = part.assignments.some(
                (assignment) =>
                  (actor.employee && assignment.employeeId === actor.employee.id) ||
                  assignment.userId === actor.user.id,
              );
              const teamAssigned = part.assignments.some(
                (assignment) =>
                  assignment.resourceKind === "TEAM" &&
                  assignment.workResourceId !== null &&
                  actor.teamResourceIds.includes(assignment.workResourceId),
              );
              const ownFacts = actor.employee && Array.isArray(part.laborFacts) ? part.laborFacts : [];
              const activeFact = ownFacts.find((fact) => fact.startedAt && !fact.endedAt) ?? null;
              const ownCompletedMinutes = ownFacts.reduce((sum, fact) => sum + (fact.endedAt ? fact.durationMinutes : 0), 0);
              const assignedResources = part.assignments
                .map((assignment) => assignment.workResource)
                .filter((resource): resource is NonNullable<typeof resource> => Boolean(resource));
              const measurableResources = assignedResources.filter((resource) => resource.kind !== "TEAM");
              const meterResources = assignedResources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind));
              const terminal = isWork10PartTerminalStatus(part.status);
              const openPartIds = work.workParts.filter((item) => !isWork10PartTerminalStatus(item.status)).map((item) => item.id);
              const isLastOpenPart = openPartIds.length === 1 && openPartIds[0] === part.id;
              const effectivePhotoRequirement = part.photoRequirement === "INHERIT" ? work.photoRequirement : part.photoRequirement;
              const requiredPhotoStage =
                effectivePhotoRequirement === "START" ? "START" :
                effectivePhotoRequirement === "PROGRESS" ? "PROGRESS" :
                effectivePhotoRequirement === "PART_COMPLETE" ? "PART_COMPLETE" :
                effectivePhotoRequirement === "WORK_COMPLETE" ? "WORK_COMPLETE" :
                null;
              const requiredPhotoExists = requiredPhotoStage === "WORK_COMPLETE"
                ? work.evidencePhotos.some((photo) => photo.stage === "WORK_COMPLETE")
                : requiredPhotoStage
                  ? part.evidencePhotos.some((photo) => photo.stage === requiredPhotoStage)
                  : true;
              const photoStageLabel =
                requiredPhotoStage === "START" ? t.photoStageStart :
                requiredPhotoStage === "PROGRESS" ? t.photoStageProgress :
                requiredPhotoStage === "PART_COMPLETE" ? t.photoStagePartComplete :
                requiredPhotoStage === "WORK_COMPLETE" ? t.photoStageWorkComplete :
                null;
              const startPhotoBlocks = requiredPhotoStage === "START" && !requiredPhotoExists;
              const completionPhotoBlocks =
                (["START", "PROGRESS", "PART_COMPLETE"].includes(requiredPhotoStage ?? "") ||
                  (requiredPhotoStage === "WORK_COMPLETE" && isLastOpenPart)) &&
                !requiredPhotoExists;
              const showPhotoRequirementCard = requiredPhotoStage !== null &&
                (requiredPhotoStage !== "WORK_COMPLETE" || isLastOpenPart);

              return (
                <article key={part.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
                      {description ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{description}</p> : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {work10StatusText(part.status, actor.language)}
                    </span>
                  </div>

                  {(directAssigned || teamAssigned) ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      {directAssigned ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{t.assignedToYou}</span> : null}
                      {teamAssigned ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{t.assignedToTeam}</span> : null}
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">{t.requiredPeople}</span><strong className="mt-1 block text-slate-900">{part.requiredPeople}</strong></div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">{t.estimatedTime}</span><strong className="mt-1 block text-slate-900">{part.estimatedMinutes ? work10FormatDuration(part.estimatedMinutes, actor.language) : t.notRegistered}</strong></div>
                  </div>

                  {showPhotoRequirementCard ? (
                    <div className={`mt-3 rounded-xl border p-3 ${requiredPhotoExists ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-bold ${requiredPhotoExists ? "text-emerald-900" : "text-amber-900"}`}>{requiredPhotoExists ? t.photoRequirementMet : t.requiredPhoto}</p>
                          <p className={`mt-1 text-xs ${requiredPhotoExists ? "text-emerald-800" : "text-amber-800"}`}>{photoStageLabel}</p>
                        </div>
                        <span className="text-lg">{requiredPhotoExists ? "✓" : "📷"}</span>
                      </div>
                      {!requiredPhotoExists && actor.employee && !terminal ? (
                        <form action={recordMobileWorkEvidencePhoto} className="mt-3 grid gap-2">
                          <input type="hidden" name="workOrderId" value={work.id} />
                          <input type="hidden" name="workPartId" value={part.id} />
                          <input type="hidden" name="stage" value={requiredPhotoStage} />
                          <label className="grid gap-1 text-xs font-semibold text-slate-700">
                            <span>{t.takeRequiredPhoto}</span>
                            <input type="file" name="photo" accept="image/*" capture="environment" required className="rounded-lg border bg-white px-3 py-2 text-sm" />
                          </label>
                          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">{t.savePhoto}</button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

                  {blockers.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">{t.dependencyPending}</p>
                      <p className="mt-1 text-xs">{t.blockedBy}: {blockerNames.join(" · ")}</p>
                    </div>
                  ) : !terminal ? (
                    <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{t.dependencyReady}</div>
                  ) : null}

                  {actor.employee ? (
                    <div className="mt-4">
                      {activeFact ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <p className="text-sm font-bold text-emerald-900">{t.activeNow}</p>
                          <p className="mt-1 text-xs text-emerald-800">{t.activeSince}: {formatTime(activeFact.startedAt!, actor.language)}</p>
                          {(() => {
                            const context = normalizeWorkStartContext(activeFact.startContext);
                            if (!context) return null;
                            const parts = [
                              context.gpsAcknowledgedAt ? t.startContextGps : null,
                              context.chainCount !== null ? `${t.chainCount}: ${context.chainCount}` : null,
                              context.startPhoto ? t.startContextPhoto : null,
                            ].filter(Boolean);
                            return parts.length > 0 ? <p className="mt-2 text-xs font-semibold text-emerald-900">{parts.join(" · ")}</p> : null;
                          })()}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <form action={stopMobileWorkPart}>
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <button type="submit" className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-3 text-sm font-bold text-emerald-900">{t.stopWork}</button>
                            </form>
                            <form action={pauseMobileWorkPart}>
                              <input type="hidden" name="workOrderId" value={work.id} />
                              <input type="hidden" name="workPartId" value={part.id} />
                              <button type="submit" className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-900">{t.pauseWork}</button>
                            </form>
                          </div>
                          <form action={completeMobileWorkPart} className="mt-2">
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="workPartId" value={part.id} />
                            <button type="submit" disabled={blockers.length > 0 || completionPhotoBlocks} className="w-full rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t.completePart}</button>
                          </form>
                        </div>
                      ) : !terminal ? (
                        <div className="grid gap-2">
                          <MobileWorkStartDialog
                            workOrderId={work.id}
                            workPartId={part.id}
                            language={actor.language}
                            rules={work.workKeyRecord?.startRules ?? []}
                            disabled={blockers.length > 0 || part.status === "BLOCKED" || startPhotoBlocks}
                          />
                          <form action={completeMobileWorkPart}>
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="workPartId" value={part.id} />
                            <button type="submit" disabled={blockers.length > 0 || part.status === "BLOCKED" || completionPhotoBlocks} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{t.completePart}</button>
                          </form>
                        </div>
                      ) : null}

                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                        <span className="text-slate-500">{t.ownTimeToday}</span>
                        <span className="ml-2 font-bold text-slate-900">{work10FormatDuration(ownCompletedMinutes, actor.language)}</span>
                      </div>
                    </div>
                  ) : null}

                  {assignedResources.length > 0 ? (
                    <div className="mt-4 border-t pt-4">
                      <h4 className="text-sm font-bold text-slate-900">{t.assignedResources}</h4>
                      <div className="mt-2 space-y-2">
                        {assignedResources.map((resource) => (
                          <div key={resource.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900">{resource.name}</p>
                                <p className="mt-1 text-xs text-slate-500">{workResourceKindText(resource.kind, actor.language)} · {resource.code}</p>
                                {resource.qrToken ? <Link href={`/mobile/verk/tilfong/${resource.qrToken}`} className="mt-2 inline-block text-xs font-bold text-blue-700">{ops.openResource} →</Link> : null}
                              </div>
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{workResourceStatusText(resource.status, actor.language)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {actor.employee && measurableResources.length > 0 && !terminal ? (
                    <details className="mt-4 rounded-xl border bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-slate-800">{t.resourceUsage}</summary>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{t.resourceUsageHelp}</p>
                      <div className="mt-3 space-y-3">
                        {measurableResources.map((resource) => (
                          <form key={resource.id} action={recordMobileResourceUsage} className="rounded-xl bg-white p-3">
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="workPartId" value={part.id} />
                            <input type="hidden" name="workResourceId" value={resource.id} />
                            <p className="font-semibold text-slate-900">{resource.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{work10UnitText(resource.baseUnit || "PCS", resource.customUnit, actor.language)}</p>
                            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                              <input name="quantity" inputMode="decimal" required placeholder={t.quantity} className="min-w-0 rounded-lg border bg-white px-3 py-2 text-sm" />
                              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{t.recordUsage}</button>
                            </div>
                            <input name="note" maxLength={1000} placeholder={t.note} className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                          </form>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  {actor.employee && meterResources.length > 0 && !terminal ? (
                    <details className="mt-3 rounded-xl border bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-slate-800">{t.meterReading}</summary>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{t.meterHelp}</p>
                      <div className="mt-3 space-y-3">
                        {meterResources.map((resource) => (
                          <form key={resource.id} action={recordMobileMeterReading} className="rounded-xl bg-white p-3">
                            <input type="hidden" name="workOrderId" value={work.id} />
                            <input type="hidden" name="workPartId" value={part.id} />
                            <input type="hidden" name="workResourceId" value={resource.id} />
                            <p className="font-semibold text-slate-900">{resource.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{t.latestMeter}: {resource.meterValue !== null ? `${work10FormatQuantity(resource.meterValue, actor.language)} ${resource.meterUnit || resource.baseUnit || ""}` : "—"}</p>
                            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                              <input name="value" inputMode="decimal" required placeholder={t.meterValue} className="min-w-0 rounded-lg border bg-white px-3 py-2 text-sm" />
                              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">{t.recordMeter}</button>
                            </div>
                            <input name="note" maxLength={500} placeholder={t.note} className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                            <label className="mt-2 grid gap-2 text-xs font-semibold text-slate-600">
                              <span>{ops.meterPhoto}</span>
                              <span className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 active:bg-blue-100">
                                📷 {ops.takeMeterPhoto}
                              </span>
                              <input type="file" name="photo" accept="image/*" capture="environment" className="sr-only" />
                              <span className="font-normal leading-5 text-slate-500">{ops.meterPhotoHelp}</span>
                            </label>
                          </form>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  {actor.employee && inventoryEnabled && inventoryItems.length > 0 && inventoryLocations.length > 0 && !terminal ? (
                    <details className="mt-3 rounded-xl border bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-slate-800">{t.materialUsage}</summary>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{t.materialHelp}</p>
                      <form action={recordMobileMaterialUsage} className="mt-3 grid gap-2">
                        <input type="hidden" name="workOrderId" value={work.id} />
                        <input type="hidden" name="workPartId" value={part.id} />
                        <label className="grid gap-1 text-xs font-semibold text-slate-600">
                          <span>{t.item}</span>
                          <select name="inventoryItemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                            <option value="" disabled>—</option>
                            {inventoryItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-slate-600">
                          <span>{t.location}</span>
                          <select name="inventoryLocationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                            <option value="" disabled>—</option>
                            {inventoryLocations.map((location) => (
                              <option key={location.id} value={location.id}>{location.name} · {location.code}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-slate-600">
                          <span>{t.quantity}</span>
                          <input name="quantity" required inputMode="decimal" className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <input name="note" maxLength={1000} placeholder={t.note} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-3 text-sm font-bold text-white">{t.recordMaterial}</button>
                      </form>
                      <div className="mt-3 text-[11px] leading-5 text-slate-500">
                        {inventoryItems.slice(0, 8).map((item) => {
                          const available = inventoryLocations.reduce(
                            (sum, location) => sum + (stockByItemAndLocation.get(`${item.id}:${location.id}`) ?? 0),
                            0,
                          );
                          return <div key={item.id}>{item.name}: {work10FormatQuantity(available, actor.language)} {work10UnitText(item.baseUnit, item.customUnit, actor.language)}</div>;
                        })}
                      </div>
                    </details>
                  ) : actor.employee && inventoryEnabled && !terminal ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{t.noInventory}</p>
                  ) : null}

                  {actor.employee ? (
                    <details className="mt-3 rounded-xl border bg-white p-3">
                      <summary className="cursor-pointer text-sm font-bold text-slate-800">{t.ownHistory}</summary>
                      {ownFacts.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">{t.noHistory}</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {ownFacts.map((fact) => (
                            <div key={fact.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <div>
                                <span className="font-semibold">{fact.startedAt ? formatTime(fact.startedAt, actor.language) : "—"}</span>
                                <span> · </span>
                                <span>{fact.endedAt ? work10FormatDuration(fact.durationMinutes, actor.language) : t.activeNow}</span>
                              </div>
                              {(() => {
                                const context = normalizeWorkStartContext(fact.startContext);
                                if (!context) return null;
                                const parts = [
                                  context.gpsAcknowledgedAt ? t.startContextGps : null,
                                  context.chainCount !== null ? `${t.chainCount}: ${context.chainCount}` : null,
                                  context.startPhoto ? t.startContextPhoto : null,
                                ].filter(Boolean);
                                return parts.length > 0 ? <div className="mt-1 font-semibold text-blue-800">{parts.join(" · ")}</div> : null;
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
