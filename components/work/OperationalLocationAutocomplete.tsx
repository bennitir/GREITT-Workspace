"use client";

import { useMemo, useState } from "react";

type LocationOption = {
  id: number | null;
  name: string;
  code?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  displayText: string;
  inputText?: string;
  searchText: string;
};

type Props = {
  label: string;
  placeholder?: string;
  help?: string;
  locationIdName?: string;
  textName: string;
  options: LocationOption[];
  disabled?: boolean;
  inputClassName?: string;
  labelClassName?: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("is")
    .trim();
}

export default function OperationalLocationAutocomplete({
  label,
  placeholder,
  help,
  locationIdName = "operationalLocationId",
  textName,
  options,
  disabled = false,
  inputClassName = "rounded-lg border px-4 py-3",
  labelClassName = "grid gap-1",
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (needle.length < 2) return options.slice(0, 6);
    return options
      .filter((option) => normalize(option.searchText).includes(needle))
      .slice(0, 8);
  }, [options, query]);

  return (
    <label className={labelClassName}>
      <span>{label}</span>
      <input type="hidden" name={locationIdName} value={selectedId} />
      <div className="relative">
        <input
          name={textName}
          value={query}
          maxLength={240}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          className={`w-full ${inputClassName} disabled:bg-slate-100`}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId("");
            setOpen(true);
          }}
        />
        {open && !disabled && matches.length > 0 ? (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {matches.map((option, index) => (
              <button
                type="button"
                key={`${option.id ?? "text"}-${option.displayText}-${index}`}
                className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(option.inputText ?? option.displayText);
                  setSelectedId(option.id ? String(option.id) : "");
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-semibold text-slate-900">{option.displayText}</span>
                {option.code ? <span className="mt-0.5 block text-xs text-slate-500">{option.code}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {help ? <span className="text-xs leading-5 text-slate-500">{help}</span> : null}
    </label>
  );
}

export type { LocationOption };
