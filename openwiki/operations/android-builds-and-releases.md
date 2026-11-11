---
type: operations
title: Android Builds and Releases
description: The local APK builder, artifact naming and signing, the manual CI build workflow, and the tag-triggered release workflow.
tags: [android, apk, ci, releases, gradle, signing]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ab7f0c4fd8fbac641fb55423
    resource: repo://.github/workflows/android-apk.yml
  - id: openwiki-source-7e2feff63ac717cadd6c55fa
    resource: repo://.github/workflows/android-release.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-91abdd0b68b872442af61a64
    resource: repo://scripts/build-android-apk.sh
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Android Builds and Releases

Hour Loop has three distinct paths: a local APK builder, a manual CI build that produces an artifact, and a release workflow that publishes a GitHub release. Only the last one publishes, and it runs only for an explicit `v*` tag or a manual release dispatch from `main`.

## Local APK builder

`npm run apk:local` invokes `scripts/build-android-apk.sh`. The script:

1. Requires Node, `npx`, a JDK, and an Android SDK with platform 35 and build-tools 35.0.0. `JAVA_HOME/bin` is prepended to `PATH` when set.
2. Reads and validates `expo.version` from `app.json`.
3. Resolves an architecture: `arm64-v8a` (default), `armeabi-v7a`, `x86_64`, or `universal`.
4. Refreshes a reusable staging directory (`.apk-build/`) from the working tree, preserving its `android/` project and Gradle outputs for incremental builds. `node_modules` is symlinked, not copied.
5. Runs `npx expo prebuild --platform android --no-install` and `./gradlew :app:assembleRelease` with the requested ABI.
6. Copies the APK to `builds/hour-loop-v<version>-<arch>.apk` and writes a SHA-256 file next to it.

The local path never commits, tags, pushes, or publishes. `CLEAN_BUILD_DIR=1` removes the staging directory before building; `OUTPUT_DIR` and `STAGE_DIR` can relocate the outputs. Local builds use the Gradle daemon and build cache; CI passes `CI=1`, which adds `--no-daemon`.

## Manual CI build

`.github/workflows/android-apk.yml` is `workflow_dispatch` only. It has one job that checks out the repository, installs Node 22/Java 17/Android SDK packages, runs `npm ci`, validates the version, optionally caches Gradle, runs `npm run apk:local`, and uploads `builds/*` as a workflow artifact.

It has no `contents: write` permission, no release validation, and no `gh release` step. Running it can never create a release; it is the remote equivalent of a local build for checking an APK in CI or downloading an artifact.

## Release workflow

`.github/workflows/android-release.yml` triggers on:

- a pushed tag matching `v*`, or
- a manual `workflow_dispatch` run with an architecture choice.

It requests `contents: write` so it can create the release. Before building, it validates:

- On a tag event, the tag name must equal `v<expo.version>` exactly.
- On a manual run, the ref must be `refs/heads/main`.
- The commit must be an ancestor of `origin/main`.
- No GitHub release may already exist for the tag.
- If the tag already exists, it must point at the same commit.

It then builds with the same local script, uploads the artifact, and calls `gh release create` with the APK and checksum. Release notes identify the architecture and commit. The workflow is serialized per ref and does not cancel an in-progress release.

## Versioning and artifact names

`expo.version` in `app.json` is the single source of version truth. Local, manual-CI, and release builds all produce `hour-loop-v<version>-<arch>.apk`, where the suffix is `arm64`, `armv7`, `x86_64`, or `universal`. The release tag is `v<version>`.

Bumping `expo.version` and pushing a matching tag is the release operation. A tag that does not match `app.json` is rejected, and an existing release or tag on another commit is rejected before any build starts.

## Signing and distribution

APKs are release-built but signed with the standard React Native debug keystore. They are intended for direct sideloading and testing, not Google Play distribution. Users install by opening the APK and allowing installs from unknown sources; the checksum file can be used to verify the download.

## Standalone asset loading

The app declares `expo-file-system` alongside `expo-asset` and `expo-font`. In a standalone APK, `expo-asset` uses the file-system permission module when copying bundled fonts into the cache. Without that module, bundled icon fonts can fail to load and vector icons render blank even though the font files are present in the APK. Keep `expo-file-system` installed and rebuild the APK after changing font or asset dependencies.

## Related pages

<!-- openwiki: broken internal link [/openwiki/operations/web-preview.md] link "/openwiki/operations/web-preview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Web Preview](/openwiki/operations/web-preview.md)
<!-- openwiki: broken internal link [/openwiki/quickstart.md] link "/openwiki/quickstart.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Hour Loop Quickstart](/openwiki/quickstart.md)
<!-- openwiki: broken internal link [/openwiki/testing/strategy.md] link "/openwiki/testing/strategy.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Testing Strategy](/openwiki/testing/strategy.md)
