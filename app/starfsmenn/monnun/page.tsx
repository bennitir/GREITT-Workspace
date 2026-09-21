import Link from "next/link";
import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { getCompanyAccess, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { employeeStaffingText } from "@/lib/i18n/employee-staffing";
import { prisma } from "@/lib/prisma";
import { addCoverageRule, addShiftPatternSlot, createCoverageProfile, createDepartment, createEmployeeTeam, createShiftPattern, createStaffingRole, createWorkScope } from "./actions";

function clock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export default async function EmployeeStaffingPage() {
  const companyId = await requireActiveCompanyReadAccess();
  const [access, language] = await Promise.all([getCompanyAccess(companyId), getCurrentInterfaceLanguage()]);
  if (!(access.role === "ADMIN" || access.role === "OWNER" || access.role === "MANAGER" || access.canManageCompanySettings)) redirect("/");
  const t = employeeStaffingText(language);

  const [departments, teams, roles, workScopes, patterns, workplaces, coverageProfiles] = await Promise.all([
    prisma.companyDepartment.findMany({ where: { companyId, isActive: true }, include: { parent: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employeeTeam.findMany({ where: { companyId, isActive: true }, include: { department: true, memberships: { where: { isActive: true }, select: { id: true } } }, orderBy: [{ department: { name: "asc" } }, { name: "asc" }] }),
    prisma.staffingRole.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.workScope.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.shiftPattern.findMany({ where: { companyId, isActive: true }, include: { slots: { orderBy: [{ dayOffset: "asc" }, { sequence: "asc" }] } }, orderBy: { name: "asc" } }),
    prisma.workplaceScheduleProfile.findMany({ where: { companyId, isActive: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.staffingCoverageProfile.findMany({
      where: { companyId, isActive: true },
      include: {
        workplaceScheduleProfile: true,
        shiftPattern: true,
        departmentUnit: true,
        rules: { include: { staffingRole: true }, orderBy: [{ startMinutes: "asc" }, { staffingRole: { name: "asc" } }] },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <main className="space-y-6">
      <div><Link href="/starfsmenn" className="text-sm font-semibold text-blue-700">← {t.back}</Link></div>
      <PageHeader title={t.title} description={t.subtitle} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.departments}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{t.departmentsHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newDepartment}</summary>
            <form action={createDepartment} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.code}</span><input name="code" required placeholder="MAINTENANCE" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.unitType}</span><select name="unitType" defaultValue="DEPARTMENT" className="rounded-lg border bg-white px-3 py-2"><option value="DIVISION">{t.unitTypes.DIVISION}</option><option value="DEPARTMENT">{t.unitTypes.DEPARTMENT}</option><option value="UNIT">{t.unitTypes.UNIT}</option><option value="WARD">{t.unitTypes.WARD}</option><option value="OTHER">{t.unitTypes.OTHER}</option></select></label>
              <label className="grid gap-1 text-sm"><span>{t.parentDepartment}</span><select name="parentId" className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.notes}</span><textarea name="notes" rows={2} className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveDepartment}</button>
            </form>
          </details>
        </div>
        {departments.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noDepartments}</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{departments.map((department) => <div key={department.id} className="rounded-xl border bg-white p-3"><p className="font-semibold">{department.name}</p><p className="mt-1 text-xs text-slate-500">{department.parent ? `${department.parent.name} → ` : ""}{department.unitType} · <span className="font-mono">{department.code}</span></p></div>)}</div>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.fixedTeams}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{t.fixedTeamsHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newTeam}</summary>
            <form action={createEmployeeTeam} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.code}</span><input name="code" required placeholder="MAINT_A" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.department}</span><select name="departmentId" required className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{departments.filter((department) => department.unitType !== "DIVISION").map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span>{t.teamType}</span><select name="teamType" defaultValue="FIXED" className="rounded-lg border bg-white px-3 py-2"><option value="FIXED">{t.teamTypes.FIXED}</option><option value="FLEXIBLE">{t.teamTypes.FLEXIBLE}</option><option value="SUPPORT">{t.teamTypes.SUPPORT}</option></select></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.notes}</span><textarea name="notes" rows={2} className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveTeam}</button>
            </form>
          </details>
        </div>
        {teams.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noTeams}</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{teams.map((team) => <div key={team.id} className="rounded-xl border bg-white p-3"><p className="font-semibold">{team.name}</p><p className="mt-1 text-xs text-slate-500">{team.department.name} · {t.teamTypes[team.teamType as keyof typeof t.teamTypes] ?? team.teamType} · {team.memberships.length} {t.membersShort}</p></div>)}</div>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.workScopes}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{t.workScopesHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newWorkScope}</summary>
            <form action={createWorkScope} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.code}</span><input name="code" required placeholder="CLEANING" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.description}</span><textarea name="description" rows={2} className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveWorkScope}</button>
            </form>
          </details>
        </div>
        {workScopes.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noWorkScopes}</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{workScopes.map((scope) => <div key={scope.id} className="rounded-xl border bg-white p-3"><p className="font-semibold">{scope.name}</p><p className="mt-1 text-xs font-mono text-slate-500">{scope.code}</p>{scope.description ? <p className="mt-2 text-sm text-slate-600">{scope.description}</p> : null}</div>)}</div>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.staffingRoles}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{t.staffingRolesHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newRole}</summary>
            <form action={createStaffingRole} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.code}</span><input name="code" required placeholder="NURSE" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.description}</span><textarea name="description" rows={2} className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveRole}</button>
            </form>
          </details>
        </div>
        {roles.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noRoles}</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{roles.map((role) => <div key={role.id} className="rounded-xl border bg-white p-3"><p className="font-semibold">{role.name}</p><p className="mt-1 text-xs font-mono text-slate-500">{role.code}</p>{role.description ? <p className="mt-2 text-sm text-slate-600">{role.description}</p> : null}</div>)}</div>}
        <p className="mt-4 rounded-xl bg-violet-50 p-3 text-sm text-violet-900">{t.employeesUseRoles}</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.shiftPatterns}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{t.shiftPatternsHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newPattern}</summary>
            <form action={createShiftPattern} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.code}</span><input name="code" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.patternType}</span><select name="patternType" defaultValue="FIXED_SHIFT" className="rounded-lg border bg-white px-3 py-2"><option value="FIXED_SHIFT">{t.patternTypes.FIXED_SHIFT}</option><option value="ROLLING">{t.patternTypes.ROLLING}</option><option value="FLEXIBLE">{t.patternTypes.FLEXIBLE}</option><option value="OTHER">{t.patternTypes.OTHER}</option></select></label>
              <label className="grid gap-1 text-sm"><span>{t.cycleLengthDays}</span><input name="cycleLengthDays" type="number" min="1" max="366" defaultValue="1" className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.anchorDate}</span><input name="anchorDate" placeholder={t.datePlaceholder} className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.notes}</span><input name="notes" className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.savePattern}</button>
            </form>
          </details>
        </div>
        {patterns.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noPatterns}</p> : <div className="mt-4 space-y-3">{patterns.map((pattern) => (
          <details key={pattern.id} className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer"><span className="font-semibold">{pattern.name}</span><span className="ml-2 text-xs text-slate-500">{pattern.patternType} · {pattern.cycleLengthDays} d.</span></summary>
            <div className="mt-3 space-y-2">{pattern.slots.map((slot) => <div key={slot.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">D+{slot.dayOffset} · <strong>{slot.label}</strong> · {clock(slot.startMinutes)} · {slot.durationMinutes} mín.</div>)}</div>
            <form action={addShiftPatternSlot} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
              <input type="hidden" name="shiftPatternId" value={pattern.id} />
              <label className="grid gap-1 text-sm"><span>{t.dayOffset}</span><input name="dayOffset" type="number" min="0" max={Math.max(0, pattern.cycleLengthDays - 1)} defaultValue="0" className="rounded-lg border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.shiftCode}</span><input name="shiftCode" required placeholder="DAY" className="rounded-lg border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.label}</span><input name="label" required className="rounded-lg border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.start}</span><input name="start" type="time" required className="rounded-lg border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.durationMinutes}</span><input name="durationMinutes" type="number" min="1" max="1440" required className="rounded-lg border px-3 py-2" /></label>
              <button className="self-end rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{t.saveSlot}</button>
            </form>
          </details>
        ))}</div>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">{t.coverage}</h2><p className="mt-1 max-w-4xl text-sm text-slate-600">{t.coverageHelp}</p></div>
          <details className="w-full max-w-xl rounded-xl border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ {t.newCoverageProfile}</summary>
            <form action={createCoverageProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm"><span>{t.name}</span><input name="name" required className="rounded-lg border bg-white px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>{t.department}</span><select name="departmentId" className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{departments.filter((department) => department.unitType !== "DIVISION").map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span>{t.workplace}</span><select name="workplaceScheduleProfileId" className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{workplaces.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm"><span>{t.shiftPattern}</span><select name="shiftPatternId" className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{patterns.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.notes}</span><textarea name="notes" rows={2} className="rounded-lg border bg-white px-3 py-2" /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white sm:col-span-2">{t.saveCoverageProfile}</button>
            </form>
          </details>
        </div>

        {coverageProfiles.length === 0 ? <p className="mt-4 text-sm text-slate-500">{t.noCoverage}</p> : <div className="mt-4 space-y-4">{coverageProfiles.map((profile) => (
          <div key={profile.id} className="rounded-xl border bg-white p-4">
            <div><p className="font-bold">{profile.name}</p><p className="mt-1 text-xs text-slate-500">{[profile.workplaceScheduleProfile?.name, profile.departmentUnit?.name ?? profile.department, profile.shiftPattern?.name].filter(Boolean).join(" · ") || "—"}</p></div>
            {profile.rules.length > 0 ? <div className="mt-3 divide-y rounded-lg border">{profile.rules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{rule.minimumCount} × {rule.staffingRole.name}</strong>{rule.dayOfWeekMask ? ` · ${rule.dayOfWeekMask}` : ""}</span><span className="text-slate-600">{clock(rule.startMinutes)}–{clock(rule.endMinutes)}</span></div>)}</div> : null}
            <details className="mt-4 rounded-lg bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold">＋ {t.addCoverageRule}</summary>
              <form action={addCoverageRule} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="staffingCoverageProfileId" value={profile.id} />
                <label className="grid gap-1 text-sm"><span>{t.staffingRole}</span><select name="staffingRoleId" required className="rounded-lg border bg-white px-3 py-2"><option value="">{t.none}</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>{t.minimumCount}</span><input name="minimumCount" type="number" min="1" required className="rounded-lg border bg-white px-3 py-2" /></label>
                <label className="grid gap-1 text-sm"><span>{t.start}</span><input name="start" type="time" required className="rounded-lg border bg-white px-3 py-2" /></label>
                <label className="grid gap-1 text-sm"><span>{t.end}</span><input name="end" type="time" required className="rounded-lg border bg-white px-3 py-2" /></label>
                <div className="sm:col-span-2 lg:col-span-4"><p className="text-sm font-medium">{t.weekdays}</p><div className="mt-2 flex flex-wrap gap-2">{([1,2,3,4,5,6,7] as const).map((day) => <label key={day} className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs"><input type="checkbox" name="dayOfWeek" value={day} />{t.days[day]}</label>)}</div><p className="mt-1 text-xs text-slate-500">{t.allDaysHelp}</p></div>
                <label className="grid gap-1 text-sm"><span>{t.validFrom}</span><input name="validFrom" placeholder={t.datePlaceholder} className="rounded-lg border bg-white px-3 py-2" /></label>
                <label className="grid gap-1 text-sm"><span>{t.validTo}</span><input name="validTo" placeholder={t.datePlaceholder} className="rounded-lg border bg-white px-3 py-2" /></label>
                <label className="grid gap-1 text-sm sm:col-span-2"><span>{t.notes}</span><input name="notes" className="rounded-lg border bg-white px-3 py-2" /></label>
                <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">{t.crossesMidnight}</p>
                <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white sm:col-span-2 lg:col-span-4">{t.saveCoverageRule}</button>
              </form>
            </details>
          </div>
        ))}</div>}
      </Card>
    </main>
  );
}
