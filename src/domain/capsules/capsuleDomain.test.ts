import type { Capsule } from './capsuleDomain';
import { isLooseCapsule } from './capsuleDomain';

function capsule(taskId: string | null): Capsule {
  return {
    item: {
      id: 'item-1',
      loop_id: 'loop-1',
      text: 'Draft the outline',
      done: false,
      current: false,
      sort_order: 0,
      carried_from_item_id: null,
      created_at: '2026-11-11T10:00:00.000Z',
      updated_at: '2026-11-11T10:00:00.000Z',
    },
    loop: {
      id: 'loop-1',
      task_id: taskId,
      sequence_number: 1,
      local_date: '2026-11-11',
      status: 'COMPLETED',
      started_at: '2026-11-11T10:00:00.000Z',
    },
  };
}

describe('isLooseCapsule', () => {
  it('is loose only when the loop has no subtask', () => {
    expect(isLooseCapsule(capsule(null))).toBe(true);
    expect(isLooseCapsule(capsule('subtask-1'))).toBe(false);
  });
});
