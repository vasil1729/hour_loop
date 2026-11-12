import { useEffect } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';

import { loopService } from '../features/loops/loopService';
import { syncLoopNotification } from '../services/notifications/notificationService';
import { useLoopStore } from '../store/loopStore';

/**
 * Keep a global safety timer for the active loop. The visible timer hooks do
 * the same check on their own cadence, but this guard also runs while the user
 * is on another tab, so a loop is paused at its target even when no timer is
 * on screen.
 */
export function useTargetGuard(db: SQLiteDatabase): void {
  const activeLoop = useLoopStore((state) => state.activeLoop);
  const elapsedSeconds = useLoopStore((state) => state.elapsedSeconds);

  const loopId = activeLoop?.id;
  const loopStatus = activeLoop?.status;
  const targetSeconds = activeLoop?.target_duration_seconds ?? 0;

  useEffect(() => {
    if (!loopId || loopStatus !== 'ACTIVE') {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkTarget = async () => {
      const current = await loopService.getActiveLoop(db);
      if (!current || current.status !== 'ACTIVE') {
        return;
      }

      const paused = await loopService.pauseAtTarget(db, current.id);
      if (paused.status === 'PAUSED') {
        await syncLoopNotification(db, paused).catch(() => undefined);
        await useLoopStore.getState().refresh(db);
        return;
      }

      // The guard fired slightly early or another write is in flight. Refresh
      // state and retry while the loop remains active.
      await useLoopStore.getState().refresh(db);
      if (!cancelled) {
        timer = setTimeout(() => {
          void checkTarget().catch(() => undefined);
        }, 1000);
      }
    };

    const remaining = Math.max(0, targetSeconds - elapsedSeconds);
    timer = setTimeout(
      () => {
        void checkTarget().catch(() => undefined);
      },
      remaining * 1000 + 250
    );

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [db, elapsedSeconds, loopId, loopStatus, targetSeconds]);
}
