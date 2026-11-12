import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoopItem, Loop } from '../../domain/types';
import {
  getDeviceTimeZone,
  localDayBounds,
} from '../../domain/shared/dateUtils';
import { getLoopItemIntervalsOverlapping } from '../../database/repositories/loopItemIntervalsRepository';
import { getLoopItemsByIds } from '../../database/repositories/loopItemsRepository';
import { getLoopsByIds } from '../../database/repositories/loopsRepository';
import { getTasksByIds } from '../../database/repositories/tasksRepository';

export type DayCapsuleSegment = {
  itemId: string;
  loopId: string;
  startAt: string;
  endAt: string;
  seconds: number;
};

export type DayCapsuleTotal = {
  itemId: string;
  loopId: string;
  text: string;
  loopSequence: number;
  taskId: string | null;
  taskTitle: string | null;
  parentTaskTitle: string | null;
  seconds: number;
};

export type CapsulePeriodData = {
  startDayKey: string;
  endDayKey: string;
  totalSeconds: number;
  segments: DayCapsuleSegment[];
  capsules: DayCapsuleTotal[];
};

export type DayCapsuleData = CapsulePeriodData;

/**
 * Capsule focus intervals clipped to one local day. Open intervals count up to
 * `referenceTime`, so the current day view stays live while a loop runs.
 */
export async function getDayCapsuleData(
  db: SQLiteDatabase,
  dayKey: string,
  referenceTime: Date = new Date()
): Promise<CapsulePeriodData> {
  const timeZone = getDeviceTimeZone();
  const bounds = localDayBounds(dayKey, timeZone);
  return getCapsuleDataForBounds(
    db,
    dayKey,
    dayKey,
    bounds.start,
    bounds.end,
    referenceTime
  );
}

/**
 * Task-first capsule focus totals for an inclusive local-day range. Used by the
 * week and month views of the task overview.
 */
export async function getRangeCapsuleData(
  db: SQLiteDatabase,
  startDayKey: string,
  endDayKey: string,
  referenceTime: Date = new Date()
): Promise<CapsulePeriodData> {
  const timeZone = getDeviceTimeZone();
  const bounds = {
    start: localDayBounds(startDayKey, timeZone).start,
    end: localDayBounds(endDayKey, timeZone).end,
  };
  return getCapsuleDataForBounds(
    db,
    startDayKey,
    endDayKey,
    bounds.start,
    bounds.end,
    referenceTime
  );
}

async function getCapsuleDataForBounds(
  db: SQLiteDatabase,
  startDayKey: string,
  endDayKey: string,
  rangeStart: Date,
  rangeEnd: Date,
  referenceTime: Date
): Promise<CapsulePeriodData> {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const now = referenceTime.getTime();

  const intervals = await getLoopItemIntervalsOverlapping(
    db,
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );

  const segments: DayCapsuleSegment[] = [];
  const secondsByItem = new Map<string, number>();

  for (const interval of intervals) {
    const start = Math.max(Date.parse(interval.started_at), startMs);
    const rawEnd = interval.ended_at
      ? Date.parse(interval.ended_at)
      : Math.min(now, endMs);
    const end = Math.min(rawEnd, endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const seconds = (end - start) / 1000;
    segments.push({
      itemId: interval.item_id,
      loopId: interval.loop_id,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      seconds,
    });
    secondsByItem.set(
      interval.item_id,
      (secondsByItem.get(interval.item_id) ?? 0) + seconds
    );
  }

  const itemIds = Array.from(secondsByItem.keys());
  const loopIds = Array.from(new Set(segments.map((segment) => segment.loopId)));
  const [items, loops] = await Promise.all([
    getLoopItemsByIds(db, itemIds),
    getLoopsByIds(db, loopIds),
  ]);
  const itemById = new Map<string, LoopItem>(items.map((item) => [item.id, item]));
  const loopById = new Map<string, Loop>(loops.map((loop) => [loop.id, loop]));

  const taskIds = Array.from(
    new Set(
      loops
        .map((loop) => loop.task_id)
        .filter((taskId): taskId is string => taskId !== null)
    )
  );
  const directTasks = await getTasksByIds(db, taskIds);
  const parentIds = Array.from(
    new Set(
      directTasks
        .map((task) => task.parent_task_id)
        .filter((parentId): parentId is string => parentId !== null)
    )
  );
  const parentTasks = await getTasksByIds(db, parentIds);
  const taskById = new Map(
    [...directTasks, ...parentTasks].map((task) => [task.id, task])
  );

  const capsules: DayCapsuleTotal[] = [];
  for (const [itemId, seconds] of secondsByItem) {
    const item = itemById.get(itemId);
    const loop = item ? loopById.get(item.loop_id) : undefined;
    if (!item || !loop) continue;
    const task = loop.task_id ? taskById.get(loop.task_id) : undefined;
    const parent = task?.parent_task_id
      ? taskById.get(task.parent_task_id)
      : undefined;
    capsules.push({
      itemId,
      loopId: loop.id,
      text: item.text,
      loopSequence: loop.sequence_number,
      taskId: loop.task_id,
      taskTitle: task?.title ?? null,
      parentTaskTitle: parent?.title ?? null,
      seconds,
    });
  }

  capsules.sort((a, b) => b.seconds - a.seconds || a.text.localeCompare(b.text));
  segments.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    startDayKey,
    endDayKey,
    totalSeconds: capsules.reduce((sum, capsule) => sum + capsule.seconds, 0),
    segments,
    capsules,
  };
}
