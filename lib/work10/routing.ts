import { prisma } from "@/lib/prisma";
import { normalizeIcelandAddressSearch } from "@/lib/work10/iceland-address";

const DEFAULT_ROUTING_BASE_URL = "https://valhalla1.openstreetmap.de";
const ROUTE_SOURCE = "API";
const ROUTE_TIMEOUT_MS = 6000;

type RouteLocation = {
  id: number;
  companyId: number;
  address: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

type RouteEstimate = {
  distanceKm: number;
  defaultMinutes: number;
  source: string;
};

function finiteCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function roundDistance(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function resolveMissingCoordinates(location: RouteLocation) {
  if (finiteCoordinate(location.latitude) && finiteCoordinate(location.longitude)) return location;

  const address = String(location.address ?? "").trim();
  if (!address) return location;

  const exact = await prisma.icelandAddress.findFirst({
    where: {
      addressText: address,
      ...(location.postalCode ? { postalCode: location.postalCode } : {}),
      latitude: { not: null },
      longitude: { not: null },
    },
    select: { latitude: true, longitude: true },
  });

  const normalized = normalizeIcelandAddressSearch(address);
  const fallback = exact ?? (normalized
    ? await prisma.icelandAddress.findFirst({
        where: {
          displaySearch: { startsWith: normalized },
          ...(location.postalCode ? { postalCode: location.postalCode } : {}),
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: [{ houseNumberSort: "asc" }, { houseLetter: "asc" }],
        select: { latitude: true, longitude: true },
      })
    : null);

  if (!fallback || !finiteCoordinate(fallback.latitude) || !finiteCoordinate(fallback.longitude)) return location;

  const updated = await prisma.operationalLocation.update({
    where: { id: location.id },
    data: { latitude: fallback.latitude, longitude: fallback.longitude },
    select: {
      id: true,
      companyId: true,
      address: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  });
  return updated;
}

async function fetchValhallaRoute(from: RouteLocation, to: RouteLocation): Promise<RouteEstimate | null> {
  if (!finiteCoordinate(from.latitude) || !finiteCoordinate(from.longitude) || !finiteCoordinate(to.latitude) || !finiteCoordinate(to.longitude)) {
    return null;
  }
  if (process.env.GLOGGT_ROUTING_DISABLED === "1") return null;

  const baseUrl = String(process.env.GLOGGT_ROUTING_BASE_URL ?? DEFAULT_ROUTING_BASE_URL).trim().replace(/\/$/, "");
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-client-id": "gloggt.is",
        "user-agent": "GLOGGT-routing/1.0 (https://gloggt.is)",
      },
      body: JSON.stringify({
        locations: [
          { lat: from.latitude, lon: from.longitude, type: "break" },
          { lat: to.latitude, lon: to.longitude, type: "break" },
        ],
        costing: "auto",
        units: "kilometers",
        directions_options: { units: "kilometers" },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = await response.json() as {
      trip?: { summary?: { length?: number; time?: number } };
    };
    const length = Number(payload.trip?.summary?.length);
    const seconds = Number(payload.trip?.summary?.time);
    if (!Number.isFinite(length) || length < 0 || !Number.isFinite(seconds) || seconds < 0) return null;

    return {
      distanceKm: roundDistance(length),
      defaultMinutes: length === 0 ? 0 : Math.max(1, Math.ceil(seconds / 60)),
      source: ROUTE_SOURCE,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureOperationalTravelRoute(input: {
  companyId: number;
  fromLocationId: number;
  toLocationId: number;
}): Promise<RouteEstimate | null> {
  if (input.fromLocationId === input.toLocationId) {
    return { distanceKm: 0, defaultMinutes: 0, source: "SAME_LOCATION" };
  }

  const existing = await prisma.operationalTravelRoute.findUnique({
    where: {
      companyId_fromLocationId_toLocationId: {
        companyId: input.companyId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
      },
    },
    select: { id: true, distanceKm: true, defaultMinutes: true, source: true, isActive: true },
  });
  if (existing?.isActive && existing.source !== "TEST_PROJECTION") {
    return { distanceKm: existing.distanceKm, defaultMinutes: existing.defaultMinutes, source: existing.source };
  }

  const locations = await prisma.operationalLocation.findMany({
    where: {
      companyId: input.companyId,
      id: { in: [input.fromLocationId, input.toLocationId] },
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
      address: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  });
  const fromRaw = locations.find((location) => location.id === input.fromLocationId);
  const toRaw = locations.find((location) => location.id === input.toLocationId);
  if (!fromRaw || !toRaw) return existing?.isActive
    ? { distanceKm: existing.distanceKm, defaultMinutes: existing.defaultMinutes, source: existing.source }
    : null;

  const [from, to] = await Promise.all([
    resolveMissingCoordinates(fromRaw),
    resolveMissingCoordinates(toRaw),
  ]);
  const estimate = await fetchValhallaRoute(from, to);
  if (!estimate) return existing?.isActive
    ? { distanceKm: existing.distanceKm, defaultMinutes: existing.defaultMinutes, source: existing.source }
    : null;

  await prisma.operationalTravelRoute.upsert({
    where: {
      companyId_fromLocationId_toLocationId: {
        companyId: input.companyId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
      },
    },
    create: {
      companyId: input.companyId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      distanceKm: estimate.distanceKm,
      defaultMinutes: estimate.defaultMinutes,
      source: estimate.source,
      isActive: true,
      notes: "Sjálfvirk leið úr OpenStreetMap með Valhalla.",
    },
    update: {
      distanceKm: estimate.distanceKm,
      defaultMinutes: estimate.defaultMinutes,
      source: estimate.source,
      isActive: true,
      notes: "Sjálfvirk leið úr OpenStreetMap með Valhalla.",
    },
  });

  return estimate;
}

export async function ensureCompanyBaseRoute(input: {
  companyId: number;
  toLocationId: number | null | undefined;
}) {
  if (!input.toLocationId) return null;
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { defaultOperationalLocationId: true },
  });
  if (!company?.defaultOperationalLocationId) return null;
  return ensureOperationalTravelRoute({
    companyId: input.companyId,
    fromLocationId: company.defaultOperationalLocationId,
    toLocationId: input.toLocationId,
  });
}
