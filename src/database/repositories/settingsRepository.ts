import type { SQLiteDatabase } from 'expo-sqlite';

import type { Setting } from '../../domain/types';
import { nowUtcIso } from '../../domain/shared/dateUtils';

export async function getSetting(
  db: SQLiteDatabase,
  key: string
): Promise<string | null> {
  const row = await db.getFirstAsync<Pick<Setting, 'value'>>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function getAllSettings(db: SQLiteDatabase): Promise<Setting[]> {
  return db.getAllAsync<Setting>('SELECT * FROM settings ORDER BY key ASC');
}

export async function setSetting(
  db: SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowUtcIso()]
  );
}

export async function deleteSetting(db: SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

export async function insertSetting(
  db: SQLiteDatabase,
  setting: Setting
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [setting.key, setting.value, setting.updated_at]
  );
}
