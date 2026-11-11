export const EARLY_WARNING_SETTING_KEY = 'early_warning_minutes';

export const DEFAULT_EARLY_WARNING_MINUTES = 5;

export const EARLY_WARNING_PRESETS_MINUTES = [0, 1, 5, 10, 15, 30] as const;

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
