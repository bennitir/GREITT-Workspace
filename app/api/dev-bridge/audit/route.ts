import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();

    const [
      totalUsers,
      activeUsers,
      activeClients,
      totalCompanies,
      activeCompanies,
      totalAccessRelations,
      inactiveAccessRelations,
      clientsWithoutCompany,
      accessToInactiveUsers,
      accessToInactiveCompanies,
      totalSessions,
      expiredSessions,
      totalReceipts,
      approvedReceipts,
      voucherReservations,
    ] = await Promise.all([
      prisma.user.count(),

      prisma.user.count({
        where: { isActive: true },
      }),

      prisma.user.count({
        where: {
          isActive: true,
          role: "CLIENT",
        },
      }),

      prisma.company.count(),

      prisma.company.count({
        where: { isActive: true },
      }),

      prisma.userCompany.count(),

      prisma.userCompany.count({
        where: { isActive: false },
      }),

      prisma.user.count({
        where: {
          role: "CLIENT",
          isActive: true,
          companies: {
            none: {
              isActive: true,
            },
          },
        },
      }),

      prisma.userCompany.count({
        where: {
          isActive: true,
          user: {
            isActive: false,
          },
        },
      }),

      prisma.userCompany.count({
        where: {
          isActive: true,
          company: {
            isActive: false,
          },
        },
      }),

      prisma.session.count(),

      prisma.session.count({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      }),

      prisma.receipt.count(),

      prisma.receipt.count({
        where: {
          status: "APPROVED",
        },
      }),

      prisma.voucherNumberReservation.count(),
    ]);

    const checks = {
      activeAccessToInactiveUsers: {
        status:
          accessToInactiveUsers === 0 ? "PASS" : "FAIL",
        count: accessToInactiveUsers,
      },

      activeAccessToInactiveCompanies: {
        status:
          accessToInactiveCompanies === 0
            ? "PASS"
            : "FAIL",
        count: accessToInactiveCompanies,
      },

      clientsWithoutActiveCompany: {
        status:
          clientsWithoutCompany === 0 ? "PASS" : "WARN",
        count: clientsWithoutCompany,
      },

      expiredSessions: {
        status:
          expiredSessions === 0 ? "PASS" : "WARN",
        count: expiredSessions,
      },
    };

    const hasFailure = Object.values(checks).some(
      (check) => check.status === "FAIL",
    );

    return NextResponse.json({
      ok: !hasFailure,
      service: "GLÖGGT Dev Bridge Audit",
      mode: "read-only",

      summary: {
        users: {
          total: totalUsers,
          active: activeUsers,
          activeClients,
        },

        companies: {
          total: totalCompanies,
          active: activeCompanies,
        },

        accessRelations: {
          total: totalAccessRelations,
          inactive: inactiveAccessRelations,
        },

        sessions: {
          total: totalSessions,
          expired: expiredSessions,
        },

        bookkeeping: {
          receipts: totalReceipts,
          approvedReceipts,
          voucherReservations,
        },
      },

      checks,

      privacy: {
        personalDataReturned: false,
        namesReturned: false,
        emailsReturned: false,
        documentContentsReturned: false,
      },

      timestamp: now.toISOString(),
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