import type { SQLiteDatabase } from 'expo-sqlite';

import type { Intention } from '../../domain/types';
import type { IntentionPeriodType } from '../../constants/loopStatus';
import {
  getDeviceTimeZone,
  localDayBounds,
  localMonthBounds,
} from '../../domain/shared/dateUtils';
import {
  actualSecondsForDay,
  actualSecondsForMonth,
  computeIntentionProgress,
  type IntentionProgress,
} from '../../domain/intentions/intentionsDomain';
import { getIntervalsOverlapping } from '../../database/repositories/intervalsRepository';
import {
  deleteIntention,
  getIntention,
  upsertIntention,
} from '../../database/repositories/intentionsRepository';

export type IntentionSummary = {
  periodType: IntentionPeriodType;
  periodKey: string;
  intention: Intention | null;
  actualSeconds: number;
  progress: IntentionProgress;
};

export async function getIntentionSummary(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string
): Promise<IntentionSummary> {
  const intention = await getIntention(db, periodType, periodKey);
  const actualSeconds = await getActualSeconds(db, periodType, periodKey);
  return {
    periodType,
    periodKey,
    intention,
    actualSeconds,
    progress: computeIntentionProgress(
      intention?.target_duration_seconds ?? 0,
      actualSeconds
    ),
  };
}

export async function getDaySummary(
  db: SQLiteDatabase,
  dayKey: string
): Promise<IntentionSummary> {
  return getIntentionSummary(db, 'daily', dayKey);
}

export async function getMonthSummary(
  db: SQLiteDatabase,
  monthKey: string
): Promise<IntentionSummary> {
  return getIntentionSummary(db, 'monthly', monthKey);
}

async function getActualSeconds(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string
): Promise<number> {
  const timeZone = getDeviceTimeZone();
  const bounds =
    periodType === 'daily'
      ? localDayBounds(periodKey, timeZone)
      : localMonthBounds(periodKey, timeZone);
  const intervals = await getIntervalsOverlapping(
    db,
    bounds.start.toISOString(),
    bounds.end.toISOString()
  );
  const reference = new Date();

  return periodType === 'daily'
    ? actualSecondsForDay(intervals, periodKey, reference, timeZone)
    : actualSecondsForMonth(intervals, periodKey, reference, timeZone);
}

export async function setIntention(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string,
  targetSeconds: number
): Promise<Intention | null> {
  if (targetSeconds <= 0) {
    await deleteIntention(db, periodType, periodKey);
    return null;
  }
  return upsertIntention(db, periodType, periodKey, Math.round(targetSeconds));
}

export async function clearIntention(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string
): Promise<void> {
  await deleteIntention(db, periodType, periodKey);
}

/**
 * Actual focus time is derived independently of loop local_date so that
 * midnight-crossing intervals are attributed to the right calendar day.
 */
export async function getIntervalTimeForDay(
  db: SQLiteDatabase,
  dayKey: string
): Promise<number> {
  const summary = await getDaySummary(db, dayKey);
  return summary.actualSeconds;
}
