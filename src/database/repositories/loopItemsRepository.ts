import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoopStatus } from '../../constants/loopStatus';
import type { Capsule } from '../../domain/capsules/capsuleDomain';
import type { LoopItem } from '../../domain/types';
import { nowUtcIso } from '../../domain/shared/dateUtils';

type LoopItemRow = Omit<LoopItem, 'done' | 'current'> & {
  done: number;
  current: number;
};

type CapsuleRow = Omit<LoopItem, 'done' | 'current'> & {
  done: number;
  current: number;
  task_id: string | null;
  sequence_number: number;
  local_date: string;
  loop_status: LoopStatus;
  started_at: string;
};

const SELECT_ITEM = `
  SELECT id, loop_id, text, done, current, sort_order, carried_from_item_id,
         created_at, updated_at
  FROM loop_items
`;

const SELECT_CAPSULES = `
  SELECT li.id, li.loop_id, li.text, li.done, li.current, li.sort_order,
         li.carried_from_item_id, li.created_at, li.updated_at,
         l.task_id, l.sequence_number, l.local_date,
         l.status AS loop_status, l.started_at
  FROM loop_items AS li
  JOIN loops AS l ON l.id = li.loop_id
  WHERE li.done = ?
    AND NOT EXISTS (
      SELECT 1
      FROM loop_items AS carried
      WHERE carried.carried_from_item_id = li.id
    )
`;

const ORDER_OPEN_CAPSULES = `
  ORDER BY l.started_at DESC, li.sort_order ASC, li.created_at ASC
`;

const ORDER_COMPLETED_CAPSULES = `
  ORDER BY li.updated_at DESC, l.started_at DESC
`;

function mapRow(row: LoopItemRow): LoopItem {
  return {
    ...row,
    done: row.done === 1,
    current: row.current === 1,
  };
}

function mapCapsuleRow(row: CapsuleRow): Capsule {
  return {
    item: {
      id: row.id,
      loop_id: row.loop_id,
      text: row.text,
      done: row.done === 1,
      current: row.current === 1,
      sort_order: row.sort_order,
      carried_from_item_id: row.carried_from_item_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    loop: {
      id: row.loop_id,
      task_id: row.task_id,
      sequence_number: row.sequence_number,
      local_date: row.local_date,
      status: row.loop_status,
      started_at: row.started_at,
    },
  };
}

export async function createLoopItem(
  db: SQLiteDatabase,
  item: LoopItem
): Promise<void> {
  await db.runAsync(
    `INSERT INTO loop_items (
       id, loop_id, text, done, current, sort_order, carried_from_item_id,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.loop_id,
      item.text,
      item.done ? 1 : 0,
      item.current ? 1 : 0,
      item.sort_order,
      item.carried_from_item_id,
      item.created_at,
      item.updated_at,
    ]
  );
}

export async function getLoopItemById(
  db: SQLiteDatabase,
  id: string
): Promise<LoopItem | null> {
  const row = await db.getFirstAsync<LoopItemRow>(
    `${SELECT_ITEM} WHERE id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function listLoopItems(
  db: SQLiteDatabase,
  loopId: string
): Promise<LoopItem[]> {
  const rows = await db.getAllAsync<LoopItemRow>(
    `${SELECT_ITEM} WHERE loop_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [loopId]
  );
  return rows.map(mapRow);
}

export async function listLoopItemsForLoops(
  db: SQLiteDatabase,
  loopIds: string[]
): Promise<LoopItem[]> {
  if (loopIds.length === 0) {
    return [];
  }
  const placeholders = loopIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<LoopItemRow>(
    `${SELECT_ITEM} WHERE loop_id IN (${placeholders})
     ORDER BY sort_order ASC, created_at ASC`,
    loopIds
  );
  return rows.map(mapRow);
}

export async function getLoopItemsByIds(
  db: SQLiteDatabase,
  ids: string[]
): Promise<LoopItem[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<LoopItemRow>(
    `${SELECT_ITEM} WHERE id IN (${placeholders})`,
    ids
  );
  return rows.map(mapRow);
}

export async function updateLoopItemDone(
  db: SQLiteDatabase,
  id: string,
  done: boolean
): Promise<void> {
  await db.runAsync(
    `UPDATE loop_items
     SET done = ?,
         current = CASE WHEN ? = 1 THEN 0 ELSE current END,
         updated_at = ?
     WHERE id = ?`,
    [done ? 1 : 0, done ? 1 : 0, nowUtcIso(), id]
  );
}

export async function setCurrentLoopItem(
  db: SQLiteDatabase,
  loopId: string,
  itemId: string | null
): Promise<void> {
  await db.runAsync(
    `UPDATE loop_items
     SET current = CASE WHEN id = ? THEN 1 ELSE 0 END,
         updated_at = ?
     WHERE loop_id = ?`,
    [itemId, nowUtcIso(), loopId]
  );
}

/**
 * Open, not-yet-carried capsules from loops without a subtask.
 * They are not part of any task and are shown as loose capsules in the task pool.
 */
export async function listLooseCapsules(db: SQLiteDatabase): Promise<Capsule[]> {
  const rows = await db.getAllAsync<CapsuleRow>(
    `${SELECT_CAPSULES}
       AND l.task_id IS NULL
     ${ORDER_OPEN_CAPSULES}`,
    [0]
  );
  return rows.map(mapCapsuleRow);
}

/**
 * Completed, not-yet-carried capsules from loops without a subtask.
 * They remain visible in the completed capsule list instead of disappearing.
 */
export async function listCompletedLooseCapsules(
  db: SQLiteDatabase
): Promise<Capsule[]> {
  const rows = await db.getAllAsync<CapsuleRow>(
    `${SELECT_CAPSULES}
       AND l.task_id IS NULL
     ${ORDER_COMPLETED_CAPSULES}`,
    [1]
  );
  return rows.map(mapCapsuleRow);
}

/**
 * Open, not-yet-carried capsules from loops attached to the given subtasks.
 * Used by task detail to show the capsules grouped under a task.
 */
export async function listCapsulesForTasks(
  db: SQLiteDatabase,
  taskIds: string[]
): Promise<Capsule[]> {
  if (taskIds.length === 0) {
    return [];
  }
  const placeholders = taskIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<CapsuleRow>(
    `${SELECT_CAPSULES}
       AND l.task_id IN (${placeholders})
     ${ORDER_OPEN_CAPSULES}`,
    [0, ...taskIds]
  );
  return rows.map(mapCapsuleRow);
}

/**
 * Completed, not-yet-carried capsules from loops attached to the given
 * subtasks. Shown in a separate completed section in task detail.
 */
export async function listCompletedCapsulesForTasks(
  db: SQLiteDatabase,
  taskIds: string[]
): Promise<Capsule[]> {
  if (taskIds.length === 0) {
    return [];
  }
  const placeholders = taskIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<CapsuleRow>(
    `${SELECT_CAPSULES}
       AND l.task_id IN (${placeholders})
     ${ORDER_COMPLETED_CAPSULES}`,
    [1, ...taskIds]
  );
  return rows.map(mapCapsuleRow);
}

export async function deleteLoopItem(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync('DELETE FROM loop_items WHERE id = ?', [id]);
}
