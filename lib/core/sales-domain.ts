export const SALE_STATUSES = [
  "DRAFT",
  "HELD",
  "FINALIZED",
  "CANCELLED",
  "RETURNED",
] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const SALE_STATUS_TRANSITIONS: Record<SaleStatus, readonly SaleStatus[]> = {
  DRAFT: ["HELD", "FINALIZED", "CANCELLED"],
  HELD: ["DRAFT", "FINALIZED", "CANCELLED"],
  FINALIZED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["AUTHORIZED", "CONFIRMED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["CONFIRMED", "FAILED", "CANCELLED"],
  CONFIRMED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionSaleStatus(from: SaleStatus, to: SaleStatus): boolean {
  return from === to || SALE_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return from === to || PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertSaleStatusTransition(from: SaleStatus, to: SaleStatus): void {
  if (!canTransitionSaleStatus(from, to)) {
    throw new Error("SALE_STATUS_TRANSITION_NOT_ALLOWED");
  }
}

export function assertPaymentStatusTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new Error("PAYMENT_STATUS_TRANSITION_NOT_ALLOWED");
  }
}

export type ExactDecimalInput = string | { toString(): string };

type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

function pow10(exponent: number): bigint {
  return BigInt(10) ** BigInt(exponent);
}

function parseDecimal(value: ExactDecimalInput): ParsedDecimal {
  const raw = typeof value === "string" ? value : value.toString();
  const normalized = raw.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);

  if (!match) {
    throw new Error("INVALID_DECIMAL_VALUE");
  }

  const sign = match[1] === "-" ? -BigInt(1) : BigInt(1);
  const integerPart = match[2];
  let fractionalPart = match[3] ?? "";

  fractionalPart = fractionalPart.replace(/0+$/, "");
  const scale = fractionalPart.length;
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";
  const coefficient = sign * BigInt(digits);

  return coefficient === BigInt(0) ? { coefficient: BigInt(0), scale: 0 } : { coefficient, scale };
}

function alignDecimal(value: ParsedDecimal, scale: number): bigint {
  return value.coefficient * pow10(scale - value.scale);
}

function formatDecimal(value: ParsedDecimal): string {
  if (value.coefficient === BigInt(0)) return "0";

  const negative = value.coefficient < BigInt(0);
  const digits = (negative ? -value.coefficient : value.coefficient).toString();

  if (value.scale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }

  const padded = digits.padStart(value.scale + 1, "0");
  const integerPart = padded.slice(0, -value.scale);
  const fractionalPart = padded.slice(-value.scale).replace(/0+$/, "");

  return `${negative ? "-" : ""}${integerPart}${fractionalPart ? `.${fractionalPart}` : ""}`;
}

function normalizeDecimal(value: ParsedDecimal): ParsedDecimal {
  if (value.coefficient === BigInt(0)) return { coefficient: BigInt(0), scale: 0 };

  let coefficient = value.coefficient;
  let scale = value.scale;

  while (scale > 0 && coefficient % BigInt(10) === BigInt(0)) {
    coefficient /= BigInt(10);
    scale -= 1;
  }

  return { coefficient, scale };
}

export function decimalAdd(
  left: ExactDecimalInput,
  right: ExactDecimalInput,
): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);

  return formatDecimal(
    normalizeDecimal({
      coefficient: alignDecimal(a, scale) + alignDecimal(b, scale),
      scale,
    }),
  );
}

export function decimalSubtract(
  left: ExactDecimalInput,
  right: ExactDecimalInput,
): string {
  const b = parseDecimal(right);
  return decimalAdd(left, formatDecimal({ coefficient: -b.coefficient, scale: b.scale }));
}

export function decimalMultiply(
  left: ExactDecimalInput,
  right: ExactDecimalInput,
): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);

  return formatDecimal(
    normalizeDecimal({
      coefficient: a.coefficient * b.coefficient,
      scale: a.scale + b.scale,
    }),
  );
}

export function decimalPercent(
  amount: ExactDecimalInput,
  rate: ExactDecimalInput,
): string {
  const product = parseDecimal(decimalMultiply(amount, rate));

  return formatDecimal(
    normalizeDecimal({
      coefficient: product.coefficient,
      scale: product.scale + 2,
    }),
  );
}

