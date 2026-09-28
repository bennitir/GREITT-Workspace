import type { InsightPeriod } from "./presentation-model";

export type InsightUnitPriceSource = "EXPLICIT_UNIT_PRICE" | "DERIVED_LINE_TOTAL";
export type InsightUnitPriceCategory = "FUEL" | "OTHER";
export type InsightUnitPriceFlow = "SALE" | "PURCHASE" | "UNKNOWN";

export type InsightUnitPriceObservation = {
  id: string;
  productKey: string;
  label: string;
  category: InsightUnitPriceCategory;
  flow: InsightUnitPriceFlow;
  unit: string;
  date: Date;
  unitPrice: number;
  quantity: number;
  lineTotal: number | null;
  merchantName: string;
  receiptId: number | null;
  documentId: number;
  voucherNumber: number | null;
  source: InsightUnitPriceSource;
  extractionConfidence: number | null;
  extractionMethod: string | null;
};

export type InsightUnitPriceSeries = {
  id: string;
  label: string;
  category: InsightUnitPriceCategory;
  flow: InsightUnitPriceFlow;
  unit: string;
  observationCount: number;
  distinctDateCount: number;
  firstPrice: number;
  latestPrice: number;
  previousPrice: number | null;
  averagePrice: number;
  totalQuantity: number;
  totalCost: number;
  minPrice: number;
  maxPrice: number;
  changeFromPrevious: number | null;
  changeFromPreviousPercent: number | null;
  firstObservedAt: Date;
  latestObservedAt: Date;
  merchants: string[];
  observations: InsightUnitPriceObservation[];
  points: Array<{
    id: string;
    date: Date;
    unitPrice: number;
    merchantName: string;
    receiptId: number | null;
    documentId: number;
    voucherNumber: number | null;
    source: InsightUnitPriceSource;
    observationCount: number;
  }>;
  months: Array<{
    periodKey: string;
    quantity: number;
    totalCost: number;
    averagePrice: number;
    observationCount: number;
    distinctDateCount: number;
  }>;
  monthChanges: Array<{
    fromPeriodKey: string;
    toPeriodKey: string;
    costChange: number;
    quantityChange: number;
    averagePriceChange: number;
    quantityEffect: number;
    priceEffect: number;
  }>;
};

export type InsightUnitPriceSummary = {
  observationCount: number;
  seriesCount: number;
  repeatSeriesCount: number;
  series: InsightUnitPriceSeries[];
};

type UnitPriceDocument = {
  id: number;
  receiptId: number | null;
  voucherNumber: number | null;
  date: Date | null;
  merchantName: string | null;
  flow: InsightUnitPriceFlow;
  extractionMetadata: unknown;
};

type UnitDefinition = {
  canonical: string;
  factor: number;
};

type CanonicalProduct = {
  key: string;
  label: string;
  category: InsightUnitPriceCategory;
};

const UNIT_DEFINITIONS: Record<string, UnitDefinition> = {
  l: { canonical: "l", factor: 1 },
  lt: { canonical: "l", factor: 1 },
  ltr: { canonical: "l", factor: 1 },
  liter: { canonical: "l", factor: 1 },
  litre: { canonical: "l", factor: 1 },
  litri: { canonical: "l", factor: 1 },
  litrar: { canonical: "l", factor: 1 },
  ml: { canonical: "l", factor: 0.001 },
  cl: { canonical: "l", factor: 0.01 },
  dl: { canonical: "l", factor: 0.1 },

  kg: { canonical: "kg", factor: 1 },
  g: { canonical: "kg", factor: 0.001 },
  mg: { canonical: "kg", factor: 0.000001 },
  tonn: { canonical: "kg", factor: 1000 },
  t: { canonical: "kg", factor: 1000 },

  stk: { canonical: "stk.", factor: 1 },
  st: { canonical: "stk.", factor: 1 },
  pcs: { canonical: "stk.", factor: 1 },
  pc: { canonical: "stk.", factor: 1 },
  ea: { canonical: "stk.", factor: 1 },
  each: { canonical: "stk.", factor: 1 },

  m: { canonical: "m", factor: 1 },
  cm: { canonical: "m", factor: 0.01 },
  mm: { canonical: "m", factor: 0.001 },
  m2: { canonical: "m²", factor: 1 },
  m3: { canonical: "m³", factor: 1 },

  kwh: { canonical: "kWh", factor: 1 },
  wh: { canonical: "kWh", factor: 0.001 },

  klst: { canonical: "klst.", factor: 1 },
  h: { canonical: "klst.", factor: 1 },
  hr: { canonical: "klst.", factor: 1 },
  hour: { canonical: "klst.", factor: 1 },
  min: { canonical: "klst.", factor: 1 / 60 },

  km: { canonical: "km", factor: 1 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUnit(value: unknown): UnitDefinition | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLocaleLowerCase("is-IS")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[^a-z0-9]+/g, "");
  return UNIT_DEFINITIONS[key] ?? null;
}

