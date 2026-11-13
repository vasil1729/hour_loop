import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Loop,
  LoopInterval,
  LoopItem,
  LoopItemInterval,
} from '../../domain/types';
import {
  getDeviceTimeZone,
  toLocalDateKey,
} from '../../domain/shared/dateUtils';
import { createId } from '../../domain/shared/id';
import {
  calculateElapsedSeconds,
  targetTimeForIntervals,
} from '../../domain/timer/timerEngine';
import * as loopsRepository from '../../database/repositories/loopsRepository';
import type { LoopJournalPatch } from '../../database/repositories/loopsRepository';
import * as intervalsRepository from '../../database/repositories/intervalsRepository';
import * as loopItemsRepository from '../../database/repositories/loopItemsRepository';
import * as loopItemIntervalsRepository from '../../database/repositories/loopItemIntervalsRepository';
import * as tasksRepository from '../../database/repositories/tasksRepository';

export class LoopAlreadyActiveError extends Error {
  constructor() {
    super('A loop is already active or paused. Finish it before starting another.');
    this.name = 'LoopAlreadyActiveError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateTransitionError';
  }
}

export class LoopNotFoundError extends Error {
  constructor(loopId: string) {
    super(`Loop ${loopId} was not found.`);
    this.name = 'LoopNotFoundError';
  }
}

export class LoopItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Loop item ${itemId} was not found in this loop.`);
    this.name = 'LoopItemNotFoundError';
  }
}

export class LoopTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was not found.`);
    this.name = 'LoopTaskNotFoundError';
  }
}

export class LoopTaskNotSubtaskError extends Error {
  constructor() {
    super('Loops can only be started on a task capsule.');
    this.name = 'LoopTaskNotSubtaskError';
  }
}

export class LoopNeedsCapsuleError extends Error {
  constructor() {
    super('A loop needs at least one capsule.');
    this.name = 'LoopNeedsCapsuleError';
  }
}

export class LastLoopCapsuleError extends Error {
  constructor() {
    super(
      'A loop needs at least one capsule. Add a new capsule before deleting this one.'
    );
    this.name = 'LastLoopCapsuleError';
  }
}

export class MissingCurrentCapsuleError extends Error {
  constructor() {
    super('Choose a current capsule while unfinished capsules remain.');
    this.name = 'MissingCurrentCapsuleError';
  }
}

export type StartLoopItemInput = {
  text: string;
  carriedFromItemId?: string | null;
};

export type StartLoopInput = {
  focus?: string | null;
  taskId?: string | null;
  carryIn?: string | null;
  items?: StartLoopItemInput[];
  targetDurationSeconds: number;
};

export type CompleteLoopInput = {
  focus?: string | null;
  carryIn?: string | null;
  done?: string | null;
  rollForward?: string | null;
  rollForwardTaskId?: string | null;
  note?: string | null;
};

type LoopRepositoryPort = {
  createLoop: typeof loopsRepository.createLoop;
  deleteLoop: typeof loopsRepository.deleteLoop;
  getLoopById: typeof loopsRepository.getLoopById;
  getActiveLoop: typeof loopsRepository.getActiveLoop;
  getLatestCompletedLoop: typeof loopsRepository.getLatestCompletedLoop;
  getMaxSequenceForDate: typeof loopsRepository.getMaxSequenceForDate;
  updateLoopStatus: typeof loopsRepository.updateLoopStatus;
  updateLoopJournal: typeof loopsRepository.updateLoopJournal;
};

type IntervalRepositoryPort = {
  createInterval: typeof intervalsRepository.createInterval;
  closeOpenInterval: typeof intervalsRepository.closeOpenInterval;
  getIntervalsForLoop: typeof intervalsRepository.getIntervalsForLoop;
  truncateIntervalsAfter: typeof intervalsRepository.truncateIntervalsAfter;
};

type LoopItemRepositoryPort = {
  createLoopItem: typeof loopItemsRepository.createLoopItem;
  deleteLoopItem: typeof loopItemsRepository.deleteLoopItem;
  getLoopItemById: typeof loopItemsRepository.getLoopItemById;
  listLoopItems: typeof loopItemsRepository.listLoopItems;
  setCurrentLoopItem: typeof loopItemsRepository.setCurrentLoopItem;
  updateLoopItemDone: typeof loopItemsRepository.updateLoopItemDone;
};

