/** Read-only candidate evidence. A matching amount and date is never proof of ownership or transfer. */
export type InternalTransferReviewResult =
  | { ok: false; code: 'UNAVAILABLE' | 'NOT_AUTHORIZED' | 'NOT_FOUND' | 'INVALID_AMOUNT' }
  | { ok: true; originId: number; oppositeAmount: string; matches: InternalTransferCandidate[]; truncated: boolean };

export type InternalTransferCandidate = {
  transactionId: number;
  bankAccountId: number;
  bankAccountName: string;
  bankAccountNumber: string | null;
  date: string;
  amount: string;
  text: string;
  status: string;
};

function minorUnits(value: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return match[1] === '-' ? -minor : minor;
}

function minorToDecimal(value: bigint): string {
  const negative = value < BigInt(0);
  const positive = negative ? -value : value;
  const whole = positive / BigInt(100);
  const pennies = positive % BigInt(100);
  return `${negative ? '-' : ''}${whole.toString()}${pennies === BigInt(0) ? '' : '.' + pennies.toString().padStart(2, '0')}`;
}

/** No floating point rounding. Null when the input cannot be proven exact. */
export function oppositeBankAmount(amount: string): string | null {
  const minor = minorUnits(amount);
  return minor === null || minor === BigInt(0) ? null : minorToDecimal(-minor);
}

/** Inclusive UTC calendar-day window for a possible inter-bank transfer. */
export function possibleTransferWindow(date: Date, days = 3): { from: Date; toExclusive: Date } | null {
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(days) || days < 0 || days > 7) return null;
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { from: new Date(day - days * 86400000), toExclusive: new Date(day + (days + 1) * 86400000) };
}

/** This is a *candidate* check only, never an automatic classification or confirmation. */
export function isPossibleInternalTransfer(source: { bankAccountId: number; date: Date; amount: string },
  target: { bankAccountId: number; date: Date; amount: string }): boolean {
  if (source.bankAccountId === target.bankAccountId) return false;
  const opposite = oppositeBankAmount(source.amount);
  const targetMinor = minorUnits(target.amount);
  const window = possibleTransferWindow(source.date);
  return Boolean(opposite && window && targetMinor !== null && minorUnits(opposite) === targetMinor &&
    target.date >= window.from && target.date < window.toExclusive);
}
