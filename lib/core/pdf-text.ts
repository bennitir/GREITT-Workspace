import { extractText } from "unpdf";

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
  const data = new Uint8Array(buffer);

    const { text } = await extractText(data, {
    mergePages: true,
  });

  return text;
}