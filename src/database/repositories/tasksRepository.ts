import type { SQLiteDatabase } from 'expo-sqlite';

import type { Task } from '../../domain/types';
import type { TaskStatus } from '../../constants/loopStatus';
import { nowUtcIso } from '../../domain/shared/dateUtils';

const SELECT_TASK = `
  SELECT id, parent_task_id, title, description, status, sort_order,
         created_at, updated_at, completed_at, archived_at
  FROM tasks
`;

export async function createTask(db: SQLiteDatabase, task: Task): Promise<void> {
  await db.runAsync(
    `INSERT INTO tasks (
       id, parent_task_id, title, description, status, sort_order,
       created_at, updated_at, completed_at, archived_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.parent_task_id,
      task.title,
      task.description,
      task.status,
      task.sort_order,
      task.created_at,
      task.updated_at,
      task.completed_at,
      task.archived_at,
    ]
  );
}

export async function getTaskById(
  db: SQLiteDatabase,
  id: string
): Promise<Task | null> {
  return db.getFirstAsync<Task>(`${SELECT_TASK} WHERE id = ?`, [id]);
}

export async function listTasks(
  db: SQLiteDatabase,
  options: { includeArchived?: boolean } = {}
): Promise<Task[]> {
  const where = options.includeArchived ? '' : "WHERE status != 'ARCHIVED'";
  return db.getAllAsync<Task>(
    `${SELECT_TASK} ${where} ORDER BY sort_order ASC, created_at ASC`
  );
}

export async function listChildren(
  db: SQLiteDatabase,
  parentId: string | null
): Promise<Task[]> {
  if (parentId === null) {
    return db.getAllAsync<Task>(
      `${SELECT_TASK} WHERE parent_task_id IS NULL ORDER BY sort_order ASC, created_at ASC`
    );
  }
  return db.getAllAsync<Task>(
    `${SELECT_TASK} WHERE parent_task_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [parentId]
  );
}

export async function getMaxSortOrder(
  db: SQLiteDatabase,
  parentId: string | null
): Promise<number> {
  const row =
    parentId === null
      ? await db.getFirstAsync<{ max_order: number | null }>(
          'SELECT MAX(sort_order) AS max_order FROM tasks WHERE parent_task_id IS NULL'
        )
      : await db.getFirstAsync<{ max_order: number | null }>(
          'SELECT MAX(sort_order) AS max_order FROM tasks WHERE parent_task_id = ?',
          [parentId]
        );
  return row?.max_order ?? -1;
}

export type TaskPatch = {
  title?: string;
  description?: string | null;
  parent_task_id?: string | null;
  status?: TaskStatus;
  sort_order?: number;
  completed_at?: string | null;
  archived_at?: string | null;
};

export async function updateTask(
  db: SQLiteDatabase,
  id: string,
  patch: TaskPatch
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value as string | number | null);
  await db.runAsync(
    `UPDATE tasks SET ${assignments}, updated_at = ? WHERE id = ?`,
    [...values, nowUtcIso(), id]
  );
}

export async function updateTaskStatus(
  db: SQLiteDatabase,
  id: string,
  status: TaskStatus,
  timestamps: { completedAt?: string | null; archivedAt?: string | null } = {}
): Promise<void> {
  await db.runAsync(
    `UPDATE tasks
     SET status = ?, completed_at = ?, archived_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      status,
      timestamps.completedAt ?? null,
      timestamps.archivedAt ?? null,
      nowUtcIso(),
      id,
    ]
  );
}

export async function deleteTask(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
}

export async function getTasksByIds(
  db: SQLiteDatabase,
  ids: string[]
): Promise<Task[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  return db.getAllAsync<Task>(
    `${SELECT_TASK} WHERE id IN (${placeholders})`,
    ids
  );
}
