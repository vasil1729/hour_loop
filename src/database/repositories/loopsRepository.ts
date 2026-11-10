import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop } from '../../domain/types';
import type { LoopStatus } from '../../constants/loopStatus';
import { nowUtcIso } from '../../domain/shared/dateUtils';

const SELECT_LOOP = `
  SELECT id, sequence_number, local_date, focus, carry_in, done, roll_forward,
         roll_forward_task_id, note, task_id, target_duration_seconds, status,
         started_at, stopped_at, created_at, updated_at
  FROM loops
`;

export async function createLoop(db: SQLiteDatabase, loop: Loop): Promise<void> {
  await db.runAsync(
    `INSERT INTO loops (
       id, sequence_number, local_date, focus, carry_in, done, roll_forward,
       roll_forward_task_id, note, task_id, target_duration_seconds, status,
       started_at, stopped_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      loop.id,
      loop.sequence_number,
      loop.local_date,
      loop.focus,
      loop.carry_in,
      loop.done,
      loop.roll_forward,
      loop.roll_forward_task_id,
      loop.note,
      loop.task_id,
      loop.target_duration_seconds,
      loop.status,
      loop.started_at,
      loop.stopped_at,
      loop.created_at,
      loop.updated_at,
    ]
  );
}

export async function getLoopById(
  db: SQLiteDatabase,
  id: string
): Promise<Loop | null> {
  return db.getFirstAsync<Loop>(`${SELECT_LOOP} WHERE id = ?`, [id]);
}

export async function getActiveLoop(db: SQLiteDatabase): Promise<Loop | null> {
  return db.getFirstAsync<Loop>(
    `${SELECT_LOOP} WHERE status IN ('ACTIVE', 'PAUSED') ORDER BY started_at DESC LIMIT 1`
  );
}

export async function getMaxSequenceForDate(
  db: SQLiteDatabase,
  localDate: string
): Promise<number> {
  const row = await db.getFirstAsync<{ max_seq: number | null }>(
    'SELECT MAX(sequence_number) AS max_seq FROM loops WHERE local_date = ?',
    [localDate]
  );
  return row?.max_seq ?? 0;
}

export async function updateLoopStatus(
  db: SQLiteDatabase,
  id: string,
  status: LoopStatus,
  stoppedAt: string | null
): Promise<void> {
  await db.runAsync(
    'UPDATE loops SET status = ?, stopped_at = ?, updated_at = ? WHERE id = ?',
    [status, stoppedAt, nowUtcIso(), id]
  );
}

export type LoopJournalPatch = {
  focus?: string | null;
  carry_in?: string | null;
  done?: string | null;
  roll_forward?: string | null;
  roll_forward_task_id?: string | null;
  note?: string | null;
};

export async function updateLoopJournal(
  db: SQLiteDatabase,
  id: string,
  patch: LoopJournalPatch
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value as string | null);
  await db.runAsync(
    `UPDATE loops SET ${assignments}, updated_at = ? WHERE id = ?`,
    [...values, nowUtcIso(), id]
  );
}

export async function listLoopsByDate(
  db: SQLiteDatabase,
  localDate: string
): Promise<Loop[]> {
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE local_date = ? ORDER BY sequence_number ASC`,
    [localDate]
  );
}

export async function listRecentLoops(
  db: SQLiteDatabase,
  limit = 5
): Promise<Loop[]> {
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE status = 'COMPLETED' ORDER BY stopped_at DESC LIMIT ?`,
    [limit]
  );
}

export async function listCompletedLoops(
  db: SQLiteDatabase,
  limit = 500
): Promise<Loop[]> {
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE status = 'COMPLETED' ORDER BY stopped_at DESC LIMIT ?`,
    [limit]
  );
}

export async function listLoopsForTask(
  db: SQLiteDatabase,
  taskId: string
): Promise<Loop[]> {
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE task_id = ? ORDER BY started_at DESC`,
    [taskId]
  );
}

export async function listLoopsForTasks(
  db: SQLiteDatabase,
  taskIds: string[]
): Promise<Loop[]> {
  if (taskIds.length === 0) {
    return [];
  }
  const placeholders = taskIds.map(() => '?').join(', ');
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE task_id IN (${placeholders}) ORDER BY started_at DESC`,
    taskIds
  );
}

export async function listAllLoops(db: SQLiteDatabase): Promise<Loop[]> {
  return db.getAllAsync<Loop>(`${SELECT_LOOP} ORDER BY started_at DESC`);
}

export async function getLoopsByIds(
  db: SQLiteDatabase,
  ids: string[]
): Promise<Loop[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  return db.getAllAsync<Loop>(
    `${SELECT_LOOP} WHERE id IN (${placeholders})`,
    ids
  );
}
