"use client";

import { useState } from "react";

import { workResourceTravelModeText } from "@/lib/i18n/work-resources";
import type { Work10MachineTravelMode } from "@/lib/work10/resources";

type Props = {
  language: string;
  questionLabel: string;
  speedLabel: string;
  helpText: string;
  initialMode?: string | null;
  initialSpeed?: number | null;
  compact?: boolean;
};

export default function WorkResourceMachineTravelFields({
  language,
  questionLabel,
  speedLabel,
  helpText,
  initialMode = "SELF_PROPELLED",
  initialSpeed = null,
  compact = false,
}: Props) {
  const [mode, setMode] = useState<Work10MachineTravelMode>(
    initialMode === "TRANSPORTED" ? "TRANSPORTED" : "SELF_PROPELLED",
  );
  const labelClass = compact
    ? "grid min-w-0 gap-1 text-xs font-medium text-slate-600"
    : "grid min-w-0 gap-1 text-sm font-medium text-slate-700";
  const controlClass = compact
    ? "w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm"
    : "w-full min-w-0 rounded-lg border bg-white px-3 py-2";
  const helpClass = compact
    ? "text-xs leading-5 text-slate-500 sm:col-span-2"
    : "text-xs leading-5 text-slate-500 md:col-span-2 xl:col-span-4";

  return (
    <>
      <label className={labelClass}>
        <span>{questionLabel}</span>
        <select
          name="travelMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as Work10MachineTravelMode)}
          className={controlClass}
        >
          <option value="SELF_PROPELLED">{workResourceTravelModeText("SELF_PROPELLED", language)}</option>
          <option value="TRANSPORTED">{workResourceTravelModeText("TRANSPORTED", language)}</option>
        </select>
      </label>

      {mode === "SELF_PROPELLED" ? (
        <label className={labelClass}>
          <span>{speedLabel}</span>
          <input
            name="planningTravelSpeedKmh"
            inputMode="decimal"
            defaultValue={initialSpeed ?? ""}
            className={controlClass}
            placeholder="25"
          />
        </label>
      ) : null}

      <p className={helpClass}>{helpText}</p>
    </>
  );
}
