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
  "1.5x0.8": { width: 1.5, height: 0.8 },
  "2x1": { width: 2, height: 1 },
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
    const compactLabel = selected
      ? selected.width <= 2.5 || selected.height <= 1.5
      : qrSizeCm <= 1;

    const automaticWidth = compactLabel
      ? Math.max(1.15, qrSizeCm + 0.62)
      : Math.max(3, qrSizeCm + 1.5);
    const automaticHeight = compactLabel
      ? Math.max(0.62, qrSizeCm + 0.08)
      : Math.max(3.2, qrSizeCm + 2);

    const effectiveWidth = selected?.width ?? automaticWidth;
    const effectiveHeight = selected?.height ?? automaticHeight;
    const labelPadding = compactLabel ? 0.02 : 0.2;
    const labelRadius = compactLabel ? 0.03 : 0.16;

    document.documentElement.style.setProperty(
      "--gloggt-work-resource-label-width",
      `${effectiveWidth}cm`,
    );
    document.documentElement.style.setProperty(
      "--gloggt-work-resource-label-height",
      `${effectiveHeight}cm`,
    );
    document.documentElement.style.setProperty(
      "--gloggt-work-resource-label-padding",
      `${labelPadding}cm`,
    );
    document.documentElement.style.setProperty(
      "--gloggt-work-resource-label-radius",
      `${labelRadius}cm`,
    );
    document.documentElement.style.setProperty(
      "--gloggt-work-resource-full-label-display",
      compactLabel ? "none" : "flex",
    );
    document.documentElement.style.setProperty(
      "--gloggt-work-resource-compact-label-display",
      compactLabel ? "flex" : "none",
    );

    // Chrome/Vercel print preview can pass physical CSS dimensions through to
    // label-printer drivers. Keep @page in sync with the chosen label size so
    // 1.5 × 0.8 cm stays landscape instead of being stretched by the page.
    const styleId = "gloggt-work-resource-print-page-size";
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@media print {
      @page { size: ${effectiveWidth}cm ${effectiveHeight}cm; margin: 0; }
      html, body { width: ${effectiveWidth}cm !important; height: ${effectiveHeight}cm !important; margin: 0 !important; padding: 0 !important; }
      body { overflow: hidden !important; }
      main { width: ${effectiveWidth}cm !important; height: ${effectiveHeight}cm !important; margin: 0 !important; padding: 0 !important; }
    }`;
    document.head.appendChild(style);

    return () => {
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-width");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-height");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-padding");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-radius");
      document.documentElement.style.removeProperty("--gloggt-work-resource-full-label-display");
      document.documentElement.style.removeProperty("--gloggt-work-resource-compact-label-display");
      document.getElementById(styleId)?.remove();
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
          <option value="1.5x0.8">1.5 × 0.8 cm</option>
          <option value="2x1">2 × 1 cm</option>
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
