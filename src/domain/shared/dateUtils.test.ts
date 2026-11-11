import {
  formatCompactDayLabel,
  formatTimeOfDay,
  formatWeekRangeLabel,
  formatWeekdayShort,
  getMonthGrid,
  getWeekDayKeys,
  localDayBounds,
  startOfWeekDayKey,
  toLocalDateKey,
} from './dateUtils';

function daysInGrid(monthKey: string): string[] {
  return getMonthGrid(monthKey)
    .flat()
    .filter((dayKey): dayKey is string => dayKey !== null);
}

describe('getMonthGrid', () => {
  it('places the first day under its weekday and returns six weeks', () => {
    const weeks = getMonthGrid('2026-11');

    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]).toBe('2026-11-01');
    expect(weeks[0]?.[6]).toBe('2026-11-07');
  });

  it('pads the start of a month that does not begin on Sunday', () => {
    const [firstWeek] = getMonthGrid('2026-10');

    expect(firstWeek).toEqual([
      null,
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('includes every day exactly once, including leap days', () => {
    const days = daysInGrid('2024-02');

    expect(days).toHaveLength(29);
    expect(days[0]).toBe('2024-02-01');
    expect(days[days.length - 1]).toBe('2024-02-29');
    expect(new Set(days).size).toBe(29);
  });

  it('rejects malformed month keys', () => {
    expect(() => getMonthGrid('2026-13')).toThrow('Invalid month key');
    expect(() => getMonthGrid('2026-11-01')).toThrow('Invalid month key');
    expect(() => getMonthGrid('November')).toThrow('Invalid month key');
  });
});

describe('time zone handling', () => {
  const instant = new Date('2026-11-11T20:30:00.000Z');

  it('derives the civil date in the requested time zone', () => {
    expect(toLocalDateKey(instant, 'Asia/Kolkata')).toBe('2026-11-12');
    expect(toLocalDateKey(instant, 'America/New_York')).toBe('2026-11-11');
    expect(toLocalDateKey(instant, 'Pacific/Kiritimati')).toBe('2026-11-12');
  });

  it('builds day bounds from local midnight in the requested time zone', () => {
    const bounds = localDayBounds('2026-11-12', 'Asia/Kolkata');

    expect(bounds.start.toISOString()).toBe('2026-11-11T18:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-11-12T18:30:00.000Z');
  });

  it('formats clock times in the requested time zone', () => {
    expect(formatTimeOfDay(instant.toISOString(), 'Asia/Kolkata')).toMatch(
      /2:00/
    );
    expect(formatTimeOfDay(instant.toISOString(), 'America/New_York')).toMatch(
      /3:30/
    );
    expect(formatTimeOfDay('not-a-date', 'Asia/Kolkata')).toBe('—');
  });
});

describe('week helpers', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeekDayKey('2026-11-12')).toBe('2026-11-09');
    expect(startOfWeekDayKey('2026-11-09')).toBe('2026-11-09');
    expect(startOfWeekDayKey('2026-11-15')).toBe('2026-11-09');
  });

  it('returns seven consecutive day keys', () => {
    expect(getWeekDayKeys('2026-11-12')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });

  it('labels a week range inside one month', () => {
    expect(formatWeekRangeLabel('2026-11-09', '2026-11-15')).toBe(
      'Nov 9 – 15, 2026'
    );
  });

  it('labels a week range across months and years', () => {
    expect(formatWeekRangeLabel('2026-11-30', '2026-12-06')).toBe(
      'Nov 30 – Dec 6, 2026'
    );
    expect(formatWeekRangeLabel('2025-12-29', '2026-01-04')).toBe(
      'Dec 29, 2025 – Jan 4, 2026'
    );
  });

  it('formats compact day labels and weekday initials', () => {
    expect(formatCompactDayLabel('2026-11-12')).toBe('Thu, Nov 12, 2026');
    expect(formatWeekdayShort('2026-11-12')).toBe('Thu');
  });
});
