import { formatNumber as formatLocaleNumber } from "@/lib/locale";

/**
 * Shared Bank display formatting.
 * Keep identifiers (account numbers, kennitala, years, references) out of these helpers.
 */
export function formatNumber(value: number): string {
  return formatLocaleNumber(value);
}

export function formatIsk(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${formatLocaleNumber(Math.abs(rounded))} kr.`;
}
