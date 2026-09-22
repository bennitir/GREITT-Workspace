import { NextRequest, NextResponse } from "next/server";

import { requireCompanyModule } from "@/lib/core/require-company-module";
import { prisma } from "@/lib/prisma";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(request: NextRequest) {
  const companyId = await requireCompanyModule("verk");
  const date = request.nextUrl.searchParams.get("date");
  const range = parseDate(date);

  if (!range || !date) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const sessions = await prisma.workTrackSession.findMany({
    where: {
      companyId,
      startedAt: { gte: range.start, lt: range.end },
      pointCount: { gt: 0 },
    },
    select: {
      id: true,
      employeeId: true,
      workOrderId: true,
      workPartId: true,
      status: true,
      startedAt: true,
      endedAt: true,
      pointCount: true,
      totalDistanceM: true,
      employee: { select: { fullName: true } },
      points: {
        select: {
          sequence: true,
          recordedAt: true,
          latitude: true,
          longitude: true,
          accuracyM: true,
        },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
  });

  const workOrderIds = [...new Set(sessions.flatMap((session) => (session.workOrderId ? [session.workOrderId] : [])))];
  const workPartIds = [...new Set(sessions.flatMap((session) => (session.workPartId ? [session.workPartId] : [])))];

  const [workOrders, workParts] = await Promise.all([
    workOrderIds.length > 0
      ? prisma.workOrder.findMany({
          where: { companyId, id: { in: workOrderIds } },
          select: { id: true, title: true, workNumber: true },
        })
      : Promise.resolve([]),
    workPartIds.length > 0
      ? prisma.workPart.findMany({
          where: { companyId, id: { in: workPartIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const workOrderById = new Map(workOrders.map((work) => [work.id, work]));
  const workPartById = new Map(workParts.map((part) => [part.id, part]));

  return NextResponse.json({
    date,
    sessions: sessions.map((session) => {
      const workOrder = session.workOrderId ? workOrderById.get(session.workOrderId) ?? null : null;
      const workPart = session.workPartId ? workPartById.get(session.workPartId) ?? null : null;

      return {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        pointCount: session.pointCount,
        totalDistanceM: session.totalDistanceM,
        employeeId: session.employeeId,
        employeeName: session.employee.fullName,
        workOrderId: session.workOrderId,
        workOrderTitle: workOrder?.title ?? null,
        workNumber: workOrder?.workNumber ?? null,
        workPartTitle: workPart?.title ?? null,
        points: session.points.map((point) => ({
          sequence: point.sequence,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracyM: point.accuracyM,
          recordedAt: point.recordedAt.toISOString(),
        })),
      };
    }),
  });
}
