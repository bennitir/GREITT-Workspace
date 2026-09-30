export type SourceDocumentTemporalInput = {
  documentDate?: Date | null;
  summary?: string | null;
  bookingEntries?: readonly { text?: string | null }[];
};

export type SourceDocumentTemporalContext = {
  documentDates: Date[];
  periodStart: Date | null;
  periodEnd: Date | null;
  dueDate: Date | null;
  finalDueDate: Date | null;
};

const MONTHS = new Map<string, number>([
  ["janúar", 0], ["januar", 0], ["jan", 0],
  ["febrúar", 1], ["februar", 1], ["feb", 1],
  ["mars", 2], ["mar", 2],
  ["apríl", 3], ["april", 3], ["apr", 3],
  ["maí", 4], ["mai", 4],
  ["júní", 5], ["juni", 5], ["jún", 5], ["jun", 5],
  ["júlí", 6], ["juli", 6], ["júl", 6], ["jul", 6],
  ["ágúst", 7], ["agust", 7], ["ágú", 7], ["agu", 7],
  ["september", 8], ["sep", 8],
  ["október", 9], ["oktober", 9], ["okt", 9],
  ["nóvember", 10], ["november", 10], ["nóv", 10], ["nov", 10],
  ["desember", 11], ["des", 11],
]);

const MONTH_PATTERN =
  "janúar|januar|jan|febrúar|februar|feb|mars|mar|apríl|april|apr|maí|mai|júní|juni|jún|jun|júlí|juli|júl|jul|ágúst|agust|ágú|agu|september|sep|október|oktober|okt|nóvember|november|nóv|nov|desember|des";

function validDate(date: Date | null | undefined): date is Date {
  return Boolean(date && Number.isFinite(date.getTime()));
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function atUtcNoon(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12));
}

function parseIcelandicDate(value: string): Date | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = atUtcNoon(year, month, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
    ? date
    : null;
}

function monthIndex(value: string) {
  return MONTHS.get(value.toLocaleLowerCase("is-IS").replace(/\.$/, "")) ?? null;
}

function monthBounds(year: number, month: number) {
  return {
    start: atUtcNoon(year, month, 1),
    end: atUtcNoon(year, month + 1, 0),
  };
}

function uniqueDateFromMatches(text: string, label: "Gjalddagi" | "Eindagi") {
  const pattern = new RegExp(`\\b${label}\\s*[:.-]?\\s*(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})`, "giu");
  const dates = [...text.matchAll(pattern)]
    .map((match) => parseIcelandicDate(match[1]))
    .filter(validDate);
  const unique = new Map(dates.map((date) => [dateKey(date), date]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function inferPeriod(text: string) {
  const rangePattern = new RegExp(
    `(?:^|[^\\p{L}])(${MONTH_PATTERN})\\.?\\s*(?:og|til|[-–—])\\s*(${MONTH_PATTERN})\\.?\\s+(20\\d{2})(?=$|[^\\p{L}\\d])`,
    "giu",
  );
  const ranges = [...text.matchAll(rangePattern)].flatMap((match) => {
    const first = monthIndex(match[1]);
    const last = monthIndex(match[2]);
    const year = Number(match[3]);
    if (first === null || last === null || last < first) return [];
    return [{ start: monthBounds(year, first).start, end: monthBounds(year, last).end }];
  });
  const uniqueRanges = new Map(ranges.map((period) => [
    `${dateKey(period.start)}:${dateKey(period.end)}`,
    period,
  ]));
  if (uniqueRanges.size === 1) return [...uniqueRanges.values()][0];
  if (uniqueRanges.size > 1) return null;

  const singlePattern = new RegExp(
    `(?:^|[^\\p{L}])(${MONTH_PATTERN})\\.?\\s+(20\\d{2})(?=$|[^\\p{L}\\d])`,
    "giu",
  );
  const periods = [...text.matchAll(singlePattern)].flatMap((match) => {
    const month = monthIndex(match[1]);
    if (month === null) return [];
    return [monthBounds(Number(match[2]), month)];
  });
  const unique = new Map(periods.map((period) => [
    `${dateKey(period.start)}:${dateKey(period.end)}`,
    period,
  ]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

/**
 * Deterministic temporal facts already present in a reviewed source document.
 * Missing or conflicting values stay null; this helper never guesses.
 */
export function extractSourceDocumentTemporalContext(
  input: SourceDocumentTemporalInput,
): SourceDocumentTemporalContext {
  const text = [
    input.summary ?? "",
    ...(input.bookingEntries ?? []).map((entry) => entry.text ?? ""),
  ].filter(Boolean).join("\n");
  const period = inferPeriod(text);
  return {
    documentDates: validDate(input.documentDate) ? [input.documentDate] : [],
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    dueDate: uniqueDateFromMatches(text, "Gjalddagi"),
    finalDueDate: uniqueDateFromMatches(text, "Eindagi"),
  };
}

function uniqueNullableDate(values: Array<Date | null>) {
  const dates = values.filter(validDate);
  const unique = new Map(dates.map((date) => [dateKey(date), date]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

/** Merge PRIMARY source documents without inventing a winner on conflicts. */
export function collectSourceDocumentTemporalContext(
  documents: readonly SourceDocumentTemporalInput[],
): SourceDocumentTemporalContext {
  const contexts = documents.map(extractSourceDocumentTemporalContext);
  const documentDates = new Map<string, Date>();
  for (const context of contexts) {
    for (const date of context.documentDates) documentDates.set(dateKey(date), date);
  }

  const periodPairs = new Map<string, { start: Date; end: Date }>();
  for (const context of contexts) {
    if (!context.periodStart || !context.periodEnd) continue;
    periodPairs.set(
      `${dateKey(context.periodStart)}:${dateKey(context.periodEnd)}`,
      { start: context.periodStart, end: context.periodEnd },
    );
  }
  const period = periodPairs.size === 1 ? [...periodPairs.values()][0] : null;

  return {
    documentDates: [...documentDates.values()].sort((a, b) => a.getTime() - b.getTime()),
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    dueDate: uniqueNullableDate(contexts.map((context) => context.dueDate)),
    finalDueDate: uniqueNullableDate(contexts.map((context) => context.finalDueDate)),
  };
}
