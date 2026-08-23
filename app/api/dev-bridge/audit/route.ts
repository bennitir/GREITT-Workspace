import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      userCount,
      activeUserCount,
      companyCount,
      activeCompanyCount,
      userCompanyCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { isActive: true },
      }),
      prisma.company.count(),
      prisma.company.count({
        where: { isActive: true },
      }),
      prisma.userCompany.count(),
    ]);

    return NextResponse.json({
      ok: true,
      service: "GLÖGGT Dev Bridge Audit",
      mode: "read-only",

      checks: {
        users: {
          total: userCount,
          active: activeUserCount,
        },

        companies: {
          total: companyCount,
          active: activeCompanyCount,
        },

        accessRelations: {
          total: userCompanyCount,
        },
      },

      privacy: {
        personalDataReturned: false,
      },

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dev Bridge audit error:", error);

    return NextResponse.json(
      {
        ok: false,
        service: "GLÖGGT Dev Bridge Audit",
        error: "Audit failed",
      },
      { status: 500 },
    );
  }
}