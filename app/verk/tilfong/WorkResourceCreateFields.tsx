"use client";

import { useState } from "react";

import { workResourceKindText, workResourceText } from "@/lib/i18n/work-resources";
import { WORK10_EQUIPMENT_KINDS, type Work10EquipmentKind } from "@/lib/work10/resources";
import WorkEquipmentUnitFields from "./WorkEquipmentUnitFields";
import WorkResourceMachineTravelFields from "./WorkResourceMachineTravelFields";

type Props = {
  language: string;
};

export default function WorkResourceCreateFields({ language }: Props) {
  const t = workResourceText(language);
  const [kind, setKind] = useState<Work10EquipmentKind>("MACHINE");

  return (
    <>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        <span>{t.kind}</span>
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as Work10EquipmentKind)}
          className="rounded-lg border bg-white px-3 py-2"
        >
          {WORK10_EQUIPMENT_KINDS.map((candidate) => (
            <option key={candidate} value={candidate}>{workResourceKindText(candidate, language)}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        <span>{t.code}</span>
        <input name="code" required maxLength={60} className="rounded-lg border px-3 py-2" placeholder={t.codePlaceholder} />
        <span className="text-xs font-normal leading-5 text-slate-500">{t.codeHelp}</span>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
        <span>{t.name}</span>
        <input name="name" required maxLength={160} className="rounded-lg border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">
        <span>{t.description}</span>
        <textarea name="description" rows={2} maxLength={1000} className="rounded-lg border px-3 py-2" />
      </label>
      <WorkEquipmentUnitFields
        language={language}
        baseUnitLabel={t.baseUnit}
        customUnitLabel={t.customUnit}
        defaultUnitLabel={t.resourceDefaultUnit}
      />
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        <span>{t.costRate}</span>
        <input name="costRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        <span>{t.saleRate}</span>
        <input name="saleRateIsk" inputMode="decimal" className="rounded-lg border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        <span>{t.meterUnit}</span>
        <input name="meterUnit" maxLength={40} className="rounded-lg border px-3 py-2" placeholder="HOUR / KM" />
      </label>
      {kind === "MACHINE" ? (
        <WorkResourceMachineTravelFields
          language={language}
          questionLabel={t.machineTravelModeQuestion}
          speedLabel={t.machineTravelSpeed}
          helpText={t.planningTravelSpeedHelp}
        />
      ) : null}
    </>
  );
}
