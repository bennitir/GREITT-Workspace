"use client";

import { useId, useRef, useState } from "react";

type Props = {
  name: string;
  defaultValue?: string;
  placeholder: string;
  calendarLabel: string;
  required?: boolean;
};

function localToIso(value: string) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoToLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export default function LocalDateInput({
  name,
  defaultValue = "",
  placeholder,
  calendarLabel,
  required = false,
}: Props) {
  const id = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(defaultValue);
  const isoValue = localToIso(displayValue);

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.value = isoValue;
    picker.showPicker?.();
  }

  return (
    <div className="relative flex items-center">
      {/*
        The user edits the Icelandic display value, but the submitted form value
        is always ISO date-only. This keeps browser/UI formatting separate from
        the server/database contract.
      */}
      <input type="hidden" name={name} value={isoValue} />

      <input
        id={id}
        value={displayValue}
        onChange={(event) => setDisplayValue(event.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        pattern="[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{4}"
        className="w-full rounded-lg border bg-white px-3 py-2 pr-11"
      />

      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-2 h-8 w-8 opacity-0"
        onChange={(event) => {
          if (event.target.value) {
            setDisplayValue(isoToLocal(event.target.value));
          }
        }}
      />

      <button
        type="button"
        onClick={openPicker}
        aria-label={calendarLabel}
        title={calendarLabel}
        className="absolute right-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-lg text-slate-600 hover:bg-slate-100"
      >
        📅
      </button>
    </div>
  );
}
