/** Parsing and arithmetic for local, read-only family loan payment drafts.
 * No floating currency, no balance calculation from installment history.
 */
export function parseIskAmount(input: string, emptyIsZero = false): number {
  const value = input.trim();
  if (!value && emptyIsZero) return 0;
  // Validate grouping BEFORE removing separators. Otherwise "1 2" becomes 12 kr.
  // Preserve plain digits (including zero) and properly grouped thousands.
  const groupedIsk = /^(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/;
  if (!groupedIsk.test(value)) throw Error('Sláðu inn heilar krónur án aukastafa.');
  const number = Number(value.replace(/[. \u00a0\u202f]/g, ''));
  if (!Number.isSafeInteger(number) || number < 0) throw Error('Upphæð er ekki gild.');
  return number;
}
export function parseBankDebitIsk(raw: string): number {
  if (!/^-\d+(?:\.0+)?$/.test(raw.trim())) throw Error('Aðeins útgreiðslur í heilum krónum eiga heima í þessari lánayfirferð.');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value >= 0) throw Error('Veldu útgreiðslu til lánveitanda.');
  return -value;
}
export function unallocatedIsk(total: number, components: readonly number[], message: string): number {
  if (!Number.isSafeInteger(total) || total <= 0 || components.some(n => !Number.isSafeInteger(n) || n < 0))
    throw Error('Ógildar fjárhæðir í skiptingu.');
  const allocated = components.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(allocated) || allocated > total) throw Error(message);
  return total - allocated;
}

/** Live progress for an unconfirmed bank payment draft.
 * Never converts user-entered amounts into verified loan or family facts.
 */
export function previewFamilyLoanAllocation(total: number, components: readonly string[], overLimitMessage: string): {
  allocatedIsk: number | null;
  remainingIsk: number | null;
  error: string | null;
} {
  try {
    const values = components.map(value => parseIskAmount(value, true));
    const remaining = unallocatedIsk(total, values, overLimitMessage);
    return { allocatedIsk: total - remaining, remainingIsk: remaining, error: null };
  } catch (error) {
    return {
      allocatedIsk: null,
      remainingIsk: null,
      error: error instanceof Error ? error.message : 'Ógild sundurliðun.',
    };
  }
}
