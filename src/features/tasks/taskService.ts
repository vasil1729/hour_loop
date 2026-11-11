import type { SQLiteDatabase } from 'expo-sqlite';

import type { Task } from '../../domain/types';
import type { TaskStatus } from '../../constants/loopStatus';
import type { Capsule } from '../../domain/capsules/capsuleDomain';
import { createId } from '../../domain/shared/id';
import { nowUtcIso } from '../../domain/shared/dateUtils';
import {
  assertValidParent,
  childProgress,
  collectTaskIdsWithDescendants,
  isTaskActive,
  type TaskProgress,
} from '../../domain/tasks/taskDomain';
import * as tasksRepository from '../../database/repositories/tasksRepository';
import { listLoopsForTask, listLoopsForTasks } from '../../database/repositories/loopsRepository';
import { listCapsulesForTasks } from '../../database/repositories/loopItemsRepository';
import { attachLoopMetrics, type LoopWithMetrics } from '../loops/loopMetrics';

export type TaskFilter = 'active' | 'completed' | 'all';

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  parentTaskId?: string | null;
};

export type TaskDetail = {
  task: Task;
  children: Task[];
  descendantIds: string[];
  descendantTasks: Task[];
  loops: LoopWithMetrics[];
  capsules: Capsule[];
  totalSeconds: number;
  progress: TaskProgress;
};

export async function listTasks(
  db: SQLiteDatabase,
  filter: TaskFilter = 'active'
): Promise<Task[]> {
  const all = await tasksRepository.listTasks(db);
  if (filter === 'completed') {
    return all.filter((task) => task.status === 'COMPLETED');
  }
  if (filter === 'active') {
    return all.filter(isTaskActive);
  }
  return all;
}

export async function createTask(
  db: SQLiteDatabase,
  input: CreateTaskInput
): Promise<Task> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('A task needs a title.');
  }

  const now = nowUtcIso();
  const sortOrder =
    (await tasksRepository.getMaxSortOrder(db, input.parentTaskId ?? null)) + 1;
  const task: Task = {
    id: createId(),
    parent_task_id: input.parentTaskId ?? null,
    title,
    description: input.description?.trim() || null,
    status: 'NOT_STARTED',
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
    completed_at: null,
    archived_at: null,
  };

  await tasksRepository.createTask(db, task);
  return task;
}

export async function updateTaskDetails(
  db: SQLiteDatabase,
  taskId: string,
  patch: { title?: string; description?: string | null }
): Promise<void> {
  const next: { title?: string; description?: string | null } = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) {
      throw new Error('A task needs a title.');
    }
    next.title = title;
  }
  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }
  await tasksRepository.updateTask(db, taskId, next);
}

export async function setTaskStatus(
  db: SQLiteDatabase,
  taskId: string,
  status: TaskStatus
): Promise<void> {
  const now = nowUtcIso();
  await tasksRepository.updateTaskStatus(db, taskId, status, {
    completedAt: status === 'COMPLETED' ? now : null,
    archivedAt: status === 'ARCHIVED' ? now : null,
  });
}

export async function markTaskInProgress(
  db: SQLiteDatabase,
  taskId: string
): Promise<void> {
  const task = await tasksRepository.getTaskById(db, taskId);
  if (!task || task.status !== 'NOT_STARTED') {
    return;
  }
  await setTaskStatus(db, taskId, 'IN_PROGRESS');
}

export async function moveTask(
  db: SQLiteDatabase,
  taskId: string,
  newParentId: string | null
): Promise<void> {
  if (taskId === newParentId) {
    assertValidParent([], taskId, newParentId);
  }
  const allTasks = await tasksRepository.listTasks(db, { includeArchived: true });
  assertValidParent(allTasks, taskId, newParentId);
  const sortOrder = (await tasksRepository.getMaxSortOrder(db, newParentId)) + 1;
  await tasksRepository.updateTask(db, taskId, {
    parent_task_id: newParentId,
    sort_order: sortOrder,
  });
}

export async function deleteTask(db: SQLiteDatabase, taskId: string): Promise<void> {
  await tasksRepository.deleteTask(db, taskId);
}

export async function getTaskDetail(
  db: SQLiteDatabase,
  taskId: string
): Promise<TaskDetail | null> {
  const task = await tasksRepository.getTaskById(db, taskId);
  if (!task) {
    return null;
  }

  const allTasks = await tasksRepository.listTasks(db, { includeArchived: true });
  const descendantIds = collectTaskIdsWithDescendants(allTasks, taskId);
  const children = allTasks.filter((entry) => entry.parent_task_id === taskId);
  const descendantIdSet = new Set(descendantIds);
  const descendantTasks = allTasks.filter(
    (entry) => entry.id !== taskId && descendantIdSet.has(entry.id)
  );
  const loops = await listLoopsForTasks(db, descendantIds);
  const [loopsWithMetrics, capsules] = await Promise.all([
    attachLoopMetrics(db, loops),
    listCapsulesForTasks(db, descendantIds),
  ]);
  const totalSeconds = loopsWithMetrics.reduce(
    (sum, entry) => sum + entry.elapsedSeconds,
    0
  );

  return {
    task,
    children,
    descendantIds,
    descendantTasks,
    loops: loopsWithMetrics,
    capsules,
    totalSeconds,
    progress: childProgress(allTasks, taskId),
  };
}

export async function getSuggestedCarryIn(
  db: SQLiteDatabase,
  taskId: string
): Promise<string | null> {
  const loops = await listLoopsForTask(db, taskId);
  const previous = loops.find(
    (loop) => loop.status === 'COMPLETED' && loop.roll_forward?.trim()
  );
  return previous?.roll_forward?.trim() ?? null;
}
