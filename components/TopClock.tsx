"use client";

import { useEffect, useState } from "react";
import { normalizeUiLanguage, type UiLanguage } from "@/lib/i18n/ui";

type Props = {
  interfaceLanguage?: string;
};

const DATE_LOCALE_BY_LANGUAGE: Record<UiLanguage, string> = {
  is: "is-IS",
  en: "en-GB",
  pl: "pl-PL",
  sr: "sr-Cyrl-RS",
};

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

export default function TopClock({ interfaceLanguage }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (!now) {
    return (
      <div className="border-b bg-white px-6 py-3">
        <div className="h-5" />
      </div>
    );
  }

  const language = normalizeUiLanguage(interfaceLanguage);
  const locale = DATE_LOCALE_BY_LANGUAGE[language];

  const dateText = capitalizeFirst(
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Atlantic/Reykjavik",
    }).format(now)
  );

  const timeText = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Atlantic/Reykjavik",
  }).format(now);

  return (
    <div className="border-b bg-white px-6 py-3">
      <div className="text-right text-sm text-gray-600">
        <span>{dateText}</span>
        <span className="mx-2">·</span>
        <span className="text-xl font-bold">{timeText}</span>
      </div>
    </div>
  );
}
