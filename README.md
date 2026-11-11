# Hour Loop

Hour Loop is an offline-first focus timer for intentional time management. A **Loop** is a timestamped focus session that can be paused, resumed, and closed with a short completion journal. An independent hierarchical task pool, daily and monthly time intentions, and a full history view sit alongside the timer.

Everything is stored in local SQLite. No account, no network, no tracking.

## Features

- **Loops** — start, pause, resume, and stop focus sessions with crash-safe persisted timing.
- **Completion journal** — capture focus, carry-in, done, roll-forward, and notes at the end of a loop.
- **Task pool** — nested tasks with progress, associated loop history, and aggregated focus time.
- **Intentions** — daily and monthly time targets with actual-vs-planned progress.
- **History** — per-day and per-month breakdowns, including midnight-crossing allocation.
- **Notifications** — local target-reached reminders, reconciled on foreground.
- **Themes** — system, light, and dark.

## Tech stack

- Expo SDK 53 / React Native 0.79 / React 19
- Expo Router
- expo-sqlite with `PRAGMA user_version` migrations
- Zustand for display state only (SQLite stays the source of truth)
- Jest + jest-expo for domain and service tests

## Getting started

```bash
npm install
npx expo start
```

Press `a` for an Android emulator, `i` for iOS, or scan the QR code with Expo Go. Local notifications require a development build on some platforms.

## Android builds

### Build an APK locally

The local builder creates a release APK in `builds/`, which is ignored by Git. It does not commit, push, or publish anything.

Prerequisites:

- Node.js 22+
- JDK 17 (the JDK bundled with Android Studio works)
- Android SDK with platform 35 and build-tools 35.0.0
- `ANDROID_HOME` pointing at the SDK (for example `$HOME/Android/Sdk`)

```bash
npm install
npm run apk:local
```

Output:

```text
builds/hour-loop-v1.0.0.apk
builds/hour-loop-v1.0.0.apk.sha256
```

The script builds in a temporary native directory and cleans it up afterwards. Set `KEEP_BUILD_DIR=1` to keep it for debugging.

### Install a build on your phone

For a local build, transfer `builds/hour-loop-v<version>.apk` to your phone. For a published build, download it from the [GitHub Releases page](https://github.com/vasil1729/hour_loop/releases/latest).

1. Open the APK on your phone.
2. Allow installs from your browser or file manager when Android prompts.
3. Optionally verify the download against the matching `.sha256` file.

APKs are release-built but signed with the standard React Native debug keystore, so they are intended for direct sideloading and testing rather than Google Play distribution.

### Publish a versioned release

Releases are never created automatically on push.

1. Bump `expo.version` in `app.json`.
2. Commit and push the version bump.
3. Open **Actions → Android APK → Run workflow**.
4. Enable **Publish a versioned GitHub release** and run it from `main`.

The workflow builds the APK, uploads it as a run artifact, and—only when requested—creates tag `v<version>` with `hour-loop-v<version>.apk` attached. The existing `android-build-1` release is the initial unversioned test build.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

## Project layout

```
app/                 Expo Router screens
src/domain/          Pure domain logic (timer, tasks, intentions, dates)
src/database/        SQLite schema and repositories
src/features/        Application services
src/services/        Notifications and app lifecycle
src/store/           Zustand display stores
src/components/      Reusable UI
src/theme/           Design tokens and theme provider
docs/                Product and architecture documentation
```

## Documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)

## Design principles

1. **SQLite is the source of truth.** Timer state is derived from persisted UTC intervals; display ticks never accumulate.
2. **Offline by default.** All features work in airplane mode.
3. **Small, transparent layers.** Raw SQL repositories and pure domain functions keep behaviour testable and debuggable.
