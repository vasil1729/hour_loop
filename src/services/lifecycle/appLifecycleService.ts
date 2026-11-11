import { AppState, type NativeEventSubscription } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useLoopStore } from '../../store/loopStore';
import { loopService } from '../../features/loops/loopService';
import { syncLoopNotification } from '../notifications/notificationService';

/**
 * Rehydrate display state and reconcile the scheduled target notification
 * whenever the app returns to the foreground.
 */
export async function recoverAppState(
  db: SQLiteDatabase,
  options: { requestPermission?: boolean } = {}
): Promise<void> {
  await useLoopStore.getState().refresh(db);
  const activeLoop = useLoopStore.getState().activeLoop;
  if (activeLoop) {
    await loopService
      .ensureCurrentItemInterval(db, activeLoop.id)
      .catch(() => undefined);
    await syncLoopNotification(db, activeLoop, options);
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
