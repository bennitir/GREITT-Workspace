"use client";

import { useEffect, useRef, useState } from "react";

type IcelandicDateInputProps = {
  name: string;
  label?: string;
  required?: boolean;
  defaultValue?: string;
  submitFormat?: "is" | "iso";
  calendarButtonLabel?: string;
  labelClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
};

function displayDateValue(defaultValue: string) {
  if (!defaultValue) return "";
  const match = defaultValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return defaultValue;
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

export default function IcelandicDateInput({
  name,
  label = "Dagsetning",
  required = false,
  defaultValue = "",
  submitFormat = "is",
  calendarButtonLabel = "Velja dagsetningu",
  labelClassName = "mb-1 block font-medium",
  inputClassName = "min-w-0 flex-1 rounded-lg border px-3 py-2",
  buttonClassName = "rounded-lg border px-3 py-2 hover:bg-gray-50",
}: IcelandicDateInputProps) {
  const [value, setValue] = useState(() => displayDateValue(defaultValue));
  const datePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(displayDateValue(defaultValue));
  }, [defaultValue]);

  function formatDateInput(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }

  function handleCalendarChange(dateValue: string) {
    if (!dateValue) {
      setValue("");
      return;
    }
    const [year, month, day] = dateValue.split("-");
    setValue(`${day}.${month}.${year}`);
  }

  function openCalendar() {
    const input = datePickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  }

  const submittedValue = (() => {
    if (submitFormat === "is") return value;
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return value;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  })();

  return (
    <div>
      <label className={labelClassName}>{label}</label>
      <div className="flex gap-2">
        <input type="hidden" name={name} value={submittedValue} />
        <input
          type="text"
          value={value}
          required={required}
          placeholder="dd.mm.áááá"
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setValue(formatDateInput(event.target.value))}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={openCalendar}
          title={calendarButtonLabel}
          aria-label={calendarButtonLabel}
          className={buttonClassName}
        >
          📅
        </button>
        <input
          ref={datePickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => handleCalendarChange(event.target.value)}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      </div>
    </div>
  );
}
