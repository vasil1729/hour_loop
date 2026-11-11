import type { Loop, LoopInterval } from '../../domain/types';
import { buildLoopClock } from './loopClock';

const CREATED_AT = '2026-01-01T15:00:00.000Z';

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    sequence_number: 1,
    local_date: '2026-01-01',
    focus: null,
    carry_in: null,
    done: null,
    roll_forward: null,
    roll_forward_task_id: null,
    note: null,
    task_id: null,
    target_duration_seconds: 3600,
    status: 'ACTIVE',
    started_at: CREATED_AT,
    stopped_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeInterval(
  id: string,
  startedAt: string,
  endedAt: string | null
): LoopInterval {
  return {
    id,
    loop_id: 'loop-1',
    started_at: startedAt,
    ended_at: endedAt,
    time_zone: 'UTC',
    created_at: startedAt,
  };
}

describe('buildLoopClock', () => {
  it('marks running and paused ticks across a pause gap', () => {
    const loop = makeLoop();
    const intervals = [
      makeInterval('i1', '2026-01-01T15:00:00.000Z', '2026-01-01T15:10:00.000Z'),
      makeInterval('i2', '2026-01-01T15:30:00.000Z', null),
    ];

    const model = buildLoopClock(
      loop,
      intervals,
      new Date('2026-01-01T15:40:00.000Z')
    );

    expect(model.startAngle).toBe(90);
    expect(model.endAngle).toBe(110);
    expect(model.isLive).toBe(true);
    expect(model.ticks[15]).toBe('running');
    expect(model.ticks[16]).toBe('paused');
    expect(model.ticks[17]).toBe('running');
    expect(model.ticks[18]).toBe('running');
    expect(model.ticks[0]).toBe('idle');
  });

  it('anchors a completed loop to its stop time', () => {
    const loop = makeLoop({
      status: 'COMPLETED',
      stopped_at: '2026-01-01T15:40:00.000Z',
    });
    const intervals = [
      makeInterval('i1', '2026-01-01T15:00:00.000Z', '2026-01-01T15:40:00.000Z'),
    ];

    const model = buildLoopClock(
      loop,
      intervals,
      new Date('2026-01-01T16:00:00.000Z')
    );

    expect(model.endAt).toBe('2026-01-01T15:40:00.000Z');
    expect(model.endAngle).toBe(110);
    expect(model.isLive).toBe(false);
    expect(model.ticks[15]).toBe('running');
  });

  it('freezes a paused loop at the pause instant', () => {
    const loop = makeLoop({ status: 'PAUSED' });
    const intervals = [
      makeInterval('i1', '2026-01-01T15:00:00.000Z', '2026-01-01T15:10:00.000Z'),
    ];

    const model = buildLoopClock(
      loop,
      intervals,
      new Date('2026-01-01T16:00:00.000Z')
    );

    expect(model.endAt).toBe('2026-01-01T15:10:00.000Z');
    expect(model.endAngle).toBe(95);
  });
});
