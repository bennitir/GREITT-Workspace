import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCompanyAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";
import { inventoryText } from "@/lib/i18n/inventory";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
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
import { resolveLaborFactNote } from "@/lib/work10/labor-text";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import MaterialUsageForm from "./MaterialUsageForm";
import {
  assignPersonToWorkPart,
  createWorkPart,
  ensureWork10OperationalTranslations,
  persistLegacyFirstWorkPart,
  removePersonFromWorkPart,
  recordPersonLaborFact,
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

  const [work, userSettings, companyAccess, companyEmployees, inventoryItems, inventoryLocations] = await Promise.all([
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
            assignments: {
              where: { removedAt: null, resourceKind: "PERSON" },
              include: { employee: true, user: true },
              orderBy: { createdAt: "asc" },
            },
            laborFacts: {
              include: {
                employee: { include: { compensations: true } },
                user: true,
                translations: true,
              },
              orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
            },
            usageFacts: {
              where: { kind: "MATERIAL" },
              include: {
                inventoryItem: { select: { id: true, sku: true, name: true } },
                inventoryLocation: { select: { id: true, code: true, name: true } },
                inventoryMovement: { select: { id: true, voidedAt: true } },
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
    prisma.inventoryItem.findMany({
      where: { companyId, isActive: true },
      include: {
        movements: {
          where: { voidedAt: null },
          select: { locationId: true, quantityDelta: true },
        },
      },
      orderBy: [{ name: "asc" }, { sku: "asc" }],
    }),
    prisma.inventoryLocation.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  if (!work) {
    notFound();
  }

  const language = userSettings?.interfaceLanguage ?? "is";
  const t = work10Text(language);
  const inventoryT = inventoryText(language);
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
  const companyPeople = companyEmployees.map((employee) => ({
    id: employee.id,
    name: employee.fullName,
    userId: employee.userId,
    jobTitle: employee.jobTitle,
  }));
  const inventoryPickerItems = inventoryItems.map((item) => {
    const byLocation = new Map<number, number>();
    for (const movement of item.movements) {
      byLocation.set(
        movement.locationId,
        (byLocation.get(movement.locationId) ?? 0) + movement.quantityDelta,
      );
    }
    const locations = inventoryLocations.map((location) => ({
      ...location,
      available: byLocation.get(location.id) ?? 0,
    }));
    return {
      id: item.id,
      sku: item.sku,
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
        <span className="text-slate-300">|</span>
        <Link
          href={`/verk/${work.id}`}
          className="font-medium text-slate-600 hover:underline"
        >
          {t.compareCurrent}
        </Link>
      </div>

      <PageHeader title={localizedTitle.text} description={t.detailDescription} />

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
              <dd className="mt-1 font-semibold">#{work.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.workKey}</dt>
              <dd className="mt-1 font-semibold text-slate-500">{t.unknown}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.status}</dt>
              <dd className="mt-1 font-semibold">
                {work10StatusText(work.status, language)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.priority}</dt>
              <dd className="mt-1 font-semibold">
                {work10PriorityText(work.priority, language)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.address}</dt>
              <dd className="mt-1 font-semibold">
                {work.address || t.unknown}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t.descriptionLabel}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6">
                {localizedDescription?.text || t.unknown}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-bold">{t.workParts}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t.workPartsHelp}
            </p>
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
                        {t.partOrder}: {part.order} ·{" "}
                        {part.persistedInWork10
                          ? t.persistedInNewCore
                          : t.projectedFromCurrentWork}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {work10StatusText(part.status, language)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {companyAccess.canWrite && !hasPersistedWorkParts && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-semibold text-slate-900">
                  {t.activateWorkPartsTitle}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t.activateWorkPartsHelp}
                </p>
                <form action={persistLegacyFirstWorkPart} className="mt-3">
                  <input type="hidden" name="workOrderId" value={work.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {t.activateWorkPartsAction}
                  </button>
                </form>
              </div>
            )}

            {companyAccess.canWrite && hasPersistedWorkParts && (
              <div className="mt-4 rounded-xl border bg-white p-4">
                <h3 className="font-semibold text-slate-900">
                  {t.addWorkPartTitle}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t.addWorkPartHelp}
                </p>
                <form action={createWorkPart} className="mt-4 space-y-3">
                  <input type="hidden" name="workOrderId" value={work.id} />
                  <div>
                    <label htmlFor="workPartTitle" className="text-sm font-medium">
                      {t.workPartTitleLabel}
                    </label>
                    <input
                      id="workPartTitle"
                      name="title"
                      required
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder={t.workPartTitlePlaceholder}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="workPartDescription"
                      className="text-sm font-medium"
                    >
                      {t.workPartDescriptionLabel}
                    </label>
                    <textarea
                      id="workPartDescription"
                      name="description"
                      rows={3}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder={t.workPartDescriptionPlaceholder}
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {t.addWorkPartAction}
                  </button>
                </form>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-bold">{t.assignments}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t.assignmentsPersistentHelp}
            </p>

            {!hasPersistedWorkParts ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                {t.assignmentNeedsPart}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {work.workParts.map((part) => {
                  const displayPart = displayPartByPersistedId.get(part.id);
                  const assignedEmployeeIds = new Set(
                    part.assignments
                      .map((assignment) => assignment.employeeId)
                      .filter((employeeId): employeeId is number => employeeId !== null),
                  );
                  const availablePeople = companyPeople.filter(
                    (person) => !assignedEmployeeIds.has(person.id),
                  );

                  return (
                    <div key={part.id} className="rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {displayPart?.title ?? part.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t.partOrder}: {part.sequence}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {part.assignments.length}
                        </span>
                      </div>

                      {part.assignments.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                          {t.noAssignmentsOnPart}
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {part.assignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
                            >
                              <span className="text-sm font-medium text-slate-900">
                                {assignment.employee?.fullName ?? assignment.user?.name ?? assignment.resourceLabel ?? t.unknown}
                              </span>
                              {companyAccess.canWrite && (
                                <form action={removePersonFromWorkPart}>
                                  <input type="hidden" name="workOrderId" value={work.id} />
                                  <input type="hidden" name="assignmentId" value={assignment.id} />
                                  <button
                                    type="submit"
                                    className="text-xs font-semibold text-slate-500 hover:text-rose-700"
                                  >
                                    {t.removeAssignment}
                                  </button>
                                </form>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {companyAccess.canWrite && availablePeople.length > 0 && (
                        <form action={assignPersonToWorkPart} className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input type="hidden" name="workOrderId" value={work.id} />
                          <input type="hidden" name="workPartId" value={part.id} />
                          <select
                            name="employeeId"
                            required
                            defaultValue=""
                            className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                          >
                            <option value="" disabled>
                              {t.choosePerson}
                            </option>
                            {availablePeople.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            {t.assignPersonAction}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}

                <p className="text-xs leading-5 text-slate-500">
                  {t.assignmentHistoryHelp}
                </p>
              </div>
            )}
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
                  const activeMaterialFacts = part.usageFacts.filter((fact) => !fact.voidedAt);
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
                          {activeFacts.length + activeMaterialFacts.length}
                        </span>
                      </div>

                      <h3 className="mt-4 text-sm font-semibold text-slate-800">{t.laborSectionTitle}</h3>

                      {part.laborFacts.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">{t.noLaborFacts}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {part.laborFacts.map((fact) => {
                            const isVoided = Boolean(fact.voidedAt);
                            return (
                              <div
                                key={fact.id}
                                className={`rounded-lg border bg-white px-3 py-2 ${isVoided ? "opacity-50" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900">
                                      {fact.employee?.fullName ?? fact.user?.name ?? fact.resourceLabel ?? t.unknown}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {work10FormatDate(fact.workDate, language)} · {work10FormatDuration(fact.durationMinutes, language)} · {t.manualSource}
                                      {isVoided ? ` · ${t.voided}` : ""}
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
                                  {companyAccess.canWrite && !isVoided && (
                                    <form action={voidPersonLaborFact}>
                                      <input type="hidden" name="workOrderId" value={work.id} />
                                      <input type="hidden" name="factId" value={fact.id} />
                                      <button
                                        type="submit"
                                        className="text-xs font-semibold text-slate-500 hover:text-rose-700"
                                      >
                                        {t.voidLaborFact}
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {companyAccess.canWrite && (
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
                        <h3 className="text-sm font-semibold text-slate-800">{t.materialUsageTitle}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{t.materialUsageHelp}</p>

                        {part.usageFacts.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">{t.noMaterialFacts}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {part.usageFacts.map((fact) => {
                              const isVoided = Boolean(fact.voidedAt);
                              return (
                                <div
                                  key={fact.id}
                                  className={`rounded-lg border bg-white px-3 py-2 ${isVoided ? "opacity-50" : ""}`}
                                >
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
                                        {isVoided ? ` · ${t.voided}` : ""}
                                      </p>
                                      {fact.note ? (
                                        <p className="mt-1 text-sm text-slate-600">{fact.note}</p>
                                      ) : null}
                                    </div>
                                    {companyAccess.canWrite && !isVoided && (
                                      <form action={voidWorkPartUsageFact}>
                                        <input type="hidden" name="workOrderId" value={work.id} />
                                        <input type="hidden" name="factId" value={fact.id} />
                                        <button
                                          type="submit"
                                          className="text-xs font-semibold text-slate-500 hover:text-rose-700"
                                        >
                                          {t.voidUsageFact}
                                        </button>
                                      </form>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {companyAccess.canWrite && (
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
                          const isCost = effect.kind === "LABOR_COST_BASIS" || effect.kind === "MATERIAL_COST_BASIS";
                          const title =
                            effect.kind === "LABOR_COST_BASIS"
                              ? t.laborCostBasis
                              : effect.kind === "LABOR_SALES_BASIS"
                                ? t.laborSalesBasis
                                : effect.kind === "MATERIAL_INVENTORY_BASIS"
                                  ? t.materialInventoryBasis
                                  : effect.kind === "MATERIAL_COST_BASIS"
                                    ? t.materialCostBasis
                                    : t.materialSalesBasis;
                          const inventoryApplied = isInventory && effect.status === "APPLIED";
                          const laborRateReady = effect.kind === "LABOR_COST_BASIS" && effect.status === "RATE_READY";
                          const statusText = inventoryApplied
                            ? inventoryT.stockMoved
                            : laborRateReady
                              ? t.effectRateReady
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
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${inventoryApplied || laborRateReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                                  {statusText}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">
                                {isLabor ? t.basedOnActualLabor : t.basedOnMaterialUsage}:{" "}
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

      <Card>
        <h2 className="text-lg font-bold">{t.workHistory}</h2>
        {work.workLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t.noLogs}</p>
        ) : (
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
        )}
      </Card>
    </main>
  );
}
