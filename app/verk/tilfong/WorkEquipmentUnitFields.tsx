"use client";

import { useState } from "react";

import { work10UnitText } from "@/lib/i18n/work10";
import { WORK10_RESOURCE_UNITS } from "@/lib/work10/resources";

type Props = {
  language: string;
  baseUnitLabel: string;
  customUnitLabel: string;
  defaultUnitLabel?: string;
  initialUnit?: string | null;
  initialCustomUnit?: string | null;
  compact?: boolean;
};

export default function WorkEquipmentUnitFields({
  language,
  baseUnitLabel,
  customUnitLabel,
  defaultUnitLabel,
  initialUnit = "",
  initialCustomUnit = "",
  compact = false,
}: Props) {
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [customUnit, setCustomUnit] = useState(initialCustomUnit ?? "");
  const labelClass = compact
    ? "grid gap-1 text-xs font-medium text-slate-600"
    : "grid gap-1 text-sm font-medium text-slate-700";
  const controlClass = compact
    ? "rounded-lg border bg-white px-3 py-2 text-sm"
    : "rounded-lg border bg-white px-3 py-2";

  return (
    <>
      <label className={labelClass}>
        <span>{baseUnitLabel}</span>
        <select
          name="baseUnit"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          className={controlClass}
        >
          {defaultUnitLabel ? <option value="">{defaultUnitLabel}</option> : null}
          {WORK10_RESOURCE_UNITS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {work10UnitText(candidate, null, language)}
            </option>
          ))}
        </select>
      </label>

      {unit === "CUSTOM" ? (
        <label className={labelClass}>
          <span>{customUnitLabel}</span>
          <input
            name="customUnit"
            maxLength={40}
            value={customUnit}
            onChange={(event) => setCustomUnit(event.target.value)}
            className={controlClass}
          />
        </label>
      ) : null}
    </>
  );
}
