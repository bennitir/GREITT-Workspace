"use client";

import { useState } from "react";

import { workResourceText } from "@/lib/i18n/work-resources";
import type { Work10EquipmentKind } from "@/lib/work10/resources";

type Props = {
  language: string;
  kind: Work10EquipmentKind;
  initialMeterUnit?: string | null;
  hasMeterHistory?: boolean;
  compact?: boolean;
};

export default function WorkResourceMeterFields({
  language,
  kind,
  initialMeterUnit = null,
  hasMeterHistory = false,
  compact = false,
}: Props) {
  const t = workResourceText(language);
  const isTool = kind === "TOOL";
  const [toolMeterEnabled, setToolMeterEnabled] = useState(Boolean(initialMeterUnit) || hasMeterHistory);

  if (!isTool) {
    return (
      <label className={`grid gap-1 font-medium text-slate-700 ${compact ? "text-xs sm:col-span-2" : "text-sm"}`}>
        <span>{t.meterUnit}</span>
        <input
          name="meterUnit"
          maxLength={40}
          defaultValue={initialMeterUnit ?? ""}
          className={`rounded-lg border bg-white px-3 py-2 ${compact ? "text-sm" : ""}`}
          placeholder="HOUR / KM"
        />
      </label>
    );
  }

  return (
    <div className={compact ? "sm:col-span-2" : "md:col-span-2 xl:col-span-4"}>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={toolMeterEnabled}
          disabled={hasMeterHistory}
          onChange={(event) => setToolMeterEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span>{t.toolHasMeter}</span>
      </label>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {hasMeterHistory ? t.toolMeterHistoryHelp : t.toolMeterHelp}
      </p>
      {toolMeterEnabled ? (
        <label className="mt-2 grid gap-1 text-xs font-medium text-slate-600">
          <span>{t.meterUnit}</span>
          <input
            name="meterUnit"
            maxLength={40}
            defaultValue={initialMeterUnit ?? ""}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            placeholder="HOUR"
          />
        </label>
      ) : (
        <input type="hidden" name="meterUnit" value="" />
      )}
    </div>
  );
}
