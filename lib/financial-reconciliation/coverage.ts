/**
 * Dataset-level reconciliation coverage.
 *
 * This module deliberately knows nothing about Prisma, bank accounts, cards,
 * receipts or AI. Flow-specific adapters decide which rows are in scope and
 * which state each authoritative row currently has. The shared layer then
 * answers the cheap first question: "is the dataset complete enough to
 * reconcile?"
 */

export const RECONCILIATION_COVERAGE_VERSION = "financial-reconciliation-coverage-v1" as const;

export const RECONCILIATION_COVERAGE_MODES = [
  "REQUIRED",
  "INFORMATIONAL",
  "EXCLUDED",
] as const;
export type ReconciliationCoverageMode =
  (typeof RECONCILIATION_COVERAGE_MODES)[number];

export const RECONCILIATION_CARDINALITIES = [
  "ONE_TO_ONE",
  "ONE_TO_MANY",
  "MANY_TO_ONE",
  "MANY_TO_MANY",
] as const;
export type ReconciliationCardinality =
  (typeof RECONCILIATION_CARDINALITIES)[number];

export const RECONCILIATION_COVERAGE_ITEM_STATES = [
  "CONFIRMED",
  "STRONG_UNCONFIRMED",
  "AMBIGUOUS",
  "UNRESOLVED",
  "EXCLUDED",
  "UNKNOWN",
] as const;
export type ReconciliationCoverageItemState =
  (typeof RECONCILIATION_COVERAGE_ITEM_STATES)[number];

export type ReconciliationCoverageItem = {
  /** Stable canonical key inside the flow-specific source. */
  key: string;
  /** Signed or unsigned input is accepted; coverage always sums absolute value. */
  amount?: string | number | null;
  /** ISO currency when known. Unknown currency remains a separate bucket. */
  currency?: string | null;
  state: ReconciliationCoverageItemState;
};

export type ReconciliationCoverageBucket = {
  count: number;
  absoluteAmountByCurrency: Record<string, string>;
  amountCompleteness: "COMPLETE" | "PARTIAL";
  unknownAmountCount: number;
};

export type ReconciliationCoverageSide = {
  total: ReconciliationCoverageBucket;
  inScope: ReconciliationCoverageBucket;
  confirmed: ReconciliationCoverageBucket;
  strongUnconfirmed: ReconciliationCoverageBucket;
  ambiguous: ReconciliationCoverageBucket;
  unresolved: ReconciliationCoverageBucket;
  excluded: ReconciliationCoverageBucket;
  unknown: ReconciliationCoverageBucket;
};

export type ReconciliationCoverageCountComparison = {
  comparability: "EXPECTED_EQUAL" | "INFORMATIONAL" | "NOT_APPLICABLE";
  sourceInScopeCount: number;
  targetInScopeCount: number;
  targetMinusSource: number;
  targetPerSourcePercent: number | null;
  state:
    | "BALANCED"
    | "SOURCE_EXCESS"
    | "TARGET_EXCESS"
    | "NOT_COMPARABLE";
};

export type ReconciliationCoverageAmountComparison = {
  sourceAbsoluteAmount: string;
  targetAbsoluteAmount: string;
  targetMinusSource: string;
  targetPerSourcePercent: number | null;
  completeness: "COMPLETE" | "PARTIAL";
};

export type ReconciliationCoverageSnapshot = {
  version: typeof RECONCILIATION_COVERAGE_VERSION;
  mode: ReconciliationCoverageMode;
  cardinality: ReconciliationCardinality;
  source: ReconciliationCoverageSide;
  target: ReconciliationCoverageSide;
  comparison: {
    count: ReconciliationCoverageCountComparison;
    amountByCurrency: Record<string, ReconciliationCoverageAmountComparison>;
  };
  openWork: {
    sourceCount: number;
    targetCount: number;
    sourceUnresolvedCount: number;
    targetUnresolvedCount: number;
    sourceAmbiguousCount: number;
    targetAmbiguousCount: number;
  };
  assessment:
    | "EXCLUDED"
    | "NOT_EVALUATED"
    | "INFORMATIONAL"
    | "COMPLETE"
    | "OPEN";
};

