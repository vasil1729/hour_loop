import {
  allocateIntervalToDays,
  allocateIntervalToMonths,
  type IntervalRecord,
} from '../timer/timerEngine';

export type IntentionProgress = {
  targetSeconds: number;
  actualSeconds: number;
  ratio: number;
  percent: number;
  remainingSeconds: number;
  reached: boolean;
};

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
