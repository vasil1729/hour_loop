import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoopItemInterval } from '../../domain/types';

const SELECT_INTERVAL = `
  SELECT id, loop_id, item_id, started_at, ended_at, time_zone, created_at
  FROM loop_item_intervals
`;

export async function createLoopItemInterval(
  db: SQLiteDatabase,
  interval: LoopItemInterval
): Promise<void> {
  await db.runAsync(
    `INSERT INTO loop_item_intervals (
       id, loop_id, item_id, started_at, ended_at, time_zone, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      interval.id,
      interval.loop_id,
      interval.item_id,
      interval.started_at,
      interval.ended_at,
      interval.time_zone,
      interval.created_at,
    ]
  );
}

export async function closeOpenLoopItemIntervals(
  db: SQLiteDatabase,
  loopId: string,
  endedAt: string
): Promise<void> {
  await db.runAsync(
    `UPDATE loop_item_intervals
     SET ended_at = ?
     WHERE loop_id = ? AND ended_at IS NULL`,
    [endedAt, loopId]
  );
}

export async function getOpenLoopItemInterval(
  db: SQLiteDatabase,
  loopId: string
): Promise<LoopItemInterval | null> {
  return db.getFirstAsync<LoopItemInterval>(
    `${SELECT_INTERVAL}
     WHERE loop_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [loopId]
  );
}

export async function getLoopItemIntervalsForLoop(
  db: SQLiteDatabase,
  loopId: string
): Promise<LoopItemInterval[]> {
  return db.getAllAsync<LoopItemInterval>(
    `${SELECT_INTERVAL} WHERE loop_id = ? ORDER BY started_at ASC`,
    [loopId]
  );
}

export async function getLoopItemIntervalsOverlapping(
  db: SQLiteDatabase,
  startIso: string,
  endIso: string
): Promise<LoopItemInterval[]> {
  return db.getAllAsync<LoopItemInterval>(
    `${SELECT_INTERVAL}
     WHERE started_at < ?
       AND (ended_at IS NULL OR ended_at > ?)
     ORDER BY started_at ASC`,
    [endIso, startIso]
  );
}

export async function getAllLoopItemIntervals(
  db: SQLiteDatabase
): Promise<LoopItemInterval[]> {
  return db.getAllAsync<LoopItemInterval>(
    `${SELECT_INTERVAL} ORDER BY started_at ASC`
  );
}

/** The capsule-interval equivalent of truncateIntervalsAfter. */
export async function truncateLoopItemIntervalsAfter(
  db: SQLiteDatabase,
  loopId: string,
  endedAt: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM loop_item_intervals WHERE loop_id = ? AND started_at >= ?',
    [loopId, endedAt]
  );
  await db.runAsync(
    `UPDATE loop_item_intervals
     SET ended_at = ?
     WHERE loop_id = ?
       AND started_at < ?
       AND (ended_at IS NULL OR ended_at > ?)`,
    [endedAt, loopId, endedAt, endedAt]
  );
}
