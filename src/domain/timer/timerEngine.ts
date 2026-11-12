import type { DayAllocation, LoopInterval, MonthAllocation } from '../types';
import { getZonedParts, toLocalDateKey, zonedTimeToUtc } from '../shared/dateUtils';
import { getActiveLanguage } from '../../i18n/localeState';

function shortUnit(unit: 'h' | 'm' | 's'): string {
  const language = getActiveLanguage();
  if (language === 'ru') {
    return unit === 'h' ? ' ч' : unit === 'm' ? ' м' : ' с';
  }
  if (language === 'ar') {
    return unit === 'h' ? ' س' : unit === 'm' ? ' د' : ' ث';
  }
  if (language === 'zh') {
    return unit === 'h' ? '小时' : unit === 'm' ? '分' : '秒';
  }
  if (language === 'tr') {
    return unit === 'h' ? ' sa' : unit === 'm' ? ' dk' : ' sn';
  }
  if (language === 'ml') {
    return unit === 'h' ? ' മണി.' : unit === 'm' ? ' മിനി.' : ' സെക.';
  }
  if (language === 'it') {
    return unit === 'h' ? ' h' : unit === 'm' ? ' min' : ' s';
  }
  if (language === 'fr') {
    return unit === 'h' ? ' h' : unit === 'm' ? ' min' : ' s';
  }
  if (language === 'es') {
    return unit === 'h' ? ' h' : unit === 'm' ? ' min' : ' s';
  }
  if (language === 'pt') {
    return unit === 'h' ? ' h' : unit === 'm' ? ' min' : ' s';
  }
  if (language === 'fa') {
    return unit === 'h' ? ' ساعت' : unit === 'm' ? ' دقیقه' : ' ثانیه';
  }
  if (language === 'de') {
    return unit === 'h' ? ' Std.' : unit === 'm' ? ' Min.' : ' Sek.';
  }
  return unit;
}

export type IntervalRecord = Pick<
  LoopInterval,
  'id' | 'loop_id' | 'started_at' | 'ended_at' | 'time_zone'
>;

export function calculateElapsedSeconds(
  intervals: IntervalRecord[],
  referenceTime: Date = new Date()
): number {
  const total = intervals.reduce((acc, interval) => {
    const start = new Date(interval.started_at).getTime();
    const end = interval.ended_at
      ? new Date(interval.ended_at).getTime()
      : referenceTime.getTime();
    return acc + Math.max(0, (end - start) / 1000);
  }, 0);

  return Math.max(0, Math.floor(total));
}

/**
 * Allocate an interval's active seconds to local calendar days.
 * Handles midnight and DST boundaries by walking to each local midnight.
 * `timeZone` defaults to the zone recorded on the interval; history and
 * intentions pass the device's current zone so queries and allocation agree.
 */
export function allocateIntervalToDays(
  interval: IntervalRecord,
  referenceTime: Date = new Date(),
  timeZone: string = interval.time_zone
): DayAllocation {
  const start = new Date(interval.started_at);
  const end = interval.ended_at ? new Date(interval.ended_at) : referenceTime;
  if (end.getTime() <= start.getTime()) {
    return {};
  }

  const result: DayAllocation = {};
  let cursor = start;
  let guard = 0;

  while (cursor < end && guard < 10_000) {
    const dayKey = toLocalDateKey(cursor, timeZone);
    const nextMidnight = localMidnightAfter(cursor, timeZone);
    const segmentEnd =
      nextMidnight.getTime() < end.getTime() ? nextMidnight : end;
    const seconds = (segmentEnd.getTime() - cursor.getTime()) / 1000;

    if (seconds > 0) {
      result[dayKey] = (result[dayKey] ?? 0) + seconds;
    }

    if (segmentEnd.getTime() <= cursor.getTime()) {
      break;
    }
    cursor = segmentEnd;
    guard += 1;
  }

  return result;
}

/** Allocate an interval's seconds to local months, built on the day allocation. */
export function allocateIntervalToMonths(
  interval: IntervalRecord,
  referenceTime: Date = new Date(),
  timeZone: string = interval.time_zone
): MonthAllocation {
  const days = allocateIntervalToDays(interval, referenceTime, timeZone);
  const months: MonthAllocation = {};
  for (const [day, seconds] of Object.entries(days)) {
    const monthKey = day.slice(0, 7);
    months[monthKey] = (months[monthKey] ?? 0) + seconds;
  }
  return months;
}

export function remainingSeconds(
  targetSeconds: number,
  elapsedSeconds: number
): number {
  return Math.max(0, targetSeconds - elapsedSeconds);
}

export function progressRatio(targetSeconds: number, elapsedSeconds: number): number {
  if (targetSeconds <= 0) {
    return elapsedSeconds > 0 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, elapsedSeconds / targetSeconds));
}

export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function formatDurationCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours}${shortUnit('h')} ${minutes}${shortUnit('m')}`;
  }
  if (hours > 0) return `${hours}${shortUnit('h')}`;
  if (minutes > 0) return `${minutes}${shortUnit('m')}`;
  return `${safe}${shortUnit('s')}`;
}

/**
 * Precise duration for live session-log segments, e.g. "1m 21s" or "1h 4m 9s".
 * Unlike formatDurationCompact, seconds are always retained so a running
 * segment visibly advances.
 */
export function formatDurationWithSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}${shortUnit('h')} ${minutes}${shortUnit('m')} ${seconds}${shortUnit('s')}`;
  }
  if (minutes > 0) {
    return `${minutes}${shortUnit('m')} ${seconds}${shortUnit('s')}`;
  }
  return `${seconds}${shortUnit('s')}`;
}

/**
 * The instant at which cumulative active time first reaches the target.
 * Returns null when the target has not been reached yet.
 */
export function targetTimeForIntervals(
  intervals: IntervalRecord[],
  targetSeconds: number,
  referenceTime: Date = new Date()
): Date | null {
  const target = Math.max(0, Math.floor(targetSeconds));
  if (target <= 0) {
    return null;
  }

  const ordered = [...intervals].sort((a, b) =>
    a.started_at.localeCompare(b.started_at)
  );
  let elapsed = 0;

  for (const interval of ordered) {
    const start = Date.parse(interval.started_at);
    const end = interval.ended_at
      ? Date.parse(interval.ended_at)
      : referenceTime.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const duration = (end - start) / 1000;
    if (elapsed + duration >= target) {
      const secondsIntoInterval = Math.max(0, target - elapsed);
      return new Date(start + secondsIntoInterval * 1000);
    }
    elapsed += duration;
  }

  return null;
}

/**
 * The UTC instant of the next local midnight in the given IANA time zone.
 */
export function localMidnightAfter(date: Date, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedTimeToUtc(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
    },
    timeZone
  );
}
