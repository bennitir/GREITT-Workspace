"use client";

import { useEffect, useRef, useState } from "react";

import { workGpsText } from "@/lib/i18n/work-gps";

const MAX_ACCEPTED_ACCURACY_M = 80;
const MIN_SEND_INTERVAL_MS = 8_000;
const FORCE_SEND_INTERVAL_MS = 25_000;
const MIN_MOVEMENT_M = 5;

type Props = {
  sessionId: number;
  language: string;
  initialPointCount?: number;
};

type Status = "WAITING" | "ACTIVE" | "WEAK" | "DENIED" | "UNAVAILABLE" | "UNSUPPORTED" | "ERROR";

type WakeLockStatus = "WAITING" | "ACTIVE" | "UNAVAILABLE" | "UNSUPPORTED";

type ScreenWakeLockSentinel = EventTarget & {
  released?: boolean;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

type Sample = {
  latitude: number;
  longitude: number;
  accuracy: number;
  recordedAtMs: number;
};

function haversineDistanceM(from: Sample, to: Sample) {
  const earthRadiusM = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MobileGpsTracker({ sessionId, language, initialPointCount = 0 }: Props) {
  const t = workGpsText(language);
  const [status, setStatus] = useState<Status>("WAITING");
  const [pointCount, setPointCount] = useState(initialPointCount);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>("WAITING");
  const lastSentRef = useRef<Sample | null>(null);
  const sendingRef = useRef(false);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);

  useEffect(() => {
    const wakeLockApi = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLockApi) {
      setWakeLockStatus("UNSUPPORTED");
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const acquireWakeLock = async () => {
      if (cancelled || requestInFlight || wakeLockRef.current || document.visibilityState !== "visible") return;

      requestInFlight = true;
      setWakeLockStatus("WAITING");
      try {
        const sentinel = await wakeLockApi.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }

        wakeLockRef.current = sentinel;
        setWakeLockStatus("ACTIVE");

        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          if (!cancelled) {
            setWakeLockStatus(document.visibilityState === "visible" ? "UNAVAILABLE" : "WAITING");
          }
        }, { once: true });
      } catch {
        if (!cancelled) setWakeLockStatus("UNAVAILABLE");
      } finally {
        requestInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquireWakeLock();
      } else if (!cancelled) {
        setWakeLockStatus("WAITING");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void acquireWakeLock();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("UNSUPPORTED");
      return;
    }

    let cancelled = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return;
        const coords = position.coords;
        const next: Sample = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          recordedAtMs: position.timestamp || Date.now(),
        };
        setAccuracy(coords.accuracy);

        if (!Number.isFinite(coords.accuracy) || coords.accuracy > MAX_ACCEPTED_ACCURACY_M) {
          setStatus("WEAK");
          return;
        }

        const previous = lastSentRef.current;
        const elapsed = previous ? next.recordedAtMs - previous.recordedAtMs : Number.POSITIVE_INFINITY;
        const moved = previous ? haversineDistanceM(previous, next) : Number.POSITIVE_INFINITY;
        const shouldSend = !previous || elapsed >= FORCE_SEND_INTERVAL_MS || (elapsed >= MIN_SEND_INTERVAL_MS && moved >= MIN_MOVEMENT_M);
        if (!shouldSend || sendingRef.current) {
          if (previous) setStatus("ACTIVE");
          return;
        }

        sendingRef.current = true;
        void fetch("/api/mobile/verk/gps/point", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyM: coords.accuracy,
            altitudeM: coords.altitude,
            headingDeg: coords.heading,
            speedMps: coords.speed,
            recordedAt: new Date(next.recordedAtMs).toISOString(),
          }),
          cache: "no-store",
        })
          .then(async (response) => {
            if (!response.ok) throw new Error(`GPS_POINT_${response.status}`);
            const payload = await response.json() as { pointCount?: number };
            if (cancelled) return;
            lastSentRef.current = next;
            if (typeof payload.pointCount === "number") setPointCount(payload.pointCount);
            else setPointCount((value) => value + 1);
            setStatus("ACTIVE");
          })
          .catch(() => {
            if (!cancelled) setStatus("ERROR");
          })
          .finally(() => {
            sendingRef.current = false;
          });
      },
      (error) => {
        if (cancelled) return;
        if (error.code === error.PERMISSION_DENIED) setStatus("DENIED");
        else if (error.code === error.POSITION_UNAVAILABLE) setStatus("UNAVAILABLE");
        else setStatus("WAITING");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3_000,
        timeout: 20_000,
      },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [sessionId]);

  const statusText =
    status === "ACTIVE" ? t.active :
    status === "WEAK" ? t.weak :
    status === "DENIED" ? t.denied :
    status === "UNAVAILABLE" ? t.unavailable :
    status === "UNSUPPORTED" ? t.unsupported :
    status === "ERROR" ? t.error :
    t.waiting;

  const wakeLockText =
    wakeLockStatus === "ACTIVE" ? t.wakeLockActive :
    wakeLockStatus === "UNAVAILABLE" ? t.wakeLockUnavailable :
    wakeLockStatus === "UNSUPPORTED" ? t.wakeLockUnsupported :
    t.wakeLockWaiting;

  const tone = status === "ACTIVE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : status === "DENIED" || status === "ERROR" || status === "UNSUPPORTED"
      ? "border-rose-200 bg-rose-50 text-rose-950"
      : "border-blue-200 bg-blue-50 text-blue-950";

  return (
    <section className={`mt-3 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{t.title}</p>
          <p className="mt-1 text-xs leading-5">{statusText}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold">{pointCount} {t.points}</span>
      </div>
      {accuracy !== null ? <p className="mt-2 text-xs">{t.accuracy}: ±{Math.round(accuracy)} m</p> : null}
      <p className="mt-2 text-[11px] font-semibold leading-4 opacity-85">{wakeLockText}</p>
      <p className="mt-1 text-[11px] leading-4 opacity-70">{t.firstTest}</p>
    </section>
  );
}
