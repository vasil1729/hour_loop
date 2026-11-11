import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Alert, Linking, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getSetting,
  setSetting,
} from '../../database/repositories/settingsRepository';

const EXACT_ALARM_PROMPTED_KEY = 'exact_alarm_prompted';
const ACTION_REQUEST_SCHEDULE_EXACT_ALARM =
  'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';

/**
 * Exact-alarm controls only exist on Android 12 (API 31) and newer. From
 * Android 14, the permission is denied by default for newly installed apps that
 * target Android 13+.
 */
export function supportsExactAlarmSettings(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 31;
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!supportsExactAlarmSettings()) return;

  const packageName = Constants.expoConfig?.android?.package;
  try {
    await IntentLauncher.startActivityAsync(
      ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
      packageName ? { data: `package:${packageName}` } : undefined
    );
  } catch {
    // Some OEM builds do not expose the dedicated screen.
    await Linking.openSettings().catch(() => undefined);
  }
}

/**
 * Explains exact-alarm timing once per install. Android 14+ denies the
 * permission by default for newly installed apps targeting Android 13+, while
 * Android 12/13 grant it by default. The Settings screen exposes the same
 * action on every supported version. The loop still starts when the user
 * dismisses the prompt; Expo Notifications falls back to an inexact alarm.
 */
export async function promptForExactAlarmAccess(
  db: SQLiteDatabase
): Promise<void> {
  if (!supportsExactAlarmSettings() || Number(Platform.Version) < 34) return;

  const alreadyPrompted = await getSetting(db, EXACT_ALARM_PROMPTED_KEY);
  if (alreadyPrompted === 'true') return;

  await setSetting(db, EXACT_ALARM_PROMPTED_KEY, 'true');

  Alert.alert(
    'Keep target alerts on time',
    'Android may delay target notifications when "Alarms & reminders" is off. Allow it for Hour Loop so the alert arrives exactly on time.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          void openExactAlarmSettings();
        },
      },
    ]
  );
}