type LoopItemIntervalRepositoryPort = {
  createLoopItemInterval: typeof loopItemIntervalsRepository.createLoopItemInterval;
  closeOpenLoopItemIntervals: typeof loopItemIntervalsRepository.closeOpenLoopItemIntervals;
  getOpenLoopItemInterval: typeof loopItemIntervalsRepository.getOpenLoopItemInterval;
  truncateLoopItemIntervalsAfter: typeof loopItemIntervalsRepository.truncateLoopItemIntervalsAfter;
};

type TaskRepositoryPort = {
  getTaskById: typeof tasksRepository.getTaskById;
};

export type LoopServiceDeps = {
  loops: LoopRepositoryPort;
  intervals: IntervalRepositoryPort;
  items: LoopItemRepositoryPort;
  itemIntervals: LoopItemIntervalRepositoryPort;
  tasks: TaskRepositoryPort;
  now: () => Date;
  newId: () => string;
  timeZone: () => string;
};

const defaultDeps: LoopServiceDeps = {
  loops: loopsRepository,
  intervals: intervalsRepository,
  items: loopItemsRepository,
  itemIntervals: loopItemIntervalsRepository,
  tasks: tasksRepository,
  now: () => new Date(),
  newId: () => createId(),
  timeZone: getDeviceTimeZone,
};

export type LoopService = {
  startLoop: (db: SQLiteDatabase, input: StartLoopInput) => Promise<Loop>;
  pauseLoop: (db: SQLiteDatabase, loopId: string) => Promise<Loop>;
  pauseAtTarget: (db: SQLiteDatabase, loopId: string) => Promise<Loop>;
  resumeLoop: (db: SQLiteDatabase, loopId: string) => Promise<Loop>;
  completeLoop: (
    db: SQLiteDatabase,
    loopId: string,
    journal: CompleteLoopInput
  ) => Promise<Loop>;
  deleteLoop: (db: SQLiteDatabase, loopId: string) => Promise<void>;
  getActiveLoop: (db: SQLiteDatabase) => Promise<Loop | null>;
  getLoop: (db: SQLiteDatabase, loopId: string) => Promise<Loop>;
  getLoopItems: (db: SQLiteDatabase, loopId: string) => Promise<LoopItem[]>;
  addLoopItem: (
    db: SQLiteDatabase,
    loopId: string,
    text: string
  ) => Promise<LoopItem>;
  deleteLoopItem: (
    db: SQLiteDatabase,
    loopId: string,
    itemId: string
  ) => Promise<void>;
  setLoopItemDone: (
    db: SQLiteDatabase,
    loopId: string,
    itemId: string,
    done: boolean
  ) => Promise<void>;
  setCurrentLoopItem: (
    db: SQLiteDatabase,
    loopId: string,
    itemId: string | null
  ) => Promise<void>;
  ensureCurrentItemInterval: (
    db: SQLiteDatabase,
    loopId: string
  ) => Promise<void>;
  getPreviousLoopWithItems: (
    db: SQLiteDatabase
  ) => Promise<{ loop: Loop; items: LoopItem[] } | null>;
  getElapsedSeconds: (db: SQLiteDatabase, loopId: string) => Promise<number>;
  getLoopWithElapsed: (
    db: SQLiteDatabase,
    loopId: string
  ) => Promise<{ loop: Loop; intervals: LoopInterval[]; elapsedSeconds: number }>;
};

