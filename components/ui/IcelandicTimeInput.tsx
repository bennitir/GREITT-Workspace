"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  name?: string;
  hourName?: string;
  minuteName?: string;
  required?: boolean;
  defaultValue?: string;
  minuteStep?: number;
  pickerLabel?: string;
  hourLabel?: string;
  minuteLabel?: string;
  inputClassName?: string;
};

const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

export default function IcelandicTimeInput({
  name,
  hourName,
  minuteName,
  required = false,
  defaultValue = "",
  minuteStep = 5,
  pickerLabel = "Velja tíma",
  hourLabel = "Klst.",
  minuteLabel = "Mín.",
  inputClassName = "w-full rounded-l-lg border border-r-0 px-3 py-2",
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const minutes = useMemo(() => {
    const safeStep = Number.isInteger(minuteStep) && minuteStep > 0 && minuteStep <= 60 ? minuteStep : 5;
    return Array.from({ length: Math.ceil(60 / safeStep) }, (_, i) => String(i * safeStep).padStart(2, "0")).filter((item) => Number(item) < 60);
  }, [minuteStep]);

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const selectedHour = match?.[1] ?? "";
  const selectedMinute = match?.[2] ?? "";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function chooseHour(hour: string) {
    setValue(`${hour}:${selectedMinute || "00"}`);
  }

  function chooseMinute(minute: string) {
    if (!selectedHour) return;
    setValue(`${selectedHour}:${minute}`);
    setOpen(false);
  }

  function handleTextChange(rawValue: string) {
    if (!rawValue) {
      setValue("");
      return;
    }
    const cleaned = rawValue.replace(/[^0-9:]/g, "").slice(0, 5);
    setValue(cleaned);
  }

  function normalizeTypedValue() {
    const text = value.trim();
    if (!text) return;

    const hourOnly = /^(\d{1,2})$/.exec(text);
    if (hourOnly) {
      const hour = Number(hourOnly[1]);
      if (hour >= 0 && hour <= 23) setValue(`${String(hour).padStart(2, "0")}:00`);
      return;
    }

    const compact = /^(\d{3,4})$/.exec(text);
    if (compact) {
      const digits = compact[1].padStart(4, "0");
      const hour = Number(digits.slice(0, 2));
      const minute = Number(digits.slice(2));
      if (hour <= 23 && minute <= 59) setValue(`${digits.slice(0, 2)}:${digits.slice(2)}`);
      return;
    }

    const clock = /^(\d{1,2}):(\d{1,2})$/.exec(text);
    if (clock) {
      const hour = Number(clock[1]);
      const minute = Number(clock[2]);
      if (hour <= 23 && minute <= 59) setValue(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }

  return (
    <div ref={containerRef} className="relative mt-1">
      {hourName ? <input type="hidden" name={hourName} value={selectedHour} /> : null}
      {minuteName ? <input type="hidden" name={minuteName} value={selectedMinute} /> : null}
      <div className="flex">
        <input
          type="text"
          name={name}
          required={required}
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={normalizeTypedValue}
          placeholder="HH:mm"
          inputMode="numeric"
          autoComplete="off"
          pattern="^([01]\d|2[0-3]):[0-5]\d$"
          className={inputClassName}
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-r-lg border px-3 py-2 hover:bg-slate-100"
          aria-label={pickerLabel}
          title={pickerLabel}
        >
          🕒
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 flex rounded-lg border bg-white p-2 shadow-lg">
          <div className="max-h-60 overflow-y-auto border-r pr-2">
            <div className="mb-1 px-2 text-xs font-semibold text-slate-500">{hourLabel}</div>
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => chooseHour(hour)}
                className={`block w-full rounded px-3 py-1 text-left hover:bg-blue-50 ${selectedHour === hour ? "bg-blue-600 text-white hover:bg-blue-600" : ""}`}
              >
                {hour}
              </button>
            ))}
          </div>
          <div className={`max-h-60 overflow-y-auto pl-2 ${selectedHour ? "" : "opacity-45"}`}>
            <div className="mb-1 px-2 text-xs font-semibold text-slate-500">{minuteLabel}</div>
            {minutes.map((minute) => (
              <button
                key={minute}
                type="button"
                disabled={!selectedHour}
                onClick={() => chooseMinute(minute)}
                className={`block w-full rounded px-3 py-1 text-left hover:bg-blue-50 disabled:cursor-not-allowed ${selectedMinute === minute ? "bg-blue-600 text-white hover:bg-blue-600" : ""}`}
              >
                {minute}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
