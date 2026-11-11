import type { Task } from '../../domain/types';
import {
  assertValidParent,
  buildTaskTree,
  childProgress,
  collectDescendantIds,
  collectTaskIdsWithDescendants,
  flattenTree,
  isLoopTarget,
  isSubtask,
  isTaskActive,
  TaskCycleError,
} from './taskDomain';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parent_task_id: null,
    description: null,
    status: 'NOT_STARTED',
    sort_order: 0,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    completed_at: null,
    archived_at: null,
    ...overrides,
  };
}

const tasks: Task[] = [
  task({ id: 'root-a', title: 'Root A', sort_order: 0 }),
  task({ id: 'child-1', title: 'Child 1', parent_task_id: 'root-a', sort_order: 1 }),
  task({ id: 'child-2', title: 'Child 2', parent_task_id: 'root-a', sort_order: 0 }),
  task({ id: 'grandchild', title: 'Grandchild', parent_task_id: 'child-1', sort_order: 0 }),
  task({ id: 'root-b', title: 'Root B', sort_order: 1 }),
];

describe('buildTaskTree', () => {
  it('nests tasks under their parents and sorts siblings', () => {
    const tree = buildTaskTree(tasks);

    expect(tree.map((node) => node.task.id)).toEqual(['root-a', 'root-b']);
    expect(tree[0]?.children.map((node) => node.task.id)).toEqual([
      'child-2',
      'child-1',
    ]);
    expect(tree[0]?.children[1]?.children[0]?.task.id).toBe('grandchild');
  });

  it('treats tasks with missing parents as roots', () => {
    const tree = buildTaskTree([
      task({ id: 'orphan', title: 'Orphan', parent_task_id: 'missing' }),
    ]);
    expect(tree.map((node) => node.task.id)).toEqual(['orphan']);
  });
});

describe('flattenTree', () => {
  it('only includes children of expanded nodes', () => {
    expect(flattenTree(tasks, new Set()).map((row) => row.task.id)).toEqual([
      'root-a',
      'root-b',
    ]);

    const rows = flattenTree(tasks, new Set(['root-a', 'child-1']));
    expect(rows.map((row) => row.task.id)).toEqual([
      'root-a',
      'child-2',
      'child-1',
      'grandchild',
      'root-b',
    ]);
    expect(rows.find((row) => row.task.id === 'grandchild')?.depth).toBe(2);
    expect(rows.find((row) => row.task.id === 'root-b')?.hasChildren).toBe(false);
  });
});

describe('collectDescendantIds', () => {
  it('returns all nested descendants', () => {
    expect(collectDescendantIds(tasks, 'root-a')).toEqual([
      'child-1',
      'child-2',
      'grandchild',
    ]);
    expect(collectTaskIdsWithDescendants(tasks, 'child-1')).toEqual([
      'child-1',
      'grandchild',
    ]);
  });

  it('returns an empty list for a leaf', () => {
    expect(collectDescendantIds(tasks, 'root-b')).toEqual([]);
  });
});

describe('assertValidParent', () => {
  it('rejects making a task its own parent', () => {
    expect(() => assertValidParent(tasks, 'root-a', 'root-a')).toThrow(
      TaskCycleError
    );
  });

  it('rejects moving a task under one of its descendants', () => {
    expect(() => assertValidParent(tasks, 'root-a', 'grandchild')).toThrow(
      TaskCycleError
    );
  });

  it('allows valid moves and root creation', () => {
    expect(() => assertValidParent(tasks, 'root-b', 'child-2')).not.toThrow();
    expect(() => assertValidParent(tasks, null, 'root-a')).not.toThrow();
    expect(() => assertValidParent(tasks, 'root-b', null)).not.toThrow();
  });
});

describe('childProgress', () => {
  it('counts completed direct children', () => {
    const withCompleted = tasks.map((entry) =>
      entry.id === 'child-2'
        ? { ...entry, status: 'COMPLETED' as const }
        : entry
    );
    expect(childProgress(withCompleted, 'root-a')).toEqual({
      completed: 1,
      total: 2,
      ratio: 0.5,
    });
  });

  it('ignores archived children', () => {
    const withArchived = tasks.map((entry) =>
      entry.id === 'child-2'
        ? { ...entry, status: 'ARCHIVED' as const }
        : entry
    );
    expect(childProgress(withArchived, 'root-a')).toEqual({
      completed: 0,
      total: 1,
      ratio: 0,
    });
  });

  it('returns zero for a leaf', () => {
    expect(childProgress(tasks, 'root-b')).toEqual({
      completed: 0,
      total: 0,
      ratio: 0,
    });
  });
});

describe('isTaskActive', () => {
  it('recognises active statuses', () => {
    expect(isTaskActive(task({ id: 'a', title: 'A' }))).toBe(true);
    expect(
      isTaskActive(task({ id: 'b', title: 'B', status: 'IN_PROGRESS' }))
    ).toBe(true);
    expect(
      isTaskActive(task({ id: 'c', title: 'C', status: 'COMPLETED' }))
    ).toBe(false);
  });
});

describe('isSubtask', () => {
  it('treats only tasks with a parent as subtasks', () => {
    expect(isSubtask(task({ id: 'root', title: 'Root' }))).toBe(false);
    expect(
      isSubtask(task({ id: 'child', title: 'Child', parent_task_id: 'root' }))
    ).toBe(true);
    expect(
      isSubtask(
        task({ id: 'grandchild', title: 'Grandchild', parent_task_id: 'child' })
      )
    ).toBe(true);
  });
});

describe('isLoopTarget', () => {
  it('allows active subtasks and rejects containers or completed subtasks', () => {
    expect(
      isLoopTarget(task({ id: 'child', title: 'Child', parent_task_id: 'root' }))
    ).toBe(true);
    expect(isLoopTarget(task({ id: 'root', title: 'Root' }))).toBe(false);
    expect(
      isLoopTarget(
        task({
          id: 'done',
          title: 'Done',
          parent_task_id: 'root',
          status: 'COMPLETED',
        })
      )
    ).toBe(false);
  });
});
