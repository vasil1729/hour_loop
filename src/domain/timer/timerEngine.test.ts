import {
  allocateIntervalToDays,
  allocateIntervalToMonths,
  calculateElapsedSeconds,
  formatElapsed,
  localMidnightAfter,
  progressRatio,
  remainingSeconds,
  type IntervalRecord,
} from './timerEngine';

function interval(overrides: Partial<IntervalRecord>): IntervalRecord {
  return {
    id: 'interval-1',
    loop_id: 'loop-1',
    started_at: '2026-01-01T10:00:00.000Z',
    ended_at: null,
    time_zone: 'UTC',
    ...overrides,
  };
}

describe('calculateElapsedSeconds', () => {
  it('returns exact seconds for a single closed interval', () => {
    const result = calculateElapsedSeconds([
      interval({
        started_at: '2026-01-01T10:00:00.000Z',
        ended_at: '2026-01-01T10:25:00.000Z',
      }),
    ]);
    expect(result).toBe(1500);
  });

  it('uses referenceTime as the end of an open interval', () => {
    const result = calculateElapsedSeconds(
      [interval({ started_at: '2026-01-01T10:00:00.000Z', ended_at: null })],
      new Date('2026-01-01T10:10:00.000Z')
    );
    expect(result).toBe(600);
  });

  it('sums multiple intervals after pause and resume', () => {
    const result = calculateElapsedSeconds([
      interval({
        id: 'a',
        started_at: '2026-01-01T10:00:00.000Z',
        ended_at: '2026-01-01T10:05:00.000Z',
      }),
      interval({
        id: 'b',
        started_at: '2026-01-01T10:10:00.000Z',
        ended_at: '2026-01-01T10:20:00.000Z',
      }),
    ]);
    expect(result).toBe(900);
  });

  it('returns zero when there are no intervals', () => {
    expect(calculateElapsedSeconds([])).toBe(0);
  });

  it('returns zero when referenceTime is before the interval start', () => {
    const result = calculateElapsedSeconds(
      [interval({ started_at: '2026-01-01T10:00:00.000Z', ended_at: null })],
      new Date('2026-01-01T09:00:00.000Z')
    );
    expect(result).toBe(0);
  });

  it('clamps negative intervals to zero', () => {
    const result = calculateElapsedSeconds([
      interval({
        started_at: '2026-01-01T10:00:00.000Z',
        ended_at: '2026-01-01T09:00:00.000Z',
      }),
    ]);
    expect(result).toBe(0);
  });
});

describe('allocateIntervalToDays', () => {
  it('splits an interval crossing midnight into two local days', () => {
    const days = allocateIntervalToDays(
      interval({
        started_at: '2026-01-01T23:30:00.000Z',
        ended_at: '2026-01-02T00:30:00.000Z',
        time_zone: 'UTC',
      })
    );

    expect(days).toEqual({
      '2026-01-01': 1800,
      '2026-01-02': 1800,
    });
    expect(Object.values(days).reduce((sum, value) => sum + value, 0)).toBe(3600);
  });

  it('does not allocate an open interval whose reference is before its start', () => {
    const days = allocateIntervalToDays(
      interval({ started_at: '2026-01-01T10:00:00.000Z', ended_at: null }),
      new Date('2026-01-01T09:00:00.000Z')
    );
    expect(days).toEqual({});
  });

  it('uses local time zone boundaries rather than UTC', () => {
    // 2026-01-02 03:30 UTC is 2026-01-01 22:30 in New York (EST).
    const days = allocateIntervalToDays(
      interval({
        started_at: '2026-01-02T03:30:00.000Z',
        ended_at: '2026-01-02T05:30:00.000Z',
        time_zone: 'America/New_York',
      })
    );

    expect(days).toEqual({
      '2026-01-01': 5400,
      '2026-01-02': 1800,
    });
  });

  it('handles DST spring-forward without losing real elapsed time', () => {
    // 2026-03-08 06:30Z = 01:30 EST, 07:30Z = 03:30 EDT.
    const days = allocateIntervalToDays(
      interval({
        started_at: '2026-03-08T06:30:00.000Z',
        ended_at: '2026-03-08T07:30:00.000Z',
        time_zone: 'America/New_York',
      })
    );

    expect(days['2026-03-08']).toBe(3600);
  });
});

describe('allocateIntervalToMonths', () => {
  it('splits an interval crossing a month boundary', () => {
    const months = allocateIntervalToMonths(
      interval({
        started_at: '2026-01-31T23:00:00.000Z',
        ended_at: '2026-02-01T01:00:00.000Z',
        time_zone: 'UTC',
      })
    );

    expect(months).toEqual({
      '2026-01': 3600,
      '2026-02': 3600,
    });
  });
});

describe('remainingSeconds', () => {
  it('clamps to zero past the target', () => {
    expect(remainingSeconds(3600, 4200)).toBe(0);
  });

  it('returns the remaining time before the target', () => {
    expect(remainingSeconds(3600, 1200)).toBe(2400);
  });
});

describe('progressRatio', () => {
  it('clamps progress between zero and one', () => {
    expect(progressRatio(3600, 1800)).toBe(0.5);
    expect(progressRatio(3600, 9000)).toBe(1);
    expect(progressRatio(0, 0)).toBe(0);
    expect(progressRatio(0, 10)).toBe(1);
  });
});

describe('formatElapsed', () => {
  it('formats hours, minutes, and seconds', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(3661)).toBe('01:01:01');
    expect(formatElapsed(86399)).toBe('23:59:59');
  });

  it('floors fractional seconds', () => {
    expect(formatElapsed(59.9)).toBe('00:00:59');
  });
});

describe('localMidnightAfter', () => {
  it('returns the next local midnight in UTC', () => {
    const result = localMidnightAfter(
      new Date('2026-01-01T23:30:00.000Z'),
      'UTC'
    );
    expect(result.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('accounts for a non-UTC zone', () => {
    // 22:30 New York on Jan 1 is 03:30Z Jan 2; next midnight is 05:00Z Jan 2.
    const result = localMidnightAfter(
      new Date('2026-01-02T03:30:00.000Z'),
      'America/New_York'
    );
    expect(result.toISOString()).toBe('2026-01-02T05:00:00.000Z');
  });
});
