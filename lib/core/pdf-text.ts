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

/**
 * Sama deterministic PDF-textalestur, en síðum haldið aðskildum.
 *
 * Þetta er mikilvægt fyrir safnskjöl þar sem eitt PDF inniheldur mörg
 * sjálfstæð rekstrarskjöl. Síður eru varðveittar í réttri röð og ekkert
 * er sent út fyrir GLÖGGT.
 */
export async function extractTextPagesFromPdfBuffer(
  buffer: Buffer | Uint8Array,
): Promise<string[]> {
  const data = new Uint8Array(buffer);

  const { text } = await extractText(data, {
    mergePages: false,
  });

  return Array.isArray(text)
    ? text.map((page) => String(page ?? ""))
    : [String(text ?? "")];
}
