import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { I18nManager, Platform } from 'react-native';

import { setupNotifications } from '../services/notifications/notificationService';
import { useSettingsStore } from '../store/settingsStore';
import {
  getDeviceLanguage,
  resolveLanguage,
  setActiveLanguage,
  translate,
  type Language,
  type TranslationKey,
  type TranslationParams,
} from './index';
import { isRtlLanguage } from './localeState';

type I18nContextValue = {
  language: Language;
  isRTL: boolean;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
}

function applyDirection(language: Language): void {
  const rtl = isRtlLanguage(language);

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    }
    return;
  }

  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) {
    // Native layout direction is applied on the next app launch.
    I18nManager.forceRTL(rtl);
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const preference = useSettingsStore((state) => state.languagePreference);
  const deviceLanguage = useMemo(() => getDeviceLanguage(), []);
  const language = resolveLanguage(preference, deviceLanguage);

  // Keep module-level formatters in sync during the same render that changes
  // the language, before any date or duration string is produced.
  setActiveLanguage(language);

  useEffect(() => {
    applyDirection(language);
    // Channel names/descriptions can be updated; Android keeps the user's
    // sound and importance choices.
    void setupNotifications().catch(() => undefined);
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      isRTL: isRtlLanguage(language),
      t: (key, params) => translate(language, key, params),
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within I18nProvider.');
  }
  return context;
}
