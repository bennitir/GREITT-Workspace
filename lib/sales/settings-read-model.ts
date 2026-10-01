import "server-only";

import { prisma } from "@/lib/prisma";

export async function getSalesSettingsReadModel(companyId: number) {
  const [locations, branches] = await Promise.all([
    prisma.operationalLocation.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        postalCode: true,
        city: true,
        salesBranch: { select: { id: true } },
      },
    }),
    prisma.salesBranch.findMany({
      where: { companyId },
      orderBy: [{ operationalLocation: { name: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        isActive: true,
        operationalLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            address: true,
            postalCode: true,
            city: true,
            isActive: true,
          },
        },
        terminals: {
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            terminalType: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  return {
    availableLocations: locations
      .filter((location) => !location.salesBranch)
      .map(({ salesBranch: _salesBranch, ...location }) => location),
    branches,
  };
}
