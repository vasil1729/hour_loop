---
type: database
title: SQLite Persistence and Migrations
description: Schema, connection pragmas, migration policy, repository boundaries, transactions, and persisted settings keys for the local SQLite database.
tags: [sqlite, persistence, migrations, schema, expo-sqlite]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-5bef3316eaca5c7c6fc4b24c
    resource: repo://src/database/client.ts
  - id: openwiki-source-ff385a65eaba1b8e35bc34a0
    resource: repo://src/database/migrations.ts
  - id: openwiki-source-b60c2275d001669569768601
    resource: repo://src/database/repositories/settingsRepository.ts
  - id: openwiki-source-d32aa26ef745f6a7c3488f36
    resource: repo://src/features/loops/loopService.ts
  - id: openwiki-source-35855f6034a3aedd41cf8509
    resource: repo://src/services/notifications/notificationService.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# SQLite Persistence and Migrations

All durable Hour Loop state lives in one local `expo-sqlite` database named `hour-loop.db`. There is no server, sync layer, or ORM. The schema is intentionally small and stable, with raw parameterized SQL kept behind repository modules.

## Schema

The database is built by four versioned migrations and currently contains seven tables:

| Table | Role | Key relationships |
| --- | --- | --- |
| `tasks` | Hierarchical task pool | `parent_task_id` self-FK, `ON DELETE CASCADE` |
| `loops` | One focus session plus journal | `task_id` and `roll_forward_task_id` reference `tasks` with `ON DELETE SET NULL` |
| `loop_intervals` | Canonical timer log | `loop_id` references `loops` with `ON DELETE CASCADE` |
| `loop_items` | Capsule checklist snapshots for a loop | `loop_id` references `loops`; `carried_from_item_id` self-FK, both cascading/set-null as noted below |
| `loop_item_intervals` | Capsule-level focus log | `loop_id` and `item_id` reference `loops`/`loop_items` with `ON DELETE CASCADE` |
| `intentions` | Daily/monthly targets | Unique `(period_type, period_key)` |
| `settings` | Preferences and notification identifiers | `key` primary key |

Timestamps are ISO-8601 UTC strings. Calendar keys (`local_date`, `period_key`) are local civil dates (`YYYY-MM-DD`) or months (`YYYY-MM`). Durations are integer seconds.

### `tasks`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID-like identifier |
| `parent_task_id` | TEXT | Self-FK, `ON DELETE CASCADE`; null for roots |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | Optional |
| `status` | TEXT NOT NULL | `NOT_STARTED` \| `IN_PROGRESS` \| `COMPLETED` \| `ARCHIVED` |
| `sort_order` | INTEGER NOT NULL | Sibling ordering, default 0 |
| `created_at` / `updated_at` | TEXT NOT NULL | |
| `completed_at` / `archived_at` | TEXT | Nullable status timestamps |

Indexes: `idx_tasks_parent(parent_task_id)`, `idx_tasks_status(status)`.

### `loops`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `sequence_number` | INTEGER NOT NULL | `H1`, `H2`, ... per `local_date` |
| `local_date` | TEXT NOT NULL | Local date the loop started |
| `focus`, `carry_in`, `done`, `roll_forward`, `note` | TEXT | Journal fields |
| `roll_forward_task_id` | TEXT | FK -> `tasks`, `ON DELETE SET NULL` |
| `task_id` | TEXT | Optional FK -> `tasks`, `ON DELETE SET NULL` |
| `target_duration_seconds` | INTEGER NOT NULL | Default 3600 |
| `status` | TEXT NOT NULL | `ACTIVE` \| `PAUSED` \| `COMPLETED` |
| `started_at` / `stopped_at` | TEXT | Start instant and completion instant |
| `created_at` / `updated_at` | TEXT NOT NULL | |

Indexes: `idx_loops_local_date`, `idx_loops_status`, `idx_loops_task_id`.

### `loop_intervals`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `loop_id` | TEXT NOT NULL | FK -> `loops`, `ON DELETE CASCADE` |
| `started_at` | TEXT NOT NULL | UTC |
| `ended_at` | TEXT | Null while running |
| `time_zone` | TEXT NOT NULL | IANA zone at interval start |
| `created_at` | TEXT NOT NULL | |

Indexes: `idx_intervals_loop_id`, `idx_intervals_started_at`. At most one interval per loop should be open; the loop service enforces this.

### `loop_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `loop_id` | TEXT NOT NULL | FK -> `loops`, `ON DELETE CASCADE` |
| `text` | TEXT NOT NULL | Trimmed capsule text |
| `done` | INTEGER NOT NULL | 0 or 1 |
| `current` | INTEGER NOT NULL | 0 or 1; at most one current capsule per loop |
| `sort_order` | INTEGER NOT NULL | Display order within the loop |
| `carried_from_item_id` | TEXT | Self-FK to the previous loop's item, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | TEXT NOT NULL | |

Index: `idx_loop_items_loop_id`. Deleting a loop cascades to its items. Carrying an item into a new loop creates a new row pointing at the source item; deleting the source loop later nulls the provenance but keeps the carried item.

### `loop_item_intervals`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `loop_id` | TEXT NOT NULL | FK -> `loops`, `ON DELETE CASCADE` |
| `item_id` | TEXT NOT NULL | FK -> `loop_items`, `ON DELETE CASCADE` |
| `started_at` | TEXT NOT NULL | UTC |
| `ended_at` | TEXT | Null while the capsule is the current focus |
| `time_zone` | TEXT NOT NULL | IANA zone at interval start |
| `created_at` | TEXT NOT NULL | |

