import {
  DEFAULT_EARLY_WARNING_MINUTES,
  DEFAULT_NOTIFICATION_SOUND,
  DEFAULT_NOTIFICATION_VIBRATION,
  NOTIFICATION_VIBRATION_PATTERNS,
  notificationChannelId,
  parseEarlyWarningMinutes,
  parseNotificationSound,
  parseNotificationVibration,
} from './notifications';

describe('parseEarlyWarningMinutes', () => {
  it('uses five minutes when no setting exists', () => {
    expect(parseEarlyWarningMinutes(null)).toBe(DEFAULT_EARLY_WARNING_MINUTES);
    expect(DEFAULT_EARLY_WARNING_MINUTES).toBe(5);
  });

  it('preserves an explicit off setting', () => {
    expect(parseEarlyWarningMinutes('0')).toBe(0);
  });

  it('accepts a stored preset value', () => {
    expect(parseEarlyWarningMinutes('15')).toBe(15);
  });

  it('falls back for invalid values', () => {
    expect(parseEarlyWarningMinutes('nope')).toBe(DEFAULT_EARLY_WARNING_MINUTES);
    expect(parseEarlyWarningMinutes('-5')).toBe(DEFAULT_EARLY_WARNING_MINUTES);
  });
});

describe('notification sound and vibration preferences', () => {
  it('defaults to long vibration and the default sound', () => {
    expect(parseNotificationVibration(null)).toBe(DEFAULT_NOTIFICATION_VIBRATION);
    expect(DEFAULT_NOTIFICATION_VIBRATION).toBe('long');
    expect(parseNotificationSound(null)).toBe(DEFAULT_NOTIFICATION_SOUND);
    expect(DEFAULT_NOTIFICATION_SOUND).toBe('default');
  });

  it('accepts the presets and rejects invalid values', () => {
    expect(parseNotificationVibration('short')).toBe('short');
    expect(parseNotificationVibration('off')).toBe('off');
    expect(parseNotificationVibration('huge')).toBe('long');
    expect(parseNotificationSound('chime')).toBe('chime');
    expect(parseNotificationSound('off')).toBe('off');
    expect(parseNotificationSound('airhorn')).toBe('default');
  });

  it('uses a distinct channel id for each preference pair', () => {
    expect(notificationChannelId('long', 'chime')).not.toBe(
      notificationChannelId('short', 'chime')
    );
    expect(notificationChannelId('long', 'chime')).not.toBe(
      notificationChannelId('long', 'default')
    );
  });

  it('uses a longer vibration pattern for long', () => {
    expect(
      NOTIFICATION_VIBRATION_PATTERNS.long.reduce((a, b) => a + b, 0)
    ).toBeGreaterThan(
      NOTIFICATION_VIBRATION_PATTERNS.short.reduce((a, b) => a + b, 0)
    );
  });
});