export function decimalCompare(
  left: ExactDecimalInput,
  right: ExactDecimalInput,
): -1 | 0 | 1 {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const leftValue = alignDecimal(a, scale);
  const rightValue = alignDecimal(b, scale);

  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

export type SaleLineAmounts = {
  quantity: ExactDecimalInput;
  unitPrice: ExactDecimalInput;
  subtotalAmount: ExactDecimalInput;
  discountAmount: ExactDecimalInput;
  netAmount: ExactDecimalInput;
  vatRate: ExactDecimalInput;
  vatAmount: ExactDecimalInput;
  totalAmount: ExactDecimalInput;
};

export type SaleLinePriceInput = Pick<
  SaleLineAmounts,
  "quantity" | "unitPrice" | "discountAmount" | "vatRate"
>;

// Reiknar nákvæm Decimal-gildi. Gjaldmiðils-/kvittunarrúnnun verður sér regla síðar.
export function calculateSaleLineAmounts(input: SaleLinePriceInput): SaleLineAmounts {
  const subtotalAmount = decimalMultiply(input.quantity, input.unitPrice);
  const netAmount = decimalSubtract(subtotalAmount, input.discountAmount);
  const vatAmount = decimalPercent(netAmount, input.vatRate);
  const totalAmount = decimalAdd(netAmount, vatAmount);

  return {
    ...input,
    subtotalAmount,
    netAmount,
    vatAmount,
    totalAmount,
  };
}

export type SaleLineAmountError =
  | "LINE_QUANTITY_MUST_BE_POSITIVE"
  | "LINE_UNIT_PRICE_MUST_NOT_BE_NEGATIVE"
  | "LINE_SUBTOTAL_MUST_NOT_BE_NEGATIVE"
  | "LINE_DISCOUNT_MUST_NOT_BE_NEGATIVE"
  | "LINE_DISCOUNT_EXCEEDS_SUBTOTAL"
  | "LINE_NET_MUST_NOT_BE_NEGATIVE"
  | "LINE_VAT_RATE_MUST_NOT_BE_NEGATIVE"
  | "LINE_VAT_MUST_NOT_BE_NEGATIVE"
  | "LINE_TOTAL_MUST_NOT_BE_NEGATIVE"
  | "LINE_SUBTOTAL_MISMATCH"
  | "LINE_NET_MISMATCH"
  | "LINE_TOTAL_MISMATCH";

export function validateSaleLineAmounts(
  line: SaleLineAmounts,
): SaleLineAmountError[] {
  const errors: SaleLineAmountError[] = [];

  if (decimalCompare(line.quantity, "0") <= 0) {
    errors.push("LINE_QUANTITY_MUST_BE_POSITIVE");
  }
  if (decimalCompare(line.unitPrice, "0") < 0) {
    errors.push("LINE_UNIT_PRICE_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.subtotalAmount, "0") < 0) {
    errors.push("LINE_SUBTOTAL_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.discountAmount, "0") < 0) {
    errors.push("LINE_DISCOUNT_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.discountAmount, line.subtotalAmount) > 0) {
    errors.push("LINE_DISCOUNT_EXCEEDS_SUBTOTAL");
  }
  if (decimalCompare(line.netAmount, "0") < 0) {
    errors.push("LINE_NET_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.vatRate, "0") < 0) {
    errors.push("LINE_VAT_RATE_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.vatAmount, "0") < 0) {
    errors.push("LINE_VAT_MUST_NOT_BE_NEGATIVE");
  }
  if (decimalCompare(line.totalAmount, "0") < 0) {
    errors.push("LINE_TOTAL_MUST_NOT_BE_NEGATIVE");
  }

  const expectedSubtotal = decimalMultiply(line.quantity, line.unitPrice);
  if (decimalCompare(line.subtotalAmount, expectedSubtotal) !== 0) {
    errors.push("LINE_SUBTOTAL_MISMATCH");
  }

  const expectedNet = decimalSubtract(line.subtotalAmount, line.discountAmount);
  if (decimalCompare(line.netAmount, expectedNet) !== 0) {
    errors.push("LINE_NET_MISMATCH");
  }

  const expectedTotal = decimalAdd(line.netAmount, line.vatAmount);
  if (decimalCompare(line.totalAmount, expectedTotal) !== 0) {
    errors.push("LINE_TOTAL_MISMATCH");
  }

  return errors;
}

export type SaleTotals = {
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
};

export function calculateSaleTotals(
  lines: readonly Pick<
    SaleLineAmounts,
    "subtotalAmount" | "discountAmount" | "netAmount" | "vatAmount" | "totalAmount"
  >[],
): SaleTotals {
  return lines.reduce<SaleTotals>(
    (totals, line) => ({
      subtotalAmount: decimalAdd(totals.subtotalAmount, line.subtotalAmount),
      discountAmount: decimalAdd(totals.discountAmount, line.discountAmount),
      netAmount: decimalAdd(totals.netAmount, line.netAmount),
      vatAmount: decimalAdd(totals.vatAmount, line.vatAmount),
      totalAmount: decimalAdd(totals.totalAmount, line.totalAmount),
    }),
    {
      subtotalAmount: "0",
      discountAmount: "0",
      netAmount: "0",
      vatAmount: "0",
      totalAmount: "0",
    },
  );
}

export function isPositivePaymentAmount(amount: ExactDecimalInput): boolean {
  return decimalCompare(amount, "0") > 0;
}
