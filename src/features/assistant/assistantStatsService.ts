import type { SQLiteDatabase } from 'expo-sqlite';

import {
  currentDayKey,
  getDeviceTimeZone,
  getWeekDayKeys,
  getZonedParts,
  localDayBounds,
  localMonthBounds,
  startOfWeekDayKey,
} from '../../domain/shared/dateUtils';
import { collectTaskIdsWithDescendants } from '../../domain/tasks/taskDomain';
import { allocateIntervalToDays } from '../../domain/timer/timerEngine';
import { getIntervalsOverlapping } from '../../database/repositories/intervalsRepository';
import { listLoopsForTasks } from '../../database/repositories/loopsRepository';
import { listTasks } from '../../database/repositories/tasksRepository';

export type AssistantFocusPeriod = 'day' | 'week' | 'month';

export type AssistantDayFocus = {
  dayKey: string;
  seconds: number;
};

export type AssistantFocusStats = {
  period: AssistantFocusPeriod;
  startDay: string;
  endDay: string;
  totalSeconds: number;
  loopCount: number;
  activeDays: number;
  days: AssistantDayFocus[];
  taskId: string | null;
  taskTitle: string | null;
};

export class AssistantStatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantStatsError';
  }
}

function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function getAssistantFocusStats(
  db: SQLiteDatabase,
  input: {
    period: AssistantFocusPeriod;
    anchorDate?: string;
    taskId?: string;
  },
  referenceTime: Date = new Date()
): Promise<AssistantFocusStats> {
  const anchor =
    input.anchorDate && isDayKey(input.anchorDate)
      ? input.anchorDate
      : currentDayKey();
  const timeZone = getDeviceTimeZone();

  let startDay: string;
  let endDay: string;
  if (input.period === 'day') {
    startDay = anchor;
    endDay = anchor;
  } else if (input.period === 'week') {
    startDay = startOfWeekDayKey(anchor);
    const days = getWeekDayKeys(startDay);
    endDay = days[days.length - 1] ?? startDay;
  } else {
    const monthKey = anchor.slice(0, 7);
    startDay = `${monthKey}-01`;
    const bounds = localMonthBounds(monthKey, timeZone);
    const last = new Date(bounds.end.getTime() - 1);
    const parts = getZonedParts(last, timeZone);
    endDay = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
      parts.day
    ).padStart(2, '0')}`;
  }

  const rangeStart = localDayBounds(startDay, timeZone).start;
  const rangeEnd = localDayBounds(endDay, timeZone).end;
  const intervals = await getIntervalsOverlapping(
    db,
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );

  let allowedLoopIds: Set<string> | null = null;
  let taskTitle: string | null = null;
  if (input.taskId) {
    const allTasks = await listTasks(db, { includeArchived: true });
    const task = allTasks.find((entry) => entry.id === input.taskId);
    if (!task) {
      throw new AssistantStatsError('Task not found.');
    }
    taskTitle = task.title;
    const ids = collectTaskIdsWithDescendants(allTasks, task.id);
    const loops = await listLoopsForTasks(db, ids);
    allowedLoopIds = new Set(loops.map((loop) => loop.id));
  }

  const byDay = new Map<string, number>();
  const loopIds = new Set<string>();
  for (const interval of intervals) {
    if (allowedLoopIds && !allowedLoopIds.has(interval.loop_id)) continue;
    const allocation = allocateIntervalToDays(interval, referenceTime, timeZone);
    for (const [dayKey, seconds] of Object.entries(allocation)) {
      if (dayKey < startDay || dayKey > endDay) continue;
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + seconds);
      loopIds.add(interval.loop_id);
    }
  }

  const days = Array.from(byDay.entries())
    .map(([dayKey, seconds]) => ({ dayKey, seconds: Math.round(seconds) }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  return {
    period: input.period,
    startDay,
    endDay,
    totalSeconds: days.reduce((sum, entry) => sum + entry.seconds, 0),
    loopCount: loopIds.size,
    activeDays: days.length,
    days,
    taskId: input.taskId ?? null,
    taskTitle,
  };
}
