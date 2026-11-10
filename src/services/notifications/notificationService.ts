import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop } from '../../domain/types';
import {
  calculateElapsedSeconds,
  remainingSeconds,
} from '../../domain/timer/timerEngine';
import { getIntervalsForLoop } from '../../database/repositories/intervalsRepository';
import {
  deleteSetting,
  getAllSettings,
  getSetting,
  setSetting,
} from '../../database/repositories/settingsRepository';

const CHANNEL_ID = 'loop-targets';

function notificationKey(loopId: string): string {
  return `notif_${loopId}`;
}

export async function setupNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Loop targets',
      description: 'Alerts when a focus loop reaches its target.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7B6EF6',
      sound: 'default',
    });
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function cancelLoopNotification(
  db: SQLiteDatabase,
  loopId: string
): Promise<void> {
  const key = notificationKey(loopId);
  const identifier = await getSetting(db, key);
  if (!identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // The notification may already have fired or been removed by the OS.
  }
  await deleteSetting(db, key);
}

export async function cancelAllLoopNotifications(
  db: SQLiteDatabase
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Ignore platform scheduling errors.
  }
  const settings = await getAllSettings(db);
  for (const setting of settings) {
    if (setting.key.startsWith('notif_')) {
      await deleteSetting(db, setting.key);
    }
  }
}

type SyncOptions = {
  requestPermission?: boolean;
};

/**
 * Cancels any existing target notification and, for an active loop with
 * notifications enabled, schedules a fresh one for the remaining duration.
 */
export async function syncLoopNotification(
  db: SQLiteDatabase,
  loop: Loop,
  options: SyncOptions = {}
): Promise<void> {
  await cancelLoopNotification(db, loop.id);

  if (loop.status !== 'ACTIVE') {
    return;
  }

  const enabled = await getSetting(db, 'notifications_enabled');
  if (enabled === 'false') {
    return;
  }

  const intervals = await getIntervalsForLoop(db, loop.id);
  const elapsed = calculateElapsedSeconds(intervals, new Date());
  const remaining = remainingSeconds(loop.target_duration_seconds, elapsed);
  if (remaining <= 0) {
    return;
  }

  const allowed = options.requestPermission
    ? await requestNotificationPermission()
    : await hasNotificationPermission();
  if (!allowed) {
    return;
  }

  await setupNotifications();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: `H${loop.sequence_number} target reached`,
      body: "You've reached your target. Keep going or close the loop.",
      data: { loopId: loop.id },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(remaining)),
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });

  await setSetting(db, notificationKey(loop.id), identifier);
}
