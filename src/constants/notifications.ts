export const EARLY_WARNING_SETTING_KEY = 'early_warning_minutes';

export const DEFAULT_EARLY_WARNING_MINUTES = 5;

export const EARLY_WARNING_PRESETS_MINUTES = [0, 1, 5, 10, 15, 30] as const;

export const NOTIFICATION_VIBRATION_SETTING_KEY = 'notification_vibration';

export type NotificationVibration = 'long' | 'short' | 'off';

export const DEFAULT_NOTIFICATION_VIBRATION: NotificationVibration = 'long';

export const NOTIFICATION_VIBRATION_PRESETS: readonly NotificationVibration[] = [
  'long',
  'short',
  'off',
];

export const NOTIFICATION_SOUND_SETTING_KEY = 'notification_sound';

export type NotificationSound = 'default' | 'chime' | 'off';

export const DEFAULT_NOTIFICATION_SOUND: NotificationSound = 'default';

export const NOTIFICATION_SOUND_PRESETS: readonly NotificationSound[] = [
  'default',
  'chime',
  'off',
];

export const NOTIFICATION_CHIME_SOUND = 'loop_chime.wav';

export const NOTIFICATION_VIBRATION_PATTERNS: Record<
  Exclude<NotificationVibration, 'off'>,
  number[]
> = {
  long: [0, 1000, 500, 1000, 500, 1000],
  short: [0, 250, 250, 250],
};

export function parseNotificationVibration(
  raw: string | null
): NotificationVibration {
  return raw === 'short' || raw === 'off' || raw === 'long'
    ? raw
    : DEFAULT_NOTIFICATION_VIBRATION;
}

export function parseNotificationSound(raw: string | null): NotificationSound {
  return raw === 'chime' || raw === 'off' || raw === 'default'
    ? raw
    : DEFAULT_NOTIFICATION_SOUND;
}

export function notificationChannelId(
  vibration: NotificationVibration,
  sound: NotificationSound
): string {
  // Android channel sound/vibration are immutable after creation, so the id
  // includes the preferences and a new channel is created on change.
  return `loop-targets-v2-${vibration}-${sound}`;
}

export function parseEarlyWarningMinutes(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_EARLY_WARNING_MINUTES;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_EARLY_WARNING_MINUTES;
  }
  return Math.round(parsed);
}
