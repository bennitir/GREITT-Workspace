"use client";

import { useEffect, useRef, useState } from "react";

type IcelandicDateInputProps = {
  name: string;
  label?: string;
  required?: boolean;
  defaultValue?: string;
  submitFormat?: "is" | "iso";
};

export default function IcelandicDateInput({
  name,
  label = "Dagsetning",
  required = false,
  defaultValue = "",
  submitFormat = "is",
}: IcelandicDateInputProps) {


  const [value, setValue] = useState(() => {
  if (!defaultValue) {
    return "";
  }

  const match = defaultValue.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }

  return defaultValue;
});

useEffect(() => {
  if (!defaultValue) {
    setValue("");
    return;
  }

  const match = defaultValue.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    const [, year, month, day] = match;
    setValue(`${day}.${month}.${year}`);
    return;
  }

  setValue(defaultValue);
}, [defaultValue]);

  const datePickerRef = useRef<HTMLInputElement>(null);

  function formatDateInput(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 2) {
      return digits;
    }

    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }

    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }

  function handleCalendarChange(dateValue: string) {
    if (!dateValue) {
      return;
    }

    const [year, month, day] = dateValue.split("-");
    setValue(`${day}.${month}.${year}`);
  }

  function openCalendar() {
  const input = datePickerRef.current;

  if (!input) {
    return;
  }

  input.showPicker();
}

const submittedValue = (() => {
  if (submitFormat === "is") {
    return value;
  }

  const match = value.match(
    /^(\d{2})\.(\d{2})\.(\d{4})$/
  );

  if (!match) {
    return value;
  }

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
})();

  return (
    <div>
      <label className="mb-1 block font-medium">
        {label}
      </label>

      <div className="flex gap-2">

<input
  type="hidden"
  name={name}
  value={submittedValue}
/>

        <input
  type="text"
  value={value}
  required={required}
  placeholder="dd.mm.áááá"
  inputMode="numeric"
  onChange={(event) =>
    setValue(formatDateInput(event.target.value))
  }
  className="min-w-0 flex-1 rounded-lg border px-3 py-2"
/>

        <button
          type="button"
          onClick={openCalendar}
          title="Velja dagsetningu"
          className="rounded-lg border px-3 py-2 hover:bg-gray-50"
        >
          📅
        </button>

        <input
          ref={datePickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) =>
            handleCalendarChange(event.target.value)
          }
          className="absolute h-0 w-0 opacity-0"
        />
      </div>
    </div>
  );
}