const TWO_DIGITS = (value: number): string => String(value).padStart(2, '0');

export type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function nowUtcIso(): string {
  return new Date().toISOString();
}

/**
 * Convert a UTC instant to wall-clock parts in a specific IANA time zone.
 */
export function getZonedParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/**
 * Offset of a time zone at a given instant in milliseconds (east of UTC is positive).
 */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds()
  );
  return asUtc - date.getTime();
}

/**
 * Convert wall-clock parts in a specific IANA time zone to a UTC instant.
 * Handles DST by refining the offset twice around the guessed instant.
 */
export function zonedTimeToUtc(
  parts: Pick<DateParts, 'year' | 'month' | 'day'> &
    Partial<Pick<DateParts, 'hour' | 'minute' | 'second'>>,
  timeZone: string
): Date {
  const { year, month, day } = parts;
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
  let candidate = guess - offset;
  const refinedOffset = getTimeZoneOffsetMs(new Date(candidate), timeZone);
  if (refinedOffset !== offset) {
    candidate = guess - refinedOffset;
    offset = refinedOffset;
  }
  return new Date(candidate);
}

export function toLocalDateKey(
  date: Date,
  timeZone: string = getDeviceTimeZone()
): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${TWO_DIGITS(parts.month)}-${TWO_DIGITS(parts.day)}`;
}

export function toLocalMonthKey(
  date: Date,
  timeZone: string = getDeviceTimeZone()
): string {
  return toLocalDateKey(date, timeZone).slice(0, 7);
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  return { year, month, day };
}

export function dayKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${TWO_DIGITS(month)}-${TWO_DIGITS(day)}`;
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${TWO_DIGITS(month)}`;
}

export function addDaysToDayKey(dayKey: string, delta: number): string {
  const { year, month, day } = parseDayKey(dayKey);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return dayKeyFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

export function addMonthsToMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + delta, 1));
  return monthKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export function localDayBounds(
  dayKey: string,
  timeZone: string = getDeviceTimeZone()
): { start: Date; end: Date } {
  const { year, month, day } = parseDayKey(dayKey);
  const start = zonedTimeToUtc({ year, month, day }, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedTimeToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
    },
    timeZone
  );
  return { start, end };
}

export function localMonthBounds(
  monthKey: string,
  timeZone: string = getDeviceTimeZone()
): { start: Date; end: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const start = zonedTimeToUtc({ year, month, day: 1 }, timeZone);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const end = zonedTimeToUtc(
    {
      year: nextMonth.getUTCFullYear(),
      month: nextMonth.getUTCMonth() + 1,
      day: 1,
    },
    timeZone
  );
  return { start, end };
}

export function currentDayKey(timeZone: string = getDeviceTimeZone()): string {
  return toLocalDateKey(new Date(), timeZone);
}

export function currentMonthKey(timeZone: string = getDeviceTimeZone()): string {
  return toLocalMonthKey(new Date(), timeZone);
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Day keys are calendar keys, so format their parts without re-applying a zone.
 */
export function formatDayLabel(dayKey: string): string {
  const { year, month, day } = parseDayKey(dayKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';
  const monthName = MONTHS[month - 1] ?? '';
  return `${weekday}, ${monthName} ${day}, ${year}`;
}

export function formatShortDayLabel(dayKey: string): string {
  const { month, day } = parseDayKey(dayKey);
  const monthName = MONTHS[month - 1] ?? '';
  return `${monthName.slice(0, 3)} ${day}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const monthName = MONTHS[(month ?? 1) - 1] ?? '';
  return `${monthName} ${year}`;
}

export function isSameDayKey(a: string, b: string): boolean {
  return a === b;
}
