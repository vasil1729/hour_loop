<p align="center">
  <img src="assets/icon.png" alt="Hour Loop icon" width="160" height="160" />
</p>

<h1 align="center">Hour Loop</h1>

<p align="center">
  An offline-first focus timer for intentional time management.
</p>

A **Loop** is a timestamped focus session that can be paused, resumed, and closed with a short completion journal. An independent hierarchical task pool, daily and monthly time intentions, and a full history view sit alongside the timer.

Everything is stored in local SQLite. No account, no network, no tracking.

## Features

- **Loops** — start, pause, resume, and stop focus sessions with crash-safe persisted timing, a live progress bar and quick pause/resume on Today, and a local-time session log.
- **Completion journal** — capture focus, carry-in, done, roll-forward, and notes at the end of a loop.
- **Task pool** — nested tasks with progress, associated loop history, and aggregated focus time.
- **Intentions** — daily and monthly time targets with actual-vs-planned progress.
- **History** — per-day and per-month breakdowns, including midnight-crossing allocation.
- **Notifications** — local target-reached reminders, reconciled on foreground.
- **Backups** — export and restore all local data as a portable JSON file.
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

### Web preview (development only)

Hour Loop targets native platforms. The web build exists only as a quick UI preview:

```bash
npm run web
```

Open http://localhost:8081. On a desktop browser the app renders inside a 390×844 phone frame; on a phone-sized viewport it fills the screen. `expo-sqlite` runs in the browser through WASM, so the preview is interactive, but local notifications are disabled on web.


## Android builds

### Build an APK locally

The local builder creates a versioned release APK in `builds/`, which is ignored by Git. It does not commit, push, or publish anything.

Prerequisites:

- Node.js 22+
- JDK 17 (the JDK bundled with Android Studio works)
- Android SDK with platform 35 and build-tools 35.0.0
- `ANDROID_HOME` pointing at the SDK (for example `$HOME/Android/Sdk`)

```bash
npm install
npm run apk:local
```

Output for the default `arm64-v8a` build:

```text
builds/hour-loop-v1.0.0-arm64.apk
builds/hour-loop-v1.0.0-arm64.apk.sha256
```

The version comes from `expo.version` in `app.json`, so local and published builds share the same version scheme.

By default the builder targets modern 64-bit phones, which keeps the APK and native compile much smaller. Use a universal build when you need every ABI:

```bash
APK_ARCH=universal npm run apk:local
```

Available targets are `arm64-v8a` (default), `armeabi-v7a`, `x86_64`, and `universal`.

The builder keeps a reusable `.apk-build/` native project so Gradle can reuse compilation outputs and caches between runs. Delete it or run `CLEAN_BUILD_DIR=1 npm run apk:local` for a clean build.

Build efficiency notes:

- Local builds use the Gradle daemon and build cache; CI disables the daemon because each runner is disposable.
- `arm64-v8a` avoids compiling and packaging the three other ABIs. `universal` includes `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`, so it is substantially larger and slower to build.
- Expo's generated Gradle config uses a 2 GB Gradle heap, which is adequate for this project. CI raises Node's heap limit to 4 GB for Metro.

### Install a build on your phone

For a local build, transfer `builds/hour-loop-v<version>-<arch>.apk` to your phone. For a published build, download it from the [GitHub Releases page](https://github.com/vasil1729/hour_loop/releases/latest).

1. Open the APK on your phone.
2. Allow installs from your browser or file manager when Android prompts.
3. Optionally verify the download against the matching `.sha256` file.

APKs are release-built but signed with the standard React Native debug keystore, so they are intended for direct sideloading and testing rather than Google Play distribution.

### Build remotely without releasing

The **Android APK** workflow is manual only. It builds an APK and uploads it as a workflow artifact; it never creates a release.

1. Open **Actions → Android APK → Run workflow**.
2. Choose `arm64-v8a` or `universal`.
3. Download the APK from the run's **Artifacts** section.

### Publish a versioned release

Normal commits never trigger a release. Version numbers use three parts — `major.minor.patch`, for example `1.1.1`. Automatic releases run only for major or minor version bumps, using tags such as `v1.1.0`. A patch-only tag such as `v1.1.1` is skipped; publish patches with a manual workflow run instead.

1. Bump `expo.version` in `app.json`.
2. Commit and push the version bump to `main`.
3. For a major or minor release, create and push a matching tag:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The workflow validates that the tag matches `expo.version`, builds the APK, uploads it as a workflow artifact, and publishes a GitHub release with the APK and checksum attached.

For a patch release, do not push a tag. Run **Actions → Android Release → Run workflow** from `main` to publish the current `expo.version`, including patch-only changes. Manual runs always release the version in `app.json`. The existing `android-build-1` release is the initial unversioned test build.

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
- [Backup format](docs/BACKUP_FORMAT.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [OpenWiki quickstart](openwiki/quickstart.md)

## Design principles

1. **SQLite is the source of truth.** Timer state is derived from persisted UTC intervals; display ticks never accumulate.
2. **Offline by default.** All features work in airplane mode.
3. **Small, transparent layers.** Raw SQL repositories and pure domain functions keep behaviour testable and debuggable.
