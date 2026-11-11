import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoopItem, Loop } from '../../domain/types';
import {
  getDeviceTimeZone,
  localDayBounds,
} from '../../domain/shared/dateUtils';
import { getLoopItemIntervalsOverlapping } from '../../database/repositories/loopItemIntervalsRepository';
import { getLoopItemsByIds } from '../../database/repositories/loopItemsRepository';
import { getLoopsByIds } from '../../database/repositories/loopsRepository';

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
  seconds: number;
};

export type DayCapsuleData = {
  dayKey: string;
  totalSeconds: number;
  segments: DayCapsuleSegment[];
  capsules: DayCapsuleTotal[];
};

/**
 * Capsule focus intervals clipped to one local day. Open intervals count up to
 * `referenceTime`, so the current day view stays live while a loop runs.
 */
export async function getDayCapsuleData(
  db: SQLiteDatabase,
  dayKey: string,
  referenceTime: Date = new Date()
): Promise<DayCapsuleData> {
  const timeZone = getDeviceTimeZone();
  const bounds = localDayBounds(dayKey, timeZone);
  const dayStart = bounds.start.getTime();
  const dayEnd = bounds.end.getTime();
  const now = referenceTime.getTime();

  const intervals = await getLoopItemIntervalsOverlapping(
    db,
    bounds.start.toISOString(),
    bounds.end.toISOString()
  );

  const segments: DayCapsuleSegment[] = [];
  const secondsByItem = new Map<string, number>();

  for (const interval of intervals) {
    const start = Math.max(Date.parse(interval.started_at), dayStart);
    const rawEnd = interval.ended_at
      ? Date.parse(interval.ended_at)
      : Math.min(now, dayEnd);
    const end = Math.min(rawEnd, dayEnd);
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

  const capsules: DayCapsuleTotal[] = [];
  for (const [itemId, seconds] of secondsByItem) {
    const item = itemById.get(itemId);
    const loop = item ? loopById.get(item.loop_id) : undefined;
    if (!item || !loop) continue;
    capsules.push({
      itemId,
      loopId: loop.id,
      text: item.text,
      loopSequence: loop.sequence_number,
      taskId: loop.task_id,
      seconds,
    });
  }

  capsules.sort((a, b) => b.seconds - a.seconds || a.text.localeCompare(b.text));
  segments.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    dayKey,
    totalSeconds: capsules.reduce((sum, capsule) => sum + capsule.seconds, 0),
    segments,
    capsules,
  };
}
