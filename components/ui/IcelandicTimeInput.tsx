"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  required?: boolean;
  defaultValue?: string;
};

const hours = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);

const minutes = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

export default function IcelandicTimeInput({
  name,
  required = false,
  defaultValue = "",
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedHour, selectedMinute] = value.includes(":")
    ? value.split(":")
    : ["08", "00"];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function chooseHour(hour: string) {
    setValue(`${hour}:${selectedMinute || "00"}`);
  }

  function chooseMinute(minute: string) {
    setValue(`${selectedHour || "08"}:${minute}`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative mt-1">
      <div className="flex">
        <input
          type="text"
          name={name}
          required={required}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="HH:mm"
          inputMode="numeric"
          pattern="^([01]\d|2[0-3]):[0-5]\d$"
          className="w-full rounded-l-lg border border-r-0 px-3 py-2"
        />

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-r-lg border px-3 py-2 hover:bg-slate-100"
          aria-label="Velja tíma"
        >
          🕒
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex rounded-lg border bg-white p-2 shadow-lg">
          <div className="max-h-56 overflow-y-auto border-r pr-2">
            <div className="mb-1 px-2 text-xs font-semibold text-slate-500">
              Klst.
            </div>

            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => chooseHour(hour)}
                className={`block w-full rounded px-3 py-1 text-left hover:bg-blue-50 ${
                  selectedHour === hour
                    ? "bg-blue-600 text-white hover:bg-blue-600"
                    : ""
                }`}
              >
                {hour}
              </button>
            ))}
          </div>

          <div className="max-h-56 overflow-y-auto pl-2">
            <div className="mb-1 px-2 text-xs font-semibold text-slate-500">
              Mín.
            </div>

            {minutes.map((minute) => (
              <button
                key={minute}
                type="button"
                onClick={() => chooseMinute(minute)}
                className={`block w-full rounded px-3 py-1 text-left hover:bg-blue-50 ${
                  selectedMinute === minute
                    ? "bg-blue-600 text-white hover:bg-blue-600"
                    : ""
                }`}
              >
                {minute}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}