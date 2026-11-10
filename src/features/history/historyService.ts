import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop } from '../../domain/types';
import {
  getDeviceTimeZone,
  localDayBounds,
  localMonthBounds,
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

export type MonthHistory = {
  monthKey: string;
  totalSeconds: number;
  loopCount: number;
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
    const days = allocateIntervalToDays(interval, reference);
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

  return {
    monthKey,
    totalSeconds: Math.round(monthly.actualSeconds),
    loopCount: uniqueLoops.size,
    monthly,
  };
}
