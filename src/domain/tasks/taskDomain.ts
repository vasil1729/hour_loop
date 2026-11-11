import type { Task } from '../../domain/types';

export type TaskNode = {
  task: Task;
  children: TaskNode[];
};

export type FlatTaskNode = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

export class TaskCycleError extends Error {
  constructor() {
    super('A task cannot be moved underneath itself or one of its own subtasks.');
    this.name = 'TaskCycleError';
  }
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Build a nested tree. Tasks whose parent is missing or archived are treated
 * as roots so they never disappear from the pool.
 */
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string | null, Task[]>();

  for (const task of tasks) {
    const parentId =
      task.parent_task_id && byId.has(task.parent_task_id)
        ? task.parent_task_id
        : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(task);
    childrenByParent.set(parentId, siblings);
  }

  const build = (parentId: string | null): TaskNode[] =>
    sortTasks(childrenByParent.get(parentId) ?? []).map((task) => ({
      task,
      children: build(task.id),
    }));

  return build(null);
}

export function flattenTree(
  tasks: Task[],
  expandedIds: ReadonlySet<string>
): FlatTaskNode[] {
  const rows: FlatTaskNode[] = [];

  const walk = (nodes: TaskNode[], depth: number) => {
    for (const node of nodes) {
      const isExpanded = expandedIds.has(node.task.id);
      rows.push({
        task: node.task,
        depth,
        hasChildren: node.children.length > 0,
        isExpanded,
      });
      if (isExpanded) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(buildTaskTree(tasks), 0);
  return rows;
}

export function collectDescendantIds(tasks: Task[], rootId: string): string[] {
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    const children = childrenByParent.get(task.parent_task_id) ?? [];
    children.push(task);
    childrenByParent.set(task.parent_task_id, children);
  }

  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>([rootId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const child of childrenByParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}

export function collectTaskIdsWithDescendants(tasks: Task[], rootId: string): string[] {
  return [rootId, ...collectDescendantIds(tasks, rootId)];
}

export function assertValidParent(
  tasks: Task[],
  taskId: string | null,
  parentId: string | null
): void {
  if (!parentId) return;
  if (taskId && taskId === parentId) {
    throw new TaskCycleError();
  }
  if (!taskId) return;

  const affected = new Set(collectTaskIdsWithDescendants(tasks, taskId));
  if (affected.has(parentId)) {
    throw new TaskCycleError();
  }
}

export type TaskProgress = {
  completed: number;
  total: number;
  ratio: number;
};

export function childProgress(tasks: Task[], taskId: string): TaskProgress {
  const children = tasks.filter(
    (task) => task.parent_task_id === taskId && task.status !== 'ARCHIVED'
  );
  const completed = children.filter((task) => task.status === 'COMPLETED').length;
  const total = children.length;
  return {
    completed,
    total,
    ratio: total === 0 ? 0 : completed / total,
  };
}

export function isTaskActive(task: Task): boolean {
  return task.status === 'NOT_STARTED' || task.status === 'IN_PROGRESS';
}

/**
 * Top-level tasks are containers, like epics or user stories. Only a task
 * nested underneath one of them is an actionable subtask that can own a loop.
 */
export function isSubtask(task: Task): boolean {
  return task.parent_task_id !== null;
}

export function isLoopTarget(task: Task): boolean {
  return isTaskActive(task) && isSubtask(task);
}
