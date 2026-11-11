import type { SQLiteDatabase } from 'expo-sqlite';

const TARGET_VERSION = 3;

const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    parent_task_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    archived_at TEXT,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

  CREATE TABLE IF NOT EXISTS loops (
    id TEXT PRIMARY KEY,
    sequence_number INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    focus TEXT,
    carry_in TEXT,
    done TEXT,
    roll_forward TEXT,
    roll_forward_task_id TEXT,
    note TEXT,
    task_id TEXT,
    target_duration_seconds INTEGER NOT NULL DEFAULT 3600,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (roll_forward_task_id) REFERENCES tasks(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_loops_local_date ON loops(local_date);
  CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status);
  CREATE INDEX IF NOT EXISTS idx_loops_task_id ON loops(task_id);

  CREATE TABLE IF NOT EXISTS loop_intervals (
    id TEXT PRIMARY KEY,
    loop_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    time_zone TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (loop_id) REFERENCES loops(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_intervals_loop_id ON loop_intervals(loop_id);
  CREATE INDEX IF NOT EXISTS idx_intervals_started_at ON loop_intervals(started_at);

  CREATE TABLE IF NOT EXISTS intentions (
    id TEXT PRIMARY KEY,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    target_duration_seconds INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(period_type, period_key)
  );
  CREATE INDEX IF NOT EXISTS idx_intentions_period ON intentions(period_type, period_key);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('default_duration_seconds', '3600', datetime('now')),
    ('theme', 'system', datetime('now')),
    ('notifications_enabled', 'true', datetime('now'));
`;

const SCHEMA_V2 = `
  CREATE TABLE IF NOT EXISTS loop_items (
    id TEXT PRIMARY KEY,
    loop_id TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    carried_from_item_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (loop_id) REFERENCES loops(id) ON DELETE CASCADE,
    FOREIGN KEY (carried_from_item_id) REFERENCES loop_items(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_loop_items_loop_id ON loop_items(loop_id);
`;

const SCHEMA_V3 = `
  ALTER TABLE loop_items ADD COLUMN current INTEGER NOT NULL DEFAULT 0;
`;

/**
 * Runs on every database open via SQLiteProvider's onInit.
 * `PRAGMA foreign_keys` is connection-scoped and must never be assumed.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version >= TARGET_VERSION) {
    return;
  }

  if (version < 1) {
    await db.execAsync(SCHEMA_V1);
  }

  if (version < 2) {
    await db.execAsync(SCHEMA_V2);
  }

  if (version < 3) {
    await db.execAsync(SCHEMA_V3);
  }

  await db.execAsync(`PRAGMA user_version = ${TARGET_VERSION}`);
}
