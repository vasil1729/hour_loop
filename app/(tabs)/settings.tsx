import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';

import { Button } from '../../src/components/common/Button';
import { Screen } from '../../src/components/common/Screen';
import { AssistantSettings } from '../../src/components/assistant/AssistantSettings';
import { IntentionEditModal } from '../../src/components/intentions/IntentionEditModal';
import {
  DURATION_PRESETS_MINUTES,
  minutesToSeconds,
  secondsToMinutes,
} from '../../src/constants/durationPresets';
import { INTENTION_PRESETS_MINUTES } from '../../src/constants/intentions';
import { EARLY_WARNING_PRESETS_MINUTES } from '../../src/constants/notifications';
import type { HourLoopBackup } from '../../src/domain/backup/backup';
import { formatIntentionDuration } from '../../src/domain/intentions/intentionsDomain';
import {
  currentDayKey,
  currentMonthKey,
  getLanguageLocale,
} from '../../src/domain/shared/dateUtils';
import {
  exportBackup,
  importBackup,
  pickBackupFile,
} from '../../src/features/backup/backupService';
import {
  clearIntention,
  setIntention,
} from '../../src/features/intentions/intentionsService';
import { useIntentions } from '../../src/hooks/useIntentions';
import { localizeError } from '../../src/i18n';
import { useTranslation } from '../../src/i18n/I18nProvider';
import type { LanguagePreference } from '../../src/i18n/localeState';
import type {
  TranslationKey,
  TranslationParams,
} from '../../src/i18n/types';
import { recoverAppState } from '../../src/services/lifecycle/appLifecycleService';
import {
  openExactAlarmSettings,
  supportsExactAlarmSettings,
} from '../../src/services/notifications/exactAlarmService';
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

const THEMES: { key: ThemePreference; labelKey: TranslationKey }[] = [
  { key: 'system', labelKey: 'settings.themeSystem' },
  { key: 'light', labelKey: 'settings.themeLight' },
  { key: 'dark', labelKey: 'settings.themeDark' },
];

