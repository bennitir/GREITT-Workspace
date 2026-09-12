"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getMyTimeTrackingSettings,
  recordAutomaticServiceTime,
} from "@/app/actions/serviceTimeActions";
import { uiOptions, uiText } from "@/lib/i18n/ui";

function moduleFromPath(pathname: string) {
  if (pathname.startsWith("/fylgiskjol")) return "Bókhald";
  if (pathname.startsWith("/vsk")) return "VSK";
  if (pathname.startsWith("/verk")) return "Verk";
  if (pathname.startsWith("/innsyn")) return "Innsýn";
  if (pathname.startsWith("/laun")) return "Laun";
  if (pathname.startsWith("/bank")) return "Banki";
  if (pathname.startsWith("/vinnustundir")) return "Vinnusaga";
  return "GLÖGGT";
}

function formatElapsed(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type TrackingConfig = {
  mode: string;
  idleMinutes: number;
  todaySeconds: number;
  interfaceLanguage: string;
};

export default function ServiceTimeTracker() {
  const pathname = usePathname();
  const [cfg, setCfg] = useState<TrackingConfig | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const currentModule = useRef(moduleFromPath(pathname));
  const segmentStart = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());
  const persistedSeconds = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    currentModule.current = moduleFromPath(pathname);
  }, [pathname]);

  useEffect(() => {
    getMyTimeTrackingSettings()
      .then((value) => {
        const normalized: TrackingConfig = {
          mode: value.mode,
          idleMinutes: Number.isFinite(value.idleMinutes) ? value.idleMinutes : 10,
          todaySeconds: Number.isFinite(value.todaySeconds) ? value.todaySeconds : 0,
          interfaceLanguage: value.interfaceLanguage ?? "is",
        };
        persistedSeconds.current = normalized.todaySeconds;
        setElapsedSeconds(normalized.todaySeconds);
        setCfg(normalized);
      })
      .catch(() => setCfg({ mode: "OFF", idleMinutes: 10, todaySeconds: 0, interfaceLanguage: "is" }));
  }, []);

  // Mikilvægt: þessi effect fer EKKI eftir pathname. Route-skipti mega ekki
  // stofna nýjan interval/flush og tvítelja tímann.
  useEffect(() => {
    if (!cfg || !["AUTO", "AUTO_PROMPT"].includes(cfg.mode)) return;

    const idleMs = Math.max(1, cfg.idleMinutes) * 60_000;
    let disposed = false;

    const startSegment = (now: number) => {
      segmentStart.current = now;
      lastActivity.current = now;
    };

    const persist = async () => {
      if (disposed || saving.current || segmentStart.current === null) return;

      const started = segmentStart.current;
      const now = Date.now();
      const ended = Math.min(now, lastActivity.current + idleMs);
      const durationSeconds = Math.floor((ended - started) / 1000);
      if (durationSeconds < 1) return;

      saving.current = true;
      try {
        const result = await recordAutomaticServiceTime({
          startedAt: new Date(started).toISOString(),
          endedAt: new Date(ended).toISOString(),
          module: currentModule.current,
        });

        if (result?.recorded) {
          persistedSeconds.current += result.durationSeconds;
          segmentStart.current = ended;
        }
      } catch {
        // Tímaskráning má aldrei stöðva vinnu notanda.
      } finally {
        saving.current = false;
      }
    };

    const onActivity = () => {
      const now = Date.now();
      const gap = now - lastActivity.current;
      if (segmentStart.current === null || gap >= idleMs) startSegment(now);
      else lastActivity.current = now;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void persist();
      } else if (segmentStart.current === null) {
        startSegment(Date.now());
      }
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);

    startSegment(Date.now());

    const liveTimer = window.setInterval(() => {
      const now = Date.now();
      if (segmentStart.current !== null && now - lastActivity.current >= idleMs) {
        void persist();
      }

      const liveSeconds = segmentStart.current === null
        ? 0
        : Math.max(
            0,
            Math.floor((Math.min(now, lastActivity.current + idleMs) - segmentStart.current) / 1000)
          );

      setElapsedSeconds(persistedSeconds.current + liveSeconds);
    }, 1000);

    const flushTimer = window.setInterval(() => void persist(), 60_000);

    return () => {
      disposed = true;
      events.forEach((name) => window.removeEventListener(name, onActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(liveTimer);
      window.clearInterval(flushTimer);
      // Ekki async-flusha í cleanup: React dev/StrictMode getur keyrt cleanup
      // við remount og þannig stofnað tvær samhliða vistunaraðgerðir.
    };
  }, [cfg]);

  if (!cfg || !["AUTO", "AUTO_PROMPT"].includes(cfg.mode)) return null;

  const t = uiText(cfg.interfaceLanguage);
  const options = uiOptions(cfg.interfaceLanguage);
  const moduleLabel = (() => {
    const module = moduleFromPath(pathname);
    if (module === "Bókhald") return options.modules.bokhald;
    if (module === "Laun") return options.modules.laun;
    if (module === "Verk") return options.modules.verk;
    if (module === "Vinnusaga") return t.myHistory;
    return module;
  })();

  return (
    <div className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200">
      <div className="font-medium">⏱ {t.trackerActive}</div>
      <div className="mt-1 font-mono tabular-nums text-slate-300">
        {moduleLabel} · {formatElapsed(elapsedSeconds)}
      </div>
    </div>
  );
}
