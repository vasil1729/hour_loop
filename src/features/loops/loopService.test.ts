import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  Loop,
  LoopInterval,
  LoopItem,
  LoopItemInterval,
  Task,
} from '../../domain/types';
import type { LoopJournalPatch } from '../../database/repositories/loopsRepository';
import {
  createLoopService,
  InvalidStateTransitionError,
  LastLoopCapsuleError,
  LoopAlreadyActiveError,
  LoopItemNotFoundError,
  LoopNeedsCapsuleError,
  LoopNotFoundError,
  LoopTaskNotFoundError,
  LoopTaskNotSubtaskError,
  MissingCurrentCapsuleError,
  type LoopServiceDeps,
} from './loopService';

type FakeState = {
  now: Date;
  idCounter: number;
  tasks: Task[];
  loops: Loop[];
  intervals: LoopInterval[];
  items: LoopItem[];
  itemIntervals: LoopItemInterval[];
};

function createHarness() {
  const state: FakeState = {
    now: new Date('2026-01-01T10:00:00.000Z'),
    idCounter: 0,
    tasks: [],
    loops: [],
    intervals: [],
    items: [],
    itemIntervals: [],
  };

  const db = {
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  } as unknown as SQLiteDatabase;

  const deps: LoopServiceDeps = {
    now: () => new Date(state.now.getTime()),
    newId: () => {
      state.idCounter += 1;
      return `id-${state.idCounter}`;
    },
    timeZone: () => 'UTC',
    loops: {
      createLoop: async (_db, loop) => {
        state.loops.push({ ...loop });
      },
      deleteLoop: async (_db, id) => {
        state.loops = state.loops.filter((loop) => loop.id !== id);
        state.intervals = state.intervals.filter((interval) => interval.loop_id !== id);
        state.items = state.items.filter((item) => item.loop_id !== id);
        state.itemIntervals = state.itemIntervals.filter(
          (interval) => interval.loop_id !== id
        );
      },
      getLoopById: async (_db, id) => {
        const loop = state.loops.find((entry) => entry.id === id);
        return loop ? { ...loop } : null;
      },
      getActiveLoop: async () => {
        const loop = state.loops.find(
          (entry) => entry.status === 'ACTIVE' || entry.status === 'PAUSED'
        );
        return loop ? { ...loop } : null;
      },
      getLatestCompletedLoop: async () =>
        [...state.loops]
          .filter((entry) => entry.status === 'COMPLETED')
          .sort((a, b) => (b.stopped_at ?? '').localeCompare(a.stopped_at ?? ''))[0] ??
        null,
      getMaxSequenceForDate: async (_db, localDate) =>
        Math.max(
          0,
          ...state.loops
            .filter((loop) => loop.local_date === localDate)
            .map((loop) => loop.sequence_number)
        ),
      updateLoopStatus: async (_db, id, status, stoppedAt) => {
        const loop = state.loops.find((entry) => entry.id === id);
        if (loop) {
          loop.status = status;
          loop.stopped_at = stoppedAt;
          loop.updated_at = state.now.toISOString();
        }
      },
      updateLoopJournal: async (_db, id, patch: LoopJournalPatch) => {
        const loop = state.loops.find((entry) => entry.id === id);
        if (loop) {
          Object.assign(loop, patch);
          loop.updated_at = state.now.toISOString();
        }
      },
    },
    intervals: {
      createInterval: async (_db, interval) => {
        state.intervals.push({ ...interval });
      },
      closeOpenInterval: async (_db, loopId, endedAt) => {
        for (const interval of state.intervals) {
          if (interval.loop_id === loopId && interval.ended_at === null) {
            interval.ended_at = endedAt;
          }
        }
      },
      getIntervalsForLoop: async (_db, loopId) =>
        state.intervals
          .filter((interval) => interval.loop_id === loopId)
          .sort((a, b) => a.started_at.localeCompare(b.started_at)),
      truncateIntervalsAfter: async (_db, loopId, endedAt) => {
        state.intervals = state.intervals.filter(
          (interval) =>
            interval.loop_id !== loopId || interval.started_at < endedAt
        );
        for (const interval of state.intervals) {
          if (
            interval.loop_id === loopId &&
            interval.started_at < endedAt &&
            (interval.ended_at === null || interval.ended_at > endedAt)
          ) {
            interval.ended_at = endedAt;
          }
        }
      },
    },
    tasks: {
      getTaskById: async (_db, id) => {
        const task = state.tasks.find((entry) => entry.id === id);
        return task ? { ...task } : null;
      },
    },
    items: {
      createLoopItem: async (_db, item) => {
        state.items.push({ ...item });
      },
      deleteLoopItem: async (_db, id) => {
        state.items = state.items.filter((item) => item.id !== id);
        state.itemIntervals = state.itemIntervals.filter(
          (interval) => interval.item_id !== id
        );
      },
      getLoopItemById: async (_db, id) => {
        const item = state.items.find((entry) => entry.id === id);
        return item ? { ...item } : null;
      },
      listLoopItems: async (_db, loopId) =>
        state.items
          .filter((item) => item.loop_id === loopId)
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order ||
              a.created_at.localeCompare(b.created_at)
          )
          .map((item) => ({ ...item })),
      updateLoopItemDone: async (_db, id, done) => {
        const item = state.items.find((entry) => entry.id === id);
        if (item) {
          item.done = done;
          if (done) item.current = false;
          item.updated_at = state.now.toISOString();
        }
      },
      setCurrentLoopItem: async (_db, loopId, itemId) => {
        for (const item of state.items) {
          if (item.loop_id !== loopId) continue;
          item.current = item.id === itemId;
          item.updated_at = state.now.toISOString();
        }
      },
    },
    itemIntervals: {
      createLoopItemInterval: async (_db, interval) => {
        state.itemIntervals.push({ ...interval });
      },
      closeOpenLoopItemIntervals: async (_db, loopId, endedAt) => {
        for (const interval of state.itemIntervals) {
          if (interval.loop_id === loopId && interval.ended_at === null) {
            interval.ended_at = endedAt;
          }
        }
      },
      getOpenLoopItemInterval: async (_db, loopId) =>
        state.itemIntervals.find(
          (interval) => interval.loop_id === loopId && interval.ended_at === null
        ) ?? null,
      truncateLoopItemIntervalsAfter: async (_db, loopId, endedAt) => {
        state.itemIntervals = state.itemIntervals.filter(
          (interval) =>
            interval.loop_id !== loopId || interval.started_at < endedAt
        );
        for (const interval of state.itemIntervals) {
          if (
            interval.loop_id === loopId &&
            interval.started_at < endedAt &&
            (interval.ended_at === null || interval.ended_at > endedAt)
          ) {
            interval.ended_at = endedAt;
          }
        }
      },
    },
  };

  const service = createLoopService(deps);

  return {
    state,
    db,
    service,
    serviceDeps: deps,
    advanceSeconds(seconds: number) {
      state.now = new Date(state.now.getTime() + seconds * 1000);
    },
  };
}

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parent_task_id: null,
    description: null,
    status: 'NOT_STARTED',
    sort_order: 0,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    completed_at: null,
    archived_at: null,
    ...overrides,
  };
}

