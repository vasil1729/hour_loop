---
type: quickstart
title: Hour Loop Quickstart
description: Product concepts, repository map, runnable commands, core invariants, and where to read next.
tags: [quickstart, onboarding, expo, sqlite, offline-first]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Hour Loop Quickstart

Hour Loop is a calm, fully offline focus timer. A **Loop** is a timestamped focus session that can be paused, resumed, and closed with a short journal. Tasks, daily/monthly intentions, and history surround the timer. There are no accounts, no cloud sync, and no network dependency.

## Invariants to know first

- **SQLite is the source of truth.** Timer state is derived from persisted UTC intervals; display ticks never accumulate time.
- **One loop at a time.** A loop may be `ACTIVE` or `PAUSED`, but starting another while one exists throws `LoopAlreadyActiveError`.
- **Intervals, not counters.** Pause closes an interval, resume opens a new one, and elapsed time is recomputed from timestamps.
- **The target is exact.** Reaching it truncates the interval log at the crossing instant, pauses the loop, and clamps displayed elapsed time.
- **Calendar attribution is interval-based.** History and intentions use zoned allocation, not `loop.local_date`.
- **Language is local state.** System or an explicit choice resolves to a typed dictionary; English is the fallback.
- **Web is a preview only.** The shipped product targets native; the browser build exists for UI development.

## Commands

```bash
npm install
npx expo start        # then press a/i or scan the QR code
npm run web           # development-only browser preview at :8081
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npm test              # Jest domain/service suites
npm run doctor        # expo-doctor health checks
npm run apk:local     # build an Android APK into builds/
```

Local APK builds require Node 22+, JDK 17, and Android SDK platform 35/build-tools 35.0.0. Releases are separate: bump `expo.version`, push a matching `v*` tag, and let the Android Release workflow publish; normal commits never release.

## Repository map

```text
app/                 Expo Router screens and layouts
src/domain/          Pure rules: timer math, tasks, intentions, dates
src/database/        Schema migrations and parameterized repositories
src/features/        Application services: loops, tasks, intentions, history
src/services/        Notifications, lifecycle recovery, navigation helpers
src/store/           Zustand display caches derived from SQLite
src/components/      Reusable presentational components
src/i18n/            Typed dictionaries and language resolution
src/theme/           Tokens and theme provider
scripts/             Local Android APK builder
.github/workflows/   Manual APK build, release, and OpenWiki update
openwiki/            Generated product, architecture, and operations wiki
```

## Read by task

| If you are working on… | Start here |
| --- | --- |
| Product vision, concepts, screens, scope | [Product Overview](product/overview.md) |
| Overall layering, bootstrap, state ownership | [System Architecture](architecture/system-overview.md) |
| Timer correctness, pauses, exact targets, midnight/DST | [Loops, Intervals, and Timer Math](domain/loops-and-timer.md) |
| Task tree, moves, capsules, subtree focus time | [Task Hierarchy](domain/tasks.md) |
| Daily/monthly targets and history totals | [Intentions and History](domain/intentions-and-history.md) |
| Schema, migrations, repositories, settings | [SQLite Persistence and Migrations](database/persistence.md) |
| Start → timer → journal → history | [Loop Lifecycle End to End](workflows/loop-lifecycle.md) |
| Startup, foreground recovery, notifications | [Bootstrap, Foreground Recovery, and Notifications](workflows/app-lifecycle-and-notifications.md) |
| Routes, day view, theme, shared components | [Navigation, Screens, and Theming](ui/navigation-and-theming.md) |
| Backup envelope, import rules, restore workflow | [Backup and Restore](operations/backup-and-restore.md) |
| APK builds, artifacts, releases | [Android Builds and Releases](operations/android-builds-and-releases.md) |
| Browser preview and its limits | [Web Preview](operations/web-preview.md) |
| Test coverage and build gates | [Testing Strategy](testing/strategy.md) |

## First things to check before changing behavior

1. Does the change belong in pure domain code, a service, or a screen? Keep transaction boundaries in services.
2. Does it affect persisted intervals or status transitions? Run the loop-service tests and add a case if the state machine changes.
3. Does it affect day/month attribution? Verify midnight and DST behavior through the timer tests.
4. Does it add a native dependency used by fonts/assets? Rebuild the APK and verify icons on a device; `expo-file-system` is required for bundled font loading.

## Related pages

- [Product Overview](product/overview.md)
- [System Architecture](architecture/system-overview.md)
- [Loop Lifecycle End to End](workflows/loop-lifecycle.md)
- [Testing Strategy](testing/strategy.md)