Indexes: `idx_loop_item_intervals_loop`, `idx_loop_item_intervals_item`, `idx_loop_item_intervals_started`. At most one capsule interval per loop is open. Selecting a capsule closes the previous interval; pausing, completing, or removing the capsule closes it too. Capsule totals and the Day view are derived from these rows.

A capsule's task grouping comes from its loop's `task_id`: a loop attached to a subtask groups its capsules under that subtask. A loop with no task produces loose capsules. This derivation needs no separate capsule table.

### `intentions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `period_type` | TEXT NOT NULL | `daily` \| `monthly` |
| `period_key` | TEXT NOT NULL | `YYYY-MM-DD` or `YYYY-MM` |
| `target_duration_seconds` | INTEGER NOT NULL | |
| `created_at` / `updated_at` | TEXT NOT NULL | |

Unique constraint: `(period_type, period_key)`. Index: `idx_intentions_period`.

### `settings`

Key/value store for preferences and notification identifiers.

| Column | Type | Notes |
| --- | --- | --- |
| `key` | TEXT PK | |
| `value` | TEXT NOT NULL | Values are stored as strings |
| `updated_at` | TEXT NOT NULL | |

Seeded keys:

| Key | Default |
| --- | --- |
| `default_duration_seconds` | `3600` |
| `theme` | `system` |
| `language` | `system` |
| `notifications_enabled` | `true` |
| `notif_{loopId}` | Scheduled notification identifier, created at runtime |
| `notif_early_{loopId}` | Early-warning identifier, created at runtime |

Default daily/monthly intention keys are written when the user changes them; until then the app uses the built-in 8-hour/160-hour defaults.

Indexes cover the access paths used by the app:

- `tasks`: `parent_task_id`, `status`
- `loops`: `local_date`, `status`, `task_id`
- `loop_intervals`: `loop_id`, `started_at`
- `loop_items`: `loop_id`
- `loop_item_intervals`: `loop_id`, `item_id`, `started_at`
- `intentions`: `(period_type, period_key)`

## Connection pragmas and migration policy

`migrateDbIfNeeded` runs on every database open through `SQLiteProvider`'s `onInit`. It always applies:

- `PRAGMA journal_mode = WAL`
- `PRAGMA foreign_keys = ON`

Both are connection-scoped, so the app never assumes they survived from a previous connection. It then reads `PRAGMA user_version` and compares it with `TARGET_VERSION` (currently 4). Migrations add, in order: the base schema, loop checklist items, the current-capsule flag, and capsule-level focus intervals. A fresh database replays the versioned blocks from zero; afterward the target version is written back.

To add a migration, increment `TARGET_VERSION` and append a new versioned block that only runs when the stored version is below the new target. Already-shipped blocks must not be edited, because existing installs will never rerun them.

## Repository responsibilities

Repositories own SQL text, parameter binding, and row-to-type mapping. They do not own business rules or transaction boundaries. Examples:

- `loopsRepository` inserts loops, looks up the active loop, assigns the next per-day sequence, updates status/journal fields, and lists loops by date/task.
- `intervalsRepository` creates intervals, closes the open interval, and queries intervals by loop or overlapping time range.
- `tasksRepository` inserts/updates tasks, lists roots or children, computes sibling sort order, and deletes a task.
- `intentionsRepository` performs the get/upsert/delete cycle keyed by period.
- `settingsRepository` provides key/value get/set/delete with an upsert on conflict.
- `loopItemsRepository` owns capsule snapshots and carry-in ordering; `loopItemIntervalsRepository` owns the capsule focus log and closes open capsule intervals on state changes.

All queries use placeholders for values. Dynamic SQL is limited to generated placeholder lists and column assignments built from a closed set of repository-defined keys.

## Transaction ownership

Application services own multi-row transactions. For loops, `startLoop`, `pauseLoop`, `resumeLoop`, and `completeLoop` wrap their writes in `db.withTransactionAsync()` so a crash cannot leave a half-applied transition. The repository calls inside the transaction remain ordinary parameterized statements.

The database does not enforce "at most one open interval per loop" with a unique index. That invariant is maintained by the loop service, which closes any open interval before pausing/completing and only creates a new interval on resume. Direct repository writes outside the service must preserve that rule.

## Settings and notification identifiers

The `settings` table is seeded with:

| Key | Default |
| --- | --- |
| `default_duration_seconds` | `3600` |
| `theme` | `system` |
| `language` | `system` |
| `notifications_enabled` | `true` |

Notification scheduling adds per-loop keys `notif_{loopId}` and `notif_early_{loopId}` whose values are OS notification identifiers. The notification service reads these keys to cancel specific scheduled notifications and deletes them after cancellation. `cancelAllLoopNotifications` scans `getAllSettings` and removes every `notif_` key, so stale identifiers do not accumulate.

## Invariants and gotchas

- `PRAGMA foreign_keys = ON` must run on every connection; without it, cascade and `SET NULL` behavior silently disappears.
- `local_date` records the day a loop started. It is not authoritative for history totals or intention progress; those use interval overlap and zoned allocation.
- `loop_intervals.ended_at` is null only for the single running interval of an `ACTIVE` loop.
- Deleting a task cascades to its descendants, while loops referencing it keep their rows and lose the task link.
- Settings values are strings; callers parse numbers and booleans.

## Related pages

- [System Architecture](../architecture/system-overview.md)
- [Loops, Intervals, and Timer Math](../domain/loops-and-timer.md)
- [Bootstrap, Foreground Recovery, and Notifications](../workflows/app-lifecycle-and-notifications.md)
- [Backup and Restore](../operations/backup-and-restore.md)
