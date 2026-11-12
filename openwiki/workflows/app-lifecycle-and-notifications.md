---
type: workflow
title: Bootstrap, Foreground Recovery, and Notifications
description: App startup order, settings hydration, active-loop recovery, foreground reconciliation, and local notification scheduling and cancellation.
tags: [lifecycle, notifications, bootstrap, appstate, expo-notifications]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ae02914ded99b1045ea700e3
    resource: repo://app/_layout.tsx
  - id: openwiki-source-e9ca948e114b2e3514aea593
    resource: repo://app/(tabs)/settings.tsx
  - id: openwiki-source-105a511030459b519febb828
    resource: repo://app/loop/active.tsx
  - id: openwiki-source-e7855150bad9a1bcf225de42
    resource: repo://app/loop/complete.tsx
  - id: openwiki-source-3c40aa382bd977e33e8aa227
    resource: repo://app/loop/start.tsx
  - id: openwiki-source-0315e05c947ec87a1ebf7694
    resource: repo://src/services/lifecycle/appLifecycleService.ts
  - id: openwiki-source-35855f6034a3aedd41cf8509
    resource: repo://src/services/notifications/notificationService.ts
  - id: openwiki-source-019ac0168a7afbf45abe04a8
    resource: repo://src/store/settingsStore.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Bootstrap, Foreground Recovery, and Notifications

This page follows the app from process start through database initialization, settings hydration, active-loop recovery, and the local notification lifecycle.

## Startup order

`RootLayout` sets up the runtime in this order:

1. `WebPhoneFrame` (web preview only)
2. `SafeAreaProvider`
3. `ThemeProvider`
4. `I18nProvider`
5. `DatabaseErrorBoundary`
6. `Suspense` with a localized loading screen
7. `SQLiteProvider` with `databaseName="hour-loop.db"` and `onInit={migrateDbIfNeeded}`, using suspense
8. `AppBootstrap`
9. `RootNavigator`

`SQLiteProvider` suspends until the database is open and migrations have run. A migration or open failure is caught by `DatabaseErrorBoundary`, which renders a localized error or "database already open" screen instead of an uncaught render error.

`AppBootstrap` has effects for:

- **Hydration/recovery:** load settings from SQLite, then run `recoverAppState(db)`.
- **Global target guard:** `useTargetGuard` schedules the exact target pause even when no timer screen is mounted.
- **Platform services:** call `setupNotifications()` and register `subscribeToForeground(db)`; cleanup removes only the foreground subscription.

Settings must load before recovery because recovery may schedule a notification and the notification service reads `notifications_enabled` and the loop data. `I18nProvider` resolves language before the database opens so loading and error screens are localized too.

## Settings hydration

The settings store loads these keys in parallel:

- `default_duration_seconds`
- default daily/monthly intention seconds
- `early_warning_minutes`
- `theme`
- `language`
- `notifications_enabled`

It falls back to 3600 seconds for a missing/invalid duration, the built-in 8-hour/160-hour intention defaults, `system` for an unknown theme or language, and enabled unless the stored value is exactly `"false"`. Writes update SQLite first and then the store, so a failed write does not leave the UI claiming a preference was saved.

## Foreground recovery

`recoverAppState`:

1. calls `useLoopStore.getState().refresh(db)`, which re-reads the active loop and recomputes elapsed seconds;
2. if an active loop exists, calls `syncLoopNotification(db, activeLoop)`.

`subscribeToForeground` listens to `AppState` and runs recovery only when the state becomes `active`. This is the convergence path after backgrounding, locking the device, or a process restart: the persisted intervals and loop status are re-read, and the notification is reconciled.

## Notification setup

`setupNotifications` returns immediately on web. On native it installs a notification handler that shows banners/list entries, plays sound, and skips badge updates. On Android it creates the `loop-targets` channel with high importance, a vibration pattern, the accent color, and the default sound. Channel names and descriptions come from the active translation dictionary; changing language refreshes them.

Permission helpers also guard web and return `false`. `requestNotificationPermission` returns early when permission is already granted, refuses when `canAskAgain` is false, and otherwise requests permission.

## Scheduling and reconciliation

`syncLoopNotification(db, loop, options)` is idempotent at the loop level:

1. Cancel any existing scheduled notification for that loop.
2. Return unless the loop is `ACTIVE`.
3. Return when `notifications_enabled` is `"false"`.
4. Re-read intervals and compute elapsed time.
5. Return when remaining time is zero or less.
6. Check or request permission (`options.requestPermission` controls which).
7. Schedule a `TIME_INTERVAL` notification for the remaining seconds, with the Android channel.
8. Persist the OS identifier under `notif_{loopId}`.

The trigger uses at least one second and rounds the remaining duration. The notification payload includes the loop ID, a localized `H{sequence_number} target reached` title, and a body inviting the user to keep going or close the loop. Early warnings use the same localized path and are scheduled only when the remaining time is longer than the warning window.

## Lifecycle touchpoints

| Event | Notification action |
| --- | --- |
| Start loop | `syncLoopNotification(..., { requestPermission: true })` after insert |
| Pause / Stop | Pause the loop, then sync; the non-ACTIVE check cancels the schedule |
| Resume | Resume, then sync with `requestPermission: true` |
| Complete / Save | `cancelLoopNotification` after completing |
| App foreground | Recovery refreshes store and syncs the active loop |
| Settings off | `cancelAllLoopNotifications`, then persist the preference |
| Settings on | Request permission, persist, then recover with permission request |

`cancelLoopNotification` reads the `notif_{loopId}` setting, attempts the OS cancellation (ignoring an already-fired/removed notification), and deletes the setting. `cancelAllLoopNotifications` cancels all scheduled OS notifications and removes every settings key starting with `notif_`.

## Failure behavior

- Missing notification settings mean notifications are enabled by default.
- A denied permission leaves the loop running but unscheduled.
- A failed schedule is caught by callers in the loop screens, so the timer flow continues.
- On web, notification helpers no-op rather than throwing.

## Related pages

- [Loop Lifecycle End to End](../workflows/loop-lifecycle.md)
- [SQLite Persistence and Migrations](../database/persistence.md)
- [Loops, Intervals, and Timer Math](../domain/loops-and-timer.md)
- [Product Overview](../product/overview.md)
