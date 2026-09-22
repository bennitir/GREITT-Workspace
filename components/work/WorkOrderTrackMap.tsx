"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type TrackPoint = {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

type Track = {
  id: number;
  label: string;
  detail?: string | null;
  points: TrackPoint[];
};

type Props = {
  tracks: Track[];
  zoomInLabel: string;
  zoomOutLabel: string;
  fitLabel: string;
  startLabel: string;
  endLabel: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 520;
const FIT_PADDING = 62;
const DISPLAY_COORD_DECIMALS = 3;
const TILE_TEMPLATE = process.env.NEXT_PUBLIC_GLOGGT_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const TRACK_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#be123c",
  "#65a30d",
  "#0f766e",
  "#a16207",
  "#7c3aed",
  "#0369a1",
];

function roundDisplayCoordinate(value: number) {
  const factor = 10 ** DISPLAY_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

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

    if (
      spanX <= Math.max(1, width - FIT_PADDING * 2) &&
      spanY <= Math.max(1, height - FIT_PADDING * 2)
    ) {
      return zoom;
    }
  }

  return MIN_ZOOM;
}

export default function WorkOrderTrackMap({
  tracks,
  zoomInLabel,
  zoomOutLabel,
  fitLabel,
  startLabel,
  endLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [zoomOffset, setZoomOffset] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const width = Math.max(280, Math.round(element.getBoundingClientRect().width));
      setSize({ width, height: DEFAULT_HEIGHT });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);

  const geometry = useMemo(() => {
    const visibleTracks = tracks.filter((track) => track.points.length > 0);
    const allPoints = visibleTracks.flatMap((track) => track.points);
    if (allPoints.length === 0) return null;

    const baseZoom = fitZoom(allPoints, size.width, size.height);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseZoom + zoomOffset));
    const projectedPoints = allPoints.map((point) => worldPoint(point.latitude, point.longitude, zoom));
    const minX = Math.min(...projectedPoints.map((point) => point.x));
    const maxX = Math.max(...projectedPoints.map((point) => point.x));
    const minY = Math.min(...projectedPoints.map((point) => point.y));
    const maxY = Math.max(...projectedPoints.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const left = centerX - size.width / 2 - panOffset.x;
    const top = centerY - size.height / 2 - panOffset.y;

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
          left: roundDisplayCoordinate(tileX * TILE_SIZE - left),
          top: roundDisplayCoordinate(tileY * TILE_SIZE - top),
        });
      }
    }

    const projectedTracks = visibleTracks.map((track, index) => ({
      ...track,
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      points: track.points.map((point) => {
        const projected = worldPoint(point.latitude, point.longitude, zoom);
        return {
          ...point,
          screenX: roundDisplayCoordinate(projected.x - left),
          screenY: roundDisplayCoordinate(projected.y - top),
        };
      }),
    }));

    return { tiles, tracks: projectedTracks, baseZoom, zoom };
  }, [tracks, size, zoomOffset, panOffset]);


  const changeZoom = (delta: number) => {
    if (!geometry) return;

    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, geometry.zoom + delta));
    if (nextZoom === geometry.zoom) return;

    const nextZoomOffset = nextZoom - geometry.baseZoom;
    const scale = 2 ** (nextZoom - geometry.zoom);
    setPanOffset((value) => ({ x: value.x * scale, y: value.y * scale }));
    setZoomOffset(nextZoomOffset);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("button, a")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: panOffset.x,
      baseY: panOffset.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    setPanOffset({
      x: drag.baseX + (event.clientX - drag.startX),
      y: drag.baseY + (event.clientY - drag.startY),
    });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const resetView = () => {
    setZoomOffset(0);
    setPanOffset({ x: 0, y: 0 });
  };

  if (!mounted) {
    return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm" style={{ height: DEFAULT_HEIGHT }} aria-hidden="true" />;
  }

  if (!geometry) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden bg-slate-200 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ height: DEFAULT_HEIGHT, touchAction: "none", userSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
      >
        {geometry.tiles.map((tile) => (
          <div
            key={tile.key}
            aria-hidden="true"
            className="absolute h-64 w-64 bg-cover bg-center bg-no-repeat"
            style={{ left: tile.left, top: tile.top, backgroundImage: `url(${JSON.stringify(tile.url)})` }}
          />
        ))}

        <svg
          aria-label="GPS tracks"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          {geometry.tracks.map((track) => {
            const first = track.points[0];
            const last = track.points[track.points.length - 1];
            const polyline = track.points.map((point) => `${point.screenX},${point.screenY}`).join(" ");

            return (
              <g key={track.id}>
                {track.points.length > 1 ? (
                  <>
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke="white"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.45"
                    />
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke={track.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.85"
                    />
                  </>
                ) : null}
                <circle cx={first.screenX} cy={first.screenY} r="7" fill="white" stroke={track.color} strokeWidth="3" />
                <circle cx={last.screenX} cy={last.screenY} r="7" fill={track.color} stroke="white" strokeWidth="3" />
              </g>
            );
          })}
        </svg>

        <div className="absolute right-3 top-3 grid gap-2">
          <button
            type="button"
            onClick={() => changeZoom(1)}
            className="h-11 w-11 rounded-xl border border-slate-300 bg-white/95 text-xl font-bold text-slate-900 shadow"
            aria-label={zoomInLabel}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            className="h-11 w-11 rounded-xl border border-slate-300 bg-white/95 text-xl font-bold text-slate-900 shadow"
            aria-label={zoomOutLabel}
          >
            −
          </button>
          {zoomOffset !== 0 || panOffset.x !== 0 || panOffset.y !== 0 ? (
            <button
              type="button"
              onClick={resetView}
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

      <div className="border-t border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {geometry.tracks.map((track) => (
            <div key={track.id} className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: track.color }} />
              <span className="truncate font-semibold">{track.label}</span>
              {track.detail ? <span className="truncate text-slate-500">· {track.detail}</span> : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{startLabel}: ○</span>
          <span>{endLabel}: ●</span>
        </div>
      </div>
    </div>
  );
}
