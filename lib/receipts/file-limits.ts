export const RECEIPT_MAX_BYTES = 3 * 1024 * 1024;
export const RECEIPT_SIZE_MESSAGE =
  "Fylgiskjal má vera að hámarki 3 MB. Veldu minni skrá.";
export const RECEIPT_EMPTY_MESSAGE =
  "Tómar skrár eru ekki gild fylgiskjöl. Veldu aðra skrá.";
export const RECEIPT_FILE_TYPE_MESSAGE =
  "Aðeins PDF- og myndskrár eru leyfðar.";

// Same file types as the browser picker. The extension fallback is only for
// files whose MIME type is unavailable; this is UI validation, not a server
// security boundary.
function isSupportedReceiptFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  if (mime !== "") return false;
  return /\.(pdf|png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif)$/i.test(file.name);
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
