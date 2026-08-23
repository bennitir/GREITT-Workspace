import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      nonAdminUsers,
      activeCompanies,
      userCompanyRelations,
      receipts,
    ] = await Promise.all([
      prisma.user.findMany({
        where: {
          isActive: true,
          role: {
            not: "ADMIN",
          },
        },
        select: {
          id: true,
        },
      }),

      prisma.company.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
        },
      }),

      prisma.userCompany.findMany({
        where: {
          isActive: true,
        },
        select: {
          userId: true,
          companyId: true,
        },
      }),

      prisma.receipt.findMany({
        select: {
          id: true,
          companyId: true,
        },
      }),
    ]);

    const relationSet = new Set(
      userCompanyRelations.map(
        (relation) => `${relation.userId}:${relation.companyId}`,
      ),
    );

    let forbiddenCompanyAccessPairs = 0;

    for (const user of nonAdminUsers) {
      for (const company of activeCompanies) {
        const hasAccess = relationSet.has(`${user.id}:${company.id}`);

        if (!hasAccess) {
          forbiddenCompanyAccessPairs += 1;
        }
      }
    }

    const receiptsWithoutCompany = receipts.filter(
      (receipt) => !receipt.companyId,
    ).length;

    const checks = {
      receiptsAlwaysBelongToCompany: {
        status: receiptsWithoutCompany === 0 ? "PASS" : "FAIL",
        count: receiptsWithoutCompany,
      },

      accessMatrixGenerated: {
        status: "PASS",
        nonAdminUsersChecked: nonAdminUsers.length,
        activeCompaniesChecked: activeCompanies.length,
        forbiddenPairsIdentified: forbiddenCompanyAccessPairs,
      },
    };

    const hasFailure = Object.values(checks).some(
      (check) => check.status === "FAIL",
    );

    return NextResponse.json({
      ok: !hasFailure,
      service: "GLÖGGT Dev Bridge Access Audit",
      mode: "read-only",

      summary: {
        nonAdminUsers: nonAdminUsers.length,
        activeCompanies: activeCompanies.length,
        activeAccessRelations: userCompanyRelations.length,
        receipts: receipts.length,
      },

      checks,

      privacy: {
        personalDataReturned: false,
        namesReturned: false,
        emailsReturned: false,
        documentContentsReturned: false,
      },

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dev Bridge access audit error:", error);

    return NextResponse.json(
      {
        ok: false,
        service: "GLÖGGT Dev Bridge Access Audit",
        error: "Access audit failed",
      },
      { status: 500 },
    );
  }
}