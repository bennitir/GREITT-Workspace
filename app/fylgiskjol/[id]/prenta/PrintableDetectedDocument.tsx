"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectConfidentReceiptCrop,
  drawCropToCanvas,
  loadImageForCanvas,
} from "@/lib/documents/image-cleanup";

type BookingLine = {
  id: number;
  account: string;
  text: string;
  side: "DEBIT" | "CREDIT";
  amount: number;
};

type Labels = {
  title: string;
  voucherLabel: string;
  preparing: string;
  printNow: string;
  close: string;
  bookingMark: string;
  bookkeeperMark: string;
  debit: string;
  credit: string;
  renderError: string;
  sourcePage: string;
};

type Props = {
  sourceUrl: string;
  isPdf: boolean;
  sourcePageNumbers: number[] | null;
  voucherNumber: number;
  companyName: string;
  merchantName: string | null;
  dateLabel: string | null;
  bookingLines: BookingLine[];
  autoPrint: boolean;
  backHref: string;
  labels: Labels;
};

const MAX_STANDALONE_PDF_PAGES = 30;

function formatAmount(value: number) {
  return `${value.toLocaleString("is-IS", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} kr.`;
}


type PdfImagePage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

async function pageImageToJpeg(pageImage: string): Promise<PdfImagePage> {
  const image = new Image();
  image.decoding = "async";
  image.src = pageImage;

  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      // Some browsers reject decode() for data URLs even though load works.
    }
  }

  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Could not load print image.")), {
        once: true,
      });
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is not available in this browser.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Could not create print image."))),
      "image/jpeg",
      0.96,
    );
  });

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

