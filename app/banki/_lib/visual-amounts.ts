/** Exact, presentation-only comparison of ISK document totals.
 * No rounding and no database writes. Unknown/unsupported amounts fail closed.
 * Sign of source documents is preserved for credit notes; bank magnitude is used
 * because bank debits and purchase invoices often have opposite signs.
 */
const SCALE = BigInt(1_000_000);

export function parseExactVisualAmount(value: string | null): bigint | null {
  if (value === null) return null;
  const match = /^([+-]?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) return null;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? '').padEnd(6, '0'));
  return (match[1] === '-' ? BigInt(-1) : BigInt(1)) * (whole * SCALE + fraction);
}

export function renderExactVisualAmount(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const integer = (absolute / SCALE).toString();
  const fraction = (absolute % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

/** A draft comparison of manually selected documents, never a confirmed match. */
export function compareSelectedVisualDocuments(bankAmount: string, amounts: readonly (string | null)[]):
  { total: string; remaining: string } | null {
  if (!amounts.length) return null;
  const rawBank = parseExactVisualAmount(bankAmount);
  if (rawBank === null) return null;
  let total = BigInt(0);
  for (const amount of amounts) {
    const parsed = parseExactVisualAmount(amount);
    if (parsed === null) return null;
    total += parsed;
  }
  const absoluteBank = rawBank < BigInt(0) ? -rawBank : rawBank;
  return { total: renderExactVisualAmount(total), remaining: renderExactVisualAmount(absoluteBank - total) };
}
