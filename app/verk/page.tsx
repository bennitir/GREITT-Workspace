import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";
import { getWorkCapabilitySettings } from "@/lib/core/work-capability-repository";
import { isWorkCapabilityEnabled } from "@/lib/core/work-capabilities";
import { projectWorkPartsForDisplay } from "@/lib/work10/display-parts";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { effectiveWork10Status, isWork10ReadyToClose } from "@/lib/work10/status";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import Work10Dashboard, { type Work10DashboardData } from "./Work10Dashboard";

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export default async function Verk10Page() {
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();

  const [workOrders, companyEmployees, workResources, workCapabilitySettings, assignmentHistory, userSettings, workplaceScheduleProfiles, laborAgreementProfiles, operationalTravelRoutes, workDiaryEntries, companyWorkBase] = await Promise.all([
    prisma.workOrder.findMany({
      where: { companyId },
      include: {
        createdBy: true,
        translations: true,
        responsibleDepartment: { select: { id: true, code: true, name: true } },
        locationDepartment: { select: { id: true, code: true, name: true, defaultOperationalLocation: { select: { id: true, code: true, name: true } } } },
        operationalLocation: { select: { id: true, code: true, name: true } },
        workLogs: {
          include: { user: true },
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        },
        workParts: {
          include: {
            translations: true,
            workScope: { select: { id: true, code: true, name: true } },
            staffingRequirements: {
              select: {
                id: true,
                sequence: true,
                roleCode: true,
                quantity: true,
                staffingRoleId: true,
                workScope: { select: { id: true, code: true, name: true } },
                requiredQualificationCodes: true,
                preferredQualificationCodes: true,
              },
              orderBy: { sequence: "asc" },
            },
            assignments: {
              where: { removedAt: null },
              select: {
                employeeId: true,
                userId: true,
                resourceKind: true,
                workResourceId: true,
                workResource: {
                  select: {
                    id: true,
                    kind: true,
                    name: true,
                    status: true,
                    description: true,
                    travelMode: true,
                    planningTravelSpeedKmh: true,
                  },
                },
              },
            },
            laborFacts: {
              where: { voidedAt: null },
              include: {
                employee: { select: { id: true, fullName: true } },
                user: { select: { id: true, name: true } },
              },
              orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
            },
            predecessorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
            successorDependencies: {
              select: { predecessorPartId: true, successorPartId: true },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        fullName: true,
        jobTitle: true,
        department: true,
        departmentId: true,
        departmentUnit: { select: { id: true, code: true, name: true, defaultOperationalLocation: { select: { id: true, code: true, name: true } } } },
        baseOperationalLocation: { select: { id: true, code: true, name: true } },
        teamMemberships: {
          where: { isActive: true },
          select: { teamId: true, isPrimary: true, team: { select: { id: true, code: true, name: true, departmentId: true } } },
        },
        userId: true,
        workplaceScheduleProfileId: true,
        laborAgreementProfileId: true,
        staffingRoles: {
          where: { isActive: true },
          select: { staffingRoleId: true },
        },
        workScopes: {
          where: { isActive: true },
          select: { workScopeId: true },
        },
        incidentalWorkMode: true,
        workExecutionMode: true,
        qualifications: {
          select: { title: true, qualificationCodes: true, validUntil: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.workResource.findMany({
      where: { companyId, isActive: true },
      include: {
        assignments: { where: { removedAt: null }, select: { id: true } },
        members: { where: { removedAt: null }, select: { id: true, employeeId: true } },
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    getWorkCapabilitySettings(companyId),
    prisma.workPartAssignment.findMany({
      where: {
        companyId,
        resourceKind: "PERSON",
        employeeId: { not: null },
      },
      select: { workPartId: true, employeeId: true, createdAt: true, removedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
    prisma.workplaceScheduleProfile.findMany({
      where: { companyId, isActive: true },
      include: { breaks: { orderBy: { sequence: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.laborAgreementProfile.findMany({
      where: { companyId, isActive: true },
      include: { breakRules: { orderBy: { sequence: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.operationalTravelRoute.findMany({
      where: { companyId, isActive: true },
      include: {
        fromLocation: { select: { id: true, code: true, name: true } },
        toLocation: { select: { id: true, code: true, name: true } },
        timeWindows: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { startMinutes: "asc" }] },
      },
      orderBy: [{ fromLocationId: "asc" }, { toLocationId: "asc" }],
    }),
    prisma.employeeWorkDiaryEntry.findMany({
      where: { companyId, voidedAt: null },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        title: true,
        operationalLocationId: true,
        workKey: true,
      },
      orderBy: [{ workDate: "desc" }, { startedAt: "desc" }],
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        defaultOperationalLocation: {
          select: { id: true, code: true, name: true },
        },
      },
    }),
  ]);

  const employeeByUserId = new Map(
    companyEmployees
      .filter((employee) => employee.userId !== null)
      .map((employee) => [employee.userId as number, employee.id]),
  );

  const assignmentsByPart = new Map<number, typeof assignmentHistory>();
  for (const assignment of assignmentHistory) {
    if (!assignment.employeeId) continue;
    const assignments = assignmentsByPart.get(assignment.workPartId) ?? [];
    assignments.push(assignment);
    assignmentsByPart.set(assignment.workPartId, assignments);
  }

  const pairingCounts = new Map<string, { employeeAId: number; employeeBId: number; count: number }>();
  for (const assignments of assignmentsByPart.values()) {
    const pairedOnPart = new Set<string>();
    for (let left = 0; left < assignments.length; left += 1) {
      for (let right = left + 1; right < assignments.length; right += 1) {
        const first = assignments[left];
        const second = assignments[right];
        if (!first.employeeId || !second.employeeId || first.employeeId === second.employeeId) continue;
        const firstEnd = first.removedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const secondEnd = second.removedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const overlapped = first.createdAt.getTime() <= secondEnd && second.createdAt.getTime() <= firstEnd;
        if (!overlapped) continue;

        const employeeAId = Math.min(first.employeeId, second.employeeId);
        const employeeBId = Math.max(first.employeeId, second.employeeId);
        const key = `${employeeAId}:${employeeBId}`;
        if (pairedOnPart.has(key)) continue;
        pairedOnPart.add(key);
        const existing = pairingCounts.get(key);
        pairingCounts.set(key, { employeeAId, employeeBId, count: (existing?.count ?? 0) + 1 });
      }
    }
  }

  const data: Work10DashboardData = {
    language: userSettings?.interfaceLanguage ?? "is",
    initialDate: new Date().toISOString().slice(0, 10),
    capabilities: {
      machines: isWorkCapabilityEnabled("machines", workCapabilitySettings),
    },
    independentLabor: workDiaryEntries.map((entry) => ({
      id: `diary-${entry.id}`,
      userId: null,
      employeeId: entry.employeeId,
      userName: null,
      workDate: entry.workDate.toISOString(),
      startedAt: entry.startedAt.toISOString(),
      endedAt: iso(entry.endedAt),
      durationMinutes: entry.durationMinutes,
      description: entry.title,
      source: "EMPLOYEE_WORK_DIARY" as const,
      workPartId: null,
      operationalLocationId: entry.operationalLocationId,
      workKey: entry.workKey,
    })),
    workdayProfiles: workplaceScheduleProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      address: profile.address,
      dayStartMinutes: profile.dayStartMinutes,
      standardWorkMinutes: profile.standardWorkMinutes,
      isDefault: profile.isDefault,
      breaks: profile.breaks.map((rule) => ({
        code: rule.code,
        label: rule.label,
        targetStartMinutes: rule.targetStartMinutes,
        durationMinutes: rule.durationMinutes,
        flexibleBeforeMinutes: rule.flexibleBeforeMinutes,
        flexibleAfterMinutes: rule.flexibleAfterMinutes,
        allowFinishNearCompleteWork: rule.allowFinishNearCompleteWork,
        finishNearCompleteThresholdMinutes: rule.finishNearCompleteThresholdMinutes,
      })),
    })),
    laborAgreementProfiles: laborAgreementProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      interpretationStatus: profile.interpretationStatus,
      breakRules: profile.breakRules.map((rule) => ({
        breakCode: rule.breakCode,
        minimumShiftMinutes: rule.minimumShiftMinutes,
        entitlementMinutes: rule.entitlementMinutes,
        paidBreak: rule.paidBreak,
        missedBreakTreatment: rule.missedBreakTreatment,
      })),
    })),
    workOrders: workOrders.map((work) => {
      const language = userSettings?.interfaceLanguage ?? "is";
      const persistedOperationalText = projectPersistedWorkOrderText(work);
      const legacyOperationalText = projectLegacyOperationalText(work);
      const operationalText =
        work.translations.length > 0 ? persistedOperationalText : legacyOperationalText;
      const localizedTitle = resolveWork10LocalizedText(operationalText.title, language)!;
      const localizedDescription = resolveWork10LocalizedText(operationalText.description, language);
      const projectedWorkParts = projectWorkPartsForDisplay(work, language);
      const assignmentEmployeeIdsByPartId = new Map(
        work.workParts.map((part) => [
          part.id,
          part.assignments
            .filter((assignment) => assignment.resourceKind === "PERSON")
            .map((assignment) => assignment.employeeId ?? (assignment.userId ? employeeByUserId.get(assignment.userId) ?? null : null))
            .filter((employeeId): employeeId is number => employeeId !== null),
        ]),
      );
      const workPartPlanningById = new Map(
        work.workParts.map((part) => [
          part.id,
          {
            requiredPeople: part.requiredPeople,
            estimatedMinutes: part.estimatedMinutes,
            photoRequirement: part.photoRequirement,
            workScopeId: part.workScope?.id ?? null,
            workScopeCode: part.workScope?.code ?? null,
            workScopeName: part.workScope?.name ?? null,
            requiredQualificationCodes: (part.requiredQualificationCodes ?? "")
              .split(/[;,\s]+/)
              .map((code) => code.trim().toUpperCase())
              .filter(Boolean),
            staffingRequirements: part.staffingRequirements.map((requirement) => ({
              id: requirement.id,
              sequence: requirement.sequence,
              roleCode: requirement.roleCode,
              quantity: requirement.quantity,
              staffingRoleId: requirement.staffingRoleId,
              workScopeId: requirement.workScope?.id ?? null,
              workScopeCode: requirement.workScope?.code ?? null,
              workScopeName: requirement.workScope?.name ?? null,
              requiredQualificationCodes: (requirement.requiredQualificationCodes ?? "")
                .split(/[;,\s]+/)
                .map((code) => code.trim().toUpperCase())
                .filter(Boolean),
              preferredQualificationCodes: (requirement.preferredQualificationCodes ?? "")
                .split(/[;,\s]+/)
                .map((code) => code.trim().toUpperCase())
                .filter(Boolean),
            })),
          },
        ]),
      );
      const workPartResourcesById = new Map(
        work.workParts.map((part) => [
          part.id,
          part.assignments
            .filter((assignment) => assignment.resourceKind !== "PERSON" && assignment.workResource)
            .map((assignment) => {
              const match = assignment.workResource?.description?.match(/Hæfnikóði:\s*([A-Z0-9_-]+)/i);
              return {
                id: assignment.workResource!.id,
                kind: assignment.workResource!.kind,
                name: assignment.workResource!.name,
                status: assignment.workResource!.status,
                qualificationCode: match?.[1]?.toUpperCase() ?? null,
                travelMode: assignment.workResource!.travelMode,
                planningTravelSpeedKmh: assignment.workResource!.planningTravelSpeedKmh,
              };
            }),
        ]),
      );
      const workParts = projectedWorkParts.map((part) => {
        const planning =
          part.source.kind === "WORK_PART"
            ? workPartPlanningById.get(Number(part.source.sourceId))
            : null;
        return {
          ...part,
          requiredPeople: planning?.requiredPeople ?? work.requiredPeople,
          estimatedMinutes: planning?.estimatedMinutes ?? work.estimatedMinutes,
          photoRequirement: planning?.photoRequirement ?? "INHERIT",
          workScopeId: planning?.workScopeId ?? null,
          workScopeCode: planning?.workScopeCode ?? null,
          workScopeName: planning?.workScopeName ?? null,
          requiredQualificationCodes: planning?.requiredQualificationCodes ?? [],
          staffingRequirements: planning?.staffingRequirements ?? [],
          assignedEmployeeIds:
            part.source.kind === "WORK_PART"
              ? assignmentEmployeeIdsByPartId.get(Number(part.source.sourceId)) ?? []
              : [],
          assignedResources:
            part.source.kind === "WORK_PART"
              ? workPartResourcesById.get(Number(part.source.sourceId)) ?? []
              : [],
        };
      });

      const effectiveStatus = effectiveWork10Status(work.status, work.workParts);
      const readyToClose = isWork10ReadyToClose(work.status, work.workParts);
      const canonicalLabor = work.workParts.flatMap((part) =>
        part.laborFacts.map((fact) => ({
          id: `FACT-${fact.id}`,
          userId: fact.userId,
          employeeId:
            fact.employeeId ??
            (fact.userId ? employeeByUserId.get(fact.userId) ?? null : null),
          userName:
            fact.employee?.fullName ??
            fact.user?.name ??
            fact.resourceLabel ??
            null,
          workDate: iso(fact.workDate)!,
          startedAt: iso(fact.startedAt),
          endedAt: iso(fact.endedAt),
          durationMinutes: fact.durationMinutes,
          description: fact.note,
          source: "WORK_PART_FACT" as const,
          workPartId: part.id,
        })),
      );

      // Legacy WorkLog er aðeins read-only brú fyrir gömul Verk sem eiga enn
      // engar canonical WorkPartLaborFact-staðreyndir. Um leið og nýi kjarninn
      // hefur raunvinnu fyrir Verk verður hann eini sannleikurinn á dashboardi;
      // þannig tvíteljum við ekki sömu vinnu úr tveimur tímakerfum.
      const legacyLabor = work.workLogs.map((log) => ({
        id: `LEGACY-${log.id}`,
        userId: log.userId,
        employeeId: log.userId ? employeeByUserId.get(log.userId) ?? null : null,
        userName: log.user?.name ?? null,
        workDate: iso(log.workDate)!,
        startedAt: iso(log.startedAt),
        endedAt: iso(log.endedAt),
        durationMinutes: log.durationMinutes ?? 0,
        description: log.description,
        source: "LEGACY_WORK_LOG" as const,
        workPartId: null,
      }));

      return {
      id: work.id,
      workNumber: work.workNumber ?? String(work.id),
      workKey: work.workKey,
      externalId: work.externalId,
      title: localizedTitle.text,
      description: localizedDescription?.text ?? null,
      address: work.address,
      responsibleDepartmentId: work.responsibleDepartment?.id ?? null,
      responsibleDepartmentCode: work.responsibleDepartment?.code ?? null,
      responsibleDepartmentName: work.responsibleDepartment?.name ?? null,
      locationDepartmentId: work.locationDepartment?.id ?? null,
      locationDepartmentCode: work.locationDepartment?.code ?? null,
      locationDepartmentName: work.locationDepartment?.name ?? null,
      operationalLocationId: work.operationalLocation?.id ?? work.locationDepartment?.defaultOperationalLocation?.id ?? null,
      operationalLocationCode: work.operationalLocation?.code ?? work.locationDepartment?.defaultOperationalLocation?.code ?? null,
      operationalLocationName: work.operationalLocation?.name ?? work.locationDepartment?.defaultOperationalLocation?.name ?? null,
      priority: work.priority,
      requiredPeople: work.requiredPeople,
      estimatedMinutes: work.estimatedMinutes,
      plannedDate: work.plannedDate ? work.plannedDate.toISOString().slice(0, 10) : null,
      plannedStartMinutes: work.plannedStartMinutes,
      plannedEndMinutes: work.plannedEndMinutes,
      completionDeadlineDate: work.completionDeadlineDate ? work.completionDeadlineDate.toISOString().slice(0, 10) : null,
      completionDeadlineMinutes: work.completionDeadlineMinutes,
      allowAfterWorkdayEnd: work.allowAfterWorkdayEnd,
      workdayEndExceptionReason: work.workdayEndExceptionReason,
      photoRequirement: work.photoRequirement,
      status: effectiveStatus,
      readyToClose,
      createdAt: iso(work.createdAt)!,
      startedAt: iso(work.startedAt),
      completedAt: iso(work.completedAt),
      createdByName: work.createdBy?.name ?? null,
      workParts,
      actualLabor: canonicalLabor.length > 0 ? canonicalLabor : legacyLabor,
    };
    }),
    resources: workResources.map((resource) => ({
      id: resource.id,
      kind: resource.kind,
      code: resource.code,
      name: resource.name,
      status: resource.status,
      baseUnit: resource.baseUnit,
      customUnit: resource.customUnit,
      meterValue: resource.meterValue,
      meterUnit: resource.meterUnit,
      travelMode: resource.travelMode,
      planningTravelSpeedKmh: resource.planningTravelSpeedKmh,
      activeAssignmentCount: resource.assignments.length,
      memberCount: resource.members.length,
      memberEmployeeIds: resource.members.map((member) => member.employeeId),
      description: resource.description,
    })),
    people: companyEmployees.map((employee) => ({
      id: employee.id,
      name: employee.fullName,
      jobTitle: employee.jobTitle,
      department: employee.departmentUnit?.name ?? employee.department,
      departmentId: employee.departmentUnit?.id ?? employee.departmentId,
      departmentCode: employee.departmentUnit?.code ?? null,
      fixedTeamIds: employee.teamMemberships.map((row) => row.teamId),
      fixedTeamNames: employee.teamMemberships.map((row) => row.team.name),
      primaryFixedTeamId: employee.teamMemberships.find((row) => row.isPrimary)?.teamId ?? null,
      baseOperationalLocationId: employee.baseOperationalLocation?.id ?? employee.departmentUnit?.defaultOperationalLocation?.id ?? companyWorkBase?.defaultOperationalLocation?.id ?? null,
      baseOperationalLocationCode: employee.baseOperationalLocation?.code ?? employee.departmentUnit?.defaultOperationalLocation?.code ?? companyWorkBase?.defaultOperationalLocation?.code ?? null,
      baseOperationalLocationName: employee.baseOperationalLocation?.name ?? employee.departmentUnit?.defaultOperationalLocation?.name ?? companyWorkBase?.defaultOperationalLocation?.name ?? null,
      userId: employee.userId,
      workplaceScheduleProfileId: employee.workplaceScheduleProfileId,
      laborAgreementProfileId: employee.laborAgreementProfileId,
      staffingRoleIds: employee.staffingRoles.map((row) => row.staffingRoleId),
      workScopeIds: employee.workScopes.map((row) => row.workScopeId),
      incidentalWorkMode: employee.incidentalWorkMode,
      workExecutionMode: employee.workExecutionMode,
      qualificationCodes: employee.qualifications
        .filter((qualification) => !qualification.validUntil || qualification.validUntil >= new Date())
        .flatMap((qualification) => (qualification.qualificationCodes ?? "").split(/[;,\s]+/))
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
      qualificationTitles: employee.qualifications
        .filter((qualification) => !qualification.validUntil || qualification.validUntil >= new Date())
        .map((qualification) => qualification.title),
    })),
    travelRoutes: operationalTravelRoutes.map((route) => ({
      id: route.id,
      fromLocationId: route.fromLocationId,
      fromLocationCode: route.fromLocation.code,
      fromLocationName: route.fromLocation.name,
      toLocationId: route.toLocationId,
      toLocationCode: route.toLocation.code,
      toLocationName: route.toLocation.name,
      distanceKm: route.distanceKm,
      defaultMinutes: route.defaultMinutes,
      source: route.source,
      timeWindows: route.timeWindows.map((window) => ({
        dayType: window.dayType,
        startMinutes: window.startMinutes,
        endMinutes: window.endMinutes,
        travelMinutes: window.travelMinutes,
        ruleCode: window.ruleCode,
        source: window.source,
      })),
    })),
    pairings: [...pairingCounts.values()],
  };

  return <Work10Dashboard data={data} />;
}
