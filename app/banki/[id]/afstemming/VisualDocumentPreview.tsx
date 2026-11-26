'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from 'pdfjs-dist';

const copy = {
  is: { loading: 'Hleð frumskjali…', failed: 'Ekki tókst að birta frumskjalið. Prófaðu að opna frumskjalið með tenglinum hér fyrir ofan.', previous: 'Fyrri síða', next: 'Næsta síða', page: 'Síða', zoomOut: 'Minnka', zoomIn: 'Stækka', fit: 'Passa breidd' },
  en: { loading: 'Loading source document…', failed: 'Could not display the source document. Try opening it with the link above.', previous: 'Previous page', next: 'Next page', page: 'Page', zoomOut: 'Zoom out', zoomIn: 'Zoom in', fit: 'Fit width' },
  pl: { loading: 'Ładowanie dokumentu…', failed: 'Nie udało się wyświetlić dokumentu. Otwórz go za pomocą linku powyżej.', previous: 'Poprzednia strona', next: 'Następna strona', page: 'Strona', zoomOut: 'Pomniejsz', zoomIn: 'Powiększ', fit: 'Dopasuj szerokość' },
  sr: { loading: 'Учитавање документа…', failed: 'Документ није могуће приказати. Отворите га преко везе изнад.', previous: 'Претходна страница', next: 'Следећа страница', page: 'Страница', zoomOut: 'Умањи', zoomIn: 'Увећај', fit: 'Уклопи ширину' },
};

type Props = { url: string; title: string; language: string };
type Source = { kind: 'loading' } | { kind: 'error' } |
  { kind: 'pdf'; document: PDFDocumentProxy } | { kind: 'image'; url: string };

/** A new source starts at page one and full width, including after rapid switches. */
export default function VisualDocumentPreview(props: Props) {
  return <DocumentPreview key={props.url} {...props} />;
}