function normalizeProductKey(value: string) {
  return value
    .toLocaleLowerCase("is-IS")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function looksLikeFuelDescription(description: string) {
  const normalized = normalizeProductKey(description);
  return /\b(?:(?:diesel|disel|dizel)(?:olia|oliu|oliar)?|bensin|petrol|gasoline|eldsneyti|fuel)\b/.test(
    normalized,
  );
}

/**
 * Backward-compatible deterministic recovery for older POS extraction.
 *
 * An earlier parser discarded decimal quantity (for example 26,06 litres) and
 * did not persist the implicit litre unit on otherwise clear fuel rows. We may
 * reconstruct that measurement only when:
 * - the line description unambiguously says fuel;
 * - an explicit unit price exists;
 * - a printed line total exists; and
 * - price × quantity (stored or reconstructed to 2 decimals) matches the line
 *   total inside a small rounding tolerance.
 *
 * This makes old data usable without AI and without inventing a price.
 */
function recoverLegacyFuelMeasurement(line: {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}) {
  if (!looksLikeFuelDescription(line.description)) return null;
  if (line.unitPrice === null || !(line.unitPrice > 0)) return null;
  if (line.lineTotal === null || !(line.lineTotal > 0)) return null;

  let quantity = line.quantity;
  if (quantity === null || !(quantity > 0)) {
    const rawQuantity = line.lineTotal / line.unitPrice;
    const roundedQuantity = Math.round(rawQuantity * 100) / 100;
    if (!Number.isFinite(roundedQuantity) || !(roundedQuantity > 0)) return null;
    quantity = roundedQuantity;
  }

  const tolerance = Math.max(1, line.lineTotal * 0.001);
  if (Math.abs(line.unitPrice * quantity - line.lineTotal) > tolerance) {
    return null;
  }

  return {
    unit: UNIT_DEFINITIONS.l,
    quantity,
  };
}

/**
 * Deterministic canonicalization for fuel descriptions.
 *
 * This is deliberately narrow: a line is only collapsed into a fuel family when
 * the description itself contains an unambiguous fuel signal and the unit is litres.
 * Unknown descriptions stay separated under their normalized source text.
 */
function canonicalProduct(description: string, canonicalUnit: string): CanonicalProduct {
  const normalized = normalizeProductKey(description);

  if (canonicalUnit === "l") {
    const hasDiesel = /\b(?:diesel|disel|dizel)(?:olia|oliu|oliar)?\b/.test(normalized);
    const hasPetrol = /\b(bensin|petrol|gasoline)\b/.test(normalized);
    const hasFuel = /\b(eldsneyti|fuel)\b/.test(normalized);
    const has95 = /\b95\b/.test(normalized) && /\b(okt|oktan|octane|bensin|petrol|gasoline)\b/.test(normalized);
    const has98 = /\b98\b/.test(normalized) && /\b(okt|oktan|octane|bensin|petrol|gasoline)\b/.test(normalized);

    if (hasDiesel) return { key: "fuel:diesel", label: "Dísel", category: "FUEL" };
    if (has98) return { key: "fuel:petrol:98", label: "Bensín 98", category: "FUEL" };
    if (has95) return { key: "fuel:petrol:95", label: "Bensín 95", category: "FUEL" };
    if (hasPetrol) return { key: "fuel:petrol", label: "Bensín", category: "FUEL" };
    if (hasFuel) return { key: "fuel:generic", label: "Eldsneyti", category: "FUEL" };
  }

  return {
    key: normalized,
    label: description,
    category: "OTHER",
  };
}

function inPeriod(date: Date | null, period: InsightPeriod) {
  if (!date) return false;
  const time = date.getTime();
  return time >= period.start.getTime() && time <= period.end.getTime();
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function monthKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}


function areAdjacentMonths(fromPeriodKey: string, toPeriodKey: string) {
  const [fromYear, fromMonth] = fromPeriodKey.split("-").map(Number);
  const [toYear, toMonth] = toPeriodKey.split("-").map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) return false;
  const fromIndex = fromYear * 12 + (fromMonth - 1);
  const toIndex = toYear * 12 + (toMonth - 1);
  return toIndex - fromIndex === 1;
}

