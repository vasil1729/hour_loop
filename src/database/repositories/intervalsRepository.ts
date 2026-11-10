import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoopInterval } from '../../domain/types';

const SELECT_INTERVAL = `
  SELECT id, loop_id, started_at, ended_at, time_zone, created_at
  FROM loop_intervals
`;

export async function createInterval(
  db: SQLiteDatabase,
  interval: LoopInterval
): Promise<void> {
  await db.runAsync(
    `INSERT INTO loop_intervals (id, loop_id, started_at, ended_at, time_zone, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      interval.id,
      interval.loop_id,
      interval.started_at,
      interval.ended_at,
      interval.time_zone,
      interval.created_at,
    ]
  );
}

export async function closeOpenInterval(
  db: SQLiteDatabase,
  loopId: string,
  endedAt: string
): Promise<void> {
  await db.runAsync(
    'UPDATE loop_intervals SET ended_at = ? WHERE loop_id = ? AND ended_at IS NULL',
    [endedAt, loopId]
  );
}

export async function getOpenInterval(
  db: SQLiteDatabase,
  loopId: string
): Promise<LoopInterval | null> {
  return db.getFirstAsync<LoopInterval>(
    `${SELECT_INTERVAL} WHERE loop_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [loopId]
  );
}

export async function getIntervalsForLoop(
  db: SQLiteDatabase,
  loopId: string
): Promise<LoopInterval[]> {
  return db.getAllAsync<LoopInterval>(
    `${SELECT_INTERVAL} WHERE loop_id = ? ORDER BY started_at ASC`,
    [loopId]
  );
}

export async function getIntervalsForLoops(
  db: SQLiteDatabase,
  loopIds: string[]
): Promise<LoopInterval[]> {
  if (loopIds.length === 0) {
    return [];
  }
  const placeholders = loopIds.map(() => '?').join(', ');
  return db.getAllAsync<LoopInterval>(
    `${SELECT_INTERVAL} WHERE loop_id IN (${placeholders}) ORDER BY started_at ASC`,
    loopIds
  );
}

/**
 * Intervals that overlap [startIso, endIso), including open intervals.
 */
export async function getIntervalsOverlapping(
  db: SQLiteDatabase,
  startIso: string,
  endIso: string
): Promise<LoopInterval[]> {
  return db.getAllAsync<LoopInterval>(
    `${SELECT_INTERVAL}
     WHERE started_at < ?
       AND (ended_at IS NULL OR ended_at > ?)
     ORDER BY started_at ASC`,
    [endIso, startIso]
  );
}

export async function getAllIntervals(db: SQLiteDatabase): Promise<LoopInterval[]> {
  return db.getAllAsync<LoopInterval>(
    `${SELECT_INTERVAL} ORDER BY started_at ASC`
  );
}
