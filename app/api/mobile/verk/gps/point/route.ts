import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { haversineDistanceM } from "@/lib/work10/gps-tracking";
import { requireMobileWorkEmployee } from "@/lib/work10/mobile-access";

export const dynamic = "force-dynamic";

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalFiniteNumber(value: unknown) {
  return value === null || value === undefined ? null : finiteNumber(value);
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireMobileWorkEmployee>>;
  try {
    actor = await requireMobileWorkEmployee();
  } catch {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const sessionId = finiteNumber(body.sessionId);
  const latitude = finiteNumber(body.latitude);
  const longitude = finiteNumber(body.longitude);
  const accuracyM = optionalFiniteNumber(body.accuracyM);
  const altitudeM = optionalFiniteNumber(body.altitudeM);
  const headingDeg = optionalFiniteNumber(body.headingDeg);
  const speedMps = optionalFiniteNumber(body.speedMps);

  if (!sessionId || !Number.isInteger(sessionId) || latitude === null || longitude === null) {
    return NextResponse.json({ error: "INVALID_POINT" }, { status: 400 });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }
  if (accuracyM !== null && (accuracyM < 0 || accuracyM > 1_000)) {
    return NextResponse.json({ error: "INVALID_ACCURACY" }, { status: 400 });
  }
  if (headingDeg !== null && (headingDeg < 0 || headingDeg > 360)) {
    return NextResponse.json({ error: "INVALID_HEADING" }, { status: 400 });
  }
  if (speedMps !== null && speedMps < 0) {
    return NextResponse.json({ error: "INVALID_SPEED" }, { status: 400 });
  }

  const parsedRecordedAt = typeof body.recordedAt === "string" ? new Date(body.recordedAt) : new Date();
  const recordedAt = Number.isNaN(parsedRecordedAt.getTime()) ? new Date() : parsedRecordedAt;

  const session = await prisma.workTrackSession.findFirst({
    where: {
      id: sessionId,
      companyId: actor.companyId,
      employeeId: actor.employee.id,
      endedAt: null,
    },
    select: {
      id: true,
      pointCount: true,
      totalDistanceM: true,
      lastLatitude: true,
      lastLongitude: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "TRACK_SESSION_NOT_ACTIVE" }, { status: 404 });
  }

  const distanceDeltaM = session.lastLatitude !== null && session.lastLongitude !== null
    ? haversineDistanceM(
        { latitude: session.lastLatitude, longitude: session.lastLongitude },
        { latitude, longitude },
      )
    : 0;
  const safeDistanceDeltaM = Number.isFinite(distanceDeltaM) && distanceDeltaM >= 0 && distanceDeltaM <= 10_000
    ? distanceDeltaM
    : 0;
  const sequence = session.pointCount + 1;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.workTrackPoint.create({
        data: {
          companyId: actor.companyId,
          sessionId: session.id,
          sequence,
          recordedAt,
          latitude,
          longitude,
          accuracyM,
          altitudeM,
          headingDeg,
          speedMps,
        },
      });

      return tx.workTrackSession.update({
        where: { id: session.id },
        data: {
          status: "TRACKING",
          lastPointAt: recordedAt,
          pointCount: { increment: 1 },
          totalDistanceM: session.totalDistanceM + safeDistanceDeltaM,
          lastLatitude: latitude,
          lastLongitude: longitude,
          lastAccuracyM: accuracyM,
        },
        select: { pointCount: true, totalDistanceM: true, lastPointAt: true },
      });
    });

    return NextResponse.json({
      ok: true,
      pointCount: updated.pointCount,
      totalDistanceM: updated.totalDistanceM,
      lastPointAt: updated.lastPointAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("GPS point write failed", error);
    return NextResponse.json({ error: "TRACK_POINT_WRITE_FAILED" }, { status: 500 });
  }
}
