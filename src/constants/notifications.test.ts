import {
  DEFAULT_EARLY_WARNING_MINUTES,
  parseEarlyWarningMinutes,
} from './notifications';

describe('parseEarlyWarningMinutes', () => {
  it('uses five minutes when no setting exists', () => {
    expect(parseEarlyWarningMinutes(null)).toBe(DEFAULT_EARLY_WARNING_MINUTES);
    expect(DEFAULT_EARLY_WARNING_MINUTES).toBe(5);
  });

  it('preserves an explicit off setting', () => {
    expect(parseEarlyWarningMinutes('0')).toBe(0);
  });

  it('accepts a stored preset value', () => {
    expect(parseEarlyWarningMinutes('15')).toBe(15);
  });

  it('falls back for invalid values', () => {
    expect(parseEarlyWarningMinutes('nope')).toBe(DEFAULT_EARLY_WARNING_MINUTES);
    expect(parseEarlyWarningMinutes('-5')).toBe(DEFAULT_EARLY_WARNING_MINUTES);
  });
});
