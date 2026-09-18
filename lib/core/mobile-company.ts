import { prisma } from "@/lib/prisma";

export type MobileCompanyChoice = {
  id: number;
  name: string;
  kennitala: string;
};

type MobileUser = {
  id: number;
  role: string;
};

/**
 * Sameiginleg fyrirtækistenging fyrir Mobile.
 *
 * Mobile er ekki háð Vinnustund. Núverandi grunnheimild er virk
 * UserCompany-tenging; síðar getur starfsmannakjarninn byggt ofan á
 * sama samband án þess að Mobile þurfi að breytast aftur.
 */
export async function getMobileCompaniesForUser(
  user: MobileUser,
): Promise<MobileCompanyChoice[]> {
  if (user.role === "ADMIN") {
    return prisma.company.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        kennitala: true,
      },
      orderBy: { name: "asc" },
    });
  }

  const links = await prisma.userCompany.findMany({
    where: {
      userId: user.id,
      isActive: true,
      company: {
        isActive: true,
      },
    },
    select: {
      company: {
        select: {
          id: true,
          name: true,
          kennitala: true,
        },
      },
    },
  });

  return links
    .map((link) => link.company)
    .sort((a, b) => a.name.localeCompare(b.name, "is"));
}

export async function getSingleMobileCompanyIdForUser(
  user: MobileUser,
): Promise<number | null> {
  if (user.role === "ADMIN") {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 2,
    });

    return companies.length === 1 ? companies[0].id : null;
  }

  const links = await prisma.userCompany.findMany({
    where: {
      userId: user.id,
      isActive: true,
      company: {
        isActive: true,
      },
    },
    select: { companyId: true },
    orderBy: { companyId: "asc" },
    take: 2,
  });

  return links.length === 1 ? links[0].companyId : null;
}
