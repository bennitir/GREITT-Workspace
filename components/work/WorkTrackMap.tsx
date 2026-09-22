"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TrackPoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

type Props = {
  points: TrackPoint[];
  startLabel: string;
  endLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  fitLabel: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_WIDTH = 340;
const DEFAULT_HEIGHT = 360;
const FIT_PADDING = 54;
const TILE_TEMPLATE = process.env.NEXT_PUBLIC_GLOGGT_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function worldPoint(latitude: number, longitude: number, zoom: number) {
  const lat = clampLatitude(latitude);
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((longitude + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function tileUrl(zoom: number, x: number, y: number) {
  return TILE_TEMPLATE
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

function fitZoom(points: TrackPoint[], width: number, height: number) {
  if (points.length <= 1) return 17;
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const world = points.map((point) => worldPoint(point.latitude, point.longitude, zoom));
    const xs = world.map((point) => point.x);
    const ys = world.map((point) => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= Math.max(1, width - FIT_PADDING * 2) && spanY <= Math.max(1, height - FIT_PADDING * 2)) {
      return zoom;
    }
  }
  return MIN_ZOOM;
}

export default function WorkTrackMap({ points, startLabel, endLabel, zoomInLabel, zoomOutLabel, fitLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [zoomOffset, setZoomOffset] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const width = Math.max(260, Math.round(element.getBoundingClientRect().width));
      setSize({ width, height: DEFAULT_HEIGHT });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const baseZoom = fitZoom(points, size.width, size.height);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseZoom + zoomOffset));
    const projected = points.map((point) => ({
      ...point,
      ...worldPoint(point.latitude, point.longitude, zoom),
    }));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const left = centerX - size.width / 2;
    const top = centerY - size.height / 2;
    const tileMinX = Math.floor(left / TILE_SIZE) - 1;
    const tileMaxX = Math.floor((left + size.width) / TILE_SIZE) + 1;
    const tileMinY = Math.floor(top / TILE_SIZE) - 1;
    const tileMaxY = Math.floor((top + size.height) / TILE_SIZE) + 1;
    const tileCount = 2 ** zoom;
    const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${zoom}-${tileX}-${tileY}`,
          url: tileUrl(zoom, wrappedX, tileY),
          left: tileX * TILE_SIZE - left,
          top: tileY * TILE_SIZE - top,
        });
      }
    }
    const screenPoints = projected.map((point) => ({
      ...point,
      screenX: point.x - left,
      screenY: point.y - top,
    }));
    return { baseZoom, zoom, tiles, screenPoints };
  }, [points, size, zoomOffset]);

  if (!geometry) return null;
  const first = geometry.screenPoints[0];
  const last = geometry.screenPoints[geometry.screenPoints.length - 1];
  const polyline = geometry.screenPoints.map((point) => `${point.screenX},${point.screenY}`).join(" ");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <div ref={containerRef} className="relative w-full overflow-hidden bg-slate-200" style={{ height: DEFAULT_HEIGHT }}>
        {geometry.tiles.map((tile) => (
          <div
            key={tile.key}
            aria-hidden="true"
            className="absolute h-64 w-64 bg-cover bg-center bg-no-repeat"
            style={{ left: tile.left, top: tile.top, backgroundImage: `url(${JSON.stringify(tile.url)})` }}
          />
        ))}

        <svg
          aria-label="GPS track"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          {geometry.screenPoints.length > 1 ? (
            <>
              <polyline points={polyline} fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />
              <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600" />
            </>
          ) : null}
          <circle cx={first.screenX} cy={first.screenY} r="9" fill="white" />
          <circle cx={first.screenX} cy={first.screenY} r="6" className="fill-emerald-600" />
          <circle cx={last.screenX} cy={last.screenY} r="9" fill="white" />
          <circle cx={last.screenX} cy={last.screenY} r="6" className="fill-rose-600" />
        </svg>

        <div className="absolute right-3 top-3 grid gap-2">
          <button
            type="button"
            onClick={() => setZoomOffset((value) => Math.min(3, value + 1))}
            className="h-11 w-11 rounded-xl border border-slate-300 bg-white/95 text-xl font-bold text-slate-900 shadow"
            aria-label={zoomInLabel}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoomOffset((value) => Math.max(-3, value - 1))}
            className="h-11 w-11 rounded-xl border border-slate-300 bg-white/95 text-xl font-bold text-slate-900 shadow"
            aria-label={zoomOutLabel}
          >
            −
          </button>
          {zoomOffset !== 0 ? (
            <button
              type="button"
              onClick={() => setZoomOffset(0)}
              className="min-h-10 rounded-xl border border-slate-300 bg-white/95 px-2 text-xs font-bold text-slate-800 shadow"
            >
              {fitLabel}
            </button>
          ) : null}
        </div>

        <div className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-slate-700 shadow-sm">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-white p-3 text-xs text-slate-700">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" />{startLabel}</div>
        <div className="flex items-center justify-end gap-2"><span className="h-3 w-3 rounded-full bg-rose-600" />{endLabel}</div>
      </div>
    </div>
  );
}
