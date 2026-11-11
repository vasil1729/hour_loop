import type { Loop, LoopInterval } from '../../domain/types';
import { getDeviceTimeZone, getZonedParts } from '../../domain/shared/dateUtils';

export type LoopClockTickState = 'idle' | 'running' | 'paused';

export type LoopClockModel = {
  ticks: LoopClockTickState[];
  startAngle: number;
  endAngle: number;
  startAt: string;
  endAt: string;
  timeZone: string;
  isLive: boolean;
};

const TICK_COUNT = 60;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

function angleFor(iso: string, timeZone: string): number {
  const parts = getZonedParts(new Date(iso), timeZone);
  const minutes = (parts.hour % 12) * 60 + parts.minute + parts.second / 60;
  return Math.round((minutes / 720) * 360 * 1000) / 1000;
}

function isRunning(intervals: LoopInterval[], timeMs: number): boolean {
  return intervals.some((interval) => {
    const start = Date.parse(interval.started_at);
    if (timeMs < start) return false;
    if (interval.ended_at === null) return true;
    return timeMs < Date.parse(interval.ended_at);
  });
}

/**
 * Builds a 12-hour clock model for the loop's wall-clock span. Each of the 60
 * ticks represents 12 minutes; ticks covered by an active interval are marked
 * running, gaps between intervals are marked paused.
 */
export function buildLoopClock(
  loop: Loop,
  intervals: LoopInterval[],
  referenceTime: Date = new Date()
): LoopClockModel {
  const ordered = [...intervals].sort((a, b) =>
    a.started_at.localeCompare(b.started_at)
  );
  const timeZone = ordered[0]?.time_zone ?? getDeviceTimeZone();
  const startAt = ordered[0]?.started_at ?? loop.started_at;
  const lastEnd = ordered[ordered.length - 1]?.ended_at ?? null;

  let endAt: string;
  if (loop.status === 'ACTIVE') {
    endAt = referenceTime.toISOString();
  } else if (loop.status === 'COMPLETED') {
    endAt = loop.stopped_at ?? lastEnd ?? referenceTime.toISOString();
  } else {
    endAt = lastEnd ?? loop.stopped_at ?? referenceTime.toISOString();
  }

  const startMs = Date.parse(startAt);
  const endMs = Math.max(startMs, Date.parse(endAt));
  const cappedEnd = Math.min(endMs, startMs + DAY_MS);
  const ticks: LoopClockTickState[] = Array(TICK_COUNT).fill('idle');

  for (let time = startMs; time <= cappedEnd; time += MINUTE_MS) {
    const parts = getZonedParts(new Date(time), timeZone);
    const tick =
      Math.floor(((parts.hour % 12) * 60 + parts.minute) / 12) % TICK_COUNT;
    if (isRunning(ordered, time)) {
      ticks[tick] = 'running';
    } else if (ticks[tick] !== 'running') {
      ticks[tick] = 'paused';
    }
  }

  return {
    ticks,
    startAngle: angleFor(startAt, timeZone),
    endAngle: angleFor(endAt, timeZone),
    startAt,
    endAt,
    timeZone,
    isLive: loop.status === 'ACTIVE',
  };
}
