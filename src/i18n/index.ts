import { getLocales } from 'expo-localization';

import {
  DEFAULT_LANGUAGE,
  getActiveLanguage,
  type Language,
  type LanguagePreference,
} from './localeState';
import { ar } from './translations/ar';
import { en } from './translations/en';
import { ml } from './translations/ml';
import { ru } from './translations/ru';
import { tr } from './translations/tr';
import { zh } from './translations/zh';
import type {
  TranslationEntry,
  TranslationKey,
  TranslationParams,
} from './types';

export {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getActiveLanguage,
  isRtlLanguage,
  setActiveLanguage,
} from './localeState';
export type { Language, LanguagePreference } from './localeState';
export type { TranslationKey, TranslationParams } from './types';

const dictionaries: Record<Language, Record<TranslationKey, TranslationEntry>> = {
  en,
  ru,
  ar,
  zh,
  tr,
  ml,
};

export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguageCode?: string | null
): Language {
  if (preference !== 'system') return preference;

  const code = (deviceLanguageCode ?? '').toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('zh')) return 'zh';
  if (code.startsWith('tr')) return 'tr';
  if (code.startsWith('ml')) return 'ml';
  return DEFAULT_LANGUAGE;
}

export function getDeviceLanguage(): string {
  try {
    return getLocales()[0]?.languageCode ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function manualPlural(
  language: Language,
  count: number
): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  const absolute = Math.abs(count);
  if (language === 'ar') {
    if (absolute === 0) return 'zero';
    if (absolute === 1) return 'one';
    if (absolute === 2) return 'two';
    const mod100 = absolute % 100;
    if (mod100 >= 3 && mod100 <= 10) return 'few';
    if (mod100 >= 11 && mod100 <= 99) return 'many';
    return 'other';
  }
  if (language === 'ru') {
    const mod10 = absolute % 10;
    const mod100 = absolute % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return 'few';
    }
    return 'many';
  }
  return absolute === 1 ? 'one' : 'other';
}

function selectPlural(
  language: Language,
  forms: Exclude<TranslationEntry, string>,
  count: number
): string {
  return forms[manualPlural(language, count)] ?? forms.other;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const entry =
    dictionaries[language][key] ?? dictionaries[DEFAULT_LANGUAGE][key] ?? key;

  const template =
    typeof entry === 'string'
      ? entry
      : selectPlural(language, entry, Number(params?.count ?? 0));

  return interpolate(template, params);
}

/** Translate with the language currently selected by the provider. */
export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(getActiveLanguage(), key, params);
}

const EXACT_ERROR_KEYS: Record<string, TranslationKey> = {
  'A task needs a title.': 'errors.taskNeedsTitle',
  'A loop is already active or paused. Finish it before starting another.':
    'errors.loopAlreadyActive',
  'Loops can only be started on a task capsule.':
    'errors.loopTaskNotSubtask',
  'This loop is already complete.': 'errors.loopAlreadyComplete',
  'A completed capsule cannot be the current focus.':
    'errors.completedCapsuleCurrent',
  'The app cache directory is unavailable.': 'errors.cacheUnavailable',
  'Sharing is not available on this device.': 'errors.sharingUnavailable',
  'No file was selected.': 'errors.noFileSelected',
  'That backup is too large to import.': 'errors.backupTooLarge',
  'This backup contains loop checklist items, but this app version cannot restore them.':
    'errors.backupChecklistUnsupported',
  'The backup contains inconsistent relationships.':
    'errors.backupInconsistent',
  'A task cannot be moved underneath itself or one of its own capsules.':
    'errors.taskMoveCycle',
  'This file is not an Hour Loop backup.': 'errors.invalidBackup',
};

const BACKUP_PARSE_MESSAGE_PATTERN =
  /^data\.|must be|appears more than once|cannot be its own parent|cannot carry from itself|cycle or an unreachable|has more than one open interval|not active but has an open interval|cannot contain more than one active/;

/**
 * Turns known service errors into localized messages. Unknown messages fall
 * back to the original text so technical details are never hidden.
 */
export function localizeError(
  error: unknown,
  fallbackKey: TranslationKey = 'common.pleaseTryAgain'
): string {
  if (!(error instanceof Error)) return t(fallbackKey);

  const exact = EXACT_ERROR_KEYS[error.message];
  if (exact) return t(exact);

  if (error.name === 'LoopAlreadyActiveError') {
    return t('errors.loopAlreadyActive');
  }
  if (error.name === 'LoopTaskNotSubtaskError') {
    return t('errors.loopTaskNotSubtask');
  }
  if (error.name === 'LoopNotFoundError') {
    return t('errors.loopNotFound');
  }
  if (error.name === 'LoopItemNotFoundError') {
    return t('errors.loopItemNotFound');
  }
  if (error.name === 'LoopTaskNotFoundError') {
    return t('errors.taskNotFound');
  }
  if (error.message.startsWith('Cannot pause a loop with status ')) {
    return t('errors.cannotPause');
  }
  if (error.message.startsWith('Cannot resume a loop with status ')) {
    return t('errors.cannotResume');
  }
  if (BACKUP_PARSE_MESSAGE_PATTERN.test(error.message)) {
    return t('errors.invalidBackup');
  }

  return error.message || t(fallbackKey);
}
