import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { DEFAULT_DURATION_SECONDS } from '../constants/durationPresets';
import { getSetting, setSetting } from '../database/repositories/settingsRepository';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsStore = {
  defaultDurationSeconds: number;
  themePreference: ThemePreference;
  notificationsEnabled: boolean;
  loaded: boolean;
  load: (db: SQLiteDatabase) => Promise<void>;
  setDefaultDuration: (db: SQLiteDatabase, seconds: number) => Promise<void>;
  setThemePreference: (db: SQLiteDatabase, preference: ThemePreference) => Promise<void>;
  setNotificationsEnabled: (db: SQLiteDatabase, enabled: boolean) => Promise<void>;
};

function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  defaultDurationSeconds: DEFAULT_DURATION_SECONDS,
  themePreference: 'system',
  notificationsEnabled: true,
  loaded: false,

  load: async (db) => {
    const [duration, theme, notifications] = await Promise.all([
      getSetting(db, 'default_duration_seconds'),
      getSetting(db, 'theme'),
      getSetting(db, 'notifications_enabled'),
    ]);
    const parsedDuration = Number(duration);
    set({
      defaultDurationSeconds:
        Number.isFinite(parsedDuration) && parsedDuration > 0
          ? parsedDuration
          : DEFAULT_DURATION_SECONDS,
      themePreference: parseTheme(theme),
      notificationsEnabled: notifications !== 'false',
      loaded: true,
    });
  },

  setDefaultDuration: async (db, seconds) => {
    await setSetting(db, 'default_duration_seconds', String(seconds));
    set({ defaultDurationSeconds: seconds });
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
