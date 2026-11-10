export const DURATION_PRESETS_MINUTES = [25, 45, 60, 90] as const;

export const DEFAULT_DURATION_SECONDS = 60 * 60;

export function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
