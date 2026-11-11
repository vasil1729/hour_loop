import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { DEFAULT_DURATION_SECONDS } from '../constants/durationPresets';
import {
  DEFAULT_DAILY_INTENTION_SECONDS,
  DEFAULT_MONTHLY_INTENTION_SECONDS,
} from '../constants/intentions';
import {
  DEFAULT_EARLY_WARNING_MINUTES,
  EARLY_WARNING_SETTING_KEY,
  parseEarlyWarningMinutes,
} from '../constants/notifications';
import { getSetting, setSetting } from '../database/repositories/settingsRepository';
import {
  getDefaultIntentionSeconds,
  setDefaultIntentionSeconds,
} from '../features/intentions/intentionDefaults';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsStore = {
  defaultDurationSeconds: number;
  defaultDailyIntentionSeconds: number;
  defaultMonthlyIntentionSeconds: number;
  earlyWarningMinutes: number;
  themePreference: ThemePreference;
  notificationsEnabled: boolean;
  loaded: boolean;
  load: (db: SQLiteDatabase) => Promise<void>;
  setDefaultDuration: (db: SQLiteDatabase, seconds: number) => Promise<void>;
  setDefaultDailyIntention: (db: SQLiteDatabase, seconds: number) => Promise<void>;
  setDefaultMonthlyIntention: (db: SQLiteDatabase, seconds: number) => Promise<void>;
  setEarlyWarningMinutes: (db: SQLiteDatabase, minutes: number) => Promise<void>;
  setThemePreference: (db: SQLiteDatabase, preference: ThemePreference) => Promise<void>;
  setNotificationsEnabled: (db: SQLiteDatabase, enabled: boolean) => Promise<void>;
};

function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  defaultDurationSeconds: DEFAULT_DURATION_SECONDS,
  defaultDailyIntentionSeconds: DEFAULT_DAILY_INTENTION_SECONDS,
  defaultMonthlyIntentionSeconds: DEFAULT_MONTHLY_INTENTION_SECONDS,
  earlyWarningMinutes: DEFAULT_EARLY_WARNING_MINUTES,
  themePreference: 'system',
  notificationsEnabled: true,
  loaded: false,

  load: async (db) => {
    const [
      duration,
      dailyIntention,
      monthlyIntention,
      earlyWarning,
      theme,
      notifications,
    ] = await Promise.all([
      getSetting(db, 'default_duration_seconds'),
      getDefaultIntentionSeconds(db, 'daily'),
      getDefaultIntentionSeconds(db, 'monthly'),
      getSetting(db, EARLY_WARNING_SETTING_KEY),
      getSetting(db, 'theme'),
      getSetting(db, 'notifications_enabled'),
    ]);
    const parsedDuration = Number(duration);
    set({
      defaultDurationSeconds:
        Number.isFinite(parsedDuration) && parsedDuration > 0
          ? parsedDuration
          : DEFAULT_DURATION_SECONDS,
      defaultDailyIntentionSeconds: dailyIntention,
      defaultMonthlyIntentionSeconds: monthlyIntention,
      earlyWarningMinutes: parseEarlyWarningMinutes(earlyWarning),
      themePreference: parseTheme(theme),
      notificationsEnabled: notifications !== 'false',
      loaded: true,
    });
  },

  setDefaultDuration: async (db, seconds) => {
    await setSetting(db, 'default_duration_seconds', String(seconds));
    set({ defaultDurationSeconds: seconds });
  },

  setDefaultDailyIntention: async (db, seconds) => {
    await setDefaultIntentionSeconds(db, 'daily', seconds);
    set({ defaultDailyIntentionSeconds: Math.max(0, seconds) });
  },

  setDefaultMonthlyIntention: async (db, seconds) => {
    await setDefaultIntentionSeconds(db, 'monthly', seconds);
    set({ defaultMonthlyIntentionSeconds: Math.max(0, seconds) });
  },

  setEarlyWarningMinutes: async (db, minutes) => {
    const normalized = Math.max(0, Math.round(minutes));
    await setSetting(db, EARLY_WARNING_SETTING_KEY, String(normalized));
    set({ earlyWarningMinutes: normalized });
  },

  setThemePreference: async (db, preference) => {
    await setSetting(db, 'theme', preference);
    set({ themePreference: preference });
  },

  setNotificationsEnabled: async (db, enabled) => {
    await setSetting(db, 'notifications_enabled', String(enabled));
    set({ notificationsEnabled: enabled });
  },
}));
