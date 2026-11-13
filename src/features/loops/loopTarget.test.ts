import type { Loop } from '../../domain/types';
import { shouldOpenCompletionJournal } from './loopTarget';

function loop(overrides: Partial<Loop> = {}): Loop {
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
    status: 'PAUSED',
    started_at: '2026-01-01T10:00:00.000Z',
    stopped_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('shouldOpenCompletionJournal', () => {
  it('opens the journal for a paused loop at its target', () => {
    expect(shouldOpenCompletionJournal(loop(), 3600)).toBe(true);
  });

  it('opens the journal for a paused loop past its target', () => {
    expect(shouldOpenCompletionJournal(loop(), 3700)).toBe(true);
  });

  it('keeps a paused loop below its target on the active screen', () => {
    expect(shouldOpenCompletionJournal(loop(), 3599)).toBe(false);
  });

  it('waits for the active loop to pause first', () => {
    expect(shouldOpenCompletionJournal(loop({ status: 'ACTIVE' }), 3600)).toBe(
      false
    );
  });

  it('ignores completed loops', () => {
    expect(
      shouldOpenCompletionJournal(loop({ status: 'COMPLETED' }), 3600)
    ).toBe(false);
  });
});
