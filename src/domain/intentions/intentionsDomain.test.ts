import {
  actualSecondsForDay,
  actualSecondsForMonth,
  allocateIntervalsToDays,
  computeIntentionProgress,
} from './intentionsDomain';
import type { IntervalRecord } from '../timer/timerEngine';

function interval(overrides: Partial<IntervalRecord>): IntervalRecord {
  return {
    id: 'interval',
    loop_id: 'loop',
    started_at: '2026-01-01T10:00:00.000Z',
    ended_at: null,
    time_zone: 'UTC',
    ...overrides,
  };
}

describe('computeIntentionProgress', () => {
  it('calculates 66% for 2h of a 3h intention', () => {
    const progress = computeIntentionProgress(10800, 7200);
    expect(progress.ratio).toBeCloseTo(2 / 3);
    expect(progress.percent).toBe(67);
    expect(progress.remainingSeconds).toBe(3600);
    expect(progress.reached).toBe(false);
  });

  it('clamps at 100% once the target is reached', () => {
    const progress = computeIntentionProgress(3600, 5400);
    expect(progress.ratio).toBe(1);
    expect(progress.percent).toBe(100);
    expect(progress.remainingSeconds).toBe(0);
    expect(progress.reached).toBe(true);
  });

  it('handles a zero target safely', () => {
    expect(computeIntentionProgress(0, 0)).toMatchObject({
      ratio: 0,
      percent: 0,
      reached: false,
    });
    expect(computeIntentionProgress(0, 120)).toMatchObject({
      ratio: 1,
      percent: 100,
    });
  });

  it('ignores negative actual seconds', () => {
    const progress = computeIntentionProgress(3600, -50);
    expect(progress.actualSeconds).toBe(0);
  });
});

describe('day and month allocation helpers', () => {
  const intervals: IntervalRecord[] = [
    interval({
      id: 'a',
      started_at: '2026-01-31T23:30:00.000Z',
      ended_at: '2026-02-01T00:30:00.000Z',
    }),
    interval({
      id: 'b',
      started_at: '2026-02-01T10:00:00.000Z',
      ended_at: '2026-02-01T11:00:00.000Z',
    }),
  ];

  it('sums actual seconds for a day across intervals', () => {
    expect(actualSecondsForDay(intervals, '2026-02-01', new Date('2026-02-02T00:00:00Z'))).toBe(
      5400
    );
  });

  it('sums actual seconds for a month across intervals', () => {
    expect(
      actualSecondsForMonth(intervals, '2026-02', new Date('2026-02-02T00:00:00Z'))
    ).toBe(5400);
    expect(
      actualSecondsForMonth(intervals, '2026-01', new Date('2026-02-02T00:00:00Z'))
    ).toBe(1800);
  });

  it('allocates many intervals into a single map', () => {
    const days = allocateIntervalsToDays(intervals, new Date('2026-02-02T00:00:00Z'));
    expect(days).toEqual({
      '2026-01-31': 1800,
      '2026-02-01': 5400,
    });
  });
});
