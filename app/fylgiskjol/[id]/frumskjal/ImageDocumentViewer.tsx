"use client";

import { useMemo, useState } from "react";

type UiLanguage = "is" | "en" | "pl" | "sr";
type ViewMode = "fit" | "zoom";

const MIN_ZOOM = 50;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;
const BASE_DOCUMENT_WIDTH = 680;

const copy = {
  is: {
    zoomOut: "Minnka",
    zoomIn: "Stækka",
    actualSize: "100%",
    fit: "Passa í glugga",
    keyboardHint: "+ / − til að stækka eða minnka",
  },
  en: {
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    actualSize: "100%",
    fit: "Fit to window",
    keyboardHint: "+ / − to zoom",
  },
  pl: {
    zoomOut: "Pomniejsz",
    zoomIn: "Powiększ",
    actualSize: "100%",
    fit: "Dopasuj do okna",
    keyboardHint: "+ / − aby zmienić powiększenie",
  },
  sr: {
    zoomOut: "Умањи",
    zoomIn: "Увећај",
    actualSize: "100%",
    fit: "Уклопи у прозор",
    keyboardHint: "+ / − за увећање или умањење",
  },
} as const;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export default function ImageDocumentViewer({
  src,
  alt,
  language,
}: {
  src: string;
  alt: string;
  language: UiLanguage;
}) {
  const labels = copy[language] ?? copy.is;
  const [mode, setMode] = useState<ViewMode>("fit");
  const [zoom, setZoom] = useState(100);

  const documentWidth = useMemo(
    () => Math.round((BASE_DOCUMENT_WIDTH * zoom) / 100),
    [zoom],
  );

  function setZoomLevel(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
    setMode("zoom");
  }

  function zoomOut() {
    setZoomLevel((mode === "fit" ? 100 : zoom) - ZOOM_STEP);
  }

  function zoomIn() {
    setZoomLevel((mode === "fit" ? 100 : zoom) + ZOOM_STEP);
  }

  function resetTo100() {
    setZoom(100);
    setMode("zoom");
  }

  function fitToWindow() {
    setMode("fit");
  }

  return (
    <div className="flex justify-center">
      <div
        className={mode === "fit" ? "w-fit max-w-full" : "w-full max-w-[1180px]"}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomIn();
          } else if (event.key === "-") {
            event.preventDefault();
            zoomOut();
          } else if (event.key === "0") {
            event.preventDefault();
            resetTo100();
          }
        }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              disabled={mode === "zoom" && zoom <= MIN_ZOOM}
              title={labels.zoomOut}
              aria-label={labels.zoomOut}
              className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>

            <button
              type="button"
              onClick={resetTo100}
              className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${
                mode === "zoom" && zoom === 100
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {mode === "fit" ? labels.actualSize : `${zoom}%`}
            </button>

            <button
              type="button"
              onClick={zoomIn}
              disabled={mode === "zoom" && zoom >= MAX_ZOOM}
              title={labels.zoomIn}
              aria-label={labels.zoomIn}
              className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>

            <button
              type="button"
              onClick={fitToWindow}
              aria-pressed={mode === "fit"}
              className={`ml-1 rounded-md border px-2.5 py-1 text-sm font-semibold ${
                mode === "fit"
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {labels.fit}
            </button>
          </div>

          <span className="hidden text-xs text-slate-500 lg:inline">{labels.keyboardHint}</span>
        </div>

        <div className="max-h-[calc(100vh-205px)] max-w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 shadow-sm">
          <div className="flex min-h-full min-w-full justify-center">
            <img
              src={src}
              alt={alt}
              className="block h-auto shrink-0 rounded-sm bg-white"
              style={
                mode === "fit"
                  ? { width: "auto", maxWidth: "min(680px, 100%)" }
                  : { width: `${documentWidth}px`, maxWidth: "none" }
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
