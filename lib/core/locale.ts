export const DEFAULT_LOCALE = "is-IS";

export function formatDate(
  value: Date,
  locale: string = DEFAULT_LOCALE
) {
  return new Intl.DateTimeFormat(locale).format(value);
}

export function formatNumber(
  value: number,
  locale: string = DEFAULT_LOCALE
) {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCurrency(
  value: number,
  currency = "ISK",
  locale: string = DEFAULT_LOCALE
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}