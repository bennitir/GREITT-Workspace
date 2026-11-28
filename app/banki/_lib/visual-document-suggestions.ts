import type { VisualDocumentHit } from './visual-reconciliation';

/**
 * Presentation-only shortlist. Never creates a reconciliation or changes the
 * approved matching rules: a similar name, amount, or date is only a hint.
 */
const normalized = (value: string) => value.toLocaleLowerCase('is')
  .replace(/þ/g, 'th').replace(/ð/g, 'd').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const nonMerchantPrefix = new Set(['faersla', 'greidsla', 'kort', 'millifaersla', 'debit', 'payment', 'transfer']);

/** Sjóvá-Almennar líftrygging -> Sjóvá (instead of an impossible exact full-name lookup). */
export function visualMerchantAnchor(text: string): string | null {
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const candidate = tokens.find(token => normalized(token).length >= 3 && !nonMerchantPrefix.has(normalized(token)));
  return candidate?.slice(0, 80) ?? null;
}

/** Only widen an unsuccessful manual search when its words refer to the selected bank description. */
export function fallbackAnchorForBankQuery(bankText: string, query: string): string | null {
  const anchor = visualMerchantAnchor(bankText);
  if (!anchor || normalized(anchor).length < 3) return null;
  const bankWords = normalized(bankText).split(' ');
  const queryWords = normalized(query).split(' ');
  if (queryWords.length === 0 || queryWords.some(word => word.length < 3)) return null;
  const belongsToBank = queryWords.some(word => bankWords.some(bankWord =>
    word === bankWord || (word.length >= 6 && bankWord.length >= 6 && word.slice(0, 6) === bankWord.slice(0, 6))));
  return belongsToBank && normalized(query) !== normalized(anchor) ? anchor : null;
}

const daysApart = (a: string, b: string | null): number | null => {
  if (!b) return null;
  const x = Date.parse(a); const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) / 86400000 : null;
};

const exactAbsoluteAmount = (bankAmount: string, documentAmount: string | null): boolean => {
  if (documentAmount === null || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(bankAmount) || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(documentAmount)) return false;
  // Compare absolute minor-unit digits as strings; never round amounts or
  // depend on BigInt/ES2020 target settings in the host project.
  const minorUnits = (value: string) => {
    const match = /^[+-]?(\d+)(?:\.(\d+))?$/.exec(value)!;
    return ((match[1] || '0') + (match[2] ?? '').padEnd(2, '0')).replace(/^0+(?=\d)/, '');
  };
  return minorUnits(bankAmount) === minorUnits(documentAmount);
};

export type SuggestedVisualDocument = {
  item: VisualDocumentHit;
  sameAmount: boolean;
  closeDate: boolean;
};

export function rankVisualDocumentsForBank(
  bank: { text: string; amount: string; date: string }, documents: readonly VisualDocumentHit[],
): SuggestedVisualDocument[] {
  const anchor = normalized(visualMerchantAnchor(bank.text) ?? '');
  const bankWords = new Set(normalized(bank.text).split(' ').filter(word => word.length >= 3));
  return documents.map(item => {
    const sameAmount = exactAbsoluteAmount(bank.amount, item.amount);
    const distance = daysApart(bank.date, item.date);
    const closeDate = distance !== null && distance <= 7;
    const docWords = normalized(item.title).split(' ');
    const sharedWords = docWords.filter(word => word.length >= 3 && bankWords.has(word)).length;
    const vendor = anchor.length >= 3 && docWords.includes(anchor);
    const score = (sameAmount ? 80 : 0) + (vendor ? 30 : 0) +
      Math.min(sharedWords, 3) * 5 + (distance === null ? 0 : distance < 1 ? 26 : distance <= 3 ? 16 : distance <= 7 ? 9 : 0);
    return { item, sameAmount, closeDate, score, distance };
  }).sort((a, b) => b.score - a.score || (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
    (b.item.date ?? '').localeCompare(a.item.date ?? '') || b.item.receiptId - a.item.receiptId)
    .map(({ item, sameAmount, closeDate }) => ({ item, sameAmount, closeDate }));
}
