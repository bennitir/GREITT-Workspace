"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE } from "@/lib/locale";

export default function TopClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  if (!now) {
    return (
      <div className="border-b bg-white px-6 py-3">
        <div className="h-5" />
      </div>
    );
  }

  const weekdays = [
  "sunnudagur",
  "mánudagur",
  "þriðjudagur",
  "miðvikudagur",
  "fimmtudagur",
  "föstudagur",
  "laugardagur",
];

const months = [
  "janúar",
  "febrúar",
  "mars",
  "apríl",
  "maí",
  "júní",
  "júlí",
  "ágúst",
  "september",
  "október",
  "nóvember",
  "desember",
];

const icelandParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Atlantic/Reykjavik",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
}).formatToParts(now);

const year = Number(
  icelandParts.find((part) => part.type === "year")?.value
);
const month = Number(
  icelandParts.find((part) => part.type === "month")?.value
);
const day = Number(
  icelandParts.find((part) => part.type === "day")?.value
);

const weekdayIndex = new Date(
  Date.UTC(year, month - 1, day)
).getUTCDay();

const dateText =
  `${weekdays[weekdayIndex]} ${day}. ${months[month - 1]} ${year}`;

  const timeText = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Atlantic/Reykjavik",
  }).format(now);

  return (
    <div className="border-b bg-white px-6 py-3">
      <div className="text-right text-sm text-gray-600">
        <span className="capitalize">{dateText}</span>
        <span className="mx-2">·</span>
        <span className="text-xl font-bold">{timeText}</span>
      </div>
    </div>
  );
}