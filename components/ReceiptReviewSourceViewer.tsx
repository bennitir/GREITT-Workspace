"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectConfidentReceiptCrop,
  drawCropToCanvas,
  loadImageForCanvas,
} from "@/lib/documents/image-cleanup";

type UiLanguage = "is" | "en" | "pl" | "sr";

type BookingLine = {
  id: number;
  account: string;
  text: string;
  debitLabel: string | null;
  creditLabel: string | null;
};

type ReviewInfo = {
  merchant: string;
  dateLabel: string;
  amountLabel: string;
  receiptNumber: string | null;
  voucherNumber: number | null;
  pageNumber: number | null;
  documentPosition: string | null;
  bookingLines: BookingLine[];
};

const copy = {
  is: {
    source: "Frumskjal",
    fit: "Passa",
    zoomOut: "Minnka",
    zoomIn: "Stækka",
    expand: "Stækka vinnusvæði",
    shrink: "Minnka vinnusvæði",
    resetPosition: "Miðja mynd",
    moveImage: "Dragðu myndina til að færa hana",
    moveDocument: "Dragðu skjalið til að færa það",
    pdfHint: "PDF opnast á réttri síðu. Dragðu skjalið með músinni til að færa það og notaðu − / Passa / + til að stækka eða minnka.",
    reviewData: "Yfirferðargögn",
    movePanel: "Dragðu hausinn til að færa spjaldið",
    collapse: "Fela spjald",
    showPanel: "Sýna yfirferðargögn",
    cleanEdges: "Snyrta mynd",
    showOriginal: "Sýna frumrit",
    cleanedHint: "Bakgrunnur utan reiknings er falinn í vinnusýn þegar mörk skjals finnast örugglega. Frumritið er óbreytt.",
    merchant: "Söluaðili",
    date: "Dagsetning",
    amount: "Upphæð",
    receiptNumber: "Reiknings-/kvittunarnr.",
    voucherNumber: "Fylgiskjal nr.",
    page: "Síða",
    booking: "Bókun",
    noBooking: "Engar bókunarlínur enn",
    debit: "D",
    credit: "K",
  },
  en: {
    source: "Source document",
    fit: "Fit",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    expand: "Expand workspace",
    shrink: "Shrink workspace",
    resetPosition: "Center image",
    moveImage: "Drag the image to move it",
    moveDocument: "Drag the document to move it",
    pdfHint: "The PDF opens on the relevant page. Drag it with the mouse to move it and use − / Fit / + to zoom in or out.",
    reviewData: "Review data",
    movePanel: "Drag the header to move this panel",
    collapse: "Hide panel",
    showPanel: "Show review data",
    cleanEdges: "Crop document",
    showOriginal: "Show original",
    cleanedHint: "Background outside the document is hidden when its boundary can be detected confidently. The original is unchanged.",
    merchant: "Merchant",
    date: "Date",
    amount: "Amount",
    receiptNumber: "Invoice/receipt no.",
    voucherNumber: "Voucher no.",
    page: "Page",
    booking: "Booking",
    noBooking: "No booking lines yet",
    debit: "D",
    credit: "C",
  },
  pl: {
    source: "Dokument źródłowy",
    fit: "Dopasuj",
    zoomOut: "Pomniejsz",
    zoomIn: "Powiększ",
    expand: "Powiększ obszar roboczy",
    shrink: "Zmniejsz obszar roboczy",
    resetPosition: "Wyśrodkuj obraz",
    moveImage: "Przeciągnij obraz, aby go przesunąć",
    moveDocument: "Przeciągnij dokument, aby go przesunąć",
    pdfHint: "PDF otwiera się na właściwej stronie. Przeciągnij dokument myszą, aby go przesunąć, i użyj − / Dopasuj / +, aby zmienić powiększenie.",
    reviewData: "Dane do weryfikacji",
    movePanel: "Przeciągnij nagłówek, aby przesunąć panel",
    collapse: "Ukryj panel",
    showPanel: "Pokaż dane do weryfikacji",
    cleanEdges: "Przytnij dokument",
    showOriginal: "Pokaż oryginał",
    cleanedHint: "Tło poza dokumentem jest ukrywane, gdy granice dokumentu można wykryć z dużą pewnością. Oryginał pozostaje bez zmian.",
    merchant: "Sprzedawca",
    date: "Data",
    amount: "Kwota",
    receiptNumber: "Nr faktury/paragonu",
    voucherNumber: "Nr dokumentu",
    page: "Strona",
    booking: "Księgowanie",
    noBooking: "Brak pozycji księgowych",
    debit: "Wn",
    credit: "Ma",
  },
  sr: {
    source: "Изворни документ",
    fit: "Уклопи",
    zoomOut: "Умањи",
    zoomIn: "Увећај",
    expand: "Прошири радни простор",
    shrink: "Смањи радни простор",
    resetPosition: "Центрирај слику",
    moveImage: "Превуците слику да бисте је померили",
    moveDocument: "Превуците документ да бисте га померили",
    pdfHint: "PDF се отвара на одговарајућој страници. Превуците документ мишем да бисте га померили и користите − / Уклопи / + за увећање и умањење.",
    reviewData: "Подаци за преглед",
    movePanel: "Превуците заглавље да бисте померили панел",
    collapse: "Сакриј панел",
    showPanel: "Прикажи податке за преглед",
    cleanEdges: "Исеци документ",
    showOriginal: "Прикажи оригинал",
    cleanedHint: "Позадина ван документа се сакрива када се границе документа могу поуздано препознати. Оригинал остаје непромењен.",
    merchant: "Продавац",
    date: "Датум",
    amount: "Износ",
    receiptNumber: "Бр. рачуна/признанице",
    voucherNumber: "Бр. документа",
    page: "Страна",
    booking: "Књижење",
    noBooking: "Још нема ставки књижења",
    debit: "Д",
    credit: "П",
  },
} as const;

const MIN_ZOOM = 75;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

type ViewerMemory = {
  zoom: number;
  pan: { x: number; y: number };
};

const viewerMemory = new Map<string, ViewerMemory>();

function stableSourceIdentity(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl, "https://gloggt.local");
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sourceUrl.split("#", 1)[0]?.split("?", 1)[0] ?? sourceUrl;
  }
}

export default function ReceiptReviewSourceViewer({
  sourceUrl,
  isPdf,
  language,
  info,
  compact = false,
}: {
  sourceUrl: string;
  isPdf: boolean;
  language: UiLanguage;
  info: ReviewInfo;
  compact?: boolean;
}) {
  const labels = copy[language] ?? copy.is;
  const sourceIdentity = useMemo(() => stableSourceIdentity(sourceUrl), [sourceUrl]);
  const viewKey = useMemo(
    () => `${sourceIdentity}::page:${info.pageNumber ?? 1}`,
    [info.pageNumber, sourceIdentity],
  );
  const initialView = viewerMemory.get(viewKey);
  const [zoom, setZoom] = useState(() => initialView?.zoom ?? 100);
  const [pan, setPan] = useState(() => initialView?.pan ?? { x: 0, y: 0 });
  const [effectiveSourceUrl, setEffectiveSourceUrl] = useState(sourceUrl);
  const currentViewKeyRef = useRef(viewKey);
  currentViewKeyRef.current = viewKey;
  const [expanded, setExpanded] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [cleanedImageUrl, setCleanedImageUrl] = useState<string | null>(null);
  const [cleanEdges, setCleanEdges] = useState(true);
  const imageDragRef = useRef<{ x: number; y: number } | null>(null);
  const panelDragRef = useRef<{ x: number; y: number } | null>(null);
  const pdfStageRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfPageRef = useRef<any>(null);
  const pdfDocumentRef = useRef<any>(null);
  const pdfRenderTaskRef = useRef<any>(null);
  const [pdfReadyVersion, setPdfReadyVersion] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfStageSize, setPdfStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const remembered = viewerMemory.get(viewKey);
    setZoom(remembered?.zoom ?? 100);
    setPan(remembered?.pan ?? { x: 0, y: 0 });
    setPanelOffset({ x: 0, y: 0 });
    // Signed storage URLs may refresh while the user is reviewing the same page.
    // Only adopt a new URL when the underlying document/page identity changes,
    // otherwise zoom/pan would appear to jump back to the start.
    setEffectiveSourceUrl(sourceUrl);
  }, [viewKey]);

  useEffect(() => {
    viewerMemory.set(currentViewKeyRef.current, { zoom, pan });
  }, [pan, zoom]);

  useEffect(() => {
    if (isPdf) {
      setCleanedImageUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function prepareCleanedPreview() {
      try {
        const image = await loadImageForCanvas(effectiveSourceUrl);
        if (cancelled) return;
        const crop = detectConfidentReceiptCrop(
          image,
          image.naturalWidth,
          image.naturalHeight,
        );
        if (!crop) {
          setCleanedImageUrl(null);
          return;
        }
        const canvas = drawCropToCanvas(image, crop);
        if (!canvas) return;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.95),
        );
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setCleanedImageUrl(objectUrl);
        setCleanEdges(true);
      } catch {
        if (!cancelled) setCleanedImageUrl(null);
      }
    }

    void prepareCleanedPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [effectiveSourceUrl, isPdf]);

  const pdfFallbackUrl = useMemo(() => {
    if (!isPdf) return effectiveSourceUrl;
    const page = info.pageNumber ? `page=${info.pageNumber}&` : "";
    return `${effectiveSourceUrl}#${page}zoom=page-width`;
  }, [effectiveSourceUrl, info.pageNumber, isPdf]);

  const displayedImageUrl = cleanEdges && cleanedImageUrl ? cleanedImageUrl : effectiveSourceUrl;

  function changeZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
  }

  function changePdfZoom(direction: -1 | 1) {
    setZoom((current) => clampZoom(current + direction * ZOOM_STEP));
  }

  function resetPdfZoom() {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }

  function resetImage() {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (!isPdf) {
      pdfPageRef.current = null;
      pdfDocumentRef.current = null;
      setPdfError(null);
      return;
    }

    let cancelled = false;
    let loadingTask: any = null;

    async function loadPdfPage() {
      try {
        setPdfError(null);
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc =
            `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        }
        loadingTask = pdfjs.getDocument({ url: effectiveSourceUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        pdfDocumentRef.current = pdf;
        const requestedPage = info.pageNumber ?? 1;
        const safePage = Math.max(1, Math.min(requestedPage, pdf.numPages));
        const page = await pdf.getPage(safePage);
        if (cancelled) return;
        pdfPageRef.current = page;
        setPdfReadyVersion((value) => value + 1);
      } catch (error) {
        if (!cancelled) {
          setPdfError(error instanceof Error ? error.message : "PDF rendering failed");
        }
      }
    }

    void loadPdfPage();

    return () => {
      cancelled = true;
      pdfRenderTaskRef.current?.cancel?.();
      loadingTask?.destroy?.();
      pdfDocumentRef.current?.destroy?.();
      pdfPageRef.current = null;
      pdfDocumentRef.current = null;
    };
  }, [effectiveSourceUrl, info.pageNumber, isPdf]);

  useEffect(() => {
    if (!isPdf || !pdfStageRef.current) return;
    const element = pdfStageRef.current;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setPdfStageSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, isPdf, panelCollapsed]);

  useEffect(() => {
    if (!isPdf) return;
    const page = pdfPageRef.current;
    const canvas = pdfCanvasRef.current;
    if (!page || !canvas || pdfStageSize.width <= 0 || pdfStageSize.height <= 0) return;

    let cancelled = false;
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(120, pdfStageSize.width - 20);
    const availableHeight = Math.max(120, pdfStageSize.height - 20);
    const fitScale = Math.min(
      availableWidth / baseViewport.width,
      availableHeight / baseViewport.height,
    );
    const renderScale = fitScale * (zoom / 100);
    const viewport = page.getViewport({ scale: renderScale });
    // Render slightly above CSS pixel density on ordinary desktop screens.
    // This keeps raster/scanned PDFs as clear as their source allows when zoomed,
    // without turning the canvas into an unbounded memory consumer.
    const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
    const context = canvas.getContext("2d");
    if (!context) return;

    pdfRenderTaskRef.current?.cancel?.();
    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : undefined,
    });
    pdfRenderTaskRef.current = renderTask;
    renderTask.promise.catch((error: unknown) => {
      if (cancelled) return;
      const name = error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name ?? "")
        : "";
      if (name !== "RenderingCancelledException") {
        setPdfError(error instanceof Error ? error.message : "PDF rendering failed");
      }
    });

    return () => {
      cancelled = true;
      renderTask.cancel();
    };
  }, [isPdf, pdfReadyVersion, pdfStageSize.height, pdfStageSize.width, zoom]);

  const stageHeight = expanded
    ? "h-[calc(100vh-135px)] min-h-[620px]"
    : compact
      ? "h-[390px] md:h-[440px]"
      : "h-[430px] md:h-[500px]";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="font-semibold text-slate-950">{labels.source}</h2>
          {info.documentPosition && (
            <span className="truncate text-xs font-medium text-slate-500">{info.documentPosition}</span>
          )}
          {info.pageNumber && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
              {labels.page} {info.pageNumber}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!isPdf ? (
            <>
              {cleanedImageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setCleanEdges((value) => !value);
                    resetImage();
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    cleanEdges
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {cleanEdges ? labels.showOriginal : labels.cleanEdges}
                </button>
              )}
              <button
                type="button"
                onClick={() => changeZoom(zoom - ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                title={labels.zoomOut}
                className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                onClick={resetImage}
                title={labels.resetPosition}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
              >
                {zoom === 100 ? labels.fit : `${zoom}%`}
              </button>
              <button
                type="button"
                onClick={() => changeZoom(zoom + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                title={labels.zoomIn}
                className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                +
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => changePdfZoom(-1)}
                disabled={zoom <= MIN_ZOOM}
                title={labels.zoomOut}
                className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                onClick={resetPdfZoom}
                title={labels.fit}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
              >
                {zoom === 100 ? labels.fit : `${zoom}%`}
              </button>
              <button
                type="button"
                onClick={() => changePdfZoom(1)}
                disabled={zoom >= MAX_ZOOM}
                title={labels.zoomIn}
                className="min-w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                +
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {expanded ? labels.shrink : labels.expand}
          </button>
        </div>
      </div>

      <div className={`relative overflow-hidden bg-slate-100 ${stageHeight}`}>
        <div
          className={`absolute inset-y-0 left-0 transition-[right] ${
            panelCollapsed ? "right-0" : "right-0 md:right-[292px]"
          }`}
        >
          {isPdf ? (
            <div
              ref={pdfStageRef}
              className={`absolute inset-0 touch-none select-none overflow-hidden ${imageDragRef.current ? "cursor-grabbing" : "cursor-grab"}`}
              title={labels.moveDocument}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                imageDragRef.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const previous = imageDragRef.current;
                if (!previous) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                imageDragRef.current = { x: event.clientX, y: event.clientY };
                setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
              }}
              onPointerUp={(event) => {
                imageDragRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                imageDragRef.current = null;
              }}
              onDoubleClick={resetPdfZoom}
            >
              {pdfError ? (
                <object
                  data={pdfFallbackUrl}
                  type="application/pdf"
                  aria-label={labels.source}
                  className="absolute inset-0 h-full w-full bg-white"
                >
                  <div className="p-6 text-center text-sm text-slate-700">
                    <a href={pdfFallbackUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">
                      {labels.source}
                    </a>
                  </div>
                </object>
              ) : (
                <canvas
                  ref={pdfCanvasRef}
                  className="absolute left-1/2 top-1/2 block bg-white shadow-md"
                  style={{
                    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
                  }}
                />
              )}
            </div>
          ) : (
            <div
              className={`absolute inset-0 touch-none select-none ${imageDragRef.current ? "cursor-grabbing" : "cursor-grab"}`}
              title={labels.moveImage}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                imageDragRef.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const previous = imageDragRef.current;
                if (!previous) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                imageDragRef.current = { x: event.clientX, y: event.clientY };
                setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
              }}
              onPointerUp={(event) => {
                imageDragRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                imageDragRef.current = null;
              }}
              onDoubleClick={resetImage}
            >
              <img
                src={displayedImageUrl}
                alt={labels.source}
                draggable={false}
                className="absolute left-1/2 top-1/2 block max-h-[calc(100%-16px)] max-w-[calc(100%-16px)] bg-white object-contain shadow-md"
                style={{
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                  transformOrigin: "center center",
                }}
              />
            </div>
          )}
        </div>

        {!panelCollapsed ? (
          <aside
            className="absolute right-3 top-3 z-20 w-[min(276px,calc(100%-24px))] overflow-hidden rounded-xl border border-slate-300 bg-white/95 shadow-xl backdrop-blur-sm"
            style={{ transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              className="flex cursor-move touch-none items-center justify-between gap-3 bg-slate-900 px-3 py-2 text-white"
              title={labels.movePanel}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                panelDragRef.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const previous = panelDragRef.current;
                if (!previous) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                panelDragRef.current = { x: event.clientX, y: event.clientY };
                setPanelOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
              }}
              onPointerUp={(event) => {
                panelDragRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                panelDragRef.current = null;
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{labels.reviewData}</div>
                <div className="truncate text-[11px] text-slate-300">{labels.movePanel}</div>
              </div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setPanelCollapsed(true)}
                aria-label={labels.collapse}
                title={labels.collapse}
                className="rounded px-2 py-1 text-lg leading-none hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="max-h-[370px] overflow-y-auto p-3 text-sm text-slate-800">
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
                <dt className="text-slate-500">{labels.merchant}</dt>
                <dd className="min-w-0 truncate font-semibold text-slate-950">{info.merchant}</dd>
                <dt className="text-slate-500">{labels.date}</dt>
                <dd className="font-semibold text-slate-950">{info.dateLabel}</dd>
                <dt className="text-slate-500">{labels.amount}</dt>
                <dd className="font-semibold text-slate-950">{info.amountLabel}</dd>
                {info.receiptNumber && (
                  <>
                    <dt className="text-slate-500">{labels.receiptNumber}</dt>
                    <dd className="min-w-0 break-words font-semibold text-slate-950">{info.receiptNumber}</dd>
                  </>
                )}
                {info.voucherNumber != null && (
                  <>
                    <dt className="text-slate-500">{labels.voucherNumber}</dt>
                    <dd className="font-semibold text-slate-950">{info.voucherNumber}</dd>
                  </>
                )}
              </dl>

              <div className="mt-3 border-t border-slate-200 pt-2.5">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{labels.booking}</div>
                {info.bookingLines.length > 0 ? (
                  <div className="space-y-1.5">
                    {info.bookingLines.map((line) => (
                      <div key={line.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                        <div className="font-semibold text-slate-900">{line.account} · {line.text}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
                          {line.debitLabel && <span>{labels.debit}: {line.debitLabel}</span>}
                          {line.creditLabel && <span>{labels.credit}: {line.creditLabel}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">{labels.noBooking}</p>
                )}
              </div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setPanelCollapsed(false)}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-lg hover:bg-white"
          >
            {labels.showPanel}
          </button>
        )}
      </div>

      <div className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">
        {isPdf
          ? labels.pdfHint
          : cleanEdges && cleanedImageUrl
            ? labels.cleanedHint
            : labels.moveImage}
      </div>
    </section>
  );
}
