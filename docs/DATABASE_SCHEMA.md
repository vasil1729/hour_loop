# Database Schema

Database: `hour-loop.db`  
Library: `expo-sqlite`  
Migrations: `PRAGMA user_version` (currently version 1)

All timestamps are ISO-8601 strings in UTC. Calendar keys are local civil dates (`YYYY-MM-DD`) or months (`YYYY-MM`). Durations are integer seconds.

## `tasks`

Hierarchical task pool.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID-like identifier |
| `parent_task_id` | TEXT | Self-FK, `ON DELETE CASCADE`; null for roots |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | Optional |
| `status` | TEXT NOT NULL | `NOT_STARTED` \| `IN_PROGRESS` \| `COMPLETED` \| `ARCHIVED` |
| `sort_order` | INTEGER NOT NULL | Sibling ordering, default 0 |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |
| `completed_at` | TEXT | Set when completed |
| `archived_at` | TEXT | Set when archived |

Indexes: `idx_tasks_parent(parent_task_id)`, `idx_tasks_status(status)`.

## `loops`

One focus session.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `sequence_number` | INTEGER NOT NULL | H1, H2… per `local_date` |
| `local_date` | TEXT NOT NULL | Local date the loop started |
| `focus` | TEXT | Journal |
| `carry_in` | TEXT | Journal |
| `done` | TEXT | Journal |
| `roll_forward` | TEXT | Journal |
| `roll_forward_task_id` | TEXT | FK → tasks, `ON DELETE SET NULL` |
| `note` | TEXT | Journal |
| `task_id` | TEXT | Optional FK → tasks, `ON DELETE SET NULL` |
| `target_duration_seconds` | INTEGER NOT NULL | Default 3600 |
| `status` | TEXT NOT NULL | `ACTIVE` \| `PAUSED` \| `COMPLETED` |
| `started_at` | TEXT NOT NULL | |
| `stopped_at` | TEXT | Completion instant |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

Indexes: `idx_loops_local_date`, `idx_loops_status`, `idx_loops_task_id`.

## `loop_intervals`

The canonical timer log. Elapsed time is derived from these rows.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `loop_id` | TEXT NOT NULL | FK → loops, `ON DELETE CASCADE` |
| `started_at` | TEXT NOT NULL | UTC |
| `ended_at` | TEXT | Null while running |
| `time_zone` | TEXT NOT NULL | IANA zone at interval start; fallback for allocation when no display zone is supplied |
| `created_at` | TEXT NOT NULL | |

Indexes: `idx_intervals_loop_id`, `idx_intervals_started_at`.

At most one interval per loop should be open at any time; the loop service enforces this.

## `intentions`

Daily and monthly focus-time targets.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `period_type` | TEXT NOT NULL | `daily` \| `monthly` |
| `period_key` | TEXT NOT NULL | `YYYY-MM-DD` or `YYYY-MM` |
| `target_duration_seconds` | INTEGER NOT NULL | |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

Unique constraint: `(period_type, period_key)`.  
Index: `idx_intentions_period`.

## `settings`

Key/value store for preferences and notification identifiers.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

Seeded keys:

| Key | Default |
|---|---|
| `default_duration_seconds` | `3600` |
| `theme` | `system` |
| `notifications_enabled` | `true` |
| `notif_{loopId}` | Scheduled notification identifier (created at runtime) |

## Migration policy

- `migrateDbIfNeeded` runs on every database open via `SQLiteProvider.onInit`.
- `PRAGMA foreign_keys = ON` is applied every time because it is connection-scoped.
- `PRAGMA journal_mode = WAL` is applied every open.
- To add a migration, increment `TARGET_VERSION` and append a versioned block that runs only when `user_version` is below the new target.
- Never edit an already-shipped migration block; add a new one.
