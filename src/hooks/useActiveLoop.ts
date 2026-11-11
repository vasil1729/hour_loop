import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { getIntervalsForLoop } from '../database/repositories/intervalsRepository';
import { calculateElapsedSeconds } from '../domain/timer/timerEngine';
import type { LoopInterval } from '../domain/types';
import { useLoopStore } from '../store/loopStore';

/**
 * Drives a one-second display refresh while the screen is focused. Each tick
 * recalculates elapsed seconds from persisted intervals — it never accumulates
 * a counter.
 */
export function useActiveLoop() {
  const db = useSQLiteContext();
  const activeLoop = useLoopStore((state) => state.activeLoop);
  const elapsedSeconds = useLoopStore((state) => state.elapsedSeconds);
  const loading = useLoopStore((state) => state.loading);
  const refresh = useLoopStore((state) => state.refresh);
  const setElapsedSeconds = useLoopStore((state) => state.setElapsedSeconds);
  const [intervals, setIntervals] = useState<LoopInterval[]>([]);

  const loopId = activeLoop?.id;
  const loopStatus = activeLoop?.status;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const tick = async () => {
        if (!loopId) {
          if (!cancelled) setIntervals([]);
          return;
        }
        const nextIntervals = await getIntervalsForLoop(db, loopId);
        if (cancelled) return;
        setIntervals(nextIntervals);
        if (loopStatus === 'ACTIVE') {
          setElapsedSeconds(calculateElapsedSeconds(nextIntervals, new Date()));
        }
      };

      void refresh(db);
      void tick();

      if (!loopId || loopStatus !== 'ACTIVE') {
        return () => {
          cancelled = true;
        };
      }

      const timer = setInterval(() => {
        void tick();
      }, 1000);

      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [db, loopId, loopStatus, refresh, setElapsedSeconds])
  );

  return { activeLoop, elapsedSeconds, loading, refresh, intervals };
}
