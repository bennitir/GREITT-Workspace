export type ImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAX_ANALYSIS_SIDE = 520;

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function makeAnalysisCanvas(image: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, scale };
}

function getDarkRatioForRow(
  pixels: Uint8ClampedArray,
  width: number,
  y: number,
  x1: number,
  x2: number,
) {
  let dark = 0;
  let sum = 0;
  let count = 0;
  for (let x = x1; x < x2; x += 2) {
    const offset = (y * width + x) * 4;
    const value = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (value < 92) dark += 1;
    sum += value;
    count += 1;
  }
  return {
    ratio: count > 0 ? dark / count : 0,
    average: count > 0 ? sum / count : 255,
  };
}

function getDarkRatioForColumn(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y1: number,
  y2: number,
) {
  let dark = 0;
  let sum = 0;
  let count = 0;
  for (let y = y1; y < y2; y += 2) {
    const offset = (y * width + x) * 4;
    const value = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (value < 92) dark += 1;
    sum += value;
    count += 1;
  }
  return {
    ratio: count > 0 ? dark / count : 0,
    average: count > 0 ? sum / count : 255,
  };
}

function isConfidentDarkEdge(stats: { ratio: number; average: number }) {
  return stats.ratio >= 0.58 && stats.average <= 112;
}


function colorSpread(r: number, g: number, b: number) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function isPaperLikePixel(r: number, g: number, b: number) {
  const light = luminance(r, g, b);
  const spread = colorSpread(r, g, b);

  // Receipt paper is usually fairly bright and close to neutral, but photos
  // often contain soft shadows. Keep the rule broad enough for shaded paper
  // while rejecting coloured desk/wood backgrounds.
  return (light >= 142 && spread <= 64) || (light >= 182 && spread <= 92);
}

function paperRatioForColumn(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y1: number,
  y2: number,
) {
  let paper = 0;
  let count = 0;
  for (let y = y1; y < y2; y += 2) {
    const offset = (y * width + x) * 4;
    if (isPaperLikePixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
      paper += 1;
    }
    count += 1;
  }
  return count > 0 ? paper / count : 0;
}

function paperRatioForRow(
  pixels: Uint8ClampedArray,
  width: number,
  y: number,
  x1: number,
  x2: number,
) {
  let paper = 0;
  let count = 0;
  for (let x = x1; x < x2; x += 2) {
    const offset = (y * width + x) * 4;
    if (isPaperLikePixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
      paper += 1;
    }
    count += 1;
  }
  return count > 0 ? paper / count : 0;
}

function paperRatioInRect(
  pixels: Uint8ClampedArray,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  let paper = 0;
  let count = 0;
  const xStep = Math.max(2, Math.round((x2 - x1) / 90));
  const yStep = Math.max(2, Math.round((y2 - y1) / 90));
  for (let y = y1; y < y2; y += yStep) {
    for (let x = x1; x < x2; x += xStep) {
      const offset = (y * width + x) * 4;
      if (isPaperLikePixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
        paper += 1;
      }
      count += 1;
    }
  }
  return count > 0 ? paper / count : 0;
}

type RatioRun = { start: number; end: number; score: number };

function findPaperRun(
  ratios: number[],
  threshold: number,
  minLength: number,
  preferredIndex: number,
) {
  const maxGap = Math.max(2, Math.round(ratios.length * 0.012));
  const runs: RatioRun[] = [];
  let index = 0;

  while (index < ratios.length) {
    while (index < ratios.length && ratios[index] < threshold) index += 1;
    if (index >= ratios.length) break;

    const start = index;
    let end = index + 1;
    let gap = 0;
    let ratioSum = ratios[index];
    let ratioCount = 1;

    for (index = index + 1; index < ratios.length; index += 1) {
      if (ratios[index] >= threshold) {
        end = index + 1;
        gap = 0;
        ratioSum += ratios[index];
        ratioCount += 1;
      } else {
        gap += 1;
        if (gap > maxGap) break;
      }
    }

    const length = end - start;
    if (length >= minLength) {
      const containsPreferred = start <= preferredIndex && preferredIndex < end;
      const distance = containsPreferred
        ? 0
        : Math.min(Math.abs(preferredIndex - start), Math.abs(preferredIndex - end));
      const average = ratioCount > 0 ? ratioSum / ratioCount : 0;
      runs.push({
        start,
        end,
        score: length * (1 + average) + (containsPreferred ? ratios.length : 0) - distance,
      });
    }
  }

  return runs.sort((a, b) => b.score - a.score)[0] ?? null;
}

