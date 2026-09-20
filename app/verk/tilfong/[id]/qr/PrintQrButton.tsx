"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  label: string;
  qrSizeLabel: string;
  qrSizeHelp: string;
  qrSizeWarning: string;
  labelSizeLabel: string;
  labelSizeHelp: string;
  labelSizeAuto: string;
  printSetupHelp: string;
  qrUrl: string;
  resourceCode: string;
  resourceName: string;
  resourceKindLabel: string;
  labelTitle: string;
};

type LabelLayout = "full" | "row" | "column";

type LabelPreset = {
  width: number;
  height: number;
  layout: LabelLayout;
  maxQr: number;
};

const labelSizes = {
  auto: null,
  "1.5x0.8": { width: 1.5, height: 0.8, layout: "row", maxQr: 0.5 },
  "2x1": { width: 2, height: 1, layout: "row", maxQr: 0.7 },
  "1.5x2": { width: 1.5, height: 2, layout: "column", maxQr: 1.1 },
  "2x2.5": { width: 2, height: 2.5, layout: "column", maxQr: 1.5 },
  "3x4": { width: 3, height: 4, layout: "full", maxQr: 2.2 },
  "4x5": { width: 4, height: 5, layout: "full", maxQr: 3 },
  "5x6": { width: 5, height: 6, layout: "full", maxQr: 3.8 },
  "6x8": { width: 6, height: 8, layout: "full", maxQr: 5 },
  "8x10": { width: 8, height: 10, layout: "full", maxQr: 6.8 },
  "10x12": { width: 10, height: 12, layout: "full", maxQr: 8.2 },
} as const satisfies Record<string, LabelPreset | null>;

type LabelSizeKey = keyof typeof labelSizes;

function setCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function waitForFrameAssets(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve) => {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      resolve();
      return;
    }

    const images = Array.from(frameDocument.images);
    const imagePromises = images.map(
      (image) =>
        new Promise<void>((done) => {
          if (image.complete) {
            done();
            return;
          }
          image.addEventListener("load", () => done(), { once: true });
          image.addEventListener("error", () => done(), { once: true });
        }),
    );

    const fontsPromise = frameDocument.fonts?.ready
      ? frameDocument.fonts.ready.then(() => undefined).catch(() => undefined)
      : Promise.resolve();

    Promise.race([
      Promise.all([...imagePromises, fontsPromise]).then(() => undefined),
      new Promise<void>((done) => window.setTimeout(done, 1500)),
    ]).then(() => resolve());
  });
}

