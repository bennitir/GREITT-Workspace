import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { workMobileText } from "@/lib/i18n/work-mobile";
import { prisma } from "@/lib/prisma";

export async function getMobileWorkActor() {
  const companyId = await requireCompanyModule("verk");
  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const [access, employee, settings] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.employee.findFirst({
      where: { companyId, userId: user.id, isActive: true },
      select: {
        id: true,
        fullName: true,
        preferredLanguage: true,
        jobTitle: true,
      },
    }),
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { interfaceLanguage: true },
    }),
  ]);

  if (!access.allowed) {
    throw new Error("COMPANY_ACCESS_DENIED");
  }

  const language = normalizeUiLanguage(
    employee?.preferredLanguage || settings?.interfaceLanguage || "is",
  );

  const teamMemberships = employee
    ? await prisma.workResourceMember.findMany({
        where: {
          companyId,
          employeeId: employee.id,
          removedAt: null,
          workResource: { kind: "TEAM", isActive: true },
        },
        select: { workResourceId: true },
      })
    : [];

  return {
    companyId,
    user,
    access,
    employee,
    language,
    teamResourceIds: teamMemberships.map((item) => item.workResourceId),
  };
}

export async function requireMobileWorkEmployee() {
  const actor = await getMobileWorkActor();
  if (!actor.employee) {
    throw new Error(workMobileText(actor.language).errors.employeeRequired);
  }
  return {
    ...actor,
    employee: actor.employee,
  };
}
