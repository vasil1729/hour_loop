---
type: database
title: SQLite Persistence and Migrations
description: Schema, connection pragmas, migration policy, repository boundaries, transactions, and persisted settings keys for the local SQLite database.
tags: [sqlite, persistence, migrations, schema, expo-sqlite]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-e8e61d605125cac4d909755e
    resource: repo://docs/ARCHITECTURE.md
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

The version-1 schema has five tables:

| Table | Role | Key relationships |
| --- | --- | --- |
| `tasks` | Hierarchical task pool | `parent_task_id` self-FK, `ON DELETE CASCADE` |
| `loops` | One focus session plus journal | `task_id` and `roll_forward_task_id` reference `tasks` with `ON DELETE SET NULL` |
| `loop_intervals` | Canonical timer log | `loop_id` references `loops` with `ON DELETE CASCADE` |
| `intentions` | Daily/monthly targets | Unique `(period_type, period_key)` |
| `settings` | Preferences and notification identifiers | `key` primary key |

Timestamps are ISO-8601 UTC strings. Calendar keys (`local_date`, `period_key`) are local civil dates (`YYYY-MM-DD`) or months (`YYYY-MM`). Durations are integer seconds.

Indexes cover the access paths used by the app:

- `tasks`: `parent_task_id`, `status`
- `loops`: `local_date`, `status`, `task_id`
- `loop_intervals`: `loop_id`, `started_at`
- `intentions`: `(period_type, period_key)`

## Connection pragmas and migration policy

`migrateDbIfNeeded` runs on every database open through `SQLiteProvider`'s `onInit`. It always applies:

- `PRAGMA journal_mode = WAL`
- `PRAGMA foreign_keys = ON`

Both are connection-scoped, so the app never assumes they survived from a previous connection. It then reads `PRAGMA user_version` and compares it with `TARGET_VERSION` (currently 1). A fresh database runs `SCHEMA_V1`; afterward the target version is written back.

To add a migration, increment `TARGET_VERSION` and append a new versioned block that only runs when the stored version is below the new target. Already-shipped blocks must not be edited, because existing installs will never rerun them.

## Repository responsibilities

Repositories own SQL text, parameter binding, and row-to-type mapping. They do not own business rules or transaction boundaries. Examples:

- `loopsRepository` inserts loops, looks up the active loop, assigns the next per-day sequence, updates status/journal fields, and lists loops by date/task.
- `intervalsRepository` creates intervals, closes the open interval, and queries intervals by loop or overlapping time range.
- `tasksRepository` inserts/updates tasks, lists roots or children, computes sibling sort order, and deletes a task.
- `intentionsRepository` performs the get/upsert/delete cycle keyed by period.
- `settingsRepository` provides key/value get/set/delete with an upsert on conflict.

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
| `notifications_enabled` | `true` |

Notification scheduling adds a per-loop key `notif_{loopId}` whose value is the OS notification identifier. The notification service reads this key to cancel a specific scheduled notification and deletes it after cancellation. `cancelAllLoopNotifications` scans `getAllSettings` and removes every `notif_` key, so stale identifiers do not accumulate.

## Invariants and gotchas

- `PRAGMA foreign_keys = ON` must run on every connection; without it, cascade and `SET NULL` behavior silently disappears.
- `local_date` records the day a loop started. It is not authoritative for history totals or intention progress; those use interval overlap and zoned allocation.
- `loop_intervals.ended_at` is null only for the single running interval of an `ACTIVE` loop.
- Deleting a task cascades to its descendants, while loops referencing it keep their rows and lose the task link.
- Settings values are strings; callers parse numbers and booleans.

## Related pages

<!-- openwiki: broken internal link [/openwiki/architecture/system-overview.md] link "/openwiki/architecture/system-overview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [System Architecture](/openwiki/architecture/system-overview.md)
<!-- openwiki: broken internal link [/openwiki/domain/loops-and-timer.md] link "/openwiki/domain/loops-and-timer.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loops, Intervals, and Timer Math](/openwiki/domain/loops-and-timer.md)
<!-- openwiki: broken internal link [/openwiki/workflows/app-lifecycle-and-notifications.md] link "/openwiki/workflows/app-lifecycle-and-notifications.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Bootstrap, Foreground Recovery, and Notifications](/openwiki/workflows/app-lifecycle-and-notifications.md)
