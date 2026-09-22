import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getCompanyAccess, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { employeeLocale, employeeText } from "@/lib/i18n/employees";
import { adminRoleLabel } from "@/lib/i18n/admin";
import { prisma } from "@/lib/prisma";
import { addEmployeeCompensation, addEmployeeQualification, setEmployeeActiveStatus, updateEmployee, updateEmployeeCompensation, updateEmployeeQualification } from "../actions";
import LocalDateInput from "./LocalDateInput";

type Props = { params: Promise<{ id: string }> };

function inputDate(value: Date | null | undefined) {
  if (!value) return "";
  return `${String(value.getUTCDate()).padStart(2, "0")}.${String(value.getUTCMonth() + 1).padStart(2, "0")}.${value.getUTCFullYear()}`;
}

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) notFound();

  const companyId = await requireActiveCompanyReadAccess();
  const [access, language] = await Promise.all([getCompanyAccess(companyId), getCurrentInterfaceLanguage()]);
  const canManage = access.role === "ADMIN" || access.role === "OWNER" || access.role === "MANAGER" || access.canManageCompanySettings;
  if (!canManage) redirect("/");
  const t = employeeText(language);
  const locale = employeeLocale(language);

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: {
      user: {
        include: {
          companies: { where: { companyId }, take: 1 },
        },
      },
      compensations: { orderBy: { validFrom: "desc" } },
      qualifications: { orderBy: [{ validUntil: "asc" }, { title: "asc" }] },
      staffingRoles: {
        where: { isActive: true },
        include: { staffingRole: true },
      },
      workScopes: {
        where: { isActive: true },
        include: { workScope: true },
      },
      departmentUnit: true,
      teamMemberships: {
        where: { isActive: true },
        include: { team: { include: { department: true } } },
      },
      workPartAssignments: { where: { removedAt: null, resourceKind: "PERSON" }, select: { id: true } },
      workPartLaborFacts: { where: { voidedAt: null }, select: { durationMinutes: true } },
      workDiaryEntries: { where: { voidedAt: null }, select: { durationMinutes: true } },
    },
  });
  if (!employee) notFound();

  const [workplaceProfiles, laborAgreementProfiles, shiftPatterns, staffingRoleOptions, workScopeOptions, departmentOptions, teamOptions] = await Promise.all([
    prisma.workplaceScheduleProfile.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.laborAgreementProfile.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.shiftPattern.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.staffingRole.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.workScope.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.companyDepartment.findMany({ where: { companyId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employeeTeam.findMany({ where: { companyId, isActive: true }, include: { department: true }, orderBy: [{ department: { name: "asc" } }, { name: "asc" }] }),
  ]);
  const selectedStaffingRoleIds = new Set(employee.staffingRoles.map((row) => row.staffingRoleId));
  const primaryStaffingRoleId = employee.staffingRoles.find((row) => row.isPrimary)?.staffingRoleId ?? null;
  const selectedWorkScopeIds = new Set(employee.workScopes.map((row) => row.workScopeId));
  const primaryWorkScopeId = employee.workScopes.find((row) => row.isPrimary)?.workScopeId ?? null;
  const selectedTeamIds = new Set(employee.teamMemberships.map((row) => row.teamId));
  const primaryTeamId = employee.teamMemberships.find((row) => row.isPrimary)?.teamId ?? null;

  const now = new Date();
  const currentCompensation = employee.compensations.find((row) => row.validFrom <= now && (!row.validTo || row.validTo >= now)) ?? employee.compensations[0] ?? null;
  const totalMinutes =
    employee.workPartLaborFacts.reduce((sum, row) => sum + row.durationMinutes, 0) +
    employee.workDiaryEntries.reduce((sum, row) => sum + row.durationMinutes, 0);
  const membership = employee.user?.companies[0] ?? null;

  const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "ISK", maximumFractionDigits: 0 }).format(value);
  const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const displayDate = (value: Date | null) => value ? inputDate(value) : "—";

  return (
    <main className="space-y-6">
      <div><Link href="/starfsmenn" className="text-sm font-semibold text-blue-700">← {t.back}</Link></div>
      <PageHeader title={employee.fullName} description={[employee.jobTitle, employee.departmentUnit?.name ?? employee.department, employee.employeeNumber].filter(Boolean).join(" · ") || t.title} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-slate-500">{t.assignments}</p><p className="mt-2 text-3xl font-bold">{employee.workPartAssignments.length}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.actualMinutes}</p><p className="mt-2 text-3xl font-bold">{new Intl.NumberFormat(locale).format(totalMinutes)} {t.minutesShort}</p></Card>
        <Card><p className="text-sm text-slate-500">{t.currentCompensation}</p><p className="mt-2 text-xl font-bold">{currentCompensation ? t.payTypes[currentCompensation.payType as keyof typeof t.payTypes] ?? currentCompensation.payType : "—"}</p></Card>
      </div>

      <form action={updateEmployee} className="grid gap-6 xl:grid-cols-2">
        <input type="hidden" name="employeeId" value={employee.id} />
        <Card>
          <h2 className="text-xl font-bold">{t.personal}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.fullName}</span><input name="fullName" required defaultValue={employee.fullName} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.employeeNumber}</span><input name="employeeNumber" defaultValue={employee.employeeNumber ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.kennitala}</span><input name="kennitala" defaultValue={employee.kennitala ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.phone}</span><input name="phone" defaultValue={employee.phone ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.email}</span><input name="email" type="email" defaultValue={employee.email ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.address}</span><input name="address" defaultValue={employee.address ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.postalCode}</span><input name="postalCode" defaultValue={employee.postalCode ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.city}</span><input name="city" defaultValue={employee.city ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.preferredLanguage}</span><select name="preferredLanguage" defaultValue={employee.preferredLanguage} className="rounded-lg border px-3 py-2"><option value="is">{t.languages.is}</option><option value="en">{t.languages.en}</option><option value="pl">{t.languages.pl}</option><option value="sr">{t.languages.sr}</option></select></label>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">{t.employment}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm"><span>{t.jobTitle}</span><input name="jobTitle" defaultValue={employee.jobTitle ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.department}</span><select name="departmentId" defaultValue={employee.departmentId ?? ""} className="rounded-lg border px-3 py-2"><option value="">{t.noDepartment}</option>{departmentOptions.filter((department) => department.unitType !== "DIVISION").map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><input type="hidden" name="department" value={employee.department ?? ""} /></label>
            <label className="grid gap-1 text-sm"><span>{t.employmentKind}</span><select name="employmentKind" defaultValue={employee.employmentKind} className="rounded-lg border px-3 py-2"><option value="EMPLOYEE">{t.kinds.EMPLOYEE}</option><option value="TEMPORARY">{t.kinds.TEMPORARY}</option><option value="APPRENTICE">{t.kinds.APPRENTICE}</option><option value="OTHER">{t.kinds.OTHER}</option></select></label>
            <label className="grid gap-1 text-sm"><span>{t.employmentPercent}</span><input name="employmentPercent" type="number" min="0" max="100" step="0.01" defaultValue={employee.employmentPercent ?? ""} className="rounded-lg border px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>{t.employmentStart}</span><LocalDateInput name="employmentStartDate" defaultValue={inputDate(employee.employmentStartDate)} placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} /></label>
            <label className="grid gap-1 text-sm"><span>{t.employmentEnd}</span><LocalDateInput name="employmentEndDate" defaultValue={inputDate(employee.employmentEndDate)} placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} /></label>
            <div className="sm:col-span-2 rounded-xl border bg-slate-50 p-3">
              <p className="text-sm font-semibold">{t.fixedTeams}</p><p className="mt-1 text-xs text-slate-500">{t.fixedTeamsHelp}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{teamOptions.map((team) => <label key={team.id} className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" name="teamIds" value={team.id} defaultChecked={selectedTeamIds.has(team.id)} className="mt-1" /><span><strong>{team.name}</strong><span className="block text-xs text-slate-500">{team.department.name}</span></span></label>)}</div>
              <label className="mt-3 grid gap-1 text-sm"><span>{t.primaryFixedTeam}</span><select name="primaryTeamId" defaultValue={primaryTeamId ?? ""} className="rounded-lg border bg-white px-3 py-2"><option value="">{t.noProfile}</option>{teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.department.name}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.notes}</span><textarea name="notes" defaultValue={employee.notes ?? ""} rows={4} className="rounded-lg border px-3 py-2" /></label>
            <div className="sm:col-span-2 rounded-xl border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{t.employmentStatus}</p>
                  <p className="mt-1 text-xs text-slate-500">{t.employmentStatusHelp}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${employee.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                  {employee.isActive ? t.active : t.inactive}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">{t.jobDescriptionTitle}</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span>{t.jobDescription}</span>
              <textarea name="jobDescription" defaultValue={employee.jobDescription ?? ""} rows={6} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.employmentContractReference}</span>
              <input name="employmentContractReference" defaultValue={employee.employmentContractReference ?? ""} className="rounded-lg border px-3 py-2" />
              <span className="text-xs leading-5 text-slate-500">{t.employmentContractReferenceHelp}</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.employmentContractNotes}</span>
              <textarea name="employmentContractNotes" defaultValue={employee.employmentContractNotes ?? ""} rows={4} className="rounded-lg border px-3 py-2" />
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">{t.workSchedule}</h2>
          <p className="mt-1 text-sm text-slate-600">{t.workScheduleHelp}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>{t.workScheduleType}</span>
              <select name="workScheduleType" defaultValue={employee.workScheduleType} className="rounded-lg border px-3 py-2">
                <option value="DAY">{t.workScheduleTypes.DAY}</option>
                <option value="DAY_FIXED_OVERTIME">{t.workScheduleTypes.DAY_FIXED_OVERTIME}</option>
                <option value="SHIFT">{t.workScheduleTypes.SHIFT}</option>
                <option value="ROLLING_SHIFT">{t.workScheduleTypes.ROLLING_SHIFT}</option>
                <option value="FLEXIBLE">{t.workScheduleTypes.FLEXIBLE}</option>
                <option value="OTHER">{t.workScheduleTypes.OTHER}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.workExecutionMode}</span>
              <select name="workExecutionMode" defaultValue={employee.workExecutionMode} className="rounded-lg border px-3 py-2">
                <option value="ASSIGNED">{t.workExecutionModes.ASSIGNED}</option>
                <option value="SELF_DIRECTED">{t.workExecutionModes.SELF_DIRECTED}</option>
                <option value="MIXED">{t.workExecutionModes.MIXED}</option>
              </select>
              <span className="text-xs leading-5 text-slate-500">{t.workExecutionModeHelp}</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.workplaceProfile}</span>
              <select name="workplaceScheduleProfileId" defaultValue={employee.workplaceScheduleProfileId ?? ""} className="rounded-lg border px-3 py-2">
                <option value="">{t.noProfile}</option>
                {workplaceProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.laborAgreement}</span>
              <select name="laborAgreementProfileId" defaultValue={employee.laborAgreementProfileId ?? ""} className="rounded-lg border px-3 py-2">
                <option value="">{t.noProfile}</option>
                {laborAgreementProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.shiftPattern}</span>
              <select name="shiftPatternId" defaultValue={employee.shiftPatternId ?? ""} className="rounded-lg border px-3 py-2">
                <option value="">{t.noProfile}</option>
                {shiftPatterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.contractedWeeklyMinutes}</span>
              <input name="contractedWeeklyHours" type="number" min="0" max="168" step="0.25" defaultValue={employee.contractedWeeklyMinutes === null ? "" : employee.contractedWeeklyMinutes / 60} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.fixedOvertimeMinutesPerWeek}</span>
              <input name="fixedOvertimeHoursPerWeek" type="number" min="0" max="168" step="0.25" defaultValue={employee.fixedOvertimeMinutesPerWeek === null ? "" : employee.fixedOvertimeMinutesPerWeek / 60} className="rounded-lg border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>{t.workScheduleNotes}</span>
              <textarea name="workScheduleNotes" defaultValue={employee.workScheduleNotes ?? ""} rows={3} className="rounded-lg border px-3 py-2" />
            </label>
          </div>
        </Card>


        <Card>
          <h2 className="text-xl font-bold">{t.workScopeTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{t.workScopeHelp}</p>
          {workScopeOptions.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed bg-slate-50 p-3 text-sm text-slate-500">{t.noWorkScopes}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {workScopeOptions.map((scope) => (
                  <label key={scope.id} className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                    <input type="checkbox" name="workScopeIds" value={scope.id} defaultChecked={selectedWorkScopeIds.has(scope.id)} className="mt-1" />
                    <span><strong>{scope.name}</strong><span className="mt-0.5 block text-xs font-mono text-slate-500">{scope.code}</span>{scope.description ? <span className="mt-0.5 block text-xs text-slate-500">{scope.description}</span> : null}</span>
                  </label>
                ))}
              </div>
              <label className="grid gap-1 text-sm">
                <span>{t.primaryWorkScope}</span>
                <select name="primaryWorkScopeId" defaultValue={primaryWorkScopeId ?? ""} className="rounded-lg border px-3 py-2">
                  <option value="">{t.noProfile}</option>
                  {workScopeOptions.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}
                </select>
              </label>
              <div className="rounded-xl border bg-amber-50 p-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-amber-950">{t.incidentalWorkMode}</span>
                  <select name="incidentalWorkMode" defaultValue={employee.incidentalWorkMode} className="rounded-lg border bg-white px-3 py-2">
                    <option value="NEVER">{t.incidentalWorkModes.NEVER}</option>
                    <option value="MANUAL_ONLY">{t.incidentalWorkModes.MANUAL_ONLY}</option>
                    <option value="AUTO_IF_NEEDED">{t.incidentalWorkModes.AUTO_IF_NEEDED}</option>
                  </select>
                  <span className="text-xs leading-5 text-amber-900">{t.incidentalWorkHelp}</span>
                </label>
                <label className="mt-3 grid gap-1 text-sm">
                  <span>{t.incidentalWorkNotes}</span>
                  <textarea name="incidentalWorkNotes" defaultValue={employee.incidentalWorkNotes ?? ""} rows={3} className="rounded-lg border bg-white px-3 py-2" />
                </label>
              </div>
              <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">{t.workScopeRightsHelp}</p>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold">{t.staffingAndCoverage}</h2><p className="mt-1 text-sm text-slate-600">{t.staffingAndCoverageHelp}</p></div>
            <Link href="/starfsmenn/monnun" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.manageStaffing}</Link>
          </div>
          {staffingRoleOptions.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed bg-slate-50 p-3 text-sm text-slate-500">{t.noStaffingRoles}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">{t.staffingRoles}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t.staffingRolesHelp}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {staffingRoleOptions.map((role) => (
                    <label key={role.id} className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                      <input type="checkbox" name="staffingRoleIds" value={role.id} defaultChecked={selectedStaffingRoleIds.has(role.id)} className="mt-1" />
                      <span><strong>{role.name}</strong>{role.description ? <span className="mt-0.5 block text-xs text-slate-500">{role.description}</span> : null}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="grid gap-1 text-sm">
                <span>{t.primaryStaffingRole}</span>
                <select name="primaryStaffingRoleId" defaultValue={primaryStaffingRoleId ?? ""} className="rounded-lg border px-3 py-2">
                  <option value="">{t.noProfile}</option>
                  {staffingRoleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </label>
              <p className="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-900">{t.minimumCoverageHelp}</p>
            </div>
          )}
        </Card>

        <div className="xl:col-span-2"><button type="submit" className="rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white">{t.save}</button></div>
      </form>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{t.employmentStatus}</h2>
            <p className="mt-1 text-sm text-slate-600">{employee.isActive ? t.activeEmploymentHelp : t.inactiveEmploymentHelp}</p>
          </div>
          {employee.isActive ? (
            <details className="rounded-xl border bg-amber-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-amber-900">{t.deactivateEmployment}</summary>
              <p className="mt-2 max-w-xl text-xs leading-5 text-amber-900">{t.deactivateEmploymentWarning}</p>
              <form action={setEmployeeActiveStatus} className="mt-3">
                <input type="hidden" name="employeeId" value={employee.id} />
                <input type="hidden" name="nextStatus" value="inactive" />
                <button type="submit" className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">{t.confirmDeactivateEmployment}</button>
              </form>
            </details>
          ) : (
            <form action={setEmployeeActiveStatus}>
              <input type="hidden" name="employeeId" value={employee.id} />
              <input type="hidden" name="nextStatus" value="active" />
              <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">{t.activateEmployment}</button>
            </form>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{t.payroll}</h2><p className="mt-1 text-sm text-slate-600">{t.sensitivePayroll}</p></div></div>
          {currentCompensation && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t.monthlySalary}</p><p className="mt-1 font-bold">{money(currentCompensation.monthlySalary)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t.hourlyRate}</p><p className="mt-1 font-bold">{money(currentCompensation.hourlyRate)}</p></div>
              <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">{t.internalCostPerMinute}</p><p className="mt-1 font-bold text-blue-950">{currentCompensation.internalCostPerMinute === null ? "—" : `${number(currentCompensation.internalCostPerMinute)} kr./${t.minutesShort}`}</p></div>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">{t.internalCostHelp}</p>

          <details className="mt-5 rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newCompensation}</summary>
            <form action={addEmployeeCompensation} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="employeeId" value={employee.id} />
              <label className="grid gap-1 text-sm"><span>{t.validFrom}</span><LocalDateInput name="validFrom" required placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} /></label>
              <label className="grid gap-1 text-sm"><span>{t.payType}</span><select name="payType" defaultValue="MONTHLY" className="rounded-lg border bg-white px-3 py-2"><option value="MONTHLY">{t.payTypes.MONTHLY}</option><option value="HOURLY">{t.payTypes.HOURLY}</option><option value="MIXED">{t.payTypes.MIXED}</option></select></label>
              <label className="grid gap-1 text-sm"><span>{t.monthlySalary}</span><input type="number" min="0" step="1" name="monthlySalary" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.hourlyRate}</span><input type="number" min="0" step="0.01" name="hourlyRate" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.internalCostPerMinute}</span><input type="number" min="0" step="0.01" name="internalCostPerMinute" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.notes}</span><input name="notes" className="rounded-lg border bg-white px-3 py-2" /></label>
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white sm:col-span-2">{t.addCompensation}</button>
            </form>
          </details>

          <h3 className="mt-5 font-bold">{t.compensationHistory}</h3>
          {employee.compensations.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.noCompensation}</p> : (
            <div className="mt-2 space-y-2">
              {employee.compensations.map((row) => (
                <details key={row.id} className="rounded-xl border bg-white p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{displayDate(row.validFrom)} → {displayDate(row.validTo)}</p>
                        <p className="mt-1 text-xs text-slate-500">{t.payTypes[row.payType as keyof typeof t.payTypes] ?? row.payType}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>{t.internalCostPerMinute}: <strong>{row.internalCostPerMinute === null ? "—" : `${number(row.internalCostPerMinute)} kr./${t.minutesShort}`}</strong></p>
                        <p className="mt-1 text-xs font-semibold text-blue-700">{t.editCompensation} ↓</p>
                      </div>
                    </div>
                  </summary>

                  <form action={updateEmployeeCompensation} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <input type="hidden" name="compensationId" value={row.id} />
                    <label className="grid gap-1 text-sm">
                      <span>{t.validFrom}</span>
                      <LocalDateInput name="validFrom" required defaultValue={inputDate(row.validFrom)} placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} />
                    </label>
                    <div className="grid gap-1 text-sm">
                      <span>{t.validTo}</span>
                      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-700">{displayDate(row.validTo)}</div>
                    </div>
                    <label className="grid gap-1 text-sm">
                      <span>{t.payType}</span>
                      <select name="payType" defaultValue={row.payType} className="rounded-lg border bg-white px-3 py-2">
                        <option value="MONTHLY">{t.payTypes.MONTHLY}</option>
                        <option value="HOURLY">{t.payTypes.HOURLY}</option>
                        <option value="MIXED">{t.payTypes.MIXED}</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>{t.monthlySalary}</span>
                      <input type="number" min="0" step="1" name="monthlySalary" defaultValue={row.monthlySalary ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>{t.hourlyRate}</span>
                      <input type="number" min="0" step="0.01" name="hourlyRate" defaultValue={row.hourlyRate ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>{t.internalCostPerMinute}</span>
                      <input type="number" min="0" step="0.01" name="internalCostPerMinute" defaultValue={row.internalCostPerMinute ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                    </label>
                    <label className="grid gap-1 text-sm sm:col-span-2">
                      <span>{t.notes}</span>
                      <input name="notes" defaultValue={row.notes ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                    </label>
                    <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t.compensationValidityHelp}</p>
                    <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveCompensation}</button>
                  </form>
                </details>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-xl font-bold">{t.qualifications}</h2>
          {employee.qualifications.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t.noQualifications}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {employee.qualifications.map((item) => {
                const expired = item.validUntil ? item.validUntil < now : false;
                const soonLimit = new Date(now);
                soonLimit.setDate(soonLimit.getDate() + 60);
                const soon = item.validUntil ? !expired && item.validUntil <= soonLimit : false;
                return (
                  <details key={item.id} className="rounded-xl border bg-white p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t.qualificationTypes[item.qualificationType as keyof typeof t.qualificationTypes] ?? item.qualificationType}
                            {item.issuer ? ` · ${item.issuer}` : ""}
                            {item.certificateNumber ? ` · ${item.certificateNumber}` : ""}
                          </p>
                          {item.qualificationCodes && (
                            <p className="mt-1 text-sm font-semibold text-slate-700">{t.qualificationCodes}: {item.qualificationCodes}</p>
                          )}
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${expired ? "bg-rose-50 text-rose-700" : soon ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {expired ? t.expired : soon ? t.expiresSoon : t.valid}
                        </span>
                      </div>
                      {item.validUntil && <p className="mt-2 text-sm text-slate-600">{t.validUntil}: {displayDate(item.validUntil)}</p>}
                      {item.notes && <p className="mt-1 text-sm text-slate-600">{item.notes}</p>}
                      <p className="mt-2 text-xs font-semibold text-blue-700">{t.editQualification} ↓</p>
                    </summary>

                    <form action={updateEmployeeQualification} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                      <input type="hidden" name="employeeId" value={employee.id} />
                      <input type="hidden" name="qualificationId" value={item.id} />
                      <label className="grid gap-1 text-sm">
                        <span>{t.qualificationType}</span>
                        <select name="qualificationType" defaultValue={item.qualificationType} className="rounded-lg border bg-white px-3 py-2">
                          <option value="EDUCATION">{t.qualificationTypes.EDUCATION}</option><option value="DRIVING_LICENSE">{t.qualificationTypes.DRIVING_LICENSE}</option>
                          <option value="MACHINE">{t.qualificationTypes.MACHINE}</option>
                          <option value="CERTIFICATION">{t.qualificationTypes.CERTIFICATION}</option>
                          <option value="TRAINING">{t.qualificationTypes.TRAINING}</option>
                          <option value="OTHER">{t.qualificationTypes.OTHER}</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>{t.qualificationTitle}</span>
                        <input name="title" required defaultValue={item.title} className="rounded-lg border bg-white px-3 py-2" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>{t.issuer}</span>
                        <input name="issuer" defaultValue={item.issuer ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>{t.certificateNumber}</span>
                        <input name="certificateNumber" defaultValue={item.certificateNumber ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                      </label>
                      <label className="grid gap-1 text-sm sm:col-span-2">
                        <span>{t.qualificationCodes}</span>
                        <input name="qualificationCodes" defaultValue={item.qualificationCodes ?? ""} placeholder="B, BE, C, CE" className="rounded-lg border bg-white px-3 py-2" />
                        <span className="text-xs leading-5 text-slate-500">{t.qualificationCodesHelp}</span>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>{t.validFrom}</span>
                        <LocalDateInput name="validFrom" defaultValue={inputDate(item.validFrom)} placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>{t.validUntil}</span>
                        <LocalDateInput name="validUntil" defaultValue={inputDate(item.validUntil)} placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} />
                      </label>
                      <label className="grid gap-1 text-sm sm:col-span-2">
                        <span>{t.qualificationNotes}</span>
                        <input name="notes" defaultValue={item.notes ?? ""} className="rounded-lg border bg-white px-3 py-2" />
                      </label>
                      <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveQualification}</button>
                    </form>
                  </details>
                );
              })}
            </div>
          )}

          <details className="mt-5 rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.addQualification}</summary>
            <form action={addEmployeeQualification} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="employeeId" value={employee.id} />
              <label className="grid gap-1 text-sm">
                <span>{t.qualificationType}</span>
                <select name="qualificationType" className="rounded-lg border bg-white px-3 py-2">
                  <option value="EDUCATION">{t.qualificationTypes.EDUCATION}</option><option value="DRIVING_LICENSE">{t.qualificationTypes.DRIVING_LICENSE}</option>
                  <option value="MACHINE">{t.qualificationTypes.MACHINE}</option>
                  <option value="CERTIFICATION">{t.qualificationTypes.CERTIFICATION}</option>
                  <option value="TRAINING">{t.qualificationTypes.TRAINING}</option>
                  <option value="OTHER">{t.qualificationTypes.OTHER}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.qualificationTitle}</span>
                <input name="title" required className="rounded-lg border bg-white px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.issuer}</span>
                <input name="issuer" className="rounded-lg border bg-white px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.certificateNumber}</span>
                <input name="certificateNumber" className="rounded-lg border bg-white px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>{t.qualificationCodes}</span>
                <input name="qualificationCodes" placeholder="B, BE, C, CE" className="rounded-lg border bg-white px-3 py-2" />
                <span className="text-xs leading-5 text-slate-500">{t.qualificationCodesHelp}</span>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.validFrom}</span>
                <LocalDateInput name="validFrom" placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.validUntil}</span>
                <LocalDateInput name="validUntil" placeholder={t.datePlaceholder} calendarLabel={t.openCalendar} />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>{t.qualificationNotes}</span>
                <input name="notes" className="rounded-lg border bg-white px-3 py-2" />
              </label>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveQualification}</button>
            </form>
          </details>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">{t.systemAccess}</h2>
          {employee.user ? <div className="mt-3 space-y-2 text-sm"><p><span className="text-slate-500">{t.loginLinked}:</span> <strong>{employee.user.email}</strong></p><p><span className="text-slate-500">{t.accessRole}:</span> <strong>{membership?.accessRole ? adminRoleLabel(membership.accessRole, language) : "—"}</strong></p></div> : <p className="mt-3 text-sm text-slate-500">{t.noLoginLinked}</p>}
        </Card>
        <Card>
          <h2 className="text-xl font-bold">{t.workConnection}</h2>
          <p className="mt-2 text-sm text-slate-600">{t.workHelp}</p>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t.assignments}</p><p className="mt-1 text-2xl font-bold">{employee.workPartAssignments.length}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t.actualMinutes}</p><p className="mt-1 text-2xl font-bold">{new Intl.NumberFormat(locale).format(totalMinutes)} {t.minutesShort}</p></div></div>
          <Link href="/verk" className="mt-4 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50">{t.workLabel} →</Link>
        </Card>
      </div>
    </main>
  );
}
