import type { SQLiteDatabase } from 'expo-sqlite';

import type { IntentionPeriodType } from '../../constants/loopStatus';
import {
  DAILY_INTENTION_SETTING_KEY,
  MONTHLY_INTENTION_SETTING_KEY,
} from '../../constants/intentions';
import {
  deleteSetting,
  getSetting,
  setSetting,
} from '../../database/repositories/settingsRepository';

function defaultIntentionKey(periodType: IntentionPeriodType): string {
  return periodType === 'daily'
    ? DAILY_INTENTION_SETTING_KEY
    : MONTHLY_INTENTION_SETTING_KEY;
}

export async function getDefaultIntentionSeconds(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType
): Promise<number> {
  const raw = await getSetting(db, defaultIntentionKey(periodType));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

/** A zero or negative target removes the stored default. */
export async function setDefaultIntentionSeconds(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  seconds: number
): Promise<void> {
  const key = defaultIntentionKey(periodType);
  if (seconds <= 0) {
    await deleteSetting(db, key);
    return;
  }
  await setSetting(db, key, String(Math.round(seconds)));
}