/**
 * Detect a light/neutral receipt or invoice lying on a visibly different
 * background (for example white receipt paper on a wooden table).
 *
 * This remains intentionally conservative. It only returns a crop when the
 * candidate document area is clearly more paper-like than the area being
 * removed. The stored original is never modified.
 */
export function detectConfidentPaperDocumentCrop(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): ImageCropRect | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;

  const analysis = makeAnalysisCanvas(image, naturalWidth, naturalHeight);
  if (!analysis) return null;

  try {
    const { canvas, context, scale } = analysis;
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;

    const initialY1 = Math.floor(height * 0.08);
    const initialY2 = Math.ceil(height * 0.92);
    const columnRatios = Array.from({ length: width }, (_, x) =>
      paperRatioForColumn(pixels, width, x, initialY1, initialY2),
    );
    const horizontalRun = findPaperRun(
      columnRatios,
      0.46,
      Math.max(20, Math.round(width * 0.34)),
      Math.floor(width / 2),
    );
    if (!horizontalRun) return null;

    let left = horizontalRun.start;
    let right = horizontalRun.end;
    const innerXPadding = Math.max(2, Math.round((right - left) * 0.04));
    const rowRatios = Array.from({ length: height }, (_, y) =>
      paperRatioForRow(
        pixels,
        width,
        y,
        Math.min(right - 1, left + innerXPadding),
        Math.max(left + 1, right - innerXPadding),
      ),
    );
    const verticalRun = findPaperRun(
      rowRatios,
      0.42,
      Math.max(24, Math.round(height * 0.34)),
      Math.floor(height / 2),
    );
    if (!verticalRun) return null;

    let top = verticalRun.start;
    let bottom = verticalRun.end;

    // Refine the horizontal boundary now that we know the likely paper height.
    const innerYPadding = Math.max(2, Math.round((bottom - top) * 0.04));
    const refinedColumnRatios = Array.from({ length: width }, (_, x) =>
      paperRatioForColumn(
        pixels,
        width,
        x,
        Math.min(bottom - 1, top + innerYPadding),
        Math.max(top + 1, bottom - innerYPadding),
      ),
    );
    const refinedHorizontalRun = findPaperRun(
      refinedColumnRatios,
      0.46,
      Math.max(20, Math.round(width * 0.34)),
      Math.floor((left + right) / 2),
    );
    if (refinedHorizontalRun) {
      left = refinedHorizontalRun.start;
      right = refinedHorizontalRun.end;
    }

    const cropWidth = right - left;
    const cropHeight = bottom - top;
    if (cropWidth < width * 0.34 || cropHeight < height * 0.34) return null;

    const insideRatio = paperRatioInRect(pixels, width, left, top, right, bottom);

    // Estimate how paper-like the area being removed is. If it is almost as
    // white/neutral as the candidate document, there is not enough evidence to
    // crop safely (e.g. a white receipt photographed on a white desk).
    const outsideSamples: number[] = [];
    if (left > width * 0.025) {
      outsideSamples.push(paperRatioInRect(pixels, width, 0, top, left, bottom));
    }
    if (right < width * 0.975) {
      outsideSamples.push(paperRatioInRect(pixels, width, right, top, width, bottom));
    }
    if (top > height * 0.025) {
      outsideSamples.push(paperRatioInRect(pixels, width, left, 0, right, top));
    }
    if (bottom < height * 0.975) {
      outsideSamples.push(paperRatioInRect(pixels, width, left, bottom, right, height));
    }
    if (outsideSamples.length === 0) return null;
    const outsideRatio = outsideSamples.reduce((sum, value) => sum + value, 0) / outsideSamples.length;

    const trimTop = top / height;
    const trimBottom = (height - bottom) / height;
    const trimLeft = left / width;
    const trimRight = (width - right) / width;
    const usefulTrim = Math.max(trimTop, trimBottom, trimLeft, trimRight) >= 0.045;
    const safe =
      trimTop <= 0.3 &&
      trimBottom <= 0.3 &&
      trimLeft <= 0.34 &&
      trimRight <= 0.34;
    const confident = insideRatio >= 0.58 && insideRatio - outsideRatio >= 0.14;

    if (!usefulTrim || !safe || !confident) return null;

    // Keep only a very small horizontal safety margin around a confidently
    // detected paper boundary. A wider margin was leaving visible strips of
    // desk/wood beside narrow receipts. Keep a little more room above/below
    // because receipt ends and perspective shadows are more variable there.
    const shortSide = Math.min(width, height);
    const horizontalSafety = Math.max(1, Math.round(shortSide * 0.004));
    const verticalSafety = Math.max(2, Math.round(shortSide * 0.01));
    top = Math.max(0, top - verticalSafety);
    left = Math.max(0, left - horizontalSafety);
    right = Math.min(width, right + horizontalSafety);
    bottom = Math.min(height, bottom + verticalSafety);

    return {
      x: Math.round(left / scale),
      y: Math.round(top / scale),
      width: Math.round((right - left) / scale),
      height: Math.round((bottom - top) / scale),
    };
  } catch {
    return null;
  }
}

