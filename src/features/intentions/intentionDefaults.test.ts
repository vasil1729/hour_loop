import {
  DEFAULT_DAILY_INTENTION_SECONDS,
  DEFAULT_MONTHLY_INTENTION_SECONDS,
} from '../../constants/intentions';
import { resolveDefaultIntentionSeconds } from './intentionDefaults';

describe('resolveDefaultIntentionSeconds', () => {
  it('falls back to the built-in daily default when no setting exists', () => {
    expect(resolveDefaultIntentionSeconds(null, 'daily')).toBe(
      DEFAULT_DAILY_INTENTION_SECONDS
    );
    expect(DEFAULT_DAILY_INTENTION_SECONDS).toBe(8 * 60 * 60);
  });

  it('falls back to the built-in monthly default when no setting exists', () => {
    expect(resolveDefaultIntentionSeconds(null, 'monthly')).toBe(
      DEFAULT_MONTHLY_INTENTION_SECONDS
    );
    expect(DEFAULT_MONTHLY_INTENTION_SECONDS).toBe(160 * 60 * 60);
  });

  it('treats an explicit zero as disabled', () => {
    expect(resolveDefaultIntentionSeconds('0', 'daily')).toBe(0);
  });

  it('uses a stored positive target', () => {
    expect(resolveDefaultIntentionSeconds('10800', 'daily')).toBe(10800);
  });

  it('falls back for invalid values', () => {
    expect(resolveDefaultIntentionSeconds('not-a-number', 'daily')).toBe(
      DEFAULT_DAILY_INTENTION_SECONDS
    );
    expect(resolveDefaultIntentionSeconds('-10', 'monthly')).toBe(
      DEFAULT_MONTHLY_INTENTION_SECONDS
    );
  });
});
