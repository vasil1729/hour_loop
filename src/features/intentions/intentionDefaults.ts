import type { SQLiteDatabase } from 'expo-sqlite';

import type { IntentionPeriodType } from '../../constants/loopStatus';
import {
  DAILY_INTENTION_SETTING_KEY,
  DEFAULT_DAILY_INTENTION_SECONDS,
  DEFAULT_MONTHLY_INTENTION_SECONDS,
  MONTHLY_INTENTION_SETTING_KEY,
} from '../../constants/intentions';
import {
  getSetting,
  setSetting,
} from '../../database/repositories/settingsRepository';

function defaultIntentionKey(periodType: IntentionPeriodType): string {
  return periodType === 'daily'
    ? DAILY_INTENTION_SETTING_KEY
    : MONTHLY_INTENTION_SETTING_KEY;
}

function defaultIntentionSeconds(periodType: IntentionPeriodType): number {
  return periodType === 'daily'
    ? DEFAULT_DAILY_INTENTION_SECONDS
    : DEFAULT_MONTHLY_INTENTION_SECONDS;
}

/**
 * A missing setting means "use the built-in default". An explicit `0` means the
 * user turned the default target off.
 */
export function resolveDefaultIntentionSeconds(
  raw: string | null,
  periodType: IntentionPeriodType
): number {
  if (raw === null) {
    return defaultIntentionSeconds(periodType);
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultIntentionSeconds(periodType);
  }
  return Math.round(parsed);
}

export async function getDefaultIntentionSeconds(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType
): Promise<number> {
  const raw = await getSetting(db, defaultIntentionKey(periodType));
  return resolveDefaultIntentionSeconds(raw, periodType);
}

/** A zero target explicitly disables the built-in default. */
export async function setDefaultIntentionSeconds(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  seconds: number
): Promise<void> {
  const normalized = Number.isFinite(seconds)
    ? Math.max(0, Math.round(seconds))
    : 0;
  await setSetting(db, defaultIntentionKey(periodType), String(normalized));
}
