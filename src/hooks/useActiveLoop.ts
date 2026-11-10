import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getIntervalsForLoop } from '../database/repositories/intervalsRepository';
import { calculateElapsedSeconds } from '../domain/timer/timerEngine';
import { useLoopStore } from '../store/loopStore';

/**
 * Drives a one-second display refresh. Each tick recalculates elapsed seconds
 * from persisted intervals — it never accumulates a counter.
 */
export function useActiveLoop() {
  const db = useSQLiteContext();
  const activeLoop = useLoopStore((state) => state.activeLoop);
  const elapsedSeconds = useLoopStore((state) => state.elapsedSeconds);
  const loading = useLoopStore((state) => state.loading);
  const refresh = useLoopStore((state) => state.refresh);
  const setElapsedSeconds = useLoopStore((state) => state.setElapsedSeconds);

  useEffect(() => {
    void refresh(db);
  }, [db, refresh]);

  const loopId = activeLoop?.id;
  const loopStatus = activeLoop?.status;

  useEffect(() => {
    if (!loopId || loopStatus !== 'ACTIVE') {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const intervals = await getIntervalsForLoop(db, loopId);
      if (!cancelled) {
        setElapsedSeconds(calculateElapsedSeconds(intervals, new Date()));
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [db, loopId, loopStatus, setElapsedSeconds]);

  return { activeLoop, elapsedSeconds, loading, refresh };
}
