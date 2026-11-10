# Hour Loop — Architecture

## Overview

Hour Loop is an Expo SDK 53 / React Native app using Expo Router, local SQLite, and Zustand for display state. The architecture separates pure domain rules, persistence, application services, and UI.

```
app/                  Expo Router screens (UI + navigation)
src/domain/           Pure business rules and date/time maths
src/database/         SQLite migrations and repositories
src/features/         Application services (loops, tasks, intentions, history)
src/services/         Platform services (notifications, app lifecycle)
src/store/            Zustand display stores
src/components/       Reusable presentational components
src/theme/            Design tokens and theme provider
```

## Data flow

```
Screen → feature service → repository → SQLite
   ↑                                      │
   └──────── display store ←──────────────┘
```

- SQLite is always the source of truth.
- Zustand stores hold only derived display state and are refreshed from the database on app start, on screen focus, and on foreground.
- Repositories contain parameterised SQL and row mapping. Services own transactions and business rules.

## Timer model

Timing is a persisted **interval log**, not a ticking counter.

- `loop_intervals` rows have `started_at`, optional `ended_at`, and the originating `time_zone`.
- Elapsed seconds:
  - closed intervals: `ended_at - started_at`
  - the single open interval: `now - started_at`
- A one-second `setInterval` in `useActiveLoop` is only a display refresh trigger. Every tick re-reads intervals and recalculates elapsed time. It never accumulates.
- Pause closes the open interval. Resume opens a new one. Complete closes any open interval at the stop instant.
- Stopping from the active screen pauses the loop before navigating to the journal, so journaling time is not counted.

### Calendar allocation

Focus time must be attributed to local calendar days correctly, including midnight crossings and DST.

- `allocateIntervalToDays` walks the interval to each local midnight in the interval's IANA time zone.
- `allocateIntervalToMonths` builds on the day allocation.
- Civil-time to UTC conversion uses `Intl.DateTimeFormat` parts with a two-pass offset refinement for DST.
- History and intention progress use allocation, never `loop.local_date`, so a loop crossing midnight is split correctly.

## Persistence

- `expo-sqlite` with `PRAGMA user_version` migrations.
- `PRAGMA foreign_keys = ON` runs on every open inside `SQLiteProvider`'s `onInit`.
- `PRAGMA journal_mode = WAL`.
- Multi-table writes (`start`, `pause`, `resume`, `complete`) run inside `db.withTransactionAsync()`.
- `settings` stores preferences and notification identifiers (`notif_{loopId}`).

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

## Loop state machine

Implemented in `src/features/loops/loopService.ts`:

| From | Action | To |
|---|---|---|
| — | start | ACTIVE |
| ACTIVE | pause | PAUSED |
| PAUSED | resume | ACTIVE |
| ACTIVE | complete | COMPLETED |
| PAUSED | complete | COMPLETED |

Invalid transitions throw `InvalidStateTransitionError`. Starting while a loop is active or paused throws `LoopAlreadyActiveError`.

The service accepts injectable dependencies (clock, ID generator, time zone, repositories), which keeps state-machine tests fast and deterministic without a native SQLite instance.

## Tasks

- Tasks form an adjacency-list hierarchy with `parent_task_id` and self-referencing `ON DELETE CASCADE`.
- `taskDomain` provides sorting, tree building, flattening, descendant collection, cycle detection, and child progress.
- The task pool uses a flattened `FlatList`; it never recursively nests views.
- `moveTask` validates that the new parent is not the task itself or one of its descendants.

## Intentions and history

- Intention targets are keyed by `period_type` + `period_key` (`YYYY-MM-DD` or `YYYY-MM`).
- Actual time is derived from intervals overlapping the local day/month bounds.
- History day view groups interval allocations by loop to show per-loop time for the selected day.
- Monthly summaries count unique loops and use monthly allocation for actual time.

## Notifications

- Local notifications are scheduled with a `TIME_INTERVAL` trigger for the remaining target duration.
- An Android high-importance channel (`loop-targets`) is created at startup.
- Notification IDs are persisted in `settings` as `notif_{loopId}`.
- Scheduling is reconciled whenever the app foregrounds: cancel the old notification, re-read intervals, and reschedule only for ACTIVE loops with notifications enabled.
- Pause, stop, and complete cancel the scheduled notification.

## Theme

- Design tokens live in `src/theme/tokens.ts`.
- `ThemeProvider` resolves `system`/`light`/`dark` preference against `useColorScheme`.
- The preference is persisted in SQLite through `settingsStore`.

## Testing

- Jest with `jest-expo`.
- Pure domain tests cover timer maths, day/month allocation, DST, task trees, cycles, and intention progress.
- Loop service tests use injected in-memory repositories and a controllable clock to exercise every transition and crash-restart recovery.
- TypeScript strict mode and `npx expo export --platform android` are used as build gates.

## Key decisions

- **No ORM.** The schema is small and stable; raw parameterised SQL keeps the data layer transparent.
- **Zustand is never authoritative.** Stores are display caches that can always be rebuilt from SQLite.
- **Persisted intervals over counters.** Crash, force-quit, and background termination cannot corrupt elapsed time.
- **Flattened task list.** Deep hierarchies stay performant on Android.
- **Local-only identifiers.** `createId` uses platform `crypto.randomUUID` when available with a local fallback, avoiding an ESM dependency in the React Native bundle.
