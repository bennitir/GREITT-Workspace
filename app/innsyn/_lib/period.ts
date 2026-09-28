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

function shiftMonthStart(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function sameDayInYear(value: Date, year: number) {
  const month = value.getMonth();
  const day = value.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return endOfDay(new Date(year, month, Math.min(day, lastDay)));
}

function previousPeriod(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime() + 1;
  const comparisonEnd = new Date(start.getTime() - 1);
  const comparisonStart = new Date(comparisonEnd.getTime() - duration + 1);
  return { comparisonStart, comparisonEnd };
}

function quarterComparison(start: Date, end: Date) {
  const comparisonStart = new Date(start.getFullYear(), start.getMonth() - 3, 1);
  const previousQuarterEnd = endOfDay(
    new Date(comparisonStart.getFullYear(), comparisonStart.getMonth() + 3, 0),
  );
  const elapsed = end.getTime() - start.getTime();
  const proposedEnd = new Date(comparisonStart.getTime() + elapsed);
  const comparisonEnd =
    proposedEnd.getTime() > previousQuarterEnd.getTime()
      ? previousQuarterEnd
      : proposedEnd;

  return { comparisonStart, comparisonEnd };
}

export function buildInsightPeriod(
  preset: InsightPeriodPreset,
  now: Date = new Date(),
  custom?: { start: Date; end: Date },
): InsightPeriod {
  let start: Date;
  let end: Date;
  let comparisonStart: Date | undefined;
  let comparisonEnd: Date | undefined;

  switch (preset) {
    case "THIS_MONTH": {
      start = startOfMonth(now);
      end = endOfDay(now);

      const previousMonthStart = shiftMonthStart(start, -1);
      const previousMonthLastDay = new Date(
        previousMonthStart.getFullYear(),
        previousMonthStart.getMonth() + 1,
        0,
      ).getDate();
      comparisonStart = previousMonthStart;
      comparisonEnd = endOfDay(
        new Date(
          previousMonthStart.getFullYear(),
          previousMonthStart.getMonth(),
          Math.min(now.getDate(), previousMonthLastDay),
        ),
      );
      break;
    }
    case "LAST_MONTH": {
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = startOfMonth(previousMonth);
      end = endOfMonth(previousMonth);
      const monthBefore = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      comparisonStart = startOfMonth(monthBefore);
      comparisonEnd = endOfMonth(monthBefore);
      break;
    }
    case "THIS_QUARTER": {
      start = startOfQuarter(now);
      end = endOfDay(now);
      ({ comparisonStart, comparisonEnd } = quarterComparison(start, end));
      break;
    }
    case "LAST_YEAR": {
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
      comparisonStart = new Date(now.getFullYear() - 2, 0, 1);
      comparisonEnd = endOfDay(new Date(now.getFullYear() - 2, 11, 31));
      break;
    }
    case "LAST_12_MONTHS": {
      start = shiftMonthStart(startOfMonth(now), -11);
      end = endOfDay(now);
      comparisonStart = shiftMonthStart(start, -12);
      comparisonEnd = sameDayInYear(end, end.getFullYear() - 1);
      break;
    }
    case "CUSTOM": {
      if (!custom) {
        throw new Error("CUSTOM Innsýn tímabil þarf upphafs- og lokadag.");
      }
      start = startOfDay(custom.start);
      end = endOfDay(custom.end);
      ({ comparisonStart, comparisonEnd } = previousPeriod(start, end));
      break;
    }
    case "THIS_YEAR":
    default: {
      start = new Date(now.getFullYear(), 0, 1);
      end = endOfDay(now);
      comparisonStart = new Date(now.getFullYear() - 1, 0, 1);
      comparisonEnd = sameDayInYear(end, now.getFullYear() - 1);
      break;
    }
  }

  if (start.getTime() > end.getTime()) {
    throw new Error("Upphaf Innsýn-tímabils má ekki vera eftir lokadag.");
  }

  return {
    preset,
    start,
    end,
    comparisonStart,
    comparisonEnd,
  };
}
