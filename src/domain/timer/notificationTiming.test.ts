import { earlyWarningDelaySeconds } from './notificationTiming';

describe('earlyWarningDelaySeconds', () => {
  it('schedules the warning before the target', () => {
    expect(earlyWarningDelaySeconds(3600, 5)).toBe(3300);
  });

  it('returns null when the early warning is off', () => {
    expect(earlyWarningDelaySeconds(3600, 0)).toBeNull();
  });

  it('returns null when the loop is already inside the warning window', () => {
    expect(earlyWarningDelaySeconds(300, 5)).toBeNull();
    expect(earlyWarningDelaySeconds(299, 5)).toBeNull();
  });

  it('never returns a negative delay', () => {
    expect(earlyWarningDelaySeconds(0, 5)).toBeNull();
    expect(earlyWarningDelaySeconds(-10, 5)).toBeNull();
  });
});
