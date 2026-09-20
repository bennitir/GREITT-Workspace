"use client";

import { useEffect, useState } from "react";

type Props = {
  label: string;
  qrSizeLabel: string;
  qrSizeHelp: string;
  qrSizeWarning: string;
  labelSizeLabel: string;
  labelSizeHelp: string;
  labelSizeAuto: string;
};

const labelSizes = {
  auto: null,
  "1.5x2": { width: 1.5, height: 2 },
  "2x2.5": { width: 2, height: 2.5 },
  "3x4": { width: 3, height: 4 },
  "4x5": { width: 4, height: 5 },
  "5x6": { width: 5, height: 6 },
  "6x8": { width: 6, height: 8 },
  "8x10": { width: 8, height: 10 },
  "10x12": { width: 10, height: 12 },
} as const;

type LabelSizeKey = keyof typeof labelSizes;

export default function PrintQrButton({
  label,
  qrSizeLabel,
  qrSizeHelp,
  qrSizeWarning,
  labelSizeLabel,
  labelSizeHelp,
  labelSizeAuto,
}: Props) {
  const [qrSizeCm, setQrSizeCm] = useState(5);
  const [labelSize, setLabelSize] = useState<LabelSizeKey>("auto");

  useEffect(() => {
    document.documentElement.style.setProperty("--gloggt-work-resource-qr-size", `${qrSizeCm}cm`);
    return () => {
      document.documentElement.style.removeProperty("--gloggt-work-resource-qr-size");
    };
  }, [qrSizeCm]);

  useEffect(() => {
    const selected = labelSizes[labelSize];
    if (!selected) {
      const automaticWidth = Math.max(1.5, qrSizeCm + 0.8);
      document.documentElement.style.setProperty(
        "--gloggt-work-resource-label-width",
        `${automaticWidth}cm`,
      );
      document.documentElement.style.setProperty(
        "--gloggt-work-resource-label-height",
        "auto",
      );
      return () => {
        document.documentElement.style.removeProperty("--gloggt-work-resource-label-width");
        document.documentElement.style.removeProperty("--gloggt-work-resource-label-height");
      };
    }

    document.documentElement.style.setProperty("--gloggt-work-resource-label-width", `${selected.width}cm`);
    document.documentElement.style.setProperty("--gloggt-work-resource-label-height", `${selected.height}cm`);

    return () => {
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-width");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-height");
    };
  }, [labelSize, qrSizeCm]);

  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        <span>{qrSizeLabel}</span>
        <input
          type="number"
          min="0.5"
          max="15"
          step="0.5"
          value={qrSizeCm}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setQrSizeCm(Math.min(15, Math.max(0.5, next)));
          }}
          className="w-24 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
          aria-describedby="qr-size-help"
        />
        <span id="qr-size-help" className="font-normal text-slate-500">{qrSizeHelp}</span>
      </label>

      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        <span>{labelSizeLabel}</span>
        <select
          value={labelSize}
          onChange={(event) => setLabelSize(event.target.value as LabelSizeKey)}
          className="w-32 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
          aria-describedby="label-size-help"
        >
          <option value="auto">{labelSizeAuto}</option>
          <option value="1.5x2">1.5 × 2 cm</option>
          <option value="2x2.5">2 × 2.5 cm</option>
          <option value="3x4">3 × 4 cm</option>
          <option value="4x5">4 × 5 cm</option>
          <option value="5x6">5 × 6 cm</option>
          <option value="6x8">6 × 8 cm</option>
          <option value="8x10">8 × 10 cm</option>
          <option value="10x12">10 × 12 cm</option>
        </select>
        <span id="label-size-help" className="font-normal text-slate-500">{labelSizeHelp}</span>
      </label>

      <p className="basis-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        {qrSizeWarning}
      </p>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white"
      >
        {label}
      </button>
    </div>
  );
}
