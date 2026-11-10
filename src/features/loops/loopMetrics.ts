import type { SQLiteDatabase } from 'expo-sqlite';

import { getIntervalsForLoops } from '../../database/repositories/intervalsRepository';
import { calculateElapsedSeconds } from '../../domain/timer/timerEngine';
import type { Loop, LoopInterval } from '../../domain/types';

export type LoopWithMetrics = {
  loop: Loop;
  intervals: LoopInterval[];
  elapsedSeconds: number;
};

export async function attachLoopMetrics(
  db: SQLiteDatabase,
  loops: Loop[]
): Promise<LoopWithMetrics[]> {
  if (loops.length === 0) {
    return [];
  }

  const intervals = await getIntervalsForLoops(
    db,
    loops.map((loop) => loop.id)
  );
  const byLoop = new Map<string, LoopInterval[]>();
  for (const interval of intervals) {
    const list = byLoop.get(interval.loop_id) ?? [];
    list.push(interval);
    byLoop.set(interval.loop_id, list);
  }

  const now = new Date();
  return loops.map((loop) => {
    const loopIntervals = byLoop.get(loop.id) ?? [];
    return {
      loop,
      intervals: loopIntervals,
      elapsedSeconds: calculateElapsedSeconds(loopIntervals, now),
    };
  });
}
