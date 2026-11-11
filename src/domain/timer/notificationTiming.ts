/**
 * Seconds until an early warning should fire, or null when the warning is off
 * or the loop is already inside the warning window.
 */
export function earlyWarningDelaySeconds(
  remainingSeconds: number,
  warningMinutes: number
): number | null {
  const warningSeconds = Math.round(warningMinutes * 60);
  if (warningSeconds <= 0) {
    return null;
  }

  const remaining = Math.floor(remainingSeconds);
  if (remaining <= warningSeconds) {
    return null;
  }

  return Math.max(1, Math.round(remaining - warningSeconds));
}
