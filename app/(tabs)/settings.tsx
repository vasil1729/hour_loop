import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';

import { Screen } from '../../src/components/common/Screen';
import {
  DURATION_PRESETS_MINUTES,
  minutesToSeconds,
  secondsToMinutes,
} from '../../src/constants/durationPresets';
import { recoverAppState } from '../../src/services/lifecycle/appLifecycleService';
import {
  cancelAllLoopNotifications,
  requestNotificationPermission,
} from '../../src/services/notifications/notificationService';
import {
  useSettingsStore,
  type ThemePreference,
} from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/ThemeContext';
import { radius, spacing } from '../../src/theme/tokens';

const THEMES: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );
  const themePreference = useSettingsStore((state) => state.themePreference);
  const notificationsEnabled = useSettingsStore(
    (state) => state.notificationsEnabled
  );
  const setDefaultDuration = useSettingsStore((state) => state.setDefaultDuration);
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);
  const setNotificationsEnabled = useSettingsStore(
    (state) => state.setNotificationsEnabled
  );

  const [customMinutes, setCustomMinutes] = useState('');
  const [saving, setSaving] = useState(false);

  const applyDuration = async (seconds: number) => {
    setSaving(true);
    try {
      await setDefaultDuration(db, seconds);
    } catch (error) {
      Alert.alert(
        'Could not save duration',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCustomDuration = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    void applyDuration(minutesToSeconds(minutes)).then(() => setCustomMinutes(''));
  };

  const handleTheme = async (preference: ThemePreference) => {
    try {
      await setThemePreference(db, preference);
    } catch (error) {
      Alert.alert(
        'Could not save theme',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const handleNotifications = async (enabled: boolean) => {
    try {
      if (enabled) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(
            'Notifications are blocked',
            'Enable notifications for Hour Loop in your device settings, then try again.'
          );
          return;
        }
      } else {
        await cancelAllLoopNotifications(db);
      }
      await setNotificationsEnabled(db, enabled);
      if (enabled) {
        await recoverAppState(db, { requestPermission: true });
      }
    } catch (error) {
      Alert.alert(
        'Could not update notifications',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const isPreset = DURATION_PRESETS_MINUTES.some(
    (minutes) => minutesToSeconds(minutes) === defaultDurationSeconds
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          PREFERENCES
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Default loop duration
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          New loops start with this target. Existing loops keep the target they were
          created with.
        </Text>
        <View style={styles.chips}>
          {DURATION_PRESETS_MINUTES.map((minutes) => {
            const selected =
              defaultDurationSeconds === minutesToSeconds(minutes);
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  void applyDuration(minutesToSeconds(minutes));
                }}
                disabled={saving}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {minutes}m
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.customRow}>
          <TextInput
            value={customMinutes}
            onChangeText={(value) =>
              setCustomMinutes(value.replace(/[^0-9]/g, ''))
            }
            placeholder={
              isPreset
                ? 'Custom minutes'
                : `Custom (${secondsToMinutes(defaultDurationSeconds)}m)`
            }
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
            style={[
              styles.customInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply custom duration"
            onPress={handleCustomDuration}
            disabled={saving || !customMinutes}
            style={[
              styles.applyButton,
              {
                backgroundColor: colors.surfaceAlt,
                opacity: saving || !customMinutes ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.applyText, { color: colors.text }]}>Apply</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
        <View style={styles.chips}>
          {THEMES.map((entry) => {
            const selected = themePreference === entry.key;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  void handleTheme(entry.key);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.switchRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.switchBody}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Target notifications
          </Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            Notify me when a running loop reaches its target. Paused loops do not
            notify.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Target notifications"
          value={notificationsEnabled}
          onValueChange={(value) => {
            void handleNotifications(value);
          }}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        <View
          style={[
            styles.aboutCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>
            Hour Loop
          </Text>
          <Text style={[styles.aboutValue, { color: colors.text }]}>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
          <Text style={[styles.aboutBody, { color: colors.textSecondary }]}>
            All data lives in a local SQLite database on this device. No account,
            network, or analytics are used. Data export is planned for a future
            release.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 64,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  applyButton: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  switchBody: {
    flex: 1,
    gap: spacing.xs,
  },
  aboutCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  aboutLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  aboutBody: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
});
