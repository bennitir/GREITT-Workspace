/**
 * Deterministic scheduling helpers for Verk.
 * A planned day is stored separately from local clock minutes so a work plan
 * does not change because a viewer/browser uses another timezone.
 */
export function parseWork10PlannedDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Ógild áætluð dagsetning.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error("Ógild áætluð dagsetning.");
  }
  return date;
}

export function parseWork10PlannedStartMinutes(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw new Error("Ógildur áætlaður upphafstími.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Ógildur áætlaður upphafstími.");
  }
  return hours * 60 + minutes;
}

/**
 * Parses separate 24-hour clock fields from forms. Both blank means that the
 * work is planned for the day but has no decided clock time. An hour without
 * minutes means :00; minutes without an hour are invalid. Past clock times are
 * intentionally allowed because plans can be entered or corrected afterwards.
 */
export function parseWork10PlannedStartParts(
  hoursValue: string | number | null | undefined,
  minutesValue: string | number | null | undefined,
) {
  const hoursText = String(hoursValue ?? "").trim();
  const minutesText = String(minutesValue ?? "").trim();
  if (!hoursText && !minutesText) return null;
  if (!hoursText) throw new Error("Klukkustund vantar í áætlaðan upphafstíma.");

  const hours = Number(hoursText);
  const minutes = minutesText ? Number(minutesText) : 0;
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Ógildur áætlaður upphafstími.");
  }
  return hours * 60 + minutes;
}

export function work10ClockFromMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function work10PlannedEndMinutes(startMinutes: number | null | undefined, durationMinutes: number | null | undefined) {
  if (startMinutes === null || startMinutes === undefined) return null;
  if (!durationMinutes || durationMinutes <= 0) return null;
  return Math.min(1440, startMinutes + durationMinutes);
}

export function work10ScheduleRangesOverlap(args: {
  firstStart: number | null | undefined;
  firstDuration: number | null | undefined;
  secondStart: number | null | undefined;
  secondDuration: number | null | undefined;
}) {
  const firstEnd = work10PlannedEndMinutes(args.firstStart, args.firstDuration);
  const secondEnd = work10PlannedEndMinutes(args.secondStart, args.secondDuration);
  if (args.firstStart === null || args.firstStart === undefined || firstEnd === null) return null;
  if (args.secondStart === null || args.secondStart === undefined || secondEnd === null) return null;
  return args.firstStart < secondEnd && args.secondStart < firstEnd;
}

/**
 * Parses the optional contractual/operational completion deadline for a Work.
 * Date and local clock must either both be present or both be empty. Keeping
 * them separate mirrors plannedDate/plannedStartMinutes and avoids timezone
 * inference for company-local operational deadlines.
 */
export function parseWork10CompletionDeadline(
  dateValue: string | null | undefined,
  hoursValue: string | number | null | undefined,
  minutesValue: string | number | null | undefined,
) {
  const dateText = String(dateValue ?? "").trim();
  const hoursText = String(hoursValue ?? "").trim();
  const minutesText = String(minutesValue ?? "").trim();
  const hasAnyTime = Boolean(hoursText || minutesText);

  if (!dateText && !hasAnyTime) return { date: null, minutes: null };
  if (!dateText) throw new Error("Dagsetning vantar í 'Klárað fyrir'.");
  if (!hasAnyTime) throw new Error("Klukkan vantar í 'Klárað fyrir'.");

  const date = parseWork10PlannedDate(dateText);
  const minutes = parseWork10PlannedStartParts(hoursText, minutesText);
  if (!date || minutes === null) throw new Error("Ógildur lokatími Verks.");
  return { date, minutes };
}
