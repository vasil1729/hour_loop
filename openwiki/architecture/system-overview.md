---
type: architecture
title: System Architecture
description: Layering, bootstrap order, state ownership, and cross-cutting invariants of the Expo Router + SQLite application.
tags: [architecture, expo-router, sqlite, zustand, offline-first]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ae02914ded99b1045ea700e3
    resource: repo://app/_layout.tsx
  - id: openwiki-source-e8e61d605125cac4d909755e
    resource: repo://docs/ARCHITECTURE.md
  - id: openwiki-source-7b048c0c1552ba7ab4761ff9
    resource: repo://docs/PRODUCT_SPEC.md
  - id: openwiki-source-ff385a65eaba1b8e35bc34a0
    resource: repo://src/database/migrations.ts
  - id: openwiki-source-7d24fbcd9fbfe98357e67e98
    resource: repo://src/database/repositories/loopsRepository.ts
  - id: openwiki-source-d32aa26ef745f6a7c3488f36
    resource: repo://src/features/loops/loopService.ts
  - id: openwiki-source-0315e05c947ec87a1ebf7694
    resource: repo://src/services/lifecycle/appLifecycleService.ts
  - id: openwiki-source-f03aed9303464254ab1db7c9
    resource: repo://src/store/loopStore.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# System Architecture

Hour Loop is an offline-first Expo SDK 53 application. It has no account system, network API, or cloud store: the device's SQLite database is the only durable source of truth. The code separates routing and presentation (`app/`, `src/components/`), pure rules (`src/domain/`), persistence (`src/database/`), application services (`src/features/`, `src/services/`), and disposable display state (`src/store/`).

## Runtime composition and startup order

`RootLayout` composes the runtime in a fixed order:

1. `WebPhoneFrame` is a no-op on native and only constrains the development web preview.
2. `SafeAreaProvider` supplies device insets.
3. `ThemeProvider` resolves the system/light/dark preference.
4. `Suspense` shows a loading screen while the database opens.
5. `SQLiteProvider` opens `hour-loop.db`, runs `migrateDbIfNeeded` through `onInit`, and suspends until initialization completes.
6. `AppBootstrap` loads settings, recovers any active loop, and starts platform subscriptions.

The bootstrap deliberately loads settings before `recoverAppState`. Recovery refreshes the loop store and may reschedule a target notification, so it needs the persisted notification preference and theme state to be available. A second effect calls `setupNotifications()` and registers the `AppState` foreground listener. Cleanup removes only the foreground subscription; notification setup is process-wide.

A failed database open or migration keeps the app on the suspense/loading screen rather than rendering against a partially initialized database.

## Layer boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Screens and layout | `app/` | Expo Router routes, navigation structure, screen-level orchestration |
| Shared UI | `src/components/` | Presentational building blocks and modal forms |
| Domain rules | `src/domain/` | Pure timer math, calendar allocation, task-tree rules, intention progress, date/ID helpers |
| Persistence | `src/database/` | Schema migrations, parameterized SQL, row mapping |
| Application services | `src/features/` | Transactions, state transitions, aggregation across repositories |
| Platform services | `src/services/` | Notifications, foreground recovery, navigation helpers |
| Display state | `src/store/` | Zustand caches derived from SQLite |
| Design system | `src/theme/` | Tokens and resolved color schemes |

Dependencies point inward: screens call services, services call repositories and pure domain functions, and repositories call `expo-sqlite`. Domain modules do not import React Native or the database, which keeps their tests fast and deterministic.

## Data flow and state ownership

The primary path is:

```text
Screen -> feature service -> repository -> SQLite
   ^                                      |
   +---------- display store <------------+
```

SQLite is authoritative. Zustand stores are explicitly documented as display-only and are refreshed from the database on startup, on screen focus, and when the app returns to the foreground. The loop store holds the active loop and elapsed seconds, but `loopService.getActiveLoop` and `getElapsedSeconds` reconstruct that state from persisted rows. Clearing or losing a store therefore loses only presentation state, not user data.

The same rule applies to derived screens: Today, History, and Task detail query repositories/services on focus instead of trusting a long-lived client cache. This is why a force-quit or a paused/backgrounded timer converges to the correct state after relaunch.

## Service and transaction pattern

`loopService` is a factory with injectable repository ports, a clock, an ID generator, and a time-zone provider. Production uses the default dependencies; tests replace them with in-memory repositories and a controllable clock. All state transitions validate the current status before writing.

Multi-row operations use `db.withTransactionAsync()`:

- Start writes the `loops` row and the first open `loop_intervals` row atomically.
- Pause closes the open interval and changes the loop status atomically.
- Resume changes the status and opens a new interval atomically.
- Complete optionally closes an open interval, writes the journal, and marks the loop completed atomically.

Repositories contain parameterized SQL only; services own transaction boundaries and business rules. This split matters for invariants such as "one active or paused loop": the service checks for an existing loop before inserting, while the repository provides the query.

## Platform services

Notifications and lifecycle handling are isolated from domain logic. `recoverAppState` refreshes the loop store and reconciles the scheduled target notification. `subscribeToForeground` invokes that recovery only when `AppState` becomes `active`. Notification helpers guard the web platform early and persist scheduled identifiers in the `settings` table under `notif_{loopId}`.

These services are intentionally thin adapters: business decisions such as whether a loop is still active, how much time remains, or whether notifications are enabled live in the store/service/domain layers, not in the OS callback.

## Invariants and failure behavior

- Only one loop may be `ACTIVE` or `PAUSED`; starting another throws `LoopAlreadyActiveError`.
- Elapsed time is derived from `loop_intervals`, never from an accumulating counter, so backgrounding and crashes cannot drift the timer.
- Calendar attribution uses the interval's stored IANA time zone; `loop.local_date` is a creation-day label, not the basis for history totals.
- Every database open re-applies `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, because both are connection-scoped.
- Schema migrations are versioned with `PRAGMA user_version`; the current target is version 1.
- Invalid state transitions throw typed errors instead of silently no-oping, except completing an already completed loop, which is rejected explicitly.
- Web is a development preview; native notifications and native SQLite behavior remain the shipped contract.

## Extension seams

- Add a feature by introducing a repository in `src/database/repositories/`, a service in `src/features/`, and a screen under `app/`; keep transaction ownership in the service.
- Add a schema change by incrementing `TARGET_VERSION` and adding a new migration branch before setting `user_version`.
- Add a display concern by extending a Zustand store, but always provide a path to rebuild it from SQLite.
- Add a platform capability behind a service in `src/services/` with a web guard when it is unavailable in the preview.

## Verification

<!-- openwiki: broken internal link [/openwiki/testing/strategy.md] link "/openwiki/testing/strategy.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
The architecture is exercised primarily by pure domain tests and service tests with injected dependencies. `loopService` tests cover every transition and crash-recovery behavior without a native database. Build gates are `npx tsc --noEmit`, `npx expo lint`, `npx jest --runInBand`, and an Android export. See [Testing Strategy](/openwiki/testing/strategy.md) for the coverage boundaries.

## Related pages

<!-- openwiki: broken internal link [/openwiki/database/persistence.md] link "/openwiki/database/persistence.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [SQLite Persistence and Migrations](/openwiki/database/persistence.md)
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
<!-- openwiki: broken internal link [/openwiki/ui/navigation-and-theming.md] link "/openwiki/ui/navigation-and-theming.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Navigation, Screens, and Theming](/openwiki/ui/navigation-and-theming.md)
