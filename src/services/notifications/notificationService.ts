import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  EARLY_WARNING_SETTING_KEY,
  parseEarlyWarningMinutes,
} from '../../constants/notifications';
import type { Loop } from '../../domain/types';
import {
  calculateElapsedSeconds,
  formatDurationCompact,
  remainingSeconds,
} from '../../domain/timer/timerEngine';
import { earlyWarningDelaySeconds } from '../../domain/timer/notificationTiming';
import { t } from '../../i18n';
import { getIntervalsForLoop } from '../../database/repositories/intervalsRepository';
import {
  deleteSetting,
  getAllSettings,
  getSetting,
  setSetting,
} from '../../database/repositories/settingsRepository';
import {
  cancelTargetFeedback,
  scheduleTargetFeedback,
} from '../feedback/targetFeedbackService';
import { promptForExactAlarmAccess } from './exactAlarmService';

const CHANNEL_ID = 'loop-targets';

function targetNotificationKey(loopId: string): string {
  return `notif_${loopId}`;
}

function earlyNotificationKey(loopId: string): string {
  return `notif_early_${loopId}`;
}

export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // The handler only runs while the app is in the foreground. Loop targets
      // get their chime and haptic in-app, so keep the OS presentation silent
      // to avoid a double alert. Background delivery still uses the channel's
      // sound and vibration.
      const isTargetAlert =
        notification.request.content.data?.kind === 'target';

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        // Target alerts have an in-app chime in the foreground. Early warnings
        // should still make a sound so they are not missed.
        shouldPlaySound: !isTargetAlert,
        shouldSetBadge: false,
      };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t('notifications.channelName'),
      description: t('notifications.channelDescription'),
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

async function cancelScheduledNotification(
  db: SQLiteDatabase,
  key: string
): Promise<void> {
  const identifier = await getSetting(db, key);
  if (!identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // The notification may already have fired or been removed by the OS.
  }
  await deleteSetting(db, key);
}

export async function cancelLoopNotification(
  db: SQLiteDatabase,
  loopId: string
): Promise<void> {
  // Only one loop can be active at a time, so any scheduled in-app feedback is
  // stale once we are cancelling a loop.
  cancelTargetFeedback();
  await Promise.all([
    cancelScheduledNotification(db, targetNotificationKey(loopId)),
    cancelScheduledNotification(db, earlyNotificationKey(loopId)),
  ]);
}

/**
 * Drops every scheduled loop notification that does not belong to the current
 * active loop. This clears notifications left behind by a completed/deleted
 * loop when the app was killed before it could cancel them.
 */
export async function reconcileLoopNotifications(
  db: SQLiteDatabase,
  activeLoopId: string | null
): Promise<void> {
  cancelTargetFeedback();

  const settings = await getAllSettings(db);
  const activeTargetKey = activeLoopId ? targetNotificationKey(activeLoopId) : null;
  const activeEarlyKey = activeLoopId ? earlyNotificationKey(activeLoopId) : null;

  for (const setting of settings) {
    if (!setting.key.startsWith('notif_')) continue;
    if (setting.key === activeTargetKey || setting.key === activeEarlyKey) {
      continue;
    }
    await cancelScheduledNotification(db, setting.key);
  }
}

export async function cancelAllLoopNotifications(
  db: SQLiteDatabase
): Promise<void> {
  cancelTargetFeedback();

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
 * Cancels existing target/early-warning notifications and, for an active loop
 * with notifications enabled, schedules fresh ones for the remaining duration.
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

  // Keep the foreground alert on time even when notification permission is
  // missing or Android falls back to an inexact alarm.
  scheduleTargetFeedback(loop.id, remaining);

  const allowed = options.requestPermission
    ? await requestNotificationPermission()
    : await hasNotificationPermission();
  if (!allowed) {
    return;
  }

  await setupNotifications();

  const targetIdentifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notifications.targetTitle', {
        sequence: loop.sequence_number,
      }),
      body: t('notifications.targetBody'),
      data: { loopId: loop.id, kind: 'target' },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(remaining)),
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });

  await setSetting(db, targetNotificationKey(loop.id), targetIdentifier);

  const earlyWarningMinutes = parseEarlyWarningMinutes(
    await getSetting(db, EARLY_WARNING_SETTING_KEY)
  );
  const earlyDelay = earlyWarningDelaySeconds(remaining, earlyWarningMinutes);
  if (earlyDelay !== null) {
    const warningSeconds = Math.round(earlyWarningMinutes * 60);
    try {
      const earlyIdentifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notifications.earlyTitle', {
            sequence: loop.sequence_number,
          }),
          body: t('notifications.earlyBody', {
            duration: formatDurationCompact(warningSeconds),
          }),
          data: { loopId: loop.id, kind: 'early' },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: earlyDelay,
          channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        },
      });
      await setSetting(db, earlyNotificationKey(loop.id), earlyIdentifier);
    } catch {
      // The target notification is already scheduled; early warning is optional.
    }
  }

  if (options.requestPermission) {
    // Do not block loop start/navigation on this one-time explanation.
    void promptForExactAlarmAccess(db).catch(() => undefined);
  }
}
