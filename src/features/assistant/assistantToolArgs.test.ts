import {
  optionalIntegerLike,
  optionalJournalText,
  optionalSequence,
  parsePeriodRequest,
  parseStringItems,
} from './assistantToolArgs';

const TODAY = '2026-11-25';

describe('assistant tool argument normalization', () => {
  it.each([
    ['today', 'day', undefined],
    ['daily', 'day', undefined],
    ['yesterday', 'day', '2026-11-24'],
    ['this week', 'week', undefined],
    ['last week', 'week', '2026-11-18'],
    ['this month', 'month', undefined],
    ['last month', 'month', '2026-10-01'],
  ])('maps period %s to %s', (value, period, anchorDate) => {
    expect(
      parsePeriodRequest(
        value,
        undefined,
        ['day', 'week', 'month'] as const,
        TODAY
      )
    ).toEqual({ period, anchorDate });
  });

  it('accepts daily/monthly aliases for intentions', () => {
    expect(
      parsePeriodRequest('daily', undefined, ['day', 'month'] as const, TODAY)
    ).toEqual({ period: 'day', anchorDate: undefined });
    expect(
      parsePeriodRequest('monthly', undefined, ['day', 'month'] as const, TODAY)
    ).toEqual({ period: 'month', anchorDate: undefined });
  });

  it('rejects a period outside the allowed set', () => {
    expect(() =>
      parsePeriodRequest('week', undefined, ['day', 'month'] as const, TODAY)
    ).toThrow('"period" must be one of: day, month.');
  });

  it('parses human duration strings', () => {
    expect(
      optionalIntegerLike({ durationMinutes: '90 minutes' }, 'durationMinutes', {
        min: 1,
        max: 1440,
      })
    ).toBe(90);
    expect(
      optionalIntegerLike({ durationMinutes: '1h30' }, 'durationMinutes', {
        min: 1,
        max: 1440,
      })
    ).toBe(90);
    expect(
      optionalIntegerLike({ durationMinutes: 25 }, 'durationMinutes', {
        min: 1,
        max: 1440,
      })
    ).toBe(25);
  });

  it('accepts capsule strings as well as objects', () => {
    expect(
      parseStringItems(
        { items: ['Write tests', { text: 'Review' }] },
        'items'
      )
    ).toEqual([{ text: 'Write tests' }, { text: 'Review' }]);
  });

  it('coerces journal fields instead of rejecting a completed loop', () => {
    expect(optionalJournalText({ done: true }, 'done')).toBeNull();
    expect(optionalJournalText({ done: 12 }, 'done')).toBe('12');
    expect(optionalJournalText({ done: '  finished  ' }, 'done')).toBe(
      'finished'
    );
  });

  it('parses H-number loop references', () => {
    expect(optionalSequence({ loopSequence: 'H3' }, 'loopSequence')).toBe(3);
    expect(optionalSequence({ loopSequence: 2 }, 'loopSequence')).toBe(2);
  });
});
