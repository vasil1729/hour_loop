import type { SQLiteDatabase } from 'expo-sqlite';
import type { Loop, LoopInterval, LoopItem } from '../../domain/types';
import {
  getDeviceTimeZone,
  toLocalDateKey,
} from '../../domain/shared/dateUtils';
import { createId } from '../../domain/shared/id';
import { calculateElapsedSeconds } from '../../domain/timer/timerEngine';
import * as loopsRepository from '../../database/repositories/loopsRepository';
import type { LoopJournalPatch } from '../../database/repositories/loopsRepository';
import * as intervalsRepository from '../../database/repositories/intervalsRepository';
import * as loopItemsRepository from '../../database/repositories/loopItemsRepository';
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
    super('Loops can only be started on a subtask.');
    this.name = 'LoopTaskNotSubtaskError';
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
};

type LoopItemRepositoryPort = {
  createLoopItem: typeof loopItemsRepository.createLoopItem;
  getLoopItemById: typeof loopItemsRepository.getLoopItemById;
  listLoopItems: typeof loopItemsRepository.listLoopItems;
  updateLoopItemDone: typeof loopItemsRepository.updateLoopItemDone;
};

type TaskRepositoryPort = {
  getTaskById: typeof tasksRepository.getTaskById;
};

export type LoopServiceDeps = {
  loops: LoopRepositoryPort;
  intervals: IntervalRepositoryPort;
  items: LoopItemRepositoryPort;
  tasks: TaskRepositoryPort;
  now: () => Date;
  newId: () => string;
  timeZone: () => string;
};

const defaultDeps: LoopServiceDeps = {
  loops: loopsRepository,
  intervals: intervalsRepository,
  items: loopItemsRepository,
  tasks: tasksRepository,
  now: () => new Date(),
  newId: () => createId(),
  timeZone: getDeviceTimeZone,
};

export type LoopService = {
  startLoop: (db: SQLiteDatabase, input: StartLoopInput) => Promise<Loop>;
  pauseLoop: (db: SQLiteDatabase, loopId: string) => Promise<Loop>;
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
  setLoopItemDone: (
    db: SQLiteDatabase,
    loopId: string,
    itemId: string,
    done: boolean
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
    const intervals = await deps.intervals.getIntervalsForLoop(db, loopId);
    return calculateElapsedSeconds(intervals, deps.now());
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

      const items: LoopItem[] = (input.items ?? [])
        .map((item, index) => ({
          id: deps.newId(),
          loop_id: loop.id,
          text: item.text.trim(),
          done: false,
          sort_order: index,
          carried_from_item_id: item.carriedFromItemId ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        }))
        .filter((item) => item.text.length > 0);

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

      const endedAt = deps.now().toISOString();
      await db.withTransactionAsync(async () => {
        await deps.intervals.closeOpenInterval(db, loopId, endedAt);
        await deps.loops.updateLoopStatus(db, loopId, 'PAUSED', null);
      });

      return requireLoop(db, loopId);
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

    async setLoopItemDone(db, loopId, itemId, done) {
      const item = await deps.items.getLoopItemById(db, itemId);
      if (!item || item.loop_id !== loopId) {
        throw new LoopItemNotFoundError(itemId);
      }
      await deps.items.updateLoopItemDone(db, itemId, done);
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
      return {
        loop,
        intervals,
        elapsedSeconds: calculateElapsedSeconds(intervals, deps.now()),
      };
    },
  };
}

export const loopService = createLoopService();
