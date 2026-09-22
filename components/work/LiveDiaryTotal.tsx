"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  completedMinutes: number;
  activeStartedAt?: string | null;
  language: string;
};

function formatMinutes(total: number, language: string) {
  const safe = Math.max(0, Math.floor(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (language === "en") return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  if (language === "pl") return hours > 0 ? `${hours} godz. ${minutes} min` : `${minutes} min`;
  if (language === "sr") return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  return hours > 0 ? `${hours} klst. ${minutes} mín.` : `${minutes} mín.`;
}

export default function LiveDiaryTotal({ completedMinutes, activeStartedAt, language }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activeStartedAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [activeStartedAt]);

  const total = useMemo(() => {
    if (!activeStartedAt) return completedMinutes;
    const started = new Date(activeStartedAt).getTime();
    if (!Number.isFinite(started)) return completedMinutes;
    return completedMinutes + Math.max(0, Math.floor((nowMs - started) / 60_000));
  }, [activeStartedAt, completedMinutes, nowMs]);

  return <>{formatMinutes(total, language)}</>;
}
