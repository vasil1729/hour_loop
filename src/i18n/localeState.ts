export const SUPPORTED_LANGUAGES = [
  'en',
  'ru',
  'ar',
  'zh',
  'tr',
  'ml',
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export type LanguagePreference = 'system' | Language;

export const DEFAULT_LANGUAGE: Language = 'en';

let activeLanguage: Language = DEFAULT_LANGUAGE;

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

export function isRtlLanguage(language: Language): boolean {
  return language === 'ar';
}
