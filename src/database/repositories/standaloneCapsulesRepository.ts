import type { SQLiteDatabase } from 'expo-sqlite';

import type { StandaloneCapsule } from '../../domain/types';
import { nowUtcIso } from '../../domain/shared/dateUtils';

type StandaloneCapsuleRow = Omit<StandaloneCapsule, 'done'> & { done: number };

const SELECT_CAPSULE = `
  SELECT id, text, done, created_at, updated_at, completed_at
  FROM standalone_capsules
`;

function mapRow(row: StandaloneCapsuleRow): StandaloneCapsule {
  return { ...row, done: row.done === 1 };
}

export async function createStandaloneCapsule(
  db: SQLiteDatabase,
  capsule: StandaloneCapsule
): Promise<void> {
  await db.runAsync(
    `INSERT INTO standalone_capsules (
       id, text, done, created_at, updated_at, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      capsule.id,
      capsule.text,
      capsule.done ? 1 : 0,
      capsule.created_at,
      capsule.updated_at,
      capsule.completed_at,
    ]
  );
}

export async function listStandaloneCapsules(
  db: SQLiteDatabase,
  done: boolean
): Promise<StandaloneCapsule[]> {
  const rows = await db.getAllAsync<StandaloneCapsuleRow>(
    `${SELECT_CAPSULE}
     WHERE done = ?
     ORDER BY completed_at DESC, created_at DESC`,
    [done ? 1 : 0]
  );
  return rows.map(mapRow);
}

export async function getStandaloneCapsuleById(
  db: SQLiteDatabase,
  id: string
): Promise<StandaloneCapsule | null> {
  const row = await db.getFirstAsync<StandaloneCapsuleRow>(
    `${SELECT_CAPSULE} WHERE id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function setStandaloneCapsuleDone(
  db: SQLiteDatabase,
  id: string,
  done: boolean
): Promise<void> {
  const now = nowUtcIso();
  await db.runAsync(
    `UPDATE standalone_capsules
     SET done = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
    [done ? 1 : 0, done ? now : null, now, id]
  );
}
