import type { SQLiteDatabase } from 'expo-sqlite';

import type { Intention } from '../../domain/types';
import type { IntentionPeriodType } from '../../constants/loopStatus';
import { createId } from '../../domain/shared/id';
import { nowUtcIso } from '../../domain/shared/dateUtils';

const SELECT_INTENTION = `
  SELECT id, period_type, period_key, target_duration_seconds, created_at, updated_at
  FROM intentions
`;

export async function getIntention(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string
): Promise<Intention | null> {
  return db.getFirstAsync<Intention>(
    `${SELECT_INTENTION} WHERE period_type = ? AND period_key = ?`,
    [periodType, periodKey]
  );
}

export async function listIntentions(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType
): Promise<Intention[]> {
  return db.getAllAsync<Intention>(
    `${SELECT_INTENTION} WHERE period_type = ? ORDER BY period_key DESC`,
    [periodType]
  );
}

export async function upsertIntention(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string,
  targetDurationSeconds: number
): Promise<Intention> {
  const now = nowUtcIso();
  const existing = await getIntention(db, periodType, periodKey);

  if (existing) {
    await db.runAsync(
      `UPDATE intentions
       SET target_duration_seconds = ?, updated_at = ?
       WHERE id = ?`,
      [targetDurationSeconds, now, existing.id]
    );
    return {
      ...existing,
      target_duration_seconds: targetDurationSeconds,
      updated_at: now,
    };
  }

  const intention: Intention = {
    id: createId(),
    period_type: periodType,
    period_key: periodKey,
    target_duration_seconds: targetDurationSeconds,
    created_at: now,
    updated_at: now,
  };
  await db.runAsync(
    `INSERT INTO intentions (
       id, period_type, period_key, target_duration_seconds, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      intention.id,
      intention.period_type,
      intention.period_key,
      intention.target_duration_seconds,
      intention.created_at,
      intention.updated_at,
    ]
  );
  return intention;
}

export async function deleteIntention(
  db: SQLiteDatabase,
  periodType: IntentionPeriodType,
  periodKey: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM intentions WHERE period_type = ? AND period_key = ?',
    [periodType, periodKey]
  );
}