const LANGUAGES: { key: LanguagePreference; labelKey: TranslationKey }[] = [
  { key: 'system', labelKey: 'common.system' },
  { key: 'en', labelKey: 'common.english' },
  { key: 'ru', labelKey: 'common.russian' },
  { key: 'ar', labelKey: 'common.arabic' },
  { key: 'zh', labelKey: 'common.chinese' },
  { key: 'tr', labelKey: 'common.turkish' },
  { key: 'ml', labelKey: 'common.malayalam' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { t, isRTL } = useTranslation();
  const defaultDurationSeconds = useSettingsStore(
    (state) => state.defaultDurationSeconds
  );
  const defaultDailyIntentionSeconds = useSettingsStore(
    (state) => state.defaultDailyIntentionSeconds
  );
  const defaultMonthlyIntentionSeconds = useSettingsStore(
    (state) => state.defaultMonthlyIntentionSeconds
  );
  const themePreference = useSettingsStore((state) => state.themePreference);
  const languagePreference = useSettingsStore(
    (state) => state.languagePreference
  );
  const notificationsEnabled = useSettingsStore(
    (state) => state.notificationsEnabled
  );
  const earlyWarningMinutes = useSettingsStore(
    (state) => state.earlyWarningMinutes
  );
  const setDefaultDuration = useSettingsStore((state) => state.setDefaultDuration);
  const setDefaultDailyIntention = useSettingsStore(
    (state) => state.setDefaultDailyIntention
  );
  const setDefaultMonthlyIntention = useSettingsStore(
    (state) => state.setDefaultMonthlyIntention
  );
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);
  const setLanguagePreference = useSettingsStore(
    (state) => state.setLanguagePreference
  );
  const setNotificationsEnabled = useSettingsStore(
    (state) => state.setNotificationsEnabled
  );
  const setEarlyWarningMinutes = useSettingsStore(
    (state) => state.setEarlyWarningMinutes
  );
  const loadSettings = useSettingsStore((state) => state.load);
  const {
    daily: dailyIntention,
    monthly: monthlyIntention,
    refresh: refreshIntentions,
  } = useIntentions();

  const [customMinutes, setCustomMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingIntention, setSavingIntention] = useState(false);
  const [savingCurrentIntention, setSavingCurrentIntention] = useState(false);
  const [editingDefaultIntention, setEditingDefaultIntention] = useState<
    'daily' | 'monthly' | null
  >(null);
  const [editingCurrentIntention, setEditingCurrentIntention] = useState<
    'daily' | 'monthly' | null
  >(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(
    null
  );
  const [assistantReloadToken, setAssistantReloadToken] = useState(0);
  const [defaultsExpanded, setDefaultsExpanded] = useState(false);

  const applyDuration = async (seconds: number) => {
    setSaving(true);
    try {
      await setDefaultDuration(db, seconds);
    } catch (error) {
      Alert.alert(
        t('settings.couldNotSaveDuration'),
        localizeError(error)
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

  const applyDefaultIntention = async (seconds: number) => {
    if (!editingDefaultIntention) return;
    setSavingIntention(true);
    try {
      if (editingDefaultIntention === 'daily') {
        await setDefaultDailyIntention(db, seconds);
      } else {
        await setDefaultMonthlyIntention(db, seconds);
      }
      setEditingDefaultIntention(null);
    } catch (error) {
      Alert.alert(
        t('settings.couldNotSaveDefaultIntention'),
        localizeError(error)
      );
    } finally {
      setSavingIntention(false);
    }
  };

  const applyCurrentIntention = async (seconds: number) => {
    if (!editingCurrentIntention) return;
    setSavingCurrentIntention(true);
    try {
      const periodKey =
        editingCurrentIntention === 'daily'
          ? dailyIntention?.periodKey ?? currentDayKey()
          : monthlyIntention?.periodKey ?? currentMonthKey();
      if (seconds > 0) {
        await setIntention(db, editingCurrentIntention, periodKey, seconds);
      } else {
        await clearIntention(db, editingCurrentIntention, periodKey);
      }
      await refreshIntentions();
      setEditingCurrentIntention(null);
    } catch (error) {
      Alert.alert(
        t('settings.couldNotSaveIntention'),
        localizeError(error)
      );
    } finally {
      setSavingCurrentIntention(false);
    }
  };

  const handleTheme = async (preference: ThemePreference) => {
    try {
      await setThemePreference(db, preference);
    } catch (error) {
      Alert.alert(
        t('settings.couldNotSaveTheme'),
        localizeError(error)
      );
    }
  };

  const handleLanguage = async (preference: LanguagePreference) => {
    try {
      await setLanguagePreference(db, preference);
    } catch (error) {
      Alert.alert(t('settings.couldNotSaveLanguage'), localizeError(error));
    }
  };

  const handleNotifications = async (enabled: boolean) => {
    try {
      if (enabled) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(
            t('settings.notificationsBlocked'),
            t('settings.notificationsBlockedBody')
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
        t('settings.couldNotUpdateNotifications'),
        localizeError(error)
      );
    }
  };

  const handleEarlyWarning = async (minutes: number) => {
    try {
      await setEarlyWarningMinutes(db, minutes);
      if (notificationsEnabled) {
        await recoverAppState(db, { requestPermission: true });
      }
    } catch (error) {
      Alert.alert(
        t('settings.couldNotUpdateWarning'),
        localizeError(error)
      );
    }
  };

  const handleExport = async () => {
    setBackupBusy('export');
    try {
      await exportBackup(db);
    } catch (error) {
      Alert.alert(
        t('settings.exportFailed'),
        localizeError(error)
      );
    } finally {
      setBackupBusy(null);
    }
  };

  const handleImport = async () => {
    setBackupBusy('import');
    try {
      const backup = await pickBackupFile();
      if (!backup) {
        setBackupBusy(null);
        return;
      }
      setBackupBusy(null);
      Alert.alert(
        t('settings.replaceTitle'),
        buildImportMessage(backup, t),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.replaceData'),
            style: 'destructive',
            onPress: () => {
              void performImport(backup);
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        t('settings.importFailed'),
        localizeError(error)
      );
      setBackupBusy(null);
    }
  };

  const performImport = async (backup: HourLoopBackup) => {
    setBackupBusy('import');
    try {
      await cancelAllLoopNotifications(db);
      const result = await importBackup(db, backup);
      await loadSettings(db);
      setAssistantReloadToken((value) => value + 1);
      await recoverAppState(db);

      const pausedNote =
        result.pausedLoops > 0
          ? t('settings.restoredPaused', { count: result.pausedLoops })
          : '';
      Alert.alert(
        t('settings.restoredTitle'),
        `${t('settings.restoredBody', {
          tasks: result.tasks,
          loops: result.loops,
          intervals: result.intervals,
          items: result.loopItems,
          intentions: result.intentions,
        })}${pausedNote}`
      );
    } catch (error) {
      await recoverAppState(db).catch(() => undefined);
      Alert.alert(
        t('settings.couldNotRestore'),
        localizeError(error)
      );
    } finally {
      setBackupBusy(null);
    }
  };

  const isPreset = DURATION_PRESETS_MINUTES.some(
    (minutes) => minutesToSeconds(minutes) === defaultDurationSeconds
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          {t('settings.eyebrow')}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('settings.title')}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.defaultDuration')}
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {t('settings.defaultDurationBody')}
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
                  {minutes}
                  {t('duration.minuteShort')}
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
                ? t('settings.customMinutes')
                : t('settings.customMinutesValue', {
                    minutes: secondsToMinutes(defaultDurationSeconds),
                  })
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
            accessibilityLabel={t('settings.applyCustom')}
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
            <Text style={[styles.applyText, { color: colors.text }]}>
              {t('common.apply')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.todayAndMonth')}
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {t('settings.todayAndMonthBody')}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.changeTodayIntention')}
          onPress={() => setEditingCurrentIntention('daily')}
          style={[
            styles.switchRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.switchBody}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('settings.todayTarget')}
            </Text>
            <View style={styles.intentionValueRow}>
              <Text style={[styles.intentionValue, { color: colors.text }]}>
                {dailyIntention?.targetSeconds
                  ? formatIntentionDuration(dailyIntention.targetSeconds)
                  : t('common.notSet')}
              </Text>
              {dailyIntention?.isDefault ? (
                <View
                  style={[
                    styles.intentionBadge,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.intentionBadgeText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t('settings.defaultBadge')}
                  </Text>
                </View>
              ) : dailyIntention?.intention ? (
                <View
                  style={[
                    styles.intentionBadge,
                    { borderColor: colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.intentionBadgeText,
                      { color: colors.accent },
                    ]}
                  >
                    {t('settings.customBadge')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={[styles.infoChevron, { color: colors.accent }]}>{isRTL ? '‹' : '›'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.changeMonthIntention')}
          onPress={() => setEditingCurrentIntention('monthly')}
          style={[
            styles.switchRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.switchBody}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('settings.monthTarget')}
            </Text>
            <View style={styles.intentionValueRow}>
              <Text style={[styles.intentionValue, { color: colors.text }]}>
                {monthlyIntention?.targetSeconds
                  ? formatIntentionDuration(monthlyIntention.targetSeconds)
                  : t('common.notSet')}
              </Text>
              {monthlyIntention?.isDefault ? (
                <View
                  style={[
                    styles.intentionBadge,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.intentionBadgeText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t('settings.defaultBadge')}
                  </Text>
                </View>
              ) : monthlyIntention?.intention ? (
                <View
                  style={[
                    styles.intentionBadge,
                    { borderColor: colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.intentionBadgeText,
                      { color: colors.accent },
                    ]}
                  >
                    {t('settings.customBadge')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={[styles.infoChevron, { color: colors.accent }]}>{isRTL ? '‹' : '›'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.defaultIntentions')}
          accessibilityState={{ expanded: defaultsExpanded }}
          onPress={() => setDefaultsExpanded((value) => !value)}
          style={styles.defaultsToggle}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('settings.defaultIntentions')}
          </Text>
          <Ionicons
            name={defaultsExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        {defaultsExpanded ? (
          <>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('settings.defaultIntentionsBody')}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.changeDefaultDaily')}
              onPress={() => setEditingDefaultIntention('daily')}
              style={[
                styles.switchRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.switchBody}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('settings.dailyTarget')}
                </Text>
                <Text style={[styles.intentionValue, { color: colors.text }]}>
                  {defaultDailyIntentionSeconds > 0
                    ? formatIntentionDuration(defaultDailyIntentionSeconds)
                    : t('common.notSet')}
                </Text>
              </View>
              <Text style={[styles.infoChevron, { color: colors.accent }]}>
                {isRTL ? '‹' : '›'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.changeDefaultMonthly')}
              onPress={() => setEditingDefaultIntention('monthly')}
              style={[
                styles.switchRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.switchBody}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('settings.monthlyTarget')}
                </Text>
                <Text style={[styles.intentionValue, { color: colors.text }]}>
                  {defaultMonthlyIntentionSeconds > 0
                    ? formatIntentionDuration(defaultMonthlyIntentionSeconds)
                    : t('common.notSet')}
                </Text>
              </View>
              <Text style={[styles.infoChevron, { color: colors.accent }]}>
                {isRTL ? '‹' : '›'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.theme')}
        </Text>
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
                  {t(entry.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.language')}
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {t('settings.languageDescription')}
        </Text>
        <View style={styles.chips}>
          {LANGUAGES.map((entry) => {
            const selected = languagePreference === entry.key;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  void handleLanguage(entry.key);
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
                  {t(entry.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {Platform.OS !== 'web' ? (
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {t('settings.languageRestart')}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.switchRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.switchBody}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('settings.notifications')}
          </Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {t('settings.notificationsBody')}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('settings.notifications')}
          value={notificationsEnabled}
          onValueChange={(value) => {
            void handleNotifications(value);
          }}
          trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.earlyWarning')}
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {t('settings.earlyWarningBody')}
        </Text>
        <View style={styles.chips}>
          {EARLY_WARNING_PRESETS_MINUTES.map((minutes) => {
            const selected = earlyWarningMinutes === minutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{
                  selected,
                  disabled: !notificationsEnabled,
                }}
                disabled={!notificationsEnabled}
                onPress={() => {
                  void handleEarlyWarning(minutes);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                    opacity: notificationsEnabled ? 1 : 0.45,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {minutes === 0
                    ? t('common.off')
                    : `${minutes}${t('duration.minuteShort')}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {supportsExactAlarmSettings() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.openAlarmA11y')}
          onPress={() => {
            void openExactAlarmSettings();
          }}
          style={[
            styles.switchRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.switchBody}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('settings.alarmTiming')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('settings.alarmTimingBody')}
            </Text>
          </View>
          <Text style={[styles.infoChevron, { color: colors.accent }]}>{isRTL ? '‹' : '›'}</Text>
        </Pressable>
      ) : null}

      <AssistantSettings reloadToken={assistantReloadToken} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.backup')}
        </Text>
        <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
          {t('settings.backupBody')}
        </Text>
        <View style={styles.backupActions}>
          <Button
            label={t('settings.export')}
            variant="secondary"
            onPress={() => {
              void handleExport();
            }}
            loading={backupBusy === 'export'}
            disabled={backupBusy !== null}
            style={styles.backupButton}
          />
          <Button
            label={t('settings.import')}
            variant="secondary"
            onPress={() => {
              void handleImport();
            }}
            loading={backupBusy === 'import'}
            disabled={backupBusy !== null}
            style={styles.backupButton}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('settings.about')}
        </Text>
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
            {t('common.version', {
              version: Constants.expoConfig?.version ?? '1.0.0',
            })}
          </Text>
          <Text style={[styles.aboutBody, { color: colors.textSecondary }]}>
            {t('settings.aboutBody')}
          </Text>
          <Text style={[styles.aboutBody, { color: colors.textSecondary }]}>
            {t('settings.license')}
          </Text>
        </View>
      </View>

      <IntentionEditModal
        visible={editingDefaultIntention !== null}
        title={
          editingDefaultIntention === 'monthly'
            ? t('settings.defaultMonthlyIntention')
            : t('settings.defaultDailyIntention')
        }
        initialSeconds={
          editingDefaultIntention === 'monthly'
            ? defaultMonthlyIntentionSeconds
            : defaultDailyIntentionSeconds
        }
        presetMinutes={INTENTION_PRESETS_MINUTES}
        busy={savingIntention}
        clearLabel={t('common.clear')}
        helperText={t('settings.defaultHelper')}
        onSave={(seconds) => {
          void applyDefaultIntention(seconds);
        }}
        onClear={() => {
          void applyDefaultIntention(0);
        }}
        onClose={() => setEditingDefaultIntention(null)}
      />

      <IntentionEditModal
        visible={editingCurrentIntention !== null}
        title={
          editingCurrentIntention === 'monthly'
            ? t('settings.thisMonthIntention')
            : t('settings.todayIntention')
        }
        initialSeconds={
          editingCurrentIntention === 'monthly'
            ? monthlyIntention?.targetSeconds ?? 0
            : dailyIntention?.targetSeconds ?? 0
        }
        presetMinutes={INTENTION_PRESETS_MINUTES}
        busy={savingCurrentIntention}
        clearLabel={t('common.clear')}
        helperText={t('settings.currentHelper')}
        onSave={(seconds) => {
          void applyCurrentIntention(seconds);
        }}
        onClear={() => {
          void applyCurrentIntention(0);
        }}
        onClose={() => setEditingCurrentIntention(null)}
      />
    </Screen>
  );
}

function buildImportMessage(
  backup: HourLoopBackup,
  t: (key: TranslationKey, params?: TranslationParams) => string
): string {
  const { counts } = backup;
  const locale = getLanguageLocale();
  const exportedAt = new Date(backup.exportedAt).toLocaleString(locale);
  const pausedNote = backup.data.loops.some(
    (loop) => loop.status === 'ACTIVE'
  )
    ? t('settings.replaceBodyPaused')
    : '';

  return `${t('settings.replaceBody', {
    tasks: counts.tasks,
    loops: counts.loops,
    intervals: counts.intervals,
    items: counts.loopItems,
    intentions: counts.intentions,
    date: exportedAt,
    version: backup.appVersion,
  })}${pausedNote}`;
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
  intentionValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  intentionValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  intentionBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  intentionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  defaultsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
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
  infoChevron: {
    fontSize: 24,
    fontWeight: '600',
    paddingHorizontal: spacing.xs,
  },
  backupActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backupButton: {
    flex: 1,
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
