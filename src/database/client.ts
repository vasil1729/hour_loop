import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'hour-loop.db';

export function openAppDatabase(): SQLiteDatabase {
  return openDatabaseSync(DATABASE_NAME);
}