function buildPdfBlob(pages: PdfImagePage[]) {
  // Build a deliberately small, dependency-free PDF. Each rendered source page
  // becomes exactly one PDF page, so browser HTML pagination can no longer
  // split a voucher or move the booking mark onto a second sheet.
  const pageWidth = 595.276; // A4 width in PDF points.
  const pageHeight = 841.89; // A4 height in PDF points.
  const objectCount = 2 + pages.length * 3;
  const offsets = new Array<number>(objectCount + 1).fill(0);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  const append = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? asciiBytes(chunk) : chunk;
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const startObject = (objectNumber: number) => {
    offsets[objectNumber] = byteLength;
    append(`${objectNumber} 0 obj\n`);
  };

  append("%PDF-1.4\n%GLGGT\n");

  startObject(1);
  append("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const pageObjects = pages.map((_, index) => 3 + index * 3);
  startObject(2);
  append(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjects
    .map((objectNumber) => `${objectNumber} 0 R`)
    .join(" ")}] >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;

    const scale = Math.min(pageWidth / page.width, pageHeight / page.height);
    const drawWidth = page.width * scale;
    const drawHeight = page.height * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const content = `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${x.toFixed(
      3,
    )} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`;
    const contentBytes = asciiBytes(content);

    startObject(pageObject);
    append(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(
        3,
      )} ${pageHeight.toFixed(
        3,
      )}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\nendobj\n`,
    );

    startObject(imageObject);
    append(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    append(page.bytes);
    append("\nendstream\nendobj\n");

    startObject(contentObject);
    append(`<< /Length ${contentBytes.length} >>\nstream\n`);
    append(contentBytes);
    append("endstream\nendobj\n");
  });

  const xrefOffset = byteLength;
  append(`xref\n0 ${objectCount + 1}\n`);
  append("0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    append(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }

  append(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const pdfBytes = new Uint8Array(byteLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return new Blob([pdfBytes.buffer], { type: "application/pdf" });
}

async function printRenderedPages(pageImages: string[], title: string) {
  if (pageImages.length === 0) return;

  const pdfPages = await Promise.all(pageImages.map((pageImage) => pageImageToJpeg(pageImage)));
  const pdfBlob = buildPdfBlob(pdfPages);
  const pdfUrl = URL.createObjectURL(pdfBlob);

  // Print the actual PDF rather than HTML. This removes browser-specific page
  // breaking from the critical path. The hidden frame remains only as a host
  // for the browser's PDF viewer.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = title;
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = pdfUrl;
  document.body.appendChild(iframe);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(pdfUrl);
    }, 1000);
  };

  iframe.addEventListener(
    "load",
    () => {
      // Give the built-in PDF viewer a moment to finish laying out the blob.
      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (error) {
          console.warn("Direct PDF printing was blocked; opening the PDF instead.", error);
          window.open(pdfUrl, "_blank", "noopener,noreferrer");
          cleanup();
        }
      }, 350);
    },
    { once: true },
  );

  // Keep the object URL alive long enough for native print dialogs. Some PDF
  // viewers do not fire afterprint on the embedding window.
  window.setTimeout(cleanup, 120_000);
}

type MarkPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function mmToPxX(mm: number, canvasWidth: number, pageWidthMm: number) {
  return (mm / pageWidthMm) * canvasWidth;
}

function mmToPxY(mm: number, canvasHeight: number, pageHeightMm: number) {
  return (mm / pageHeightMm) * canvasHeight;
}

function findBlankPlacement(
  canvas: HTMLCanvasElement,
  pageWidthMm: number,
  pageHeightMm: number,
  markWidthMm: number,
  markHeightMm: number,
): MarkPlacement | null {
  const analysisWidth = 560;
  const analysisHeight = Math.max(1, Math.round((canvas.height / canvas.width) * analysisWidth));
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;

  const analysisContext = analysisCanvas.getContext("2d", { alpha: false });
  if (!analysisContext) return null;

  analysisContext.fillStyle = "#ffffff";
  analysisContext.fillRect(0, 0, analysisWidth, analysisHeight);
  analysisContext.drawImage(canvas, 0, 0, analysisWidth, analysisHeight);

  const pixels = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data;
  const stride = analysisWidth + 1;

  // First build a high-resolution ink map. Thin receipt text can disappear
  // when downsampled too aggressively, so use a very conservative threshold.
  const rawInk = new Uint8Array(analysisWidth * analysisHeight);
  for (let y = 0; y < analysisHeight; y += 1) {
    for (let x = 0; x < analysisWidth; x += 1) {
      const offset = (y * analysisWidth + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      rawInk[y * analysisWidth + x] = r < 250 || g < 250 || b < 250 ? 1 : 0;
    }
  }

  // Dilate ink slightly so a booking mark never sits on top of sparse text,
  // dates or page numbers that occupy only a tiny fraction of the candidate box.
  const rawStride = analysisWidth + 1;
  const rawIntegral = new Uint32Array((analysisWidth + 1) * (analysisHeight + 1));
  for (let y = 1; y <= analysisHeight; y += 1) {
    let row = 0;
    for (let x = 1; x <= analysisWidth; x += 1) {
      row += rawInk[(y - 1) * analysisWidth + (x - 1)];
      rawIntegral[y * rawStride + x] = rawIntegral[(y - 1) * rawStride + x] + row;
    }
  }

  const occupied = new Uint8Array(analysisWidth * analysisHeight);
  const dilationRadius = 3;
  const rawRectInk = (x1: number, y1: number, x2: number, y2: number) =>
    rawIntegral[y2 * rawStride + x2] -
    rawIntegral[y1 * rawStride + x2] -
    rawIntegral[y2 * rawStride + x1] +
    rawIntegral[y1 * rawStride + x1];

  for (let y = 0; y < analysisHeight; y += 1) {
    const y1 = Math.max(0, y - dilationRadius);
    const y2 = Math.min(analysisHeight, y + dilationRadius + 1);
    for (let x = 0; x < analysisWidth; x += 1) {
      const x1 = Math.max(0, x - dilationRadius);
      const x2 = Math.min(analysisWidth, x + dilationRadius + 1);
      occupied[y * analysisWidth + x] = rawRectInk(x1, y1, x2, y2) > 0 ? 1 : 0;
    }
  }

  const integral = new Uint32Array((analysisWidth + 1) * (analysisHeight + 1));
  for (let y = 1; y <= analysisHeight; y += 1) {
    let rowInk = 0;
    for (let x = 1; x <= analysisWidth; x += 1) {
      rowInk += occupied[(y - 1) * analysisWidth + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowInk;
    }
  }

  const pxPerMmX = analysisWidth / pageWidthMm;
  const pxPerMmY = analysisHeight / pageHeightMm;
  const safetyMm = 4;
  const scanWidth = Math.max(1, Math.round((markWidthMm + safetyMm * 2) * pxPerMmX));
  const scanHeight = Math.max(1, Math.round((markHeightMm + safetyMm * 2) * pxPerMmY));
  const edgeX = Math.max(1, Math.round(5 * pxPerMmX));
  const edgeY = Math.max(1, Math.round(5 * pxPerMmY));
  const stepX = Math.max(1, Math.round(3 * pxPerMmX));
  const stepY = Math.max(1, Math.round(3 * pxPerMmY));

  const rectInk = (x: number, y: number, width: number, height: number) => {
    const x2 = x + width;
    const y2 = y + height;
    return (
      integral[y2 * stride + x2] -
      integral[y * stride + x2] -
      integral[y2 * stride + x] +
      integral[y * stride + x]
    );
  };

  let best: { x: number; y: number; ratio: number; score: number } | null = null;
  const area = scanWidth * scanHeight;

  for (let y = edgeY; y + scanHeight <= analysisHeight - edgeY; y += stepY) {
    for (let x = edgeX; x + scanWidth <= analysisWidth - edgeX; x += stepX) {
      const ratio = rectInk(x, y, scanWidth, scanHeight) / area;
      // Prefer truly empty areas. When equally empty, prefer lower areas of
      // the page: receipt headers often contain sparse dates/page numbers that
      // are easy to miss, while the lower half is usually safer blank space.
      const score = ratio + ((analysisHeight - y) / analysisHeight) * 0.00002;
      if (!best || score < best.score) {
        best = { x, y, ratio, score };
      }
    }
  }

  // After dilation, even a tiny amount of occupied area can represent real
  // receipt text. Be deliberately strict: if the box is not essentially empty,
  // fall back to the reserved bottom area instead of hiding source information.
  if (!best || best.ratio > 0.0008) return null;

  const insetX = Math.round(safetyMm * pxPerMmX);
  const insetY = Math.round(safetyMm * pxPerMmY);
  const x = ((best.x + insetX) / analysisWidth) * canvas.width;
  const y = ((best.y + insetY) / analysisHeight) * canvas.height;

  return {
    x,
    y,
    width: mmToPxX(markWidthMm, canvas.width, pageWidthMm),
    height: mmToPxY(markHeightMm, canvas.height, pageHeightMm),
  };
}

function drawBookingMark(
  context: CanvasRenderingContext2D,
  placement: MarkPlacement,
  voucherNumber: number,
  bookingLines: BookingLine[],
  labels: Labels,
  meta: string,
) {
  const { x, y, width, height } = placement;
  const unit = Math.min(width / 52, height / 30);
  const pad = Math.max(4, 1.5 * unit);

  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#111111";
  context.lineWidth = Math.max(2, 0.45 * unit);
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);

  const headerHeight = 7.5 * unit;
  context.fillStyle = "#111111";
  context.textBaseline = "middle";
  context.font = `700 ${Math.max(10, 2.25 * unit)}px Arial, sans-serif`;
  context.fillText("GLÖGGT", x + pad, y + headerHeight * 0.48);

  const voucherText = `${labels.voucherLabel} ${voucherNumber}`;
  context.font = `900 ${Math.max(13, 3.7 * unit)}px Arial, sans-serif`;
  const voucherWidth = context.measureText(voucherText).width;
  context.fillText(
    voucherText,
    Math.max(x + pad, x + width - pad - voucherWidth),
    y + headerHeight * 0.5,
  );

  context.lineWidth = Math.max(1, 0.22 * unit);
  context.beginPath();
  context.moveTo(x + pad, y + headerHeight);
  context.lineTo(x + width - pad, y + headerHeight);
  context.stroke();

  const footerHeight = 4.2 * unit;
  const linesTop = y + headerHeight + 0.8 * unit;
  const linesBottom = y + height - footerHeight - 0.6 * unit;
  const availableLinesHeight = Math.max(1, linesBottom - linesTop);
  const lineCount = Math.max(1, bookingLines.length);
  const lineHeight = availableLinesHeight / lineCount;
  const fontSize = Math.max(9, Math.min(4.2 * unit, lineHeight * 0.72));

  bookingLines.forEach((line, index) => {
    const centerY = linesTop + lineHeight * (index + 0.5);
    const sideLabel = line.side === "DEBIT" ? labels.debit : labels.credit;
    const sideShort = sideLabel.trim().slice(0, 1).toUpperCase();
    const leftText = `${sideShort} ${line.account}`;
    const amountText = line.amount.toLocaleString("is-IS", {
      maximumFractionDigits: 2,
    });

    context.font = `900 ${fontSize}px Arial, sans-serif`;
    context.fillStyle = "#111111";
    context.fillText(leftText, x + pad, centerY);

    const amountWidth = context.measureText(amountText).width;
    context.fillText(amountText, x + width - pad - amountWidth, centerY);
  });

  if (meta) {
    context.font = `600 ${Math.max(7, 1.7 * unit)}px Arial, sans-serif`;
    context.fillStyle = "#555555";
    const maxWidth = width - pad * 2;
    let text = meta;
    while (text.length > 8 && context.measureText(text).width > maxWidth) {
      text = `${text.slice(0, -2)}…`;
    }
    context.fillText(text, x + pad, y + height - footerHeight * 0.45);
  }

  context.restore();
}

function addBookingMarkToCanvas(
  canvas: HTMLCanvasElement,
  pageWidthMm: number,
  pageHeightMm: number,
  voucherNumber: number,
  bookingLines: BookingLine[],
  labels: Labels,
  meta: string,
) {
  const markWidthMm = 52;
  const markHeightMm = Math.min(44, Math.max(30, 12 + bookingLines.length * 4.6));

  let placement = findBlankPlacement(
    canvas,
    pageWidthMm,
    pageHeightMm,
    markWidthMm,
    markHeightMm,
  );

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  if (!placement) {
    // No safe white area was found. Keep all source content visible by
    // shrinking it slightly and reserve a compact mark at the bottom.
    const sourceCopy = document.createElement("canvas");
    sourceCopy.width = canvas.width;
    sourceCopy.height = canvas.height;
    const copyContext = sourceCopy.getContext("2d", { alpha: false });
    if (copyContext) {
      copyContext.drawImage(canvas, 0, 0);

      const bottomBandMm = markHeightMm + 7;
      const bottomBandPx = mmToPxY(bottomBandMm, canvas.height, pageHeightMm);
      const usableHeight = canvas.height - bottomBandPx;
      const scale = Math.min(1, usableHeight / canvas.height);
      const scaledWidth = canvas.width * scale;
      const scaledHeight = canvas.height * scale;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        sourceCopy,
        (canvas.width - scaledWidth) / 2,
        0,
        scaledWidth,
        scaledHeight,
      );
    }

    const marginX = mmToPxX(6, canvas.width, pageWidthMm);
    const marginY = mmToPxY(4, canvas.height, pageHeightMm);
    const width = mmToPxX(markWidthMm, canvas.width, pageWidthMm);
    const height = mmToPxY(markHeightMm, canvas.height, pageHeightMm);
    placement = {
      x: canvas.width - width - marginX,
      y: canvas.height - height - marginY,
      width,
      height,
    };
  }

  drawBookingMark(context, placement, voucherNumber, bookingLines, labels, meta);
}

function addBookingMarkToRenderedPage(
  canvas: HTMLCanvasElement,
  naturalPageWidth: number,
  naturalPageHeight: number,
  voucherNumber: number,
  bookingLines: BookingLine[],
  labels: Labels,
  meta: string,
) {
  const pageWidthMm = (naturalPageWidth / 72) * 25.4;
  const pageHeightMm = (naturalPageHeight / 72) * 25.4;
  addBookingMarkToCanvas(
    canvas,
    pageWidthMm,
    pageHeightMm,
    voucherNumber,
    bookingLines,
    labels,
    meta,
  );
}

async function preparePhotographedDocumentForPrint(
  sourceUrl: string,
  voucherNumber: number,
  bookingLines: BookingLine[],
  labels: Labels,
  meta: string,
) {
  const image = await loadImageForCanvas(sourceUrl);
  const detectedCrop = detectConfidentReceiptCrop(
    image,
    image.naturalWidth,
    image.naturalHeight,
  );

  let canvas = detectedCrop ? drawCropToCanvas(image, detectedCrop) : null;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is not available in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
  }

  // Treat the cleaned photo as a document page with A4-like physical width.
  // Only the ratio matters for mark placement; the original image remains
  // untouched in storage.
  const pageWidthMm = 210;
  const pageHeightMm = pageWidthMm * (canvas.height / canvas.width);
  addBookingMarkToCanvas(
    canvas,
    pageWidthMm,
    pageHeightMm,
    voucherNumber,
    bookingLines,
    labels,
    meta,
  );

  return canvas.toDataURL("image/jpeg", 0.95);
}

export default function PrintableDetectedDocument({
  sourceUrl,
  isPdf,
  sourcePageNumbers,
  voucherNumber,
  companyName,
  merchantName,
  dateLabel,
  bookingLines,
  autoPrint,
  backHref,
  labels,
}: Props) {
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const didAutoPrintRef = useRef(false);

  const sourcePageKey = useMemo(
    () => (sourcePageNumbers ? sourcePageNumbers.join(",") : "all"),
    [sourcePageNumbers],
  );

  useEffect(() => {
    let cancelled = false;

    async function prepareSourcePages() {
      setIsPreparing(true);
      setRenderError(null);
      setRenderedPages([]);

      try {
        if (!isPdf) {
          const meta = [companyName, merchantName, dateLabel]
            .filter((value): value is string => Boolean(value))
            .join(" · ");
          const preparedImage = await preparePhotographedDocumentForPrint(
            sourceUrl,
            voucherNumber,
            bookingLines,
            labels,
            meta,
          );
          if (!cancelled) {
            setRenderedPages([preparedImage]);
            setIsPreparing(false);
          }
          return;
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const sourceBytes = new Uint8Array(await response.arrayBuffer());
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(sourceBytes);

        let pagesToRender: number[];
        if (sourcePageNumbers && sourcePageNumbers.length > 0) {
          pagesToRender = sourcePageNumbers;
        } else {
          if (pdf.numPages > MAX_STANDALONE_PDF_PAGES) {
            throw new Error(
              `PDF contains ${pdf.numPages} pages; safe print preview limit is ${MAX_STANDALONE_PDF_PAGES}.`,
            );
          }
          pagesToRender = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
        }

        const uniquePages = [...new Set(pagesToRender)].filter(
          (pageNumber) =>
            Number.isInteger(pageNumber) &&
            pageNumber >= 1 &&
            pageNumber <= pdf.numPages,
        );

        if (uniquePages.length === 0) {
          throw new Error("No valid source page was found for printing.");
        }

        const pageImages: string[] = [];

        for (const pageNumber of uniquePages) {
          if (cancelled) break;

          const page = await pdf.getPage(pageNumber);
          const naturalViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2.2, Math.max(1.5, 1400 / naturalViewport.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            throw new Error("Canvas is not available in this browser.");
          }

          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          // `canvas` became explicit in newer PDF.js versions while older
          // versions only require canvasContext. Supplying both keeps this
          // compatible across the versions GLÖGGT has used.
          const renderParameters: any = {
            canvas,
            canvasContext: context,
            viewport,
            intent: "print",
            background: "#ffffff",
          };

          await page.render(renderParameters).promise;

          if (pageImages.length === 0) {
            const meta = [companyName, merchantName, dateLabel]
              .filter((value): value is string => Boolean(value))
              .join(" · ");
            addBookingMarkToRenderedPage(
              canvas,
              naturalViewport.width,
              naturalViewport.height,
              voucherNumber,
              bookingLines,
              labels,
              meta,
            );
          }

          pageImages.push(canvas.toDataURL("image/png"));
          page.cleanup();
        }

        const destroyPdf = (pdf as unknown as {
          destroy?: () => Promise<void> | void;
        }).destroy;
        if (typeof destroyPdf === "function") {
          await destroyPdf.call(pdf);
        }

        if (!cancelled) {
          setRenderedPages(pageImages);
          setIsPreparing(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to prepare detected document for printing", error);
          setRenderError(labels.renderError);
          setIsPreparing(false);
        }
      }
    }

    void prepareSourcePages();

    return () => {
      cancelled = true;
    };
  }, [
    bookingLines,
    companyName,
    dateLabel,
    isPdf,
    labels,
    merchantName,
    sourcePageKey,
    sourceUrl,
    voucherNumber,
  ]);

  useEffect(() => {
    if (
      !autoPrint ||
      isPreparing ||
      renderError ||
      renderedPages.length === 0 ||
      didAutoPrintRef.current
    ) {
      return;
    }

    didAutoPrintRef.current = true;
    const title = `${labels.title} ${voucherNumber}`;
    void printRenderedPages(renderedPages, title);
  }, [
    autoPrint,
    isPreparing,
    labels.title,
    renderError,
    renderedPages,
    voucherNumber,
  ]);

  return (
    <div className="gloggt-print-root fixed inset-0 z-[1000] overflow-y-auto bg-slate-100 text-slate-950">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 7mm;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .gloggt-print-root,
          .gloggt-print-root * {
            visibility: visible !important;
          }

          .gloggt-print-root {
            position: static !important;
            inset: auto !important;
            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          .gloggt-screen-controls {
            display: none !important;
          }

          .gloggt-print-sheet {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 282mm;
            min-height: 0 !important;
            padding: 0 !important;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: auto;
            page-break-after: auto;
          }

          .gloggt-print-sheet + .gloggt-print-sheet {
            break-before: page;
            page-break-before: always;
          }

          .gloggt-source-frame {
            display: flex;
            flex: 1 1 auto;
            min-height: 0;
            width: 100%;
            align-items: flex-start;
            justify-content: center;
            overflow: hidden;
          }

          .gloggt-print-sheet-following .gloggt-source-frame {
            flex: 1 1 auto;
          }

          .gloggt-source-image {
            display: block;
            max-width: 100% !important;
            max-height: 100% !important;
            width: auto !important;
            height: auto !important;
            object-fit: contain;
          }
        }
      `}</style>

      <div className="gloggt-screen-controls sticky top-0 z-10 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{labels.title}</div>
            <div className="text-sm text-slate-600">
              {labels.bookingMark} · {labels.sourcePage}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={backHref}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              {labels.close}
            </a>
            <button
              type="button"
              onClick={() =>
                void printRenderedPages(
                  renderedPages,
                  `${labels.title} ${voucherNumber}`,
                )
              }
              disabled={isPreparing || Boolean(renderError) || renderedPages.length === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPreparing ? labels.preparing : labels.printNow}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[210mm] bg-white print:max-w-none">
        {renderError ? (
          <div className="gloggt-screen-controls m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            {renderError}
          </div>
        ) : null}

        {renderedPages.map((pageImage, index) => (
          <section
            key={`${sourcePageKey}-${index}`}
            className={`gloggt-print-sheet bg-white p-[7mm] ${
              index === 0
                ? "gloggt-print-sheet-first"
                : "gloggt-print-sheet-following"
            }`}
          >
            <div className="gloggt-source-frame">
              <img
                src={pageImage}
                alt={`${labels.title} ${voucherNumber} – ${index + 1}`}
                className="gloggt-source-image max-w-full border border-slate-200 bg-white"
              />
            </div>
          </section>
        ))}

        {isPreparing ? (
          <div className="gloggt-screen-controls flex min-h-[70vh] items-center justify-center text-lg font-semibold text-slate-600">
            {labels.preparing}
          </div>
        ) : null}
      </main>
    </div>
  );
}
