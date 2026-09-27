import type { InsightPeriod, InsightPeriodPreset } from "./presentation-model";

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return endOfDay(new Date(value.getFullYear(), value.getMonth() + 1, 0));
}

function startOfQuarter(value: Date) {
  const month = Math.floor(value.getMonth() / 3) * 3;
  return new Date(value.getFullYear(), month, 1);
}

function endOfQuarter(value: Date) {
  const start = startOfQuarter(value);
  return endOfDay(new Date(start.getFullYear(), start.getMonth() + 3, 0));
}

function shiftMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, value.getDate());
}

function previousPeriod(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime() + 1;
  const comparisonEnd = new Date(start.getTime() - 1);
  const comparisonStart = new Date(comparisonEnd.getTime() - duration + 1);
  return { comparisonStart, comparisonEnd };
}

export function buildInsightPeriod(
  preset: InsightPeriodPreset,
  now: Date = new Date(),
  custom?: { start: Date; end: Date },
): InsightPeriod {
  let start: Date;
  let end: Date;

  switch (preset) {
    case "THIS_MONTH":
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case "LAST_MONTH": {
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = startOfMonth(previousMonth);
      end = endOfMonth(previousMonth);
      break;
    }
    case "THIS_QUARTER":
      start = startOfQuarter(now);
      end = endOfQuarter(now);
      break;
    case "LAST_YEAR":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
      break;
    case "LAST_12_MONTHS":
      start = startOfMonth(shiftMonths(now, -11));
      end = endOfMonth(now);
      break;
    case "CUSTOM":
      if (!custom) {
        throw new Error("CUSTOM Innsýn tímabil þarf upphafs- og lokadag.");
      }
      start = startOfDay(custom.start);
      end = endOfDay(custom.end);
      break;
    case "THIS_YEAR":
    default:
      start = new Date(now.getFullYear(), 0, 1);
      end = endOfDay(new Date(now.getFullYear(), 11, 31));
      break;
  }

  if (start.getTime() > end.getTime()) {
    throw new Error("Upphaf Innsýn-tímabils má ekki vera eftir lokadag.");
  }

  return {
    preset,
    start,
    end,
    ...previousPeriod(start, end),
  };
}
