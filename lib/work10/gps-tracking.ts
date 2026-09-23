import { normalizeWorkStartContext } from "@/lib/work10/work-start-requirements";

export function workStartContextUsesGps(value: unknown) {
  const context = normalizeWorkStartContext(value);
  if (!context?.gpsAcknowledgedAt) return false;
  return context.rules.some((rule) => rule.kind === "GPS_PROGRESS");
}

export function haversineDistanceM(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusM = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

export type GpsDistancePoint = {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  speedMps?: number | null;
};

const MAX_ACCEPTED_GPS_SEGMENT_M = 10_000;
const STATIONARY_GPS_SPEED_MPS = 1.5;

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Returns the distance that may count toward the operational track length.
 *
 * Raw GPS points remain untouched. We only suppress a segment when both
 * endpoints explicitly report near-stationary speed and the measured move
 * is no larger than the reported GPS uncertainty. This is intentionally
 * conservative so slow walking/machinery movement is not broadly smoothed.
 */
export function acceptedGpsSegmentDistanceM(
  from: GpsDistancePoint,
  to: GpsDistancePoint,
) {
  const rawDistanceM = haversineDistanceM(from, to);

  if (
    !Number.isFinite(rawDistanceM) ||
    rawDistanceM < 0 ||
    rawDistanceM > MAX_ACCEPTED_GPS_SEGMENT_M
  ) {
    return 0;
  }

  const fromSpeedMps = finiteNonNegative(from.speedMps);
  const toSpeedMps = finiteNonNegative(to.speedMps);
  const fromAccuracyM = finiteNonNegative(from.accuracyM);
  const toAccuracyM = finiteNonNegative(to.accuracyM);

  const bothNearStationary =
    fromSpeedMps !== null &&
    toSpeedMps !== null &&
    fromSpeedMps <= STATIONARY_GPS_SPEED_MPS &&
    toSpeedMps <= STATIONARY_GPS_SPEED_MPS;

  const uncertaintyM = Math.max(fromAccuracyM ?? 0, toAccuracyM ?? 0);

  if (bothNearStationary && uncertaintyM > 0 && rawDistanceM <= uncertaintyM) {
    return 0;
  }

  return rawDistanceM;
}
