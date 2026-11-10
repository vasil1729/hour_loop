import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop, LoopInterval } from '../../domain/types';
import type { LoopJournalPatch } from '../../database/repositories/loopsRepository';
import {
  createLoopService,
  InvalidStateTransitionError,
  LoopAlreadyActiveError,
  type LoopServiceDeps,
} from './loopService';

type FakeState = {
  now: Date;
  idCounter: number;
  loops: Loop[];
  intervals: LoopInterval[];
};

function createHarness() {
  const state: FakeState = {
    now: new Date('2026-01-01T10:00:00.000Z'),
    idCounter: 0,
    loops: [],
    intervals: [],
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
});