export function createLoopService(overrides: Partial<LoopServiceDeps> = {}): LoopService {
  const deps: LoopServiceDeps = { ...defaultDeps, ...overrides };

  async function requireLoop(db: SQLiteDatabase, loopId: string): Promise<Loop> {
    const loop = await deps.loops.getLoopById(db, loopId);
    if (!loop) {
      throw new LoopNotFoundError(loopId);
    }
    return loop;
  }

  async function getElapsedSeconds(
    db: SQLiteDatabase,
    loopId: string
  ): Promise<number> {
    const loop = await requireLoop(db, loopId);
    const intervals = await deps.intervals.getIntervalsForLoop(db, loopId);
    const elapsed = calculateElapsedSeconds(intervals, deps.now());
    return Math.min(elapsed, loop.target_duration_seconds);
  }

  async function getCurrentItem(
    db: SQLiteDatabase,
    loopId: string
  ): Promise<LoopItem | null> {
    const items = await deps.items.listLoopItems(db, loopId);
    return items.find((item) => item.current) ?? null;
  }

  async function openItemInterval(
    db: SQLiteDatabase,
    loopId: string,
    itemId: string,
    startedAt: string
  ): Promise<void> {
    const interval: LoopItemInterval = {
      id: deps.newId(),
      loop_id: loopId,
      item_id: itemId,
      started_at: startedAt,
      ended_at: null,
      time_zone: deps.timeZone(),
      created_at: startedAt,
    };
    await deps.itemIntervals.createLoopItemInterval(db, interval);
  }

  async function pauseAtTargetInternal(
    db: SQLiteDatabase,
    loop: Loop,
    intervals: LoopInterval[]
  ): Promise<Loop> {
    const now = deps.now();
    let targetAt = targetTimeForIntervals(
      intervals,
      loop.target_duration_seconds,
      now
    );

    if (!targetAt) {
      const elapsed = calculateElapsedSeconds(intervals, now);
      if (elapsed < loop.target_duration_seconds) {
        return loop;
      }
      // Defensive fallback: if interval math cannot locate the crossing,
      // still stop further growth at the equivalent target instant.
      targetAt = new Date(
        now.getTime() -
          (elapsed - loop.target_duration_seconds) * 1000
      );
    }

    const targetIso = targetAt.toISOString();
    await db.withTransactionAsync(async () => {
      await deps.intervals.truncateIntervalsAfter(db, loop.id, targetIso);
      await deps.itemIntervals.truncateLoopItemIntervalsAfter(
        db,
        loop.id,
        targetIso
      );
      await deps.loops.updateLoopStatus(db, loop.id, 'PAUSED', null);
    });

    return requireLoop(db, loop.id);
  }

  /**
   * Pause an ACTIVE loop, clamping at the target when the target has already
   * been crossed. Shared by the explicit pause action and by the invariant
   * that an active timer must always have a current capsule.
   */
  async function pauseLoopInternal(
    db: SQLiteDatabase,
    loop: Loop
  ): Promise<Loop> {
    if (loop.status !== 'ACTIVE') return loop;
    const intervals = await deps.intervals.getIntervalsForLoop(db, loop.id);
    const elapsed = calculateElapsedSeconds(intervals, deps.now());
    if (elapsed >= loop.target_duration_seconds) {
      return pauseAtTargetInternal(db, loop, intervals);
    }

    const endedAt = deps.now().toISOString();
    await db.withTransactionAsync(async () => {
      await deps.intervals.closeOpenInterval(db, loop.id, endedAt);
      await deps.itemIntervals.closeOpenLoopItemIntervals(db, loop.id, endedAt);
      await deps.loops.updateLoopStatus(db, loop.id, 'PAUSED', null);
    });

    return requireLoop(db, loop.id);
  }

  async function pauseIfNoCurrentCapsule(
    db: SQLiteDatabase,
    loop: Loop
  ): Promise<void> {
    if (loop.status !== 'ACTIVE') return;
    const current = await getCurrentItem(db, loop.id);
    if (current && !current.done) return;

    const items = await deps.items.listLoopItems(db, loop.id);
    const candidate = items.find((item) => !item.done);
    if (candidate) {
      const nowIso = deps.now().toISOString();
      await db.withTransactionAsync(async () => {
        await deps.itemIntervals.closeOpenLoopItemIntervals(
          db,
          loop.id,
          nowIso
        );
        await deps.items.setCurrentLoopItem(db, loop.id, candidate.id);
        await openItemInterval(db, loop.id, candidate.id, nowIso);
      });
      return;
    }

    await pauseLoopInternal(db, loop);
  }

  return {
    async startLoop(db, input) {
      const existing = await deps.loops.getActiveLoop(db);
      if (existing) {
        throw new LoopAlreadyActiveError();
      }

      const taskId = input.taskId?.trim() || null;
      if (taskId) {
        const task = await deps.tasks.getTaskById(db, taskId);
        if (!task) {
          throw new LoopTaskNotFoundError(taskId);
        }
        if (task.parent_task_id === null) {
          throw new LoopTaskNotSubtaskError();
        }
      }

      const now = deps.now();
      const nowIso = now.toISOString();
      const timeZone = deps.timeZone();
      const localDate = toLocalDateKey(now, timeZone);
      const maxSequence = await deps.loops.getMaxSequenceForDate(db, localDate);

      const loop: Loop = {
        id: deps.newId(),
        sequence_number: maxSequence + 1,
        local_date: localDate,
        focus: input.focus?.trim() || null,
        carry_in: input.carryIn?.trim() || null,
        done: null,
        roll_forward: null,
        roll_forward_task_id: null,
        note: null,
        task_id: taskId,
        target_duration_seconds: Math.max(1, Math.round(input.targetDurationSeconds)),
        status: 'ACTIVE',
        started_at: nowIso,
        stopped_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const interval: LoopInterval = {
        id: deps.newId(),
        loop_id: loop.id,
        started_at: nowIso,
        ended_at: null,
        time_zone: timeZone,
        created_at: nowIso,
      };

      const items: LoopItem[] = [];
      for (const item of input.items ?? []) {
        const text = item.text.trim();
        if (!text) continue;
        items.push({
          id: deps.newId(),
          loop_id: loop.id,
          text,
          done: false,
          current: items.length === 0,
          sort_order: items.length,
          carried_from_item_id: item.carriedFromItemId ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      if (items.length === 0) {
        throw new LoopNeedsCapsuleError();
      }

      await db.withTransactionAsync(async () => {
        await deps.loops.createLoop(db, loop);
        await deps.intervals.createInterval(db, interval);
        for (const item of items) {
          await deps.items.createLoopItem(db, item);
        }
      });

      return loop;
    },

    async pauseLoop(db, loopId) {
      const loop = await requireLoop(db, loopId);
      if (loop.status !== 'ACTIVE') {
        throw new InvalidStateTransitionError(
          `Cannot pause a loop with status ${loop.status}.`
        );
      }

      return pauseLoopInternal(db, loop);
    },

    async pauseAtTarget(db, loopId) {
      const loop = await requireLoop(db, loopId);
      if (loop.status === 'COMPLETED') {
        return loop;
      }
      const intervals = await deps.intervals.getIntervalsForLoop(db, loopId);
      const elapsed = calculateElapsedSeconds(intervals, deps.now());
      const needsClamp =
        loop.status === 'ACTIVE'
          ? elapsed >= loop.target_duration_seconds
          : elapsed > loop.target_duration_seconds;
      if (!needsClamp) {
        return loop;
      }
      return pauseAtTargetInternal(db, loop, intervals);
    },

    async resumeLoop(db, loopId) {
      const loop = await requireLoop(db, loopId);
      if (loop.status !== 'PAUSED') {
        throw new InvalidStateTransitionError(
          `Cannot resume a loop with status ${loop.status}.`
        );
      }

      const now = deps.now();
      const nowIso = now.toISOString();
      let currentItem = await getCurrentItem(db, loopId);
      if (!currentItem || currentItem.done) {
        const items = await deps.items.listLoopItems(db, loopId);
        currentItem = items.find((item) => !item.done) ?? null;
      }
      if (!currentItem) {
        throw new MissingCurrentCapsuleError();
      }
      const interval: LoopInterval = {
        id: deps.newId(),
        loop_id: loopId,
        started_at: nowIso,
        ended_at: null,
        time_zone: deps.timeZone(),
        created_at: nowIso,
      };

      await db.withTransactionAsync(async () => {
        await deps.loops.updateLoopStatus(db, loopId, 'ACTIVE', null);
        await deps.intervals.createInterval(db, interval);
        await deps.itemIntervals.closeOpenLoopItemIntervals(
          db,
          loopId,
          nowIso
        );
        await deps.items.setCurrentLoopItem(db, loopId, currentItem.id);
        await openItemInterval(db, loopId, currentItem.id, nowIso);
      });

      return requireLoop(db, loopId);
    },

    async completeLoop(db, loopId, journal) {
      const loop = await requireLoop(db, loopId);
      if (loop.status === 'COMPLETED') {
        throw new InvalidStateTransitionError('This loop is already complete.');
      }

      const nowIso = deps.now().toISOString();
      const patch: LoopJournalPatch = {
        focus: journal.focus?.trim() || null,
        carry_in: journal.carryIn?.trim() || null,
        done: journal.done?.trim() || null,
        roll_forward: journal.rollForward?.trim() || null,
        roll_forward_task_id: journal.rollForwardTaskId ?? null,
        note: journal.note?.trim() || null,
      };

      await db.withTransactionAsync(async () => {
        if (loop.status === 'ACTIVE') {
          await deps.intervals.closeOpenInterval(db, loopId, nowIso);
        }
        await deps.itemIntervals.closeOpenLoopItemIntervals(db, loopId, nowIso);
        await deps.loops.updateLoopJournal(db, loopId, patch);
        await deps.loops.updateLoopStatus(db, loopId, 'COMPLETED', nowIso);
      });

      return requireLoop(db, loopId);
    },

    async deleteLoop(db, loopId) {
      await requireLoop(db, loopId);
      await deps.loops.deleteLoop(db, loopId);
    },

    getActiveLoop(db) {
      return deps.loops.getActiveLoop(db);
    },

    getLoop(db, loopId) {
      return requireLoop(db, loopId);
    },

    getLoopItems(db, loopId) {
      return deps.items.listLoopItems(db, loopId);
    },

    async addLoopItem(db, loopId, text) {
      const loop = await requireLoop(db, loopId);
      if (loop.status === 'COMPLETED') {
        throw new InvalidStateTransitionError('This loop is already complete.');
      }
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error('A capsule needs a title.');
      }
      const existing = await deps.items.listLoopItems(db, loopId);
      const hasCurrent = existing.some((item) => item.current && !item.done);
      const sortOrder =
        existing.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      const nowIso = deps.now().toISOString();
      const item: LoopItem = {
        id: deps.newId(),
        loop_id: loopId,
        text: trimmed,
        done: false,
        current: !hasCurrent,
        sort_order: sortOrder,
        carried_from_item_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      await deps.items.createLoopItem(db, item);
      if (item.current && loop.status === 'ACTIVE') {
        await deps.itemIntervals.closeOpenLoopItemIntervals(
          db,
          loopId,
          nowIso
        );
        await openItemInterval(db, loopId, item.id, nowIso);
      }
      return item;
    },

    async deleteLoopItem(db, loopId, itemId) {
      const loop = await requireLoop(db, loopId);
      if (loop.status === 'COMPLETED') {
        throw new InvalidStateTransitionError('This loop is already complete.');
      }
      const existing = await deps.items.listLoopItems(db, loopId);
      const item = existing.find((entry) => entry.id === itemId);
      if (!item) {
        throw new LoopItemNotFoundError(itemId);
      }
      if (existing.length <= 1) {
        throw new LastLoopCapsuleError();
      }
      const nextCurrent = item.current
        ? existing.find((entry) => entry.id !== itemId && !entry.done) ?? null
        : null;
      const nowIso = deps.now().toISOString();
      await db.withTransactionAsync(async () => {
        if (item.current) {
          await deps.itemIntervals.closeOpenLoopItemIntervals(
            db,
            loopId,
            nowIso
          );
        }
        await deps.items.deleteLoopItem(db, itemId);
        if (item.current) {
          await deps.items.setCurrentLoopItem(
            db,
            loopId,
            nextCurrent?.id ?? null
          );
          if (nextCurrent && loop.status === 'ACTIVE') {
            await openItemInterval(db, loopId, nextCurrent.id, nowIso);
          }
        }
      });
      if (loop.status === 'ACTIVE') {
        await pauseIfNoCurrentCapsule(db, loop);
      }
    },

    async setLoopItemDone(db, loopId, itemId, done) {
      const item = await deps.items.getLoopItemById(db, itemId);
      if (!item || item.loop_id !== loopId) {
        throw new LoopItemNotFoundError(itemId);
      }
      const loop = await requireLoop(db, loopId);
      const existing = await deps.items.listLoopItems(db, loopId);
      const nextCurrent =
        done && item.current
          ? existing.find((entry) => entry.id !== itemId && !entry.done) ?? null
          : null;
      const nowIso = deps.now().toISOString();
      await db.withTransactionAsync(async () => {
        if (done && item.current) {
          await deps.itemIntervals.closeOpenLoopItemIntervals(
            db,
            loopId,
            nowIso
          );
        }
        await deps.items.updateLoopItemDone(db, itemId, done);

        if (done && item.current) {
          await deps.items.setCurrentLoopItem(
            db,
            loopId,
            nextCurrent?.id ?? null
          );
          if (nextCurrent && loop.status === 'ACTIVE') {
            await openItemInterval(db, loopId, nextCurrent.id, nowIso);
          }
        } else if (!done && !item.current) {
          const hasCurrent = existing.some(
            (entry) => entry.current && entry.id !== itemId
          );
          if (!hasCurrent) {
            await deps.items.setCurrentLoopItem(db, loopId, itemId);
            if (loop.status === 'ACTIVE') {
              await openItemInterval(db, loopId, itemId, nowIso);
            }
          }
        }
      });
      if (loop.status === 'ACTIVE') {
        await pauseIfNoCurrentCapsule(db, loop);
      }
    },

    async setCurrentLoopItem(db, loopId, itemId) {
      const loop = await requireLoop(db, loopId);
      if (itemId) {
        const item = await deps.items.getLoopItemById(db, itemId);
        if (!item || item.loop_id !== loopId) {
          throw new LoopItemNotFoundError(itemId);
        }
        if (item.done) {
          throw new InvalidStateTransitionError(
            'A completed capsule cannot be the current focus.'
          );
        }
      } else {
        const existing = await deps.items.listLoopItems(db, loopId);
        if (existing.some((item) => !item.done)) {
          throw new MissingCurrentCapsuleError();
        }
      }
      const nowIso = deps.now().toISOString();
      await db.withTransactionAsync(async () => {
        await deps.itemIntervals.closeOpenLoopItemIntervals(db, loopId, nowIso);
        await deps.items.setCurrentLoopItem(db, loopId, itemId);
        if (itemId && loop.status === 'ACTIVE') {
          await openItemInterval(db, loopId, itemId, nowIso);
        }
      });
      if (loop.status === 'ACTIVE') {
        await pauseIfNoCurrentCapsule(db, loop);
      }
    },

    async ensureCurrentItemInterval(db, loopId) {
      const loop = await requireLoop(db, loopId);
      const isActive = loop.status === 'ACTIVE';
      if (!isActive && loop.status !== 'PAUSED') return;

      const nowIso = deps.now().toISOString();
      let currentItem = await getCurrentItem(db, loopId);

      if (currentItem?.done) {
        await deps.itemIntervals.closeOpenLoopItemIntervals(
          db,
          loopId,
          nowIso
        );
        currentItem = null;
      }

      if (!currentItem) {
        const open = await deps.itemIntervals.getOpenLoopItemInterval(
          db,
          loopId
        );
        if (open) {
          await deps.itemIntervals.closeOpenLoopItemIntervals(
            db,
            loopId,
            nowIso
          );
        }
        const items = await deps.items.listLoopItems(db, loopId);
        const candidate = items.find((item) => !item.done);
        if (!candidate) {
          if (isActive) {
            await pauseLoopInternal(db, loop);
          }
          return;
        }
        await deps.items.setCurrentLoopItem(db, loopId, candidate.id);
        currentItem = candidate;
      }

      if (!isActive) return;

      const open = await deps.itemIntervals.getOpenLoopItemInterval(db, loopId);
      if (open) return;
      await openItemInterval(db, loopId, currentItem.id, nowIso);
    },

    async getPreviousLoopWithItems(db) {
      const loop = await deps.loops.getLatestCompletedLoop(db);
      if (!loop) {
        return null;
      }
      return {
        loop,
        items: await deps.items.listLoopItems(db, loop.id),
      };
    },

    getElapsedSeconds,

    async getLoopWithElapsed(db, loopId) {
      const loop = await requireLoop(db, loopId);
      const intervals = await deps.intervals.getIntervalsForLoop(db, loopId);
      const elapsed = calculateElapsedSeconds(intervals, deps.now());
      return {
        loop,
        intervals,
        elapsedSeconds: Math.min(elapsed, loop.target_duration_seconds),
      };
    },
  };
}

export const loopService = createLoopService();