function DocumentPreview({ url, title, language }: Props) {
  const labels = copy[language as keyof typeof copy] ?? copy.is;
  const [source, setSource] = useState<Source>({ kind: 'loading' });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let imageUrl: string | undefined;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let worker: PDFWorker | undefined;
    let workerPort: Worker | undefined;

    async function load() {
      try {
        // Keep the existing company-authorized route. Credentials are sent only
        // to our origin; a signed storage redirect needs no cross-origin cookies.
        const response = await fetch(url, {
          credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Source unavailable');
        const blob = await response.blob();
        if (disposed) return;
        if (blob.type.startsWith('image/')) {
          imageUrl = URL.createObjectURL(blob);
          setSource({ kind: 'image', url: imageUrl });
          return;
        }

        const data = new Uint8Array(await blob.arrayBuffer());
        if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) {
          throw new Error('Unsupported source');
        }
        const pdfjs = await import('pdfjs-dist');
        if (disposed) return;
        // Bundle the matching worker locally: no CDN, global worker setting or
        // document bytes sent to an additional service.
        workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
        worker = pdfjs.PDFWorker.create({ port: workerPort });
        const assetBase = `/api/pdfjs/${pdfjs.version}/`;
        loadingTask = pdfjs.getDocument({
          data, worker, stopAtErrors: true,
          wasmUrl: `${assetBase}wasm/`, cMapUrl: `${assetBase}cmaps/`,
          standardFontDataUrl: `${assetBase}standard_fonts/`, iccUrl: `${assetBase}iccs/`,
        });
        // Password-protected files remain available through the original link.
        loadingTask.onPassword = () => {
          if (!disposed) setSource({ kind: 'error' });
          void loadingTask?.destroy().catch(() => undefined);
        };
        const document = await loadingTask.promise;
        if (!disposed) setSource({ kind: 'pdf', document });
      } catch {
        if (!disposed) setSource({ kind: 'error' });
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      void (loadingTask?.destroy() ?? Promise.resolve()).catch(() => undefined).finally(() => {
        worker?.destroy();
        workerPort?.terminate();
      });
    };
  }, [url]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setWidth(Math.max(1, viewport.clientWidth - 16));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  function changePage(next: number) {
    setPageNumber(next);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }

  const ready = source.kind === 'pdf' || source.kind === 'image';
  const button = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-teal-700';
  return <div data-testid="document-file-preview" className="mt-3 flex h-[58vh] min-h-[360px] w-full flex-col overflow-hidden rounded border bg-slate-100">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white p-2">
      {source.kind === 'pdf' && <>
        <button type="button" className={button} aria-label={labels.previous} disabled={pageNumber <= 1}
          onClick={() => changePage(pageNumber - 1)}>‹</button>
        <span aria-live="polite" className="text-sm">{labels.page} {pageNumber} / {source.document.numPages}</span>
        <button type="button" className={button} aria-label={labels.next} disabled={pageNumber >= source.document.numPages}
          onClick={() => changePage(pageNumber + 1)}>›</button>
      </>}
      <button type="button" className={button} aria-label={labels.zoomOut} disabled={!ready || zoom <= 50}
        onClick={() => setZoom(current => Math.max(50, current - 25))}>−</button>
      <button type="button" className={button} disabled={!ready} onClick={() => {
        setZoom(100);
        viewportRef.current?.scrollTo({ top: 0, left: 0 });
      }}>{labels.fit}</button>
      <button type="button" className={button} aria-label={labels.zoomIn} disabled={!ready || zoom >= 300}
        onClick={() => setZoom(current => Math.min(300, current + 25))}>+</button>
      <span className="text-xs tabular-nums" aria-live="polite">{zoom}%</span>
    </div>
    <div ref={viewportRef} data-testid="document-preview-viewport" tabIndex={0} aria-label={title}
      className="min-h-0 flex-1 overflow-auto overscroll-contain p-2" style={{ scrollbarGutter: 'stable' }}>
      {source.kind === 'loading' && <p role="status" className="p-3 text-sm">{labels.loading}</p>}
      {source.kind === 'error' && <p role="alert" className="p-3 text-sm">{labels.failed}</p>}
      {source.kind === 'pdf' && width > 0 && <PdfPage
        key={`${pageNumber}:${width}:${zoom}`}
        document={source.document} pageNumber={pageNumber} width={width * zoom / 100}
        title={`${title} — ${labels.page} ${pageNumber}`} loading={labels.loading} failed={labels.failed}
      />}
      {source.kind === 'image' && width > 0 &&
        // Blob comes from the authorized route and is released on source change.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.url} alt={title} className="mx-auto block h-auto max-w-none bg-white"
          style={{ width: width * zoom / 100 }} onError={() => setSource({ kind: 'error' })} />}
    </div>
  </div>;
}

function PdfPage({ document, pageNumber, width, title, loading, failed }: {
  document: PDFDocumentProxy; pageNumber: number; width: number; title: string; loading: string; failed: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let disposed = false;
    let task: RenderTask | undefined;
    async function render() {
      try {
        const page = await document.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / original.width });
        // Preserve sharp text on HiDPI screens while bounding canvas memory.
        const density = Math.min(window.devicePixelRatio || 1, 2,
          Math.sqrt(16_000_000 / (viewport.width * viewport.height)),
          16384 / Math.max(viewport.width, viewport.height));
        canvas.width = Math.max(1, Math.floor(viewport.width * density));
        canvas.height = Math.max(1, Math.floor(viewport.height * density));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = page.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] });
        await task.promise;
        if (!disposed) setStatus('ready');
      } catch {
        if (!disposed) setStatus('error');
      }
    }
    void render();
    return () => {
      disposed = true;
      task?.cancel();
    };
  }, [document, pageNumber, width]);

  return <>
    {status === 'loading' && <p role="status" className="p-3 text-sm">{loading}</p>}
    {status === 'error' && <p role="alert" className="p-3 text-sm">{failed}</p>}
    <canvas ref={canvasRef} data-testid="document-preview-canvas" role="img" aria-label={title}
      className="mx-auto block bg-white" style={{ display: status === 'ready' ? 'block' : 'none' }} />
  </>;
}
