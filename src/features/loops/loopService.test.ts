import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop, LoopInterval, LoopItem, Task } from '../../domain/types';
import type { LoopJournalPatch } from '../../database/repositories/loopsRepository';
import {
  createLoopService,
  InvalidStateTransitionError,
  LoopAlreadyActiveError,
  LoopItemNotFoundError,
  LoopNotFoundError,
  LoopTaskNotFoundError,
  LoopTaskNotSubtaskError,
  type LoopServiceDeps,
} from './loopService';

type FakeState = {
  now: Date;
  idCounter: number;
  tasks: Task[];
  loops: Loop[];
  intervals: LoopInterval[];
  items: LoopItem[];
};

function createHarness() {
  const state: FakeState = {
    now: new Date('2026-01-01T10:00:00.000Z'),
    idCounter: 0,
    tasks: [],
    loops: [],
    intervals: [],
    items: [],
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
          item.updated_at = state.now.toISOString();
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

    const loop = await service.startLoop(db, { targetDurationSeconds: 3600 });

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
    });

    expect(loop.task_id).toBe('subtask');
  });

  it('rejects a missing subtask target', async () => {
    const harness = createHarness();

    await expect(
      harness.service.startLoop(harness.db, {
        targetDurationSeconds: 3600,
        taskId: 'missing',
      })
    ).rejects.toBeInstanceOf(LoopTaskNotFoundError);
  });

  it('rejects starting a second loop while one is active', async () => {
    const { db, service } = createHarness();
    await service.startLoop(db, { targetDurationSeconds: 3600 });

    await expect(
      service.startLoop(db, { targetDurationSeconds: 3600 })
    ).rejects.toBeInstanceOf(LoopAlreadyActiveError);
  });

  it('freezes elapsed time on pause and continues on resume', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600 });

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
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600 });
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
    const started = await service.startLoop(db, { targetDurationSeconds: 3600 });
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
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600 });
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
    const first = await service.startLoop(db, { targetDurationSeconds: 600 });
    await service.completeLoop(db, first.id, {});
    const second = await service.startLoop(db, { targetDurationSeconds: 600 });

    expect(second.sequence_number).toBe(2);
  });

  it('persists the completion journal fields', async () => {
    const harness = createHarness();
    const { db, service } = harness;
    const loop = await service.startLoop(db, {
      targetDurationSeconds: 3600,
      focus: 'Write tests',
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
    const loop = await service.startLoop(db, { targetDurationSeconds: 3600 });
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
