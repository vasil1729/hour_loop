---
type: quickstart
title: Hour Loop Quickstart
description: Product concepts, repository map, runnable commands, core invariants, and where to read next.
tags: [quickstart, onboarding, expo, sqlite, offline-first]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-7b048c0c1552ba7ab4761ff9
    resource: repo://docs/PRODUCT_SPEC.md
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
- **Calendar attribution is interval-based.** History and intentions use zoned allocation, not `loop.local_date`.
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
src/theme/           Tokens and theme provider
docs/                Product spec, architecture, database schema
scripts/             Local Android APK builder
.github/workflows/   Manual APK build and tag-triggered release
```

## Read by task

| If you are working on… | Start here |
| --- | --- |
<!-- openwiki: broken internal link [/openwiki/architecture/system-overview.md] link "/openwiki/architecture/system-overview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Overall layering, bootstrap, state ownership | [System Architecture](/openwiki/architecture/system-overview.md) |
<!-- openwiki: broken internal link [/openwiki/domain/loops-and-timer.md] link "/openwiki/domain/loops-and-timer.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Timer correctness, pauses, midnight/DST | [Loops, Intervals, and Timer Math](/openwiki/domain/loops-and-timer.md) |
<!-- openwiki: broken internal link [/openwiki/domain/tasks.md] link "/openwiki/domain/tasks.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Task tree, moves, subtree focus time | [Task Hierarchy](/openwiki/domain/tasks.md) |
<!-- openwiki: broken internal link [/openwiki/domain/intentions-and-history.md] link "/openwiki/domain/intentions-and-history.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Daily/monthly targets and history totals | [Intentions and History](/openwiki/domain/intentions-and-history.md) |
<!-- openwiki: broken internal link [/openwiki/database/persistence.md] link "/openwiki/database/persistence.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Schema, migrations, repositories, settings | [SQLite Persistence and Migrations](/openwiki/database/persistence.md) |
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Start → timer → journal → history | [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md) |
<!-- openwiki: broken internal link [/openwiki/workflows/app-lifecycle-and-notifications.md] link "/openwiki/workflows/app-lifecycle-and-notifications.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Startup, foreground recovery, notifications | [Bootstrap, Foreground Recovery, and Notifications](/openwiki/workflows/app-lifecycle-and-notifications.md) |
<!-- openwiki: broken internal link [/openwiki/ui/navigation-and-theming.md] link "/openwiki/ui/navigation-and-theming.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Routes, theme, shared components | [Navigation, Screens, and Theming](/openwiki/ui/navigation-and-theming.md) |
<!-- openwiki: broken internal link [/openwiki/operations/android-builds-and-releases.md] link "/openwiki/operations/android-builds-and-releases.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| APK builds, artifacts, releases | [Android Builds and Releases](/openwiki/operations/android-builds-and-releases.md) |
<!-- openwiki: broken internal link [/openwiki/operations/web-preview.md] link "/openwiki/operations/web-preview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Browser preview and its limits | [Web Preview](/openwiki/operations/web-preview.md) |
<!-- openwiki: broken internal link [/openwiki/testing/strategy.md] link "/openwiki/testing/strategy.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
| Test coverage and build gates | [Testing Strategy](/openwiki/testing/strategy.md) |

## First things to check before changing behavior

1. Does the change belong in pure domain code, a service, or a screen? Keep transaction boundaries in services.
2. Does it affect persisted intervals or status transitions? Run the loop-service tests and add a case if the state machine changes.
3. Does it affect day/month attribution? Verify midnight and DST behavior through the timer tests.
4. Does it add a native dependency used by fonts/assets? Rebuild the APK and verify icons on a device; `expo-file-system` is required for bundled font loading.

## Related pages

<!-- openwiki: broken internal link [/openwiki/architecture/system-overview.md] link "/openwiki/architecture/system-overview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [System Architecture](/openwiki/architecture/system-overview.md)
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
<!-- openwiki: broken internal link [/openwiki/testing/strategy.md] link "/openwiki/testing/strategy.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Testing Strategy](/openwiki/testing/strategy.md)
