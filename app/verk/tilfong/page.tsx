import Link from "next/link";

import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workResourceKindText, workResourceStatusText, workResourceText } from "@/lib/i18n/work-resources";
import { work10FormatCurrencyIsk, work10UnitText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import { WORK10_RESOURCE_KINDS, WORK10_RESOURCE_STATUSES, WORK10_RESOURCE_UNITS } from "@/lib/work10/resources";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import {
  addWorkResourceMember,
  addWorkResourceMeterReading,
  createWorkResource,
  removeWorkResourceMember,
  updateWorkResourceDetails,
  updateWorkResourceStatus,
} from "./actions";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function WorkResourcesPage() {
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();
  const [access, settings, resources, employees] = await Promise.all([
    getCompanyAccess(companyId),
    effectiveUser
      ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } })
      : Promise.resolve(null),
    prisma.workResource.findMany({
      where: { companyId },
      include: {
        members: {
          where: { removedAt: null },
          include: { employee: { select: { id: true, fullName: true, jobTitle: true } } },
          orderBy: { createdAt: "asc" },
        },
        meterReadings: { orderBy: { readingAt: "desc" }, take: 3 },
        assignments: { where: { removedAt: null }, select: { id: true } },
      },
      orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, fullName: true, jobTitle: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const language = settings?.interfaceLanguage ?? "is";
  const t = workResourceText(language);

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <PageHeader title={t.title} description={t.subtitle} />
      <div>
        <Link href="/verk" className="text-sm font-semibold text-blue-700 hover:underline">← {t.back}</Link>
      </div>

      {access.canWrite && (
        <Card>
          <h2 className="text-lg font-bold text-slate-950">{t.newResource}</h2>
          <form action={createWorkResource} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.kind}</span>
              <select name="kind" defaultValue="MACHINE" className="rounded-lg border bg-white px-3 py-2">
                {WORK10_RESOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{workResourceKindText(kind, language)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.code}</span>
              <input name="code" required maxLength={60} className="rounded-lg border px-3 py-2" placeholder="VEL-001" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              <span>{t.name}</span>
              <input name="name" required maxLength={160} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">
              <span>{t.description}</span>
              <textarea name="description" rows={2} maxLength={1000} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.baseUnit}</span>
              <select name="baseUnit" defaultValue="" className="rounded-lg border bg-white px-3 py-2">
                <option value="">{t.resourceDefaultUnit}</option>
                {WORK10_RESOURCE_UNITS.map((unit) => <option key={unit} value={unit}>{work10UnitText(unit, null, language)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.customUnit}</span>
              <input name="customUnit" maxLength={40} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.costRate}</span>
              <input name="costRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.saleRate}</span>
              <input name="saleRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>{t.meterUnit}</span>
              <input name="meterUnit" maxLength={40} className="rounded-lg border px-3 py-2" placeholder="HOUR / KM" />
            </label>
            <div className="flex items-end">
              <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700" type="submit">{t.create}</button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950">{t.resources}</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{resources.length}</span>
        </div>
        {resources.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t.noResources}</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {resources.map((resource) => {
              const memberIds = new Set(resource.members.map((member) => member.employeeId));
              const availableEmployees = employees.filter((employee) => !memberIds.has(employee.id));
              const latestReading = resource.meterReadings[0] ?? null;
              return (
                <article key={resource.id} className={`rounded-2xl border p-4 ${resource.isActive ? "bg-white" : "bg-slate-50 opacity-75"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{workResourceKindText(resource.kind, language)}</span>
                        <span className="text-xs font-semibold text-slate-400">{resource.code}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{resource.name}</h3>
                      {resource.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{resource.description}</p> : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{workResourceStatusText(resource.status, language)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.baseUnit}</div><div className="mt-1 font-semibold text-slate-900">{resource.baseUnit ? work10UnitText(resource.baseUnit, resource.customUnit, language) : "—"}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.activeAssignments}</div><div className="mt-1 font-semibold text-slate-900">{resource.assignments.length}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.costRate}</div><div className="mt-1 font-semibold text-slate-900">{resource.costRateIsk !== null ? work10FormatCurrencyIsk(resource.costRateIsk, language) : "—"}</div></div>
                    <div className="rounded-lg bg-slate-50 p-2"><div>{t.saleRate}</div><div className="mt-1 font-semibold text-slate-900">{resource.saleRateIsk !== null ? work10FormatCurrencyIsk(resource.saleRateIsk, language) : "—"}</div></div>
                  </div>

                  {access.canWrite && (
                    <details className="mt-3 rounded-xl border bg-slate-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t.editDetails}</summary>
                      <form action={updateWorkResourceDetails} className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.name}</span>
                          <input name="name" required maxLength={160} defaultValue={resource.name} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.description}</span>
                          <textarea name="description" rows={2} maxLength={1000} defaultValue={resource.description ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.baseUnit}</span>
                          <select name="baseUnit" defaultValue={resource.baseUnit ?? "HOUR"} className="rounded-lg border bg-white px-3 py-2 text-sm">
                            {WORK10_RESOURCE_UNITS.map((unit) => <option key={unit} value={unit}>{work10UnitText(unit, null, language)}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.customUnit}</span>
                          <input name="customUnit" maxLength={40} defaultValue={resource.customUnit ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.costRate}</span>
                          <input name="costRateIsk" inputMode="decimal" defaultValue={resource.costRateIsk ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          <span>{t.saleRate}</span>
                          <input name="saleRateIsk" inputMode="decimal" defaultValue={resource.saleRateIsk ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                          <span>{t.meterUnit}</span>
                          <input name="meterUnit" maxLength={40} defaultValue={resource.meterUnit ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
                        </label>
                        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t.historicalCostHelp}</p>
                        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:col-span-2">{t.saveDetails}</button>
                      </form>
                    </details>
                  )}

                  {access.canWrite && (
                    <form action={updateWorkResourceStatus} className="mt-3 flex gap-2">
                      <input type="hidden" name="resourceId" value={resource.id} />
                      <select name="status" defaultValue={resource.status} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm">
                        {WORK10_RESOURCE_STATUSES.map((status) => <option key={status} value={status}>{workResourceStatusText(status, language)}</option>)}
                      </select>
                      <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.updateStatus}</button>
                    </form>
                  )}

                  {resource.kind === "TEAM" && (
                    <div className="mt-4 border-t pt-4">
                      <h4 className="text-sm font-bold text-slate-900">{t.teamMembers}</h4>
                      {resource.members.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.noTeamMembers}</p> : (
                        <div className="mt-2 space-y-2">
                          {resource.members.map((member) => (
                            <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                              <span><strong>{member.employee.fullName}</strong>{member.roleLabel ? ` · ${member.roleLabel}` : member.employee.jobTitle ? ` · ${member.employee.jobTitle}` : ""}</span>
                              {access.canWrite && <form action={removeWorkResourceMember}><input type="hidden" name="memberId" value={member.id} /><button className="text-xs font-semibold text-rose-700" type="submit">{t.removeMember}</button></form>}
                            </div>
                          ))}
                        </div>
                      )}
                      {access.canWrite && availableEmployees.length > 0 && resource.isActive && (
                        <form action={addWorkResourceMember} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <select name="employeeId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                            <option value="" disabled>{t.chooseEmployee}</option>
                            {availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}{employee.jobTitle ? ` · ${employee.jobTitle}` : ""}</option>)}
                          </select>
                          <input name="roleLabel" maxLength={120} placeholder={t.roleLabel} className="rounded-lg border px-3 py-2 text-sm" />
                          <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.addMember}</button>
                        </form>
                      )}
                    </div>
                  )}

                  {["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind) && (
                    <div className="mt-4 border-t pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-slate-900">{t.meterReading}</h4>
                        {resource.qrToken ? <span className="text-xs font-semibold text-emerald-700">{t.qrReady}</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{t.latestMeter}: <strong>{latestReading ? `${latestReading.value} ${latestReading.unit}` : resource.meterValue !== null ? `${resource.meterValue} ${resource.meterUnit ?? ""}` : "—"}</strong></p>
                      {access.canWrite && resource.isActive && (
                        <form action={addWorkResourceMeterReading} className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{t.readingDate}</span><input type="date" name="readingAt" defaultValue={todayIso()} required className="rounded-lg border px-3 py-2 text-sm" /></label>
                          <label className="grid gap-1 text-xs font-medium text-slate-600"><span>{t.readingValue}</span><input name="value" inputMode="decimal" required className="rounded-lg border px-3 py-2 text-sm" /></label>
                          <input name="note" maxLength={500} placeholder={t.readingNote} className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
                          <button type="submit" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50 sm:col-span-2">{t.saveReading}</button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
