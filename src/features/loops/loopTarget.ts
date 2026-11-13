import type { Loop } from '../../domain/types';

/**
 * A paused loop that has reached its target no longer needs a separate stop
 * step; the next action is the completion journal.
 */
export function shouldOpenCompletionJournal(
  loop: Loop,
  elapsedSeconds: number
): boolean {
  return (
    loop.status === 'PAUSED' &&
    elapsedSeconds >= loop.target_duration_seconds
  );
}
