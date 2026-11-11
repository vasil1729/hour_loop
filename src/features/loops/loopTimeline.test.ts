import type { Loop, LoopInterval } from '../../domain/types';
import { buildLoopTimeline } from './loopTimeline';

function loop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    sequence_number: 1,
    local_date: '2026-01-01',
    focus: 'Focus',
    carry_in: null,
    done: null,
    roll_forward: null,
    roll_forward_task_id: null,
    note: null,
    task_id: null,
    target_duration_seconds: 3600,
    status: 'ACTIVE',
    started_at: '2026-01-01T10:00:00.000Z',
    stopped_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function interval(overrides: Partial<LoopInterval> = {}): LoopInterval {
  return {
    id: 'interval-1',
    loop_id: 'loop-1',
    started_at: '2026-01-01T10:00:00.000Z',
    ended_at: null,
    time_zone: 'UTC',
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildLoopTimeline', () => {
  it('shows a start event for a running loop', () => {
    const events = buildLoopTimeline(loop(), [interval()]);

    expect(events).toEqual([
      { kind: 'STARTED', at: '2026-01-01T10:00:00.000Z' },
    ]);
  });

  it('shows pause and resume events', () => {
    const events = buildLoopTimeline(loop({ status: 'PAUSED' }), [
      interval({
        started_at: '2026-01-01T10:00:00.000Z',
        ended_at: '2026-01-01T10:25:00.000Z',
      }),
      interval({
        id: 'interval-2',
        started_at: '2026-01-01T10:30:00.000Z',
        ended_at: '2026-01-01T10:45:00.000Z',
      }),
    ]);

    expect(events).toEqual([
      { kind: 'STARTED', at: '2026-01-01T10:00:00.000Z' },
      { kind: 'PAUSED', at: '2026-01-01T10:25:00.000Z' },
      { kind: 'RESUMED', at: '2026-01-01T10:30:00.000Z' },
      { kind: 'PAUSED', at: '2026-01-01T10:45:00.000Z' },
    ]);
  });

  it('labels the final interval end as stopped for a completed loop', () => {
    const events = buildLoopTimeline(
      loop({
        status: 'COMPLETED',
        stopped_at: '2026-01-01T11:00:00.000Z',
      }),
      [
        interval({
          started_at: '2026-01-01T10:00:00.000Z',
          ended_at: '2026-01-01T10:25:00.000Z',
        }),
        interval({
          id: 'interval-2',
          started_at: '2026-01-01T10:30:00.000Z',
          ended_at: '2026-01-01T11:00:00.000Z',
        }),
      ]
    );

    expect(events.map((event) => event.kind)).toEqual([
      'STARTED',
      'PAUSED',
      'RESUMED',
      'STOPPED',
    ]);
  });

  it('labels the final pause as stopped while the loop is being closed', () => {
    const events = buildLoopTimeline(
      loop({ status: 'PAUSED' }),
      [
        interval({
          started_at: '2026-01-01T10:00:00.000Z',
          ended_at: '2026-01-01T11:00:00.000Z',
        }),
      ],
      { closing: true }
    );

    expect(events.map((event) => event.kind)).toEqual(['STARTED', 'STOPPED']);
  });

  it('closes a completed loop that has an open interval', () => {
    const events = buildLoopTimeline(
      loop({
        status: 'COMPLETED',
        stopped_at: '2026-01-01T10:20:00.000Z',
      }),
      [interval()]
    );

    expect(events).toEqual([
      { kind: 'STARTED', at: '2026-01-01T10:00:00.000Z' },
      { kind: 'STOPPED', at: '2026-01-01T10:20:00.000Z' },
    ]);
  });

  it('sorts intervals by start time before building events', () => {
    const events = buildLoopTimeline(loop(), [
      interval({
        id: 'interval-2',
        started_at: '2026-01-01T10:30:00.000Z',
      }),
      interval({
        started_at: '2026-01-01T10:00:00.000Z',
        ended_at: '2026-01-01T10:25:00.000Z',
      }),
    ]);

    expect(events.map((event) => event.kind)).toEqual([
      'STARTED',
      'PAUSED',
      'RESUMED',
    ]);
  });
});