export default function PrintQrButton({
  label,
  qrSizeLabel,
  qrSizeHelp,
  qrSizeWarning,
  labelSizeLabel,
  labelSizeHelp,
  labelSizeAuto,
  printSetupHelp,
  qrUrl,
  resourceCode,
  resourceName,
  resourceKindLabel,
  labelTitle,
}: Props) {
  const [qrSizeCm, setQrSizeCm] = useState(5);
  const [labelSize, setLabelSize] = useState<LabelSizeKey>("auto");
  const selected = labelSizes[labelSize];

  const layout = useMemo<LabelLayout>(() => {
    if (selected) return selected.layout;
    return qrSizeCm <= 1 ? "row" : "full";
  }, [qrSizeCm, selected]);

  const maxQrForCurrentLabel = selected?.maxQr ?? 15;
  const effectiveQrSize = Math.min(qrSizeCm, maxQrForCurrentLabel);

  const dimensions = useMemo(() => {
    const automaticWidth = layout === "row"
      ? Math.max(1.35, effectiveQrSize + 0.8)
      : layout === "column"
        ? Math.max(1.2, effectiveQrSize + 0.2)
        : Math.max(3, effectiveQrSize + 1.5);
    const automaticHeight = layout === "row"
      ? Math.max(0.72, effectiveQrSize + 0.18)
      : layout === "column"
        ? Math.max(1.5, effectiveQrSize + 0.55)
        : Math.max(3.2, effectiveQrSize + 2);

    return {
      width: selected?.width ?? automaticWidth,
      height: selected?.height ?? automaticHeight,
    };
  }, [effectiveQrSize, layout, selected]);

  useEffect(() => {
    setCssVariable("--gloggt-work-resource-qr-size", `${effectiveQrSize}cm`);
    return () => {
      document.documentElement.style.removeProperty("--gloggt-work-resource-qr-size");
    };
  }, [effectiveQrSize]);

  useEffect(() => {
    const compact = layout !== "full";
    const labelPaddingX = layout === "row" ? 0.08 : compact ? 0.07 : 0.2;
    const labelPaddingY = layout === "row" ? 0.055 : compact ? 0.07 : 0.2;
    const labelRadius = compact ? 0.06 : 0.16;

    setCssVariable("--gloggt-work-resource-label-width", `${dimensions.width}cm`);
    setCssVariable("--gloggt-work-resource-label-height", `${dimensions.height}cm`);
    setCssVariable("--gloggt-work-resource-label-padding-x", `${labelPaddingX}cm`);
    setCssVariable("--gloggt-work-resource-label-padding-y", `${labelPaddingY}cm`);
    setCssVariable("--gloggt-work-resource-label-radius", `${labelRadius}cm`);
    setCssVariable("--gloggt-work-resource-full-label-display", layout === "full" ? "flex" : "none");
    setCssVariable("--gloggt-work-resource-compact-row-display", layout === "row" ? "flex" : "none");
    setCssVariable("--gloggt-work-resource-compact-column-display", layout === "column" ? "flex" : "none");

    return () => {
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-width");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-height");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-padding-x");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-padding-y");
      document.documentElement.style.removeProperty("--gloggt-work-resource-label-radius");
      document.documentElement.style.removeProperty("--gloggt-work-resource-full-label-display");
      document.documentElement.style.removeProperty("--gloggt-work-resource-compact-row-display");
      document.documentElement.style.removeProperty("--gloggt-work-resource-compact-column-display");
    };
  }, [dimensions.height, dimensions.width, layout]);

  function updateLabelSize(next: LabelSizeKey) {
    const preset = labelSizes[next];
    setLabelSize(next);
    if (preset && qrSizeCm > preset.maxQr) {
      setQrSizeCm(preset.maxQr);
    }
  }

  async function printLabel() {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const frameDocument = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!frameDocument || !frameWindow) {
      iframe.remove();
      return;
    }

    const compact = layout !== "full";
    const paddingX = layout === "row" ? 0.08 : compact ? 0.07 : 0.2;
    const paddingY = layout === "row" ? 0.055 : compact ? 0.07 : 0.2;
    const radius = compact ? 0.06 : 0.16;
    const safeQrUrl = escapeHtml(qrUrl);
    const safeCode = escapeHtml(resourceCode);
    const safeName = escapeHtml(resourceName);
    const safeKind = escapeHtml(resourceKindLabel);
    const safeLabelTitle = escapeHtml(labelTitle);

    const content = layout === "row"
      ? `<div class="row"><span class="code">${safeCode}</span><img src="${safeQrUrl}" alt="" /></div>`
      : layout === "column"
        ? `<div class="column"><span class="code">${safeCode}</span><img src="${safeQrUrl}" alt="" /></div>`
        : `<div class="full"><div class="title">${safeLabelTitle}</div><div class="meta">${safeKind} · ${safeCode}</div><div class="name">${safeName}</div><img src="${safeQrUrl}" alt="" /></div>`;

    frameDocument.open();
    frameDocument.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title></title>
<style>
  @page { margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body {
    width: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .label {
    width: ${dimensions.width}cm;
    height: ${dimensions.height}cm;
    margin: 0;
    padding: ${paddingY}cm ${paddingX}cm;
    border: 1px solid #020617;
    border-radius: ${radius}cm;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .label * { box-sizing: border-box; }
  .row {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.05cm;
    line-height: 1;
  }
  .column {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05cm;
    line-height: 1;
  }
  .code {
    flex: 0 0 auto;
    white-space: nowrap;
    font-weight: 900;
    text-transform: uppercase;
    font-size: ${layout === "row" ? "7px" : "8px"};
  }
  .row img, .column img {
    flex: 0 0 auto;
    width: ${effectiveQrSize}cm;
    height: ${effectiveQrSize}cm;
    display: block;
  }
  .full {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .full .title {
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 10px;
  }
  .full .meta {
    margin-top: 0.05cm;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 8px;
    color: #64748b;
  }
  .full .name {
    margin-top: 0.05cm;
    font-weight: 900;
    font-size: 14px;
  }
  .full img {
    width: ${effectiveQrSize}cm;
    height: ${effectiveQrSize}cm;
    margin-top: 0.12cm;
    display: block;
  }
  @media print {
    .label {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      page-break-before: avoid !important;
      page-break-after: avoid !important;
    }
  }
</style>
</head>
<body>
  <div class="label">${content}</div>
</body>
</html>`);
    frameDocument.close();

    await waitForFrameAssets(iframe);
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => iframe.remove(), 1500);
  }

  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <label className="grid gap-1 text-xs font-semibold text-slate-600">
        <span>{qrSizeLabel}</span>
        <input
          type="number"
          min="0.5"
          max={maxQrForCurrentLabel}
          step="0.1"
          value={qrSizeCm}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              setQrSizeCm(Math.min(maxQrForCurrentLabel, Math.max(0.5, next)));
            }
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
          onChange={(event) => updateLabelSize(event.target.value as LabelSizeKey)}
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
      <p className="basis-full text-xs leading-5 text-slate-500">
        {printSetupHelp}
      </p>

      <button
        type="button"
        onClick={printLabel}
        className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white"
      >
        {label}
      </button>
    </div>
  );
}