const UNKNOWN_CURRENCY = "UNSPECIFIED";
const IN_SCOPE_STATES = new Set<ReconciliationCoverageItemState>([
  "CONFIRMED",
  "STRONG_UNCONFIRMED",
  "AMBIGUOUS",
  "UNRESOLVED",
]);

type ParsedDecimal = { units: bigint; scale: number };

function parseDecimal(value: string | number): ParsedDecimal | null {
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!/^[+-]?(?:\d+)(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  let units = BigInt(digits);
  if (negative) units = -units;
  return { units, scale: fraction.length };
}

function pow10(power: number) {
  return BigInt(10) ** BigInt(power);
}

function align(value: ParsedDecimal, scale: number) {
  return value.units * pow10(scale - value.scale);
}

function decimalString(units: bigint, scale: number) {
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  if (scale === 0) return `${negative ? "-" : ""}${absolute}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function addDecimals(values: readonly string[]) {
  const parsed = values.map(parseDecimal).filter((value): value is ParsedDecimal => value !== null);
  if (!parsed.length) return "0";
  const scale = Math.max(...parsed.map((value) => value.scale));
  const units = parsed.reduce((sum, value) => sum + align(value, scale), BigInt(0));
  return decimalString(units, scale);
}

function subtractDecimals(left: string, right: string) {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) return "0";
  const scale = Math.max(a.scale, b.scale);
  return decimalString(align(a, scale) - align(b, scale), scale);
}

function absoluteDecimal(value: string | number) {
  const parsed = parseDecimal(value);
  if (!parsed) return null;
  const units = parsed.units < BigInt(0) ? -parsed.units : parsed.units;
  return decimalString(units, parsed.scale);
}

function percent(numerator: string | number, denominator: string | number) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function bucket(items: readonly ReconciliationCoverageItem[]): ReconciliationCoverageBucket {
  const amounts = new Map<string, string[]>();
  let unknownAmountCount = 0;

  for (const item of items) {
    if (item.amount === null || item.amount === undefined) {
      unknownAmountCount += 1;
      continue;
    }
    const absolute = absoluteDecimal(item.amount);
    if (absolute === null) {
      unknownAmountCount += 1;
      continue;
    }
    const currency = String(item.currency ?? "").trim().toUpperCase() || UNKNOWN_CURRENCY;
    const values = amounts.get(currency) ?? [];
    values.push(absolute);
    amounts.set(currency, values);
  }

  return {
    count: items.length,
    absoluteAmountByCurrency: Object.fromEntries(
      [...amounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, values]) => [currency, addDecimals(values)]),
    ),
    amountCompleteness: unknownAmountCount === 0 ? "COMPLETE" : "PARTIAL",
    unknownAmountCount,
  };
}

function side(items: readonly ReconciliationCoverageItem[]): ReconciliationCoverageSide {
  const byState = (state: ReconciliationCoverageItemState) =>
    items.filter((item) => item.state === state);
  const inScope = items.filter((item) => IN_SCOPE_STATES.has(item.state));

  return {
    total: bucket(items),
    inScope: bucket(inScope),
    confirmed: bucket(byState("CONFIRMED")),
    strongUnconfirmed: bucket(byState("STRONG_UNCONFIRMED")),
    ambiguous: bucket(byState("AMBIGUOUS")),
    unresolved: bucket(byState("UNRESOLVED")),
    excluded: bucket(byState("EXCLUDED")),
    unknown: bucket(byState("UNKNOWN")),
  };
}

function amountComparison(
  source: ReconciliationCoverageBucket,
  target: ReconciliationCoverageBucket,
) {
  const currencies = [...new Set([
    ...Object.keys(source.absoluteAmountByCurrency),
    ...Object.keys(target.absoluteAmountByCurrency),
  ])].sort();

  return Object.fromEntries(currencies.map((currency) => {
    const sourceAmount = source.absoluteAmountByCurrency[currency] ?? "0";
    const targetAmount = target.absoluteAmountByCurrency[currency] ?? "0";
    return [currency, {
      sourceAbsoluteAmount: sourceAmount,
      targetAbsoluteAmount: targetAmount,
      targetMinusSource: subtractDecimals(targetAmount, sourceAmount),
      targetPerSourcePercent: percent(targetAmount, sourceAmount),
      completeness:
        source.amountCompleteness === "COMPLETE" && target.amountCompleteness === "COMPLETE"
          ? "COMPLETE" as const
          : "PARTIAL" as const,
    }];
  }));
}

function countComparison(
  mode: ReconciliationCoverageMode,
  cardinality: ReconciliationCardinality,
  sourceCount: number,
  targetCount: number,
): ReconciliationCoverageCountComparison {
  const direct = cardinality === "ONE_TO_ONE";
  const comparability = direct
    ? mode === "REQUIRED" ? "EXPECTED_EQUAL" as const : "INFORMATIONAL" as const
    : "NOT_APPLICABLE" as const;
  const difference = targetCount - sourceCount;
  const state = !direct
    ? "NOT_COMPARABLE" as const
    : difference === 0
      ? "BALANCED" as const
      : difference < 0
        ? "SOURCE_EXCESS" as const
        : "TARGET_EXCESS" as const;

  return {
    comparability,
    sourceInScopeCount: sourceCount,
    targetInScopeCount: targetCount,
    targetMinusSource: difference,
    targetPerSourcePercent: direct && sourceCount > 0
      ? Math.round((targetCount / sourceCount) * 1000) / 10
      : null,
    state,
  };
}

/**
 * Build a deterministic dataset-level reconciliation snapshot.
 *
 * Important: this function never decides whether a row is business/private,
 * whether a receipt is legally required, or whether a flow is 1:1. Those are
 * explicit flow/account/card context supplied by the caller. That prevents a
 * mixed-use personal card from being turned into a false "missing documents"
 * alarm.
 */
export function buildReconciliationCoverageSnapshot(input: {
  mode: ReconciliationCoverageMode;
  cardinality: ReconciliationCardinality;
  source: readonly ReconciliationCoverageItem[];
  target: readonly ReconciliationCoverageItem[];
}): ReconciliationCoverageSnapshot {
  const source = side(input.source);
  const target = side(input.target);
  const count = countComparison(
    input.mode,
    input.cardinality,
    source.inScope.count,
    target.inScope.count,
  );

  const sourceOpen = source.strongUnconfirmed.count + source.ambiguous.count + source.unresolved.count;
  const targetOpen = target.strongUnconfirmed.count + target.ambiguous.count + target.unresolved.count;
  const notEvaluated = source.unknown.count > 0 || target.unknown.count > 0;
  const complete = !notEvaluated && sourceOpen === 0 && targetOpen === 0 &&
    (input.cardinality !== "ONE_TO_ONE" || count.state === "BALANCED");

  const assessment: ReconciliationCoverageSnapshot["assessment"] =
    input.mode === "EXCLUDED" ? "EXCLUDED" :
      notEvaluated ? "NOT_EVALUATED" :
        input.mode === "INFORMATIONAL" ? "INFORMATIONAL" :
          complete ? "COMPLETE" : "OPEN";

  return {
    version: RECONCILIATION_COVERAGE_VERSION,
    mode: input.mode,
    cardinality: input.cardinality,
    source,
    target,
    comparison: {
      count,
      amountByCurrency: amountComparison(source.inScope, target.inScope),
    },
    openWork: {
      sourceCount: sourceOpen,
      targetCount: targetOpen,
      sourceUnresolvedCount: source.unresolved.count,
      targetUnresolvedCount: target.unresolved.count,
      sourceAmbiguousCount: source.ambiguous.count,
      targetAmbiguousCount: target.ambiguous.count,
    },
    assessment,
  };
}
