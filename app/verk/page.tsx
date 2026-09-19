import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";
import { getWorkCapabilitySettings } from "@/lib/core/work-capability-repository";
import { isWorkCapabilityEnabled } from "@/lib/core/work-capabilities";
import { projectWorkPartsForDisplay } from "@/lib/work10/display-parts";
import { projectLegacyOperationalText } from "@/lib/work10/legacy-operational-text";
import { projectPersistedWorkOrderText } from "@/lib/work10/work-order-text";
import { effectiveWork10Status } from "@/lib/work10/status";
import { resolveWork10LocalizedText } from "@/lib/work10/operational-text";
import Work10Dashboard, { type Work10DashboardData } from "./Work10Dashboard";

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export default async function Verk10Page() {
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();

  const [workOrders, companyEmployees, workCapabilitySettings, userSettings] = await Promise.all([
    prisma.workOrder.findMany({
      where: { companyId },
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
              select: { employeeId: true, userId: true },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, fullName: true, jobTitle: true, userId: true },
      orderBy: { fullName: "asc" },
    }),
    getWorkCapabilitySettings(companyId),
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
  ]);

  const employeeByUserId = new Map(
    companyEmployees
      .filter((employee) => employee.userId !== null)
      .map((employee) => [employee.userId as number, employee.id]),
  );

  const data: Work10DashboardData = {
    language: userSettings?.interfaceLanguage ?? "is",
    initialDate: new Date().toISOString().slice(0, 10),
    capabilities: {
      machines: isWorkCapabilityEnabled("machines", workCapabilitySettings),
    },
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
            .map((assignment) => assignment.employeeId ?? (assignment.userId ? employeeByUserId.get(assignment.userId) ?? null : null))
            .filter((employeeId): employeeId is number => employeeId !== null),
        ]),
      );
      const workParts = projectedWorkParts.map((part) => ({
        ...part,
        assignedEmployeeIds:
          part.source.kind === "WORK_PART"
            ? assignmentEmployeeIdsByPartId.get(Number(part.source.sourceId)) ?? []
            : [],
      }));

      const effectiveStatus = effectiveWork10Status(work.status, work.workParts);

      return {
      id: work.id,
      title: localizedTitle.text,
      description: localizedDescription?.text ?? null,
      address: work.address,
      priority: work.priority,
      status: effectiveStatus,
      createdAt: iso(work.createdAt)!,
      startedAt: iso(work.startedAt),
      completedAt: iso(work.completedAt),
      createdByName: work.createdBy?.name ?? null,
      workParts,
      workLogs: work.workLogs.map((log) => ({
        id: log.id,
        userId: log.userId,
        employeeId: log.userId ? employeeByUserId.get(log.userId) ?? null : null,
        userName: log.user?.name ?? null,
        workDate: iso(log.workDate)!,
        startedAt: iso(log.startedAt),
        endedAt: iso(log.endedAt),
        durationMinutes: log.durationMinutes,
        description: log.description,
      })),
    };
    }),
    people: companyEmployees.map((employee) => ({
      id: employee.id,
      name: employee.fullName,
      jobTitle: employee.jobTitle,
      userId: employee.userId,
    })),
  };

  return <Work10Dashboard data={data} />;
}
