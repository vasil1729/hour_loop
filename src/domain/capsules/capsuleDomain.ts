import type { Loop, LoopItem } from '../types';

/**
 * A loop capsule is a loop item viewed together with the loop that owns it.
 * Capsules whose loop has no subtask are "loose" and surface in the task pool.
 */
export type Capsule = {
  item: LoopItem;
  loop: Pick<
    Loop,
    'id' | 'task_id' | 'sequence_number' | 'local_date' | 'status' | 'started_at'
  >;
};

export function isLooseCapsule(capsule: Capsule): boolean {
  return capsule.loop.task_id === null;
}