describe('loopService', () => {
  it('starts a loop with an open interval and per-day sequence number', async () => {
    const { db, service } = createHarness();

    const loop = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });

    expect(loop.status).toBe('ACTIVE');
    expect(loop.sequence_number).toBe(1);
    expect(loop.local_date).toBe('2026-01-01');
    expect(loop.started_at).toBe('2026-01-01T10:00:00.000Z');
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(0);
  });

  it('rejects a top-level task container as a loop target', async () => {
    const harness = createHarness();
    harness.state.tasks.push(makeTask({ id: 'container', title: 'Container' }));

    await expect(
      harness.service.startLoop(harness.db, {
        targetDurationSeconds: 3600,
        taskId: 'container',
        items: [{ text: 'Focus' }],
      })
    ).rejects.toBeInstanceOf(LoopTaskNotSubtaskError);
  });

  it('starts a loop on a subtask', async () => {
    const harness = createHarness();
    harness.state.tasks.push(
      makeTask({ id: 'container', title: 'Container' }),
      makeTask({
        id: 'subtask',
        title: 'Subtask',
        parent_task_id: 'container',
      })
    );

    const loop = await harness.service.startLoop(harness.db, {
      targetDurationSeconds: 3600,
      taskId: 'subtask',
      items: [{ text: 'Focus' }],
    });

    expect(loop.task_id).toBe('subtask');
  });

  it('rejects a missing subtask target', async () => {
    const harness = createHarness();

    await expect(
      harness.service.startLoop(harness.db, {
        targetDurationSeconds: 3600,
        taskId: 'missing',
        items: [{ text: 'Focus' }],
      })
    ).rejects.toBeInstanceOf(LoopTaskNotFoundError);
  });

  it('rejects starting a second loop while one is active', async () => {
    const { db, service } = createHarness();
    await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });

    await expect(
      service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] })
    ).rejects.toBeInstanceOf(LoopAlreadyActiveError);
  });

  it('freezes elapsed time on pause and continues on resume', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });

    harness.advanceSeconds(600);
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(600);

    const paused = await service.pauseLoop(db, loop.id);
    expect(paused.status).toBe('PAUSED');

    harness.advanceSeconds(300);
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(600);

    const resumed = await service.resumeLoop(db, loop.id);
    expect(resumed.status).toBe('ACTIVE');

    harness.advanceSeconds(120);
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(720);
  });

  it('rejects pausing a completed loop', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });
    await service.completeLoop(db, loop.id, {});

    await expect(service.pauseLoop(db, loop.id)).rejects.toBeInstanceOf(
      InvalidStateTransitionError
    );
    await expect(service.resumeLoop(db, loop.id)).rejects.toBeInstanceOf(
      InvalidStateTransitionError
    );
  });

  it('walks the full start → pause → resume → complete transition sequence', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const started = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });
    const paused = await service.pauseLoop(db, started.id);
    const resumed = await service.resumeLoop(db, started.id);
    harness.advanceSeconds(90);
    const completed = await service.completeLoop(db, started.id, {
      done: 'Shipped the timer',
    });

    expect([started.status, paused.status, resumed.status, completed.status]).toEqual([
      'ACTIVE',
      'PAUSED',
      'ACTIVE',
      'COMPLETED',
    ]);
    expect(completed.stopped_at).toBe('2026-01-01T10:01:30.000Z');
    expect(completed.done).toBe('Shipped the timer');
    expect(await service.getElapsedSeconds(db, started.id)).toBe(90);
    expect(await service.getActiveLoop(db)).toBeNull();
  });

  it('keeps elapsed time stable across a simulated app restart', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });
    harness.advanceSeconds(245);
    const before = await service.getElapsedSeconds(db, loop.id);

    const restarted = createLoopService({
      now: () => new Date(harness.state.now.getTime()),
      newId: () => 'new-id',
      timeZone: () => 'UTC',
      loops: harness.serviceDeps.loops,
      intervals: harness.serviceDeps.intervals,
    });

    expect(await restarted.getElapsedSeconds(db, loop.id)).toBe(before);
    expect(before).toBe(245);
  });

  it('increments the sequence number for a second loop on the same day', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const first = await service.startLoop(db, { targetDurationSeconds: 600, items: [{ text: 'Focus' }] });
    await service.completeLoop(db, first.id, {});
    const second = await service.startLoop(db, { targetDurationSeconds: 600, items: [{ text: 'Focus' }] });

    expect(second.sequence_number).toBe(2);
  });

  it('pauses exactly at the target when auto-stopped', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 60, items: [{ text: 'Focus' }] });

    harness.advanceSeconds(90);
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(60);
    const paused = await service.pauseAtTarget(db, loop.id);

    expect(paused.status).toBe('PAUSED');
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(60);
    expect(harness.state.intervals[0]?.ended_at).toBe(
      '2026-01-01T10:01:00.000Z'
    );
  });

  it('does not pause before the target', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 60, items: [{ text: 'Focus' }] });

    harness.advanceSeconds(30);
    const unchanged = await service.pauseAtTarget(db, loop.id);

    expect(unchanged.status).toBe('ACTIVE');
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(30);
  });

  it('trims overtime when the pause action lands after the target', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 60, items: [{ text: 'Focus' }] });

    harness.advanceSeconds(75);
    const paused = await service.pauseLoop(db, loop.id);

    expect(paused.status).toBe('PAUSED');
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(60);
  });

  it('persists the completion journal fields', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      focus: 'Write tests',
      items: [{ text: 'Focus' }],
    });
    await service.completeLoop(db, loop.id, {
      focus: 'Write better tests',
      carryIn: 'Yesterday note',
      done: 'Added coverage',
      rollForward: 'Add integration tests',
      note: 'Deep work felt good',
    });

    const completed = await service.getLoop(db, loop.id);
    expect(completed).toMatchObject({
      focus: 'Write better tests',
      carry_in: 'Yesterday note',
      done: 'Added coverage',
      roll_forward: 'Add integration tests',
      note: 'Deep work felt good',
      status: 'COMPLETED',
    });
  });

  it('deletes a loop and its intervals', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600, items: [{ text: 'Focus' }] });
    await service.completeLoop(db, loop.id, {});

    expect(state.intervals).toHaveLength(1);

    await service.deleteLoop(db, loop.id);

    await expect(service.getLoop(db, loop.id)).rejects.toBeInstanceOf(
      LoopNotFoundError
    );
    expect(state.loops).toHaveLength(0);
    expect(state.intervals).toHaveLength(0);
  });

  it('rejects deleting a loop that does not exist', async () => {
    const { db, service } = createHarness();

    await expect(service.deleteLoop(db, 'missing-loop')).rejects.toBeInstanceOf(
      LoopNotFoundError
    );
  });

  it('starts a loop with ordered, trimmed capsules and carry provenance', async () => {
    const { db, service } = createHarness();

    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [
        { text: '  Draft the outline  ' },
        { text: 'Review notes', carriedFromItemId: 'old-item' },
        { text: '   ' },
      ],
    });

    const items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.text)).toEqual([
      'Draft the outline',
      'Review notes',
    ]);
    expect(items.map((item) => item.sort_order)).toEqual([0, 1]);
    expect(items[1]?.carried_from_item_id).toBe('old-item');
    expect(items.every((item) => item.done === false)).toBe(true);
  });

  it('toggles a loop item and rejects items from another loop', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'One item' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    await service.setLoopItemDone(db, loop.id, item.id, true);
    expect((await service.getLoopItems(db, loop.id))[0]?.done).toBe(true);

    await expect(
      service.setLoopItemDone(db, 'another-loop', item.id, false)
    ).rejects.toBeInstanceOf(LoopItemNotFoundError);
  });

  it('adds a capsule to an existing loop with the next sort order', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });

    const added = await service.addLoopItem(db, loop.id, '  Third  ');
    const items = await service.getLoopItems(db, loop.id);

    expect(added.text).toBe('Third');
    expect(added.done).toBe(false);
    expect(added.current).toBe(false);
    expect(items.map((item) => item.text)).toEqual(['First', 'Second', 'Third']);
    expect(items.map((item) => item.sort_order)).toEqual([0, 1, 2]);
  });

  it('deletes a capsule and rejects capsules from another loop', async () => {
    const { db, service } = createHarness();
    const firstLoop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Keep' }, { text: 'Remove' }],
    });
    const [keep, remove] = await service.getLoopItems(db, firstLoop.id);
    if (!keep || !remove) throw new Error('Expected two items');

    await service.deleteLoopItem(db, firstLoop.id, remove.id);
    expect(
      (await service.getLoopItems(db, firstLoop.id)).map((item) => item.id)
    ).toEqual([keep.id]);

    await service.completeLoop(db, firstLoop.id, {});
    const secondLoop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Focus' }],
    });

    await expect(
      service.deleteLoopItem(db, secondLoop.id, keep.id)
    ).rejects.toBeInstanceOf(LoopItemNotFoundError);
  });

  it('moves focus to the next capsule when the current capsule is deleted', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Current' }, { text: 'Next' }],
    });
    const [current, next] = await service.getLoopItems(db, loop.id);
    if (!current || !next) throw new Error('Expected two items');

    await service.setCurrentLoopItem(db, loop.id, current.id);
    harness.advanceSeconds(60);
    await service.deleteLoopItem(db, loop.id, current.id);

    const items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.id)).toEqual([next.id]);
    expect(items[0]?.current).toBe(true);
    expect(state.itemIntervals).toHaveLength(1);
    expect(state.itemIntervals[0]?.item_id).toBe(next.id);
    expect(state.itemIntervals[0]?.ended_at).toBeNull();
  });

  it('rejects deleting the last capsule', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Only capsule' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    await expect(
      service.deleteLoopItem(db, loop.id, item.id)
    ).rejects.toBeInstanceOf(LastLoopCapsuleError);
    expect(await service.getLoopItems(db, loop.id)).toHaveLength(1);
  });

  it('requires at least one capsule to start a loop', async () => {
    const { db, service } = createHarness();

    await expect(
      service.startLoop(db, { targetDurationSeconds: 3600 })
    ).rejects.toBeInstanceOf(LoopNeedsCapsuleError);
    await expect(
      service.startLoop(db, {
        targetDurationSeconds: 3600,
        items: [{ text: '   ' }],
      })
    ).rejects.toBeInstanceOf(LoopNeedsCapsuleError);
  });

  it('sets only one current capsule per loop', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });
    const [first, second] = await service.getLoopItems(db, loop.id);
    if (!first || !second) throw new Error('Expected two items');

    await service.setCurrentLoopItem(db, loop.id, first.id);
    let items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.current)).toEqual([true, false]);

    await service.setCurrentLoopItem(db, loop.id, second.id);
    items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.current)).toEqual([false, true]);

    await expect(
      service.setCurrentLoopItem(db, loop.id, null)
    ).rejects.toBeInstanceOf(MissingCurrentCapsuleError);

    await service.setLoopItemDone(db, loop.id, first.id, true);
    await service.setLoopItemDone(db, loop.id, second.id, true);
    items = await service.getLoopItems(db, loop.id);
    expect(items.every((item) => !item.current)).toBe(true);
    await service.setCurrentLoopItem(db, loop.id, null);
  });

  it('clears the current capsule when it is marked done', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Focus item' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    await service.setCurrentLoopItem(db, loop.id, item.id);
    await service.setLoopItemDone(db, loop.id, item.id, true);

    const [updated] = await service.getLoopItems(db, loop.id);
    expect(updated?.done).toBe(true);
    expect(updated?.current).toBe(false);
  });

  it('pauses the timer when the last unfinished capsule is completed', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Only unfinished capsule' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    harness.advanceSeconds(60);
    await service.setLoopItemDone(db, loop.id, item.id, true);

    const updated = await service.getLoop(db, loop.id);
    expect(updated.status).toBe('PAUSED');
    expect(state.intervals.every((interval) => interval.ended_at !== null)).toBe(
      true
    );
    expect(
      state.itemIntervals.every((interval) => interval.ended_at !== null)
    ).toBe(true);
    expect(await service.getElapsedSeconds(db, loop.id)).toBe(60);
  });

  it('pauses the timer when the last unfinished capsule is deleted', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Completed' }, { text: 'Last unfinished' }],
    });
    const [completed, lastUnfinished] = await service.getLoopItems(db, loop.id);
    if (!completed || !lastUnfinished) {
      throw new Error('Expected two items');
    }

    await service.setLoopItemDone(db, loop.id, completed.id, true);
    expect((await service.getLoop(db, loop.id)).status).toBe('ACTIVE');

    harness.advanceSeconds(60);
    await service.deleteLoopItem(db, loop.id, lastUnfinished.id);

    const updated = await service.getLoop(db, loop.id);
    expect(updated.status).toBe('PAUSED');
    expect(state.intervals.every((interval) => interval.ended_at !== null)).toBe(
      true
    );
    const remaining = await service.getLoopItems(db, loop.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.current).toBe(false);
  });

  it('rejects resuming when no unfinished capsule remains', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Only capsule' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    await service.setLoopItemDone(db, loop.id, item.id, true);
    expect((await service.getLoop(db, loop.id)).status).toBe('PAUSED');

    await expect(service.resumeLoop(db, loop.id)).rejects.toBeInstanceOf(
      MissingCurrentCapsuleError
    );
  });

  it('restores the first unfinished capsule when resuming a paused loop without a current', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });
    for (const item of state.items) {
      item.current = false;
    }
    await service.pauseLoop(db, loop.id);

    await service.resumeLoop(db, loop.id);

    const items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.current)).toEqual([true, false]);
    const open = state.itemIntervals.find(
      (interval) => interval.item_id === items[0]?.id && interval.ended_at === null
    );
    expect(open).toBeDefined();
  });

  it('pauses an active timer with no unfinished capsule during reconciliation', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Legacy completed capsule' }],
    });
    for (const item of state.items) {
      item.current = false;
      item.done = true;
    }

    await service.ensureCurrentItemInterval(db, loop.id);

    expect((await service.getLoop(db, loop.id)).status).toBe('PAUSED');
    expect(state.intervals.every((interval) => interval.ended_at !== null)).toBe(
      true
    );
  });

  it('selects the next unfinished capsule when the current one is completed', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });
    const [first, second] = await service.getLoopItems(db, loop.id);
    if (!first || !second) throw new Error('Expected two items');

    await service.setCurrentLoopItem(db, loop.id, first.id);
    await service.setLoopItemDone(db, loop.id, first.id, true);

    const items = await service.getLoopItems(db, loop.id);
    expect(items.map((item) => item.current)).toEqual([false, true]);
    const nextInterval = state.itemIntervals.find(
      (interval) => interval.item_id === second.id
    );
    expect(nextInterval?.ended_at).toBeNull();
  });

  it('restores a current capsule when an active loop has none', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });
    for (const item of state.items) {
      item.current = false;
    }

    await service.ensureCurrentItemInterval(db, loop.id);

    const items = await service.getLoopItems(db, loop.id);
    expect(items[0]?.current).toBe(true);
    const open = state.itemIntervals.find(
      (interval) => interval.item_id === items[0]?.id
    );
    expect(open?.ended_at).toBeNull();
  });

  it('rejects selecting a completed capsule as current', async () => {
    const { db, service } = createHarness();
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'Done item' }],
    });
    const [item] = await service.getLoopItems(db, loop.id);
    if (!item) throw new Error('Expected an item');

    await service.setLoopItemDone(db, loop.id, item.id, true);

    await expect(
      service.setCurrentLoopItem(db, loop.id, item.id)
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('tracks capsule focus intervals across selection and pause', async () => {
    const harness = createHarness();
    const { db, service, state } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      items: [{ text: 'First' }, { text: 'Second' }],
    });
    const [first, second] = await service.getLoopItems(db, loop.id);
    if (!first || !second) throw new Error('Expected two items');

    await service.setCurrentLoopItem(db, loop.id, first.id);
    expect(state.itemIntervals).toHaveLength(1);
    expect(state.itemIntervals[0]?.item_id).toBe(first.id);
    expect(state.itemIntervals[0]?.ended_at).toBeNull();

    harness.advanceSeconds(60);
    await service.setCurrentLoopItem(db, loop.id, second.id);
    expect(state.itemIntervals[0]?.ended_at).toBe('2026-01-01T10:01:00.000Z');
    expect(state.itemIntervals[1]?.item_id).toBe(second.id);
    expect(state.itemIntervals[1]?.ended_at).toBeNull();

    harness.advanceSeconds(60);
    await service.pauseLoop(db, loop.id);
    expect(state.itemIntervals[1]?.ended_at).toBe('2026-01-01T10:02:00.000Z');

    harness.advanceSeconds(60);
    await service.resumeLoop(db, loop.id);
    expect(state.itemIntervals).toHaveLength(3);
    expect(state.itemIntervals[2]?.item_id).toBe(second.id);
    expect(state.itemIntervals[2]?.started_at).toBe('2026-01-01T10:03:00.000Z');
  });

  it('returns the latest completed loop and its items for carry-in', async () => {
    const harness = createHarness();
    const { db, service } = harness;

    const first = await service.startLoop(db, {
      targetDurationSeconds: 600,
      items: [{ text: 'First item' }],
    });
    await service.completeLoop(db, first.id, {});
    harness.advanceSeconds(60);

    const second = await service.startLoop(db, {
      targetDurationSeconds: 600,
      items: [{ text: 'Second item' }],
    });
    await service.completeLoop(db, second.id, {});

    const previous = await service.getPreviousLoopWithItems(db);
    expect(previous?.loop.id).toBe(second.id);
    expect(previous?.items.map((item) => item.text)).toEqual(['Second item']);
  });
});
