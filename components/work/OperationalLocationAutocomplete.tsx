"use client";

import { useEffect, useMemo, useState } from "react";

type LocationOption = {
  id: number | null;
  externalId?: string | null;
  source?: "LOCAL" | "HMS" | string;
  name: string;
  code?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  displayText: string;
  inputText?: string;
  searchText: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  label: string;
  placeholder?: string;
  help?: string;
  locationIdName?: string;
  externalAddressIdName?: string;
  textName: string;
  options: LocationOption[];
  disabled?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  officialSearchEnabled?: boolean;
  officialSourceLabel?: string;
  officialSearchingLabel?: string;
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
  externalAddressIdName = "externalAddressId",
  textName,
  options,
  disabled = false,
  inputClassName = "rounded-lg border px-4 py-3",
  labelClassName = "grid gap-1",
  officialSearchEnabled = true,
  officialSourceLabel,
  officialSearchingLabel,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [externalAddressId, setExternalAddressId] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<LocationOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const localMatches = useMemo(() => {
    const needle = normalize(query);
    if (needle.length < 2) return options.slice(0, 6);
    return options
      .filter((option) => normalize(option.searchText).includes(needle))
      .slice(0, 6);
  }, [options, query]);

  useEffect(() => {
    if (!officialSearchEnabled || disabled) {
      setRemoteOptions([]);
      setRemoteLoading(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 3 || selectedId || externalAddressId) {
      setRemoteOptions([]);
      setRemoteLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setRemoteLoading(true);
        const response = await fetch(`/api/stadfong?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("address search failed");
        const data = (await response.json()) as { items?: LocationOption[] };
        setRemoteOptions(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        if ((error as { name?: string })?.name !== "AbortError") setRemoteOptions([]);
      } finally {
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [disabled, externalAddressId, officialSearchEnabled, query, selectedId]);

  const matches = useMemo(() => {
    const seen = new Set<string>();
    const result: LocationOption[] = [];
    for (const option of [...localMatches, ...remoteOptions]) {
      const key = normalize(option.displayText);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(option);
      if (result.length >= 10) break;
    }
    return result;
  }, [localMatches, remoteOptions]);

  return (
    <label className={labelClassName}>
      <span>{label}</span>
      <input type="hidden" name={locationIdName} value={selectedId} />
      <input type="hidden" name={externalAddressIdName} value={externalAddressId} />
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
            setExternalAddressId("");
            setOpen(true);
          }}
        />
        {open && !disabled && (matches.length > 0 || remoteLoading) ? (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {matches.map((option, index) => (
              <button
                type="button"
                key={`${option.id ?? option.externalId ?? "text"}-${option.displayText}-${index}`}
                className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(option.inputText ?? option.displayText);
                  setSelectedId(option.id ? String(option.id) : "");
                  setExternalAddressId(option.externalId ?? "");
                  setRemoteOptions([]);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-semibold text-slate-900">{option.displayText}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {option.source === "HMS" ? officialSourceLabel : option.code}
                </span>
              </button>
            ))}
            {remoteLoading && officialSearchingLabel ? (
              <div className="px-3 py-2 text-xs text-slate-500">{officialSearchingLabel}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {help ? <span className="text-xs leading-5 text-slate-500">{help}</span> : null}
    </label>
  );
}

export type { LocationOption };
