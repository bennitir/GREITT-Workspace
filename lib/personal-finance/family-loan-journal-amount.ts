/**
 * Convert the canonical positive BIGINT::text representation returned by
 * FamilyLoanLedgerMovement.amountIsk into an exact JavaScript integer.
 *
 * This deliberately rejects Number() conveniences such as exponent notation,
 * hex, whitespace and decimal suffixes. Invalid historical rows must never
 * be silently transformed into believable loan balances.
 */
export function parseStoredFamilyLoanAmountIsk(value: string): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw Error('FAMILY_JOURNAL_AMOUNT_INVALID');
  }
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw Error('FAMILY_JOURNAL_AMOUNT_INVALID');
  }
  return amount;
}

/**
 * Parse user-entered ISK for a local journal, without silently removing
 * malformed separators. Plain digits and properly grouped Icelandic
 * thousands separators are accepted; decimal fractions are not.
 */
export function parseEnteredFamilyLoanAmountIsk(input: string): number | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  const validWholeIsk = /^(?:[1-9][0-9]*|[1-9][0-9]{0,2}(?:\.[0-9]{3})+|[1-9][0-9]{0,2}(?:[ \u00a0\u202f][0-9]{3})+)$/;
  if (!validWholeIsk.test(value)) return null;
  const amount = Number(value.replace(/[. \u00a0\u202f]/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