function observationCost(row: InsightUnitPriceObservation) {
  // Keep every analytical amount on the exact same value basis as the
  // unit price. Source documents may expose both net and gross line totals
  // and older extraction did not always persist the same one. When an
  // explicit unit price exists, quantity × unit price is therefore the
  // deterministic canonical line value. A printed line total is only the
  // fallback when the unit price itself had to be derived from it.
  if (row.source === "EXPLICIT_UNIT_PRICE") {
    return row.unitPrice * row.quantity;
  }
  if (row.lineTotal !== null && Number.isFinite(row.lineTotal) && row.lineTotal > 0) {
    return row.lineTotal;
  }
  return row.unitPrice * row.quantity;
}

function readPurchaseLines(extractionMetadata: unknown) {
  const metadata = asRecord(extractionMetadata);
  const canonicalExtraction = asRecord(metadata?.canonicalExtraction);
  const rawLines = Array.isArray(canonicalExtraction?.purchaseLines)
    ? canonicalExtraction.purchaseLines
    : [];
  const extractionMethod = stringOrNull(metadata?.analysisSource) ?? stringOrNull(metadata?.source);

  return rawLines.flatMap((raw, lineIndex) => {
    const line = asRecord(raw);
    if (!line) return [];
    const description = stringOrNull(line.description);
    if (!description) return [];

    return [{
      lineIndex,
      description,
      quantity: numberOrNull(line.quantity),
      unit: line.unit,
      unitPrice: numberOrNull(line.unitPrice),
      lineTotal: numberOrNull(line.lineTotal),
      confidence: numberOrNull(line.confidence),
      extractionMethod,
    }];
  });
}

/**
 * Deterministic unit-price analysis over already extracted canonical purchase lines.
 * This function never calls AI. It only uses quantity, unit and price/line total that
 * already exist in the source facts. Explicit unit price is preferred; deriving from
 * line total is allowed only when quantity and a supported measurement unit are known.
 */
