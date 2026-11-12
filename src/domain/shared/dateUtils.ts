import {
  getActiveLanguage,
  type Language,
} from '../../i18n/localeState';

const TWO_DIGITS = (value: number): string => String(value).padStart(2, '0');

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  ar: 'ar-u-nu-latn',
  zh: 'zh-CN',
  tr: 'tr-TR',
  ml: 'ml-IN',
};

export function getLanguageLocale(
  language: Language = getActiveLanguage()
): string {
  return LOCALE_BY_LANGUAGE[language] ?? 'en-US';
}

function getFormatLocale(): string {
  return getLanguageLocale();
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(
  cacheKey: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${getFormatLocale()}:${cacheKey}`;
  const cached = dateFormatters.get(key);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(getFormatLocale(), options);
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', options);
  }
  dateFormatters.set(key, formatter);
  return formatter;
}

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

const zonedPartsFormatters = new Map<string, Intl.DateTimeFormat>();

function getZonedPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedPartsFormatters.get(timeZone);
  if (cached) return cached;
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
  zonedPartsFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Convert a UTC instant to wall-clock parts in a specific IANA time zone.
 */
export function getZonedParts(date: Date, timeZone: string): DateParts {
  const formatter = getZonedPartsFormatter(timeZone);
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

/** Monday-based start of the week containing the given day. */
export function startOfWeekDayKey(dayKey: string): string {
  const { year, month, day } = parseDayKey(dayKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const offset = (weekday + 6) % 7;
  return addDaysToDayKey(dayKey, -offset);
}

export function getWeekDayKeys(dayKey: string): string[] {
  const start = startOfWeekDayKey(dayKey);
  return Array.from({ length: 7 }, (_, index) =>
    addDaysToDayKey(start, index)
  );
}

/**
 * Build a fixed six-week calendar grid for a month, starting on Sunday.
 * Empty leading and trailing cells are null so callers can lay out rows directly.
 */
export function getMonthGrid(monthKey: string): (string | null)[][] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(dayKeyFromParts(year, month, day));
  }
  while (cells.length < 42) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
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

function dayKeyToUtcDate(dayKey: string): Date {
  const { year, month, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Day keys are calendar keys, so format their parts without re-applying a zone.
 */
export function formatDayLabel(dayKey: string): string {
  return getDateFormatter('day-label', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}

export function formatShortDayLabel(dayKey: string): string {
  return getDateFormatter('short-day', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return getDateFormatter('month-label', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)));
}

export function formatCompactDayLabel(dayKey: string): string {
  return getDateFormatter('compact-day', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}

export function formatWeekdayShort(dayKey: string): string {
  return getDateFormatter('weekday-short', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}

export function formatWeekdayNarrow(dayKey: string): string {
  return getDateFormatter('weekday-narrow', {
    weekday: 'narrow',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}

/** Sunday-first weekday labels for calendar headers. */
export function getWeekdayLabels(style: 'short' | 'narrow'): string[] {
  const sunday = Date.UTC(2023, 0, 1);
  return Array.from({ length: 7 }, (_, index) =>
    getDateFormatter(`weekday-${style}`, {
      weekday: style,
      timeZone: 'UTC',
    }).format(new Date(sunday + index * 24 * 60 * 60 * 1000))
  );
}

export function formatWeekRangeLabel(startKey: string, endKey: string): string {
  const start = parseDayKey(startKey);
  const end = parseDayKey(endKey);
  const language = getActiveLanguage();
  const startLabel = getDateFormatter('range-start', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(startKey));
  const endLabel = getDateFormatter('range-end', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(endKey));

  if (start.year !== end.year) {
    return `${startLabel}, ${start.year} – ${endLabel}, ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${startLabel} – ${endLabel}, ${end.year}`;
  }
  return language === 'en'
    ? `${startLabel} – ${end.day}, ${end.year}`
    : `${startLabel} – ${endLabel}, ${end.year}`;
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function getClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const key = `${getFormatLocale()}:${timeZone}`;
  const cached = clockFormatters.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(getFormatLocale(), options);
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', options);
  }
  clockFormatters.set(key, formatter);
  return formatter;
}

/**
 * Format a UTC instant as a clock time in the given IANA time zone.
 * The device locale decides between 12- and 24-hour display.
 */
export function formatTimeOfDay(
  instantIso: string,
  timeZone: string = getDeviceTimeZone()
): string {
  const date = new Date(instantIso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return getClockFormatter(timeZone).format(date);
}

export function isSameDayKey(a: string, b: string): boolean {
  return a === b;
}
