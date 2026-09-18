"use client";

import { useMemo, useState } from "react";

import { inventoryFormatNumber, inventoryText } from "@/lib/i18n/inventory";
import { work10UnitText } from "@/lib/i18n/work10";
import { recordMaterialUsageFact } from "./actions";

type PickerLocation = {
  id: number;
  name: string;
  code: string;
  available: number;
};

type PickerItem = {
  id: number;
  sku: string;
  name: string;
  baseUnit: string;
  customUnit: string | null;
  totalStock: number;
  locations: PickerLocation[];
};

type Props = {
  workOrderId: number;
  workPartId: number;
  language: string;
  items: PickerItem[];
};

const MANUAL_UNITS = ["PCS", "KG", "L", "M", "M2", "M3", "CUSTOM"] as const;

function displayFromIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export default function MaterialUsageForm({ workOrderId, workPartId, language, items }: Props) {
  const t = inventoryText(language);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [dateText, setDateText] = useState("");

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedLocation = selectedItem?.locations.find((location) => location.id === selectedLocationId) ?? null;

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.sku} ${item.name}`.toLocaleLowerCase().includes(needle),
    );
  }, [items, query]);

  function chooseItem(item: PickerItem) {
    setSelectedItemId(item.id);
    const preferred = item.locations.find((location) => location.available > 0) ?? item.locations[0] ?? null;
    setSelectedLocationId(preferred?.id ?? null);
    setManualMode(false);
    setPickerOpen(false);
  }

  function resetToPicker() {
    setSelectedItemId(null);
    setSelectedLocationId(null);
    setManualMode(false);
    setPickerOpen(true);
  }

  return (
    <>
      <form action={recordMaterialUsageFact} className="mt-3 grid gap-3">
        <input type="hidden" name="workOrderId" value={workOrderId} />
        <input type="hidden" name="workPartId" value={workPartId} />
        <input type="hidden" name="inventoryItemId" value={selectedItem?.id ?? ""} />
        <input type="hidden" name="inventoryLocationId" value={selectedLocation?.id ?? ""} />

        {!manualMode && !selectedItem ? (
          <div className="rounded-xl border border-dashed bg-white p-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100"
            >
              <span className="block">📦 {t.chooseItem}</span>
              <span className="mt-1 block text-xs font-normal text-blue-700">{t.chooseItemHelp}</span>
            </button>
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {t.manualMaterial}
            </button>
          </div>
        ) : null}

        {selectedItem ? (
          <div className="rounded-xl border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.selectedItem}</p>
                <p className="mt-1 font-semibold text-slate-950">{selectedItem.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedItem.sku} · {t.available}: {inventoryFormatNumber(selectedItem.totalStock, language)} {work10UnitText(selectedItem.baseUnit, selectedItem.customUnit, language)}
                </p>
              </div>
              <button type="button" onClick={resetToPicker} className="text-xs font-semibold text-blue-700 hover:underline">
                {t.changeItem}
              </button>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">
              <span>{t.usageLocation}</span>
              <select
                value={selectedLocationId ?? ""}
                onChange={(event) => setSelectedLocationId(Number(event.target.value) || null)}
                required
                className="rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>—</option>
                {selectedItem.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {inventoryFormatNumber(location.available, language)} {work10UnitText(selectedItem.baseUnit, selectedItem.customUnit, language)}
                  </option>
                ))}
              </select>
            </label>
            {selectedItem.locations.length === 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t.noLocations}</p>
            ) : null}
          </div>
        ) : null}

        {manualMode ? (
          <div className="rounded-xl border bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.freeTextMaterial}</p>
              <button type="button" onClick={() => { setManualMode(false); setPickerOpen(true); }} className="text-xs font-semibold text-blue-700 hover:underline">
                {t.backToInventory}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.name}</span>
                <input name="resourceLabel" required maxLength={160} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.sku}</span>
                <input name="resourceCode" maxLength={80} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.unit}</span>
                <select name="unit" defaultValue="PCS" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  {MANUAL_UNITS.map((unit) => <option key={unit} value={unit}>{work10UnitText(unit, null, language)}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.customUnit}</span>
                <input name="customUnit" maxLength={40} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
            </div>
          </div>
        ) : null}

        {(selectedItem || manualMode) ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.usageDate}</span>
                <div className="relative flex rounded-lg border bg-white focus-within:ring-2 focus-within:ring-blue-100">
                  <input
                    name="usageDate"
                    required
                    value={dateText}
                    onChange={(event) => setDateText(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd.mm.áááá"
                    pattern="(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.\d{4}"
                    className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm outline-none"
                  />
                  <label className="relative grid w-11 cursor-pointer place-items-center border-l text-base" title={t.openCalendar}>
                    📅
                    <input
                      type="date"
                      tabIndex={-1}
                      aria-label={t.openCalendar}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(event) => setDateText(displayFromIso(event.target.value))}
                    />
                  </label>
                </div>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.quantityUsed}</span>
                <div className="flex rounded-lg border bg-white">
                  <input name="quantity" required inputMode="decimal" className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm outline-none" />
                  <span className="grid min-w-16 place-items-center border-l px-2 text-xs font-semibold text-slate-500">
                    {selectedItem ? work10UnitText(selectedItem.baseUnit, selectedItem.customUnit, language) : ""}
                  </span>
                </div>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              <span>{t.usageNote}</span>
              <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
            </label>
            <button
              type="submit"
              disabled={Boolean(selectedItem && !selectedLocation)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.recordUsage}
            </button>
          </>
        ) : null}
      </form>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t.inventoryPickerTitle}
            className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-lg font-bold">{t.inventoryPickerTitle}</h3>
                <p className="mt-1 text-xs text-slate-500">{t.chooseItemHelp}</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-semibold">{t.close}</button>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.inventoryPickerSearch}
                className="w-full rounded-xl border px-4 py-3 text-sm"
              />
              <div className="mt-3 max-h-[58vh] overflow-y-auto rounded-xl border">
                {filteredItems.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">{t.noPickerItems}</p>
                ) : (
                  <div className="divide-y">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => chooseItem(item)}
                        className="grid w-full gap-2 px-4 py-3 text-left hover:bg-blue-50 md:grid-cols-[1fr_auto]"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.sku}</p>
                          {item.locations.length > 0 ? (
                            <p className="mt-2 text-xs text-slate-500">
                              {item.locations.map((location) => `${location.name}: ${inventoryFormatNumber(location.available, language)}`).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="self-center text-right">
                          <p className={`text-sm font-bold ${item.totalStock < 0 ? "text-rose-700" : "text-slate-900"}`}>
                            {inventoryFormatNumber(item.totalStock, language)} {work10UnitText(item.baseUnit, item.customUnit, language)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-blue-700">{t.choose} →</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
