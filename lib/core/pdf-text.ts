import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Les textalag úr PDF-buffer án þess að senda skjalið til AI
 * eða annarrar ytri greiningarþjónustu.
 *
 * Þetta er m.a. notað fyrir persónuverndar-preflight Innsýnar.
 *
 * Athugið:
 * - Þetta er textalestur, ekki OCR.
 * - Skannað PDF án textalags getur því skilað tómum texta.
 * - Engin gögn eru vistuð hér.
 */
export async function extractTextFromPdfBuffer(
  buffer: Buffer | Uint8Array,
): Promise<string> {
  const data =
    buffer instanceof Uint8Array
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data,
  });

  const pdf = await loadingTask.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item) => {
          if ("str" in item) {
            return item.str;
          }

          return "";
        })
        .filter(Boolean)
        .join(" ");

      pages.push(pageText);
    }

    return pages.join("\n");
    } finally {
    await loadingTask.destroy();
  }
}