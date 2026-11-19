/** Format a bank ISO calendar date without moving it across time zones. */
export function formatCounterBankDate(raw: string, language: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(raw);
  if (!match) return raw;
  const [, year, month, day] = match;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (utc.getUTCFullYear() !== Number(year) || utc.getUTCMonth() + 1 !== Number(month) || utc.getUTCDate() !== Number(day)) return raw;
  return language === 'en' ? `${day}/${month}/${year}` : `${day}.${month}.${year}`;
}
