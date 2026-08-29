export const DEFAULT_LOCALE = "is-IS";
export const DEFAULT_CURRENCY = "ISK";

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
) {
  return value.toLocaleString(DEFAULT_LOCALE, options);
}

export function formatCurrency(
  value: number,
  options?: Intl.NumberFormatOptions
) {
  return value.toLocaleString(DEFAULT_LOCALE, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
    ...options,
  });
}

export function formatDate(
  value: Date | string | null | undefined
) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleDateString(DEFAULT_LOCALE);
}