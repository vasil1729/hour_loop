import {
  allocateIntervalToDays,
  allocateIntervalToMonths,
  type IntervalRecord,
} from '../timer/timerEngine';
import { getActiveLanguage } from '../../i18n/localeState';

function durationUnits(): { hour: string; minute: string } {
  const language = getActiveLanguage();
  if (language === 'ru') return { hour: ' ч', minute: ' мин' };
  if (language === 'ar') return { hour: ' س', minute: ' د' };
  if (language === 'zh') return { hour: '小时', minute: '分钟' };
  if (language === 'tr') return { hour: ' sa', minute: ' dk' };
  if (language === 'ml') return { hour: ' മണി.', minute: ' മിനി.' };
  if (language === 'it') return { hour: ' h', minute: ' min' };
  if (language === 'fr') return { hour: ' h', minute: ' min' };
  if (language === 'es') return { hour: ' h', minute: ' min' };
  if (language === 'pt') return { hour: ' h', minute: ' min' };
  if (language === 'fa') return { hour: ' ساعت', minute: ' دقیقه' };
  if (language === 'de') return { hour: ' Std.', minute: ' Min.' };
  return { hour: 'h', minute: 'min' };
}

export type IntentionProgress = {
  targetSeconds: number;
  actualSeconds: number;
  ratio: number;
  percent: number;
  remainingSeconds: number;
  reached: boolean;
};

/** Human-readable duration for intention targets, e.g. "5h 30min". */
export function formatIntentionDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const units = durationUnits();

  if (hours > 0 && minutes > 0) {
    return `${hours}${units.hour} ${minutes}${units.minute}`;
  }
  if (hours > 0) return `${hours}${units.hour}`;
  if (minutes > 0) return `${minutes}${units.minute}`;
  return `0${units.minute}`;
}

export function computeIntentionProgress(
  targetSeconds: number,
  actualSeconds: number
): IntentionProgress {
  const safeActual = Math.max(0, actualSeconds);
  const safeTarget = Math.max(0, targetSeconds);
  const ratio =
    safeTarget <= 0
      ? safeActual > 0
        ? 1
        : 0
      : Math.min(1, safeActual / safeTarget);
  const remaining = Math.max(0, safeTarget - safeActual);

  return {
    targetSeconds: safeTarget,
    actualSeconds: safeActual,
    ratio,
    percent: Math.round(ratio * 100),
    remainingSeconds: remaining,
    reached: safeTarget > 0 && remaining === 0,
  };
}

export function allocateIntervalsToDays(
  intervals: IntervalRecord[],
  referenceTime: Date = new Date(),
  timeZone?: string
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const interval of intervals) {
    const days = allocateIntervalToDays(interval, referenceTime, timeZone);
    for (const [dayKey, seconds] of Object.entries(days)) {
      result[dayKey] = (result[dayKey] ?? 0) + seconds;
    }
  }
  return result;
}

export function allocateIntervalsToMonths(
  intervals: IntervalRecord[],
  referenceTime: Date = new Date(),
  timeZone?: string
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const interval of intervals) {
    const months = allocateIntervalToMonths(interval, referenceTime, timeZone);
    for (const [monthKey, seconds] of Object.entries(months)) {
      result[monthKey] = (result[monthKey] ?? 0) + seconds;
    }
  }
  return result;
}

export function actualSecondsForDay(
  intervals: IntervalRecord[],
  dayKey: string,
  referenceTime: Date = new Date(),
  timeZone?: string
): number {
  return allocateIntervalsToDays(intervals, referenceTime, timeZone)[dayKey] ?? 0;
}

export function actualSecondsForMonth(
  intervals: IntervalRecord[],
  monthKey: string,
  referenceTime: Date = new Date(),
  timeZone?: string
): number {
  return (
    allocateIntervalsToMonths(intervals, referenceTime, timeZone)[monthKey] ?? 0
  );
}
