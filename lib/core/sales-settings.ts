export const SALES_TERMINAL_TYPES = ["POS", "MOBILE", "WEB", "OTHER"] as const;

export type SalesTerminalType = (typeof SALES_TERMINAL_TYPES)[number];

const SALES_TERMINAL_TYPE_SET = new Set<string>(SALES_TERMINAL_TYPES);

export function normalizeSalesTerminalCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 64) {
    throw new Error("INVALID_SALES_TERMINAL_CODE");
  }
  return normalized;
}

export function normalizeSalesTerminalName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("INVALID_SALES_TERMINAL_NAME");
  }
  return normalized;
}

export function parseSalesTerminalType(value: string): SalesTerminalType {
  if (!SALES_TERMINAL_TYPE_SET.has(value)) {
    throw new Error("INVALID_SALES_TERMINAL_TYPE");
  }
  return value as SalesTerminalType;
}