/**
 * Prefer a confidently detected paper/document boundary. Fall back to the
 * older dark-edge detector for photos where the only obvious removable area is
 * black/dark background.
 */
export function detectConfidentReceiptCrop(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): ImageCropRect | null {
  return (
    detectConfidentPaperDocumentCrop(image, naturalWidth, naturalHeight) ??
    detectConfidentDarkEdgeCrop(image, naturalWidth, naturalHeight)
  );
}


/**
 * Detect only very obvious dark background touching an outer image edge.
 * This is deliberately conservative: it is meant to remove e.g. a black desk,
 * dashboard or phone-case area around a photographed receipt, not to infer the
 * document boundary. The original image remains untouched.
 */
export function detectConfidentDarkEdgeCrop(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): ImageCropRect | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;

  const analysis = makeAnalysisCanvas(image, naturalWidth, naturalHeight);
  if (!analysis) return null;

  try {
    const { canvas, context, scale } = analysis;
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;

    const centerX1 = Math.floor(width * 0.12);
    const centerX2 = Math.ceil(width * 0.88);
    const centerY1 = Math.floor(height * 0.12);
    const centerY2 = Math.ceil(height * 0.88);

    let top = 0;
    let bottom = height;
    let left = 0;
    let right = width;

    // A screenshot/photo can contain a few bright border pixels outside a
    // genuinely dark background. Allow a very small outer gap, but require a
    // substantial dark run before trimming anything.
    const rowGapLimit = Math.max(2, Math.round(height * 0.02));
    const columnGapLimit = Math.max(2, Math.round(width * 0.02));
    const minDarkRowRun = Math.max(3, Math.round(height * 0.045));
    const minDarkColumnRun = Math.max(3, Math.round(width * 0.045));

    let probeTop = 0;
    let topGap = 0;
    while (
      probeTop < Math.floor(height * 0.28) &&
      topGap < rowGapLimit &&
      !isConfidentDarkEdge(getDarkRatioForRow(pixels, width, probeTop, centerX1, centerX2))
    ) {
      probeTop += 1;
      topGap += 1;
    }
    const topRunStart = probeTop;
    while (
      probeTop < Math.floor(height * 0.28) &&
      isConfidentDarkEdge(getDarkRatioForRow(pixels, width, probeTop, centerX1, centerX2))
    ) {
      probeTop += 1;
    }
    if (probeTop - topRunStart >= minDarkRowRun) top = probeTop;

    let probeBottom = height;
    let bottomGap = 0;
    while (
      probeBottom > Math.ceil(height * 0.58) &&
      bottomGap < rowGapLimit &&
      !isConfidentDarkEdge(
        getDarkRatioForRow(pixels, width, probeBottom - 1, centerX1, centerX2),
      )
    ) {
      probeBottom -= 1;
      bottomGap += 1;
    }
    const bottomRunEnd = probeBottom;
    while (
      probeBottom > Math.ceil(height * 0.58) &&
      isConfidentDarkEdge(
        getDarkRatioForRow(pixels, width, probeBottom - 1, centerX1, centerX2),
      )
    ) {
      probeBottom -= 1;
    }
    if (bottomRunEnd - probeBottom >= minDarkRowRun) bottom = probeBottom;

    let probeLeft = 0;
    let leftGap = 0;
    while (
      probeLeft < Math.floor(width * 0.3) &&
      leftGap < columnGapLimit &&
      !isConfidentDarkEdge(getDarkRatioForColumn(pixels, width, probeLeft, centerY1, centerY2))
    ) {
      probeLeft += 1;
      leftGap += 1;
    }
    const leftRunStart = probeLeft;
    while (
      probeLeft < Math.floor(width * 0.3) &&
      isConfidentDarkEdge(getDarkRatioForColumn(pixels, width, probeLeft, centerY1, centerY2))
    ) {
      probeLeft += 1;
    }
    if (probeLeft - leftRunStart >= minDarkColumnRun) left = probeLeft;

    let probeRight = width;
    let rightGap = 0;
    while (
      probeRight > Math.ceil(width * 0.7) &&
      rightGap < columnGapLimit &&
      !isConfidentDarkEdge(
        getDarkRatioForColumn(pixels, width, probeRight - 1, centerY1, centerY2),
      )
    ) {
      probeRight -= 1;
      rightGap += 1;
    }
    const rightRunEnd = probeRight;
    while (
      probeRight > Math.ceil(width * 0.7) &&
      isConfidentDarkEdge(
        getDarkRatioForColumn(pixels, width, probeRight - 1, centerY1, centerY2),
      )
    ) {
      probeRight -= 1;
    }
    if (rightRunEnd - probeRight >= minDarkColumnRun) right = probeRight;

    const trimTop = top / height;
    const trimBottom = (height - bottom) / height;
    const trimLeft = left / width;
    const trimRight = (width - right) / width;

    // Ignore tiny edge shadows and refuse aggressive guesses. At least one
    // edge must have a clearly useful trim before we alter the review/print view.
    const useful = Math.max(trimTop, trimBottom, trimLeft, trimRight) >= 0.045;
    const safe =
      trimTop <= 0.28 &&
      trimBottom <= 0.42 &&
      trimLeft <= 0.3 &&
      trimRight <= 0.3 &&
      right - left >= width * 0.45 &&
      bottom - top >= height * 0.45;

    if (!useful || !safe) return null;

    // Keep a small safety border outside the detected boundary so source text
    // right at the paper edge is not clipped by the preview/print cleanup.
    const safety = Math.max(2, Math.round(Math.min(width, height) * 0.012));
    top = Math.max(0, top - safety);
    left = Math.max(0, left - safety);
    right = Math.min(width, right + safety);
    bottom = Math.min(height, bottom + safety);

    return {
      x: Math.round(left / scale),
      y: Math.round(top / scale),
      width: Math.round((right - left) / scale),
      height: Math.round((bottom - top) / scale),
    };
  } catch {
    // Cross-origin image pixels may be unavailable in some environments. In
    // that case we simply keep showing/printing the untouched source image.
    return null;
  }
}

export function drawCropToCanvas(
  image: CanvasImageSource,
  crop: ImageCropRect,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, crop.width);
  canvas.height = Math.max(1, crop.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

export async function loadImageForCanvas(sourceUrl: string) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = sourceUrl;

  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      // Fall back to the load event below.
    }
  }

  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Could not load source image.")), {
        once: true,
      });
    });
  }

  return image;
}
