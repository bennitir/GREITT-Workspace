export const RECEIPT_MAX_BYTES = 3 * 1024 * 1024;
export const RECEIPT_SIZE_MESSAGE =
  "Fylgiskjal má vera að hámarki 3 MB. Veldu minni skrá.";
export const RECEIPT_EMPTY_MESSAGE =
  "Tómar skrár eru ekki gild fylgiskjöl. Veldu aðra skrá.";
export const RECEIPT_FILE_TYPE_MESSAGE =
  "Aðeins PDF- og myndskrár eru leyfðar.";

// The browser picker is only a convenience. The server additionally checks
// the uploaded bytes before parsing the document or writing it to Storage.
const RECEIPT_MEDIA_RULES: Record<string, {
  extensions: readonly string[];
  declaredMimes: readonly string[];
}> = {
  "application/pdf": { extensions: ["pdf"], declaredMimes: ["application/pdf", "application/x-pdf"] },
  "image/png": { extensions: ["png"], declaredMimes: ["image/png", "image/x-png"] },
  "image/jpeg": { extensions: ["jpg", "jpeg", "jpe"], declaredMimes: ["image/jpeg", "image/pjpeg"] },
  "image/gif": { extensions: ["gif"], declaredMimes: ["image/gif"] },
  "image/webp": { extensions: ["webp"], declaredMimes: ["image/webp"] },
  "image/bmp": { extensions: ["bmp"], declaredMimes: ["image/bmp", "image/x-ms-bmp", "image/x-bmp"] },
  "image/tiff": { extensions: ["tif", "tiff"], declaredMimes: ["image/tiff"] },
  "image/avif": { extensions: ["avif"], declaredMimes: ["image/avif", "image/avif-sequence"] },
  "image/heic": { extensions: ["heic", "heif"], declaredMimes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"] },
  "image/heif": { extensions: ["heic", "heif"], declaredMimes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"] },
};

export const RECEIPT_CONTENT_MESSAGE =
  "Skráin er ekki gilt PDF eða studd myndskrá, eða ending hennar passar ekki við innihaldið.";

type ReceiptFileMetadata = Pick<File, "name" | "type" | "size">;

function extensionOf(fileName: string): string {
  return /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? "";
}

function declaredMimeOf(fileType: string): string {
  return fileType.split(";", 1)[0].trim().toLowerCase();
}

function metadataMatches(
  metadata: ReceiptFileMetadata,
  rule: { extensions: readonly string[]; declaredMimes: readonly string[] },
): boolean {
  const extension = extensionOf(metadata.name);
  const mime = declaredMimeOf(metadata.type);
  return rule.extensions.includes(extension) &&
    (!mime || mime === "application/octet-stream" || rule.declaredMimes.includes(mime));
}

function isSupportedReceiptFile(file: File): boolean {
  return Object.values(RECEIPT_MEDIA_RULES).some((rule) => metadataMatches(file, rule));
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// Signature check, not a full media decoder or malware scan. Do not rely on
// the filename or a client-controlled MIME value for this classification.
function detectReceiptMedia(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && /^%PDF-[12]\.[0-9]$/.test(ascii(bytes, 0, 8))) {
    return "application/pdf";
  }
  if (bytes.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
      ascii(bytes, 12, 4) === "IHDR") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (bytes.length >= 13 && /^(GIF87a|GIF89a)$/.test(ascii(bytes, 0, 6))) {
    return "image/gif";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" &&
      ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 14 && ascii(bytes, 0, 2) === "BM") return "image/bmp";
  if (bytes.length >= 8 && (ascii(bytes, 0, 4) === "II*\0" ||
      ascii(bytes, 0, 4) === "MM\0*")) return "image/tiff";

  // HEIC, HEIF and AVIF use an ISO-BMFF ftyp box with a media brand.
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp") {
    const boxSize = bytes[0] * 0x1000000 + (bytes[1] << 16) +
      (bytes[2] << 8) + bytes[3];
    if (boxSize >= 16 && boxSize <= bytes.length) {
      const brands = [ascii(bytes, 8, 4)];
      for (let offset = 16; offset + 4 <= Math.min(boxSize, 256); offset += 4) {
        brands.push(ascii(bytes, offset, 4));
      }
      if (brands.some((brand) => brand === "avif" || brand === "avis")) return "image/avif";
      if (brands.some((brand) => ["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand))) {
        return "image/heic";
      }
      if (brands.some((brand) => brand === "mif1" || brand === "msf1")) return "image/heif";
    }
  }
  return null;
}

/**
 * Shared server-side boundary for both automatic and manual receipt uploads.
 * Call before document extraction and before writing to Supabase Storage.
 * Returns the verified canonical MIME for Storage (never the client MIME).
 */
export function assertReceiptContent(
  metadata: ReceiptFileMetadata,
  bytes: Uint8Array,
): string {
  assertReceiptSize(metadata.size);
  assertReceiptSize(bytes.byteLength);
  if (metadata.size !== bytes.byteLength) throw new Error(RECEIPT_CONTENT_MESSAGE);
  const detected = detectReceiptMedia(bytes);
  const rule = detected ? RECEIPT_MEDIA_RULES[detected] : undefined;
  if (!detected || !rule || !metadataMatches(metadata, rule)) {
    throw new Error(RECEIPT_CONTENT_MESSAGE);
  }
  return detected;
}

export function selectReceiptFiles(files: readonly File[]): {
  acceptedFiles: File[];
  hasOversizedFiles: boolean;
  hasEmptyFiles: boolean;
  hasUnsupportedFiles: boolean;
} {
  const acceptedFiles = files.filter(
    (file) =>
      file.size > 0 &&
      file.size <= RECEIPT_MAX_BYTES &&
      isSupportedReceiptFile(file),
  );

  return {
    acceptedFiles,
    hasOversizedFiles: files.some((file) => file.size > RECEIPT_MAX_BYTES),
    hasEmptyFiles: files.some((file) => file.size <= 0),
    hasUnsupportedFiles: files.some((file) => !isSupportedReceiptFile(file)),
  };
}

// Preserve documents already selected when the user chooses or drops more files.
// Dedupe only the very same File object: two different documents can have
// identical names, sizes and timestamps, so metadata is never a safe key.
export function appendReceiptFiles(
  existing: readonly File[],
  incoming: readonly File[],
): File[] {
  const combined = [...existing];
  for (const file of incoming) {
    if (!combined.includes(file)) combined.push(file);
  }
  return combined;
}

export function assertReceiptSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0 || size > RECEIPT_MAX_BYTES) {
    throw new Error(RECEIPT_SIZE_MESSAGE);
  }
}