export function buildUnitPriceSummary(
  documents: UnitPriceDocument[],
  period: InsightPeriod,
): InsightUnitPriceSummary {
  const observations: InsightUnitPriceObservation[] = [];

  for (const document of documents) {
    if (!inPeriod(document.date, period) || !document.date) continue;

    const lines = readPurchaseLines(document.extractionMetadata);
    for (const line of lines) {
      let unit = normalizeUnit(line.unit);
      let quantity = line.quantity;

      // Nýjar línur eiga að hafa skýra mælieiningu. Fyrir eldri fuel-línur
      // má þó endurheimta týnda „l“ mælieiningu og decimal-magn úr prentuðu
      // einingarverði + línuheild, en aðeins þegar útreikningurinn stemmir.
      if (!unit) {
        const recoveredFuel = recoverLegacyFuelMeasurement(line);
        if (!recoveredFuel) continue;
        unit = recoveredFuel.unit;
        quantity = recoveredFuel.quantity;
      }

      if (quantity === null || quantity <= 0) continue;

      const canonicalQuantity = quantity * unit.factor;
      if (!Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0) continue;

      let unitPrice: number | null = null;
      let source: InsightUnitPriceSource | null = null;

      if (line.unitPrice !== null && line.unitPrice > 0) {
        unitPrice = line.unitPrice / unit.factor;
        source = "EXPLICIT_UNIT_PRICE";
      } else if (line.lineTotal !== null && line.lineTotal > 0) {
        unitPrice = line.lineTotal / canonicalQuantity;
        source = "DERIVED_LINE_TOTAL";
      }

      if (unitPrice === null || source === null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        continue;
      }

      const product = canonicalProduct(line.description, unit.canonical);
      if (!product.key) continue;

      const normalizedLineTotal = source === "EXPLICIT_UNIT_PRICE"
        ? unitPrice * canonicalQuantity
        : line.lineTotal;

      observations.push({
        id: `${document.id}:${line.lineIndex}`,
        productKey: product.key,
        label: product.label,
        category: product.category,
        flow: document.flow,
        unit: unit.canonical,
        date: document.date,
        unitPrice,
        quantity: canonicalQuantity,
        lineTotal: normalizedLineTotal,
        merchantName: document.merchantName?.trim() || "Óþekktur mótaðili",
        receiptId: document.receiptId,
        documentId: document.id,
        voucherNumber: document.voucherNumber,
        source,
        extractionConfidence: line.confidence,
        extractionMethod: line.extractionMethod,
      });
    }
  }

  const grouped = new Map<string, InsightUnitPriceObservation[]>();
  for (const observation of observations) {
    const key = `${observation.productKey}|${observation.unit}|${observation.flow}`;
    const current = grouped.get(key) ?? [];
    current.push(observation);
    grouped.set(key, current);
  }

  const series = Array.from(grouped.entries()).map(([id, rows]) => {
    const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Multiple lines on the same calendar date are one price point, not a time trend.
    // Their daily unit price is quantity-weighted so duplicated/split lines do not
    // artificially count as separate changes.
    const byDate = new Map<string, InsightUnitPriceObservation[]>();
    for (const row of sorted) {
      const key = dateKey(row.date);
      const current = byDate.get(key) ?? [];
      current.push(row);
      byDate.set(key, current);
    }

    const dailyPoints = Array.from(byDate.values())
      .map((dayRows) => {
        const quantity = dayRows.reduce((sum, row) => sum + row.quantity, 0);
        const weightedPrice = dayRows.reduce(
          (sum, row) => sum + row.unitPrice * row.quantity,
          0,
        );
        const merchants = Array.from(new Set(dayRows.map((row) => row.merchantName)));
        const primary = dayRows[dayRows.length - 1]!;
        const source: InsightUnitPriceSource = dayRows.every(
          (row) => row.source === "EXPLICIT_UNIT_PRICE",
        )
          ? "EXPLICIT_UNIT_PRICE"
          : "DERIVED_LINE_TOTAL";

        return {
          id: `${id}:${dateKey(primary.date)}`,
          date: primary.date,
          unitPrice: quantity > 0
            ? weightedPrice / quantity
            : dayRows.reduce((sum, row) => sum + row.unitPrice, 0) / dayRows.length,
          merchantName: merchants.join(", "),
          receiptId: primary.receiptId,
          documentId: primary.documentId,
          voucherNumber: primary.voucherNumber,
          source,
          observationCount: dayRows.length,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const latest = dailyPoints[dailyPoints.length - 1]!;
    const previous = dailyPoints.length > 1 ? dailyPoints[dailyPoints.length - 2]! : null;
    const change = previous ? latest.unitPrice - previous.unitPrice : null;
    const changePercent = previous && previous.unitPrice !== 0
      ? (change! / previous.unitPrice) * 100
      : null;

    const totalQuantity = sorted.reduce((sum, row) => sum + row.quantity, 0);
    const totalCost = sorted.reduce((sum, row) => sum + observationCost(row), 0);
    const averagePrice = totalQuantity > 0
      ? totalCost / totalQuantity
      : sorted.reduce((sum, row) => sum + row.unitPrice, 0) / sorted.length;

    const monthGroups = new Map<string, InsightUnitPriceObservation[]>();
    for (const row of sorted) {
      const key = monthKey(row.date);
      const current = monthGroups.get(key) ?? [];
      current.push(row);
      monthGroups.set(key, current);
    }
    const months = Array.from(monthGroups.entries())
      .map(([periodKey, monthRows]) => {
        const quantity = monthRows.reduce((sum, row) => sum + row.quantity, 0);
        const cost = monthRows.reduce((sum, row) => sum + observationCost(row), 0);
        return {
          periodKey,
          quantity,
          totalCost: cost,
          averagePrice: quantity > 0
            ? cost / quantity
            : monthRows.reduce((sum, row) => sum + row.unitPrice, 0) / monthRows.length,
          observationCount: monthRows.length,
          distinctDateCount: new Set(monthRows.map((row) => dateKey(row.date))).size,
        };
      })
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

    const monthChanges = months.flatMap((month, index) => {
      if (index === 0) return [];
      const previousMonth = months[index - 1]!;
      if (!areAdjacentMonths(previousMonth.periodKey, month.periodKey)) return [];

      // Symmetric deterministic decomposition (Shapley-style):
      // Δcost = Δquantity × average(price0, price1) + Δprice × average(quantity0, quantity1).
      // The two effects add exactly to the monthly cost change when monthly average
      // price is defined as totalCost / quantity. No AI or residual interaction term.
      const quantityChange = month.quantity - previousMonth.quantity;
      const averagePriceChange = month.averagePrice - previousMonth.averagePrice;
      const quantityEffect = quantityChange * ((previousMonth.averagePrice + month.averagePrice) / 2);
      const priceEffect = averagePriceChange * ((previousMonth.quantity + month.quantity) / 2);

      return [{
        fromPeriodKey: previousMonth.periodKey,
        toPeriodKey: month.periodKey,
        costChange: month.totalCost - previousMonth.totalCost,
        quantityChange,
        averagePriceChange,
        quantityEffect,
        priceEffect,
      }];
    });

    const pointPrices = dailyPoints.map((point) => point.unitPrice);
    const firstRow = sorted[0]!;

    return {
      id,
      label: firstRow.label,
      category: firstRow.category,
      flow: firstRow.flow,
      unit: firstRow.unit,
      observationCount: sorted.length,
      distinctDateCount: dailyPoints.length,
      firstPrice: dailyPoints[0]!.unitPrice,
      latestPrice: latest.unitPrice,
      previousPrice: previous?.unitPrice ?? null,
      averagePrice,
      totalQuantity,
      totalCost,
      minPrice: Math.min(...pointPrices),
      maxPrice: Math.max(...pointPrices),
      changeFromPrevious: change,
      changeFromPreviousPercent: changePercent,
      firstObservedAt: dailyPoints[0]!.date,
      latestObservedAt: latest.date,
      merchants: Array.from(new Set(sorted.map((row) => row.merchantName))),
      observations: sorted,
      points: dailyPoints,
      months,
      monthChanges,
    } satisfies InsightUnitPriceSeries;
  }).sort((a, b) => {
    if (a.category !== b.category) return a.category === "FUEL" ? -1 : 1;
    if (b.distinctDateCount !== a.distinctDateCount) return b.distinctDateCount - a.distinctDateCount;
    if (b.observationCount !== a.observationCount) return b.observationCount - a.observationCount;
    return b.latestObservedAt.getTime() - a.latestObservedAt.getTime();
  });

  return {
    observationCount: observations.length,
    seriesCount: series.length,
    repeatSeriesCount: series.filter((row) => row.distinctDateCount >= 2).length,
    series,
  };
}
