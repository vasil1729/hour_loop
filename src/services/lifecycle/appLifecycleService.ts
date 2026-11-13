import { AppState, type NativeEventSubscription } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useLoopStore } from '../../store/loopStore';
import { loopService } from '../../features/loops/loopService';
import {
  reconcileLoopNotifications,
  syncLoopNotification,
} from '../notifications/notificationService';

/**
 * Rehydrate display state and reconcile the scheduled target notification
 * whenever the app returns to the foreground.
 */
export async function recoverAppState(
  db: SQLiteDatabase,
  options: { requestPermission?: boolean } = {}
): Promise<void> {
  let activeLoop = await loopService.getActiveLoop(db);
  if (activeLoop && activeLoop.status === 'ACTIVE') {
    const elapsed = await loopService.getElapsedSeconds(db, activeLoop.id);
    if (elapsed >= activeLoop.target_duration_seconds) {
      activeLoop = await loopService.pauseAtTarget(db, activeLoop.id);
    }
  }

  await useLoopStore.getState().refresh(db);
  const currentLoop = useLoopStore.getState().activeLoop;
  await reconcileLoopNotifications(db, currentLoop?.id ?? null);
  if (currentLoop) {
    await loopService
      .ensureCurrentItemInterval(db, currentLoop.id)
      .catch(() => undefined);
    await syncLoopNotification(db, currentLoop, options);
  }
}

export function subscribeToForeground(
  db: SQLiteDatabase,
  onRecovered?: () => void
): NativeEventSubscription {
  return AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    void recoverAppState(db).then(() => {
      onRecovered?.();
    });
  });
}
