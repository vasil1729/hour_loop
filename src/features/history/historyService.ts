import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop } from '../../domain/types';
import {
  addDaysToDayKey,
  currentDayKey,
  getDeviceTimeZone,
  getWeekDayKeys,
  localDayBounds,
  localMonthBounds,
  startOfWeekDayKey,
} from '../../domain/shared/dateUtils';
import { allocateIntervalToDays } from '../../domain/timer/timerEngine';
import { getIntervalsOverlapping } from '../../database/repositories/intervalsRepository';
import { getLoopsByIds } from '../../database/repositories/loopsRepository';
import {
  getDaySummary,
  getMonthSummary,
  type IntentionSummary,
} from '../intentions/intentionsService';

export type HistoryLoopEntry = {
  loop: Loop;
  elapsedSeconds: number;
};

export type DayHistory = {
  dayKey: string;
  loops: HistoryLoopEntry[];
  totalSeconds: number;
  loopCount: number;
  daily: IntentionSummary;
};

export type WeekDayHistory = {
  dayKey: string;
  totalSeconds: number;
  daily: IntentionSummary;
};

export type WeekHistory = {
  weekStart: string;
  weekEnd: string;
  totalSeconds: number;
  loopCount: number;
  activeDays: number;
  targetDays: number;
  targetDayCount: number;
  days: WeekDayHistory[];
};

export type MonthHistory = {
  monthKey: string;
  totalSeconds: number;
  loopCount: number;
  activeDays: number;
  days: Record<string, number>;
  monthly: IntentionSummary;
};

export async function getDayHistory(
  db: SQLiteDatabase,
  dayKey: string
): Promise<DayHistory> {
  const timeZone = getDeviceTimeZone();
  const bounds = localDayBounds(dayKey, timeZone);
  const intervals = await getIntervalsOverlapping(
    db,
    bounds.start.toISOString(),
    bounds.end.toISOString()
  );

  const reference = new Date();
  const secondsByLoop = new Map<string, number>();
  for (const interval of intervals) {
    const days = allocateIntervalToDays(interval, reference, timeZone);
    const seconds = days[dayKey] ?? 0;
    if (seconds <= 0) continue;
    secondsByLoop.set(
      interval.loop_id,
      (secondsByLoop.get(interval.loop_id) ?? 0) + seconds
    );
  }

  const loops = await getLoopsByIds(db, Array.from(secondsByLoop.keys()));
  const entries: HistoryLoopEntry[] = loops
    .map((loop) => ({
      loop,
      elapsedSeconds: Math.round(secondsByLoop.get(loop.id) ?? 0),
    }))
    .filter((entry) => entry.elapsedSeconds > 0)
    .sort((a, b) => a.loop.started_at.localeCompare(b.loop.started_at));

  const daily = await getDaySummary(db, dayKey);

  return {
    dayKey,
    loops: entries,
    totalSeconds: entries.reduce((sum, entry) => sum + entry.elapsedSeconds, 0),
    loopCount: entries.length,
    daily,
  };
}

export async function getWeekHistory(
  db: SQLiteDatabase,
  dayKey: string
): Promise<WeekHistory> {
  const timeZone = getDeviceTimeZone();
  const weekStart = startOfWeekDayKey(dayKey);
  const weekEnd = addDaysToDayKey(weekStart, 6);
  const dayKeys = getWeekDayKeys(weekStart);
  const startBounds = localDayBounds(weekStart, timeZone);
  const endBounds = localDayBounds(weekEnd, timeZone);

  const intervals = await getIntervalsOverlapping(
    db,
    startBounds.start.toISOString(),
    endBounds.end.toISOString()
  );
  const uniqueLoops = new Set(intervals.map((interval) => interval.loop_id));

  const days = await Promise.all(
    dayKeys.map(async (day): Promise<WeekDayHistory> => {
      const daily = await getDaySummary(db, day);
      return {
        dayKey: day,
        totalSeconds: Math.round(daily.actualSeconds),
        daily,
      };
    })
  );
  const elapsedDays = days.filter((day) => day.dayKey <= currentDayKey(timeZone));

  return {
    weekStart,
    weekEnd,
    totalSeconds: days.reduce((sum, day) => sum + day.totalSeconds, 0),
    loopCount: uniqueLoops.size,
    activeDays: days.filter((day) => day.totalSeconds > 0).length,
    targetDays: elapsedDays.filter(
      (day) => day.daily.targetSeconds > 0 && day.daily.progress.reached
    ).length,
    targetDayCount: elapsedDays.filter((day) => day.daily.targetSeconds > 0).length,
    days,
  };
}

export async function getMonthHistory(
  db: SQLiteDatabase,
  monthKey: string
): Promise<MonthHistory> {
  const timeZone = getDeviceTimeZone();
  const bounds = localMonthBounds(monthKey, timeZone);
  const intervals = await getIntervalsOverlapping(
    db,
    bounds.start.toISOString(),
    bounds.end.toISOString()
  );
  const monthly = await getMonthSummary(db, monthKey);
  const uniqueLoops = new Set(intervals.map((interval) => interval.loop_id));
  const reference = new Date();
  const days: Record<string, number> = {};
  for (const interval of intervals) {
    const allocated = allocateIntervalToDays(interval, reference, timeZone);
    for (const [dayKey, seconds] of Object.entries(allocated)) {
      if (dayKey.startsWith(`${monthKey}-`)) {
        days[dayKey] = Math.round((days[dayKey] ?? 0) + seconds);
      }
    }
  }

  return {
    monthKey,
    totalSeconds: Math.round(monthly.actualSeconds),
    loopCount: uniqueLoops.size,
    activeDays: Object.keys(days).length,
    days,
    monthly,
  };
}
