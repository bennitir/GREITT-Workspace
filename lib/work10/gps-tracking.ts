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
