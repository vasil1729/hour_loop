---
type: testing
title: Testing Strategy
description: Jest configuration, pure-domain coverage, deterministic loop-service tests, build gates, and untested boundaries.
tags: [testing, jest, domain, services, coverage]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-827e7e3d0b1e5569b0a4c3da
    resource: repo://jest.config.js
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-86f843a65a22daf14daa068c
    resource: repo://src/domain/intentions/intentionsDomain.test.ts
  - id: openwiki-source-1b2c64be96343446e029d88c
    resource: repo://src/domain/tasks/taskDomain.test.ts
  - id: openwiki-source-b55214a2209394c1a358b94c
    resource: repo://src/domain/timer/timerEngine.test.ts
  - id: openwiki-source-38616d8fa86316f919606e7b
    resource: repo://src/features/loops/loopService.test.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Testing Strategy

The repository uses Jest with the `jest-expo` preset. The checked-in suites focus on pure domain rules and the loop service; there is no native UI, screenshot, or end-to-end test suite.

## Commands

```bash
npm test              # run Jest once
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npm run doctor        # expo-doctor 1.21.6
```

Android bundling is also used as a build gate:

```bash
npx expo export --platform android
```

The README documents typecheck, lint, and test as the standard quality checks.

## Jest configuration

`jest.config.js` sets:

- `preset: 'jest-expo'`
- `testMatch: ['**/?(*.)+(test).[jt]s?(x)']`
- coverage collection from `src/domain/**` and `src/features/**`, excluding test files

Coverage is therefore aimed at the pure rules and application services. Screens, platform services, repositories, and build scripts are outside the coverage glob.

## Domain suites

`src/domain/timer/timerEngine.test.ts` covers:

- exact elapsed seconds for closed intervals
- open intervals against a reference time
- multiple intervals after pause/resume
- zero intervals, reversed intervals, and negative-interval clamping
- midnight splitting, non-UTC local boundaries, DST spring-forward, and month boundaries
- remaining time, progress clamping, formatting, and `localMidnightAfter`

`src/domain/tasks/taskDomain.test.ts` covers:

- tree construction and sibling sorting
- missing parents promoted to roots
- flattening only expanded children
- descendant collection, including leaves
- self-parent and descendant-parent rejection, plus valid moves
- direct-child progress, archived-child exclusion, and leaf progress
- active-status classification

`src/domain/intentions/intentionsDomain.test.ts` covers:

- percentage and target-reached behavior
- zero targets and negative actual time
- day/month allocation helpers across multiple intervals

These tests import no React Native or SQLite APIs, so they run quickly and deterministically.

## Loop service tests

`src/features/loops/loopService.test.ts` builds a harness with:

- an in-memory `FakeState` holding loops and intervals
- repository ports implemented as plain async functions
- a fake database whose only used method is `withTransactionAsync`, which immediately runs the callback
- injectable `now`, `newId`, and `timeZone` functions
- an `advanceSeconds` helper to move the fake clock

The service is created with `createLoopService(deps)`, not the production singleton. Tests cover:

- starting a loop with an open interval and per-day sequence number
- rejecting a second active loop
- freezing elapsed time on pause and continuing on resume
- rejecting pause on a completed loop
- the full start → pause → resume → complete sequence
- stable elapsed time across a simulated app restart
- sequence increment for a second loop on the same day
- persistence of every completion-journal field

The restart test constructs a second service instance over the same harness state, which is the closest analogue to process restart without a native database.

## Untested boundaries

- No tests exercise `expo-sqlite` repositories or migrations against a real database.
- No tests cover notification scheduling, permissions, Android channels, or `AppState` recovery.
- No React Native component or screen tests exist.
- No E2E/device tests exist.
- The APK build script and GitHub workflows are validated by running them, not by Jest.

For those areas, the build gates and manual Android checks are the verification path. When adding behavior, prefer extracting pure math/rules into `src/domain` and service orchestration into `src/features` so it can join the deterministic suites.

## Related pages

<!-- openwiki: broken internal link [/openwiki/architecture/system-overview.md] link "/openwiki/architecture/system-overview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [System Architecture](/openwiki/architecture/system-overview.md)
<!-- openwiki: broken internal link [/openwiki/domain/loops-and-timer.md] link "/openwiki/domain/loops-and-timer.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loops, Intervals, and Timer Math](/openwiki/domain/loops-and-timer.md)
<!-- openwiki: broken internal link [/openwiki/domain/tasks.md] link "/openwiki/domain/tasks.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Task Hierarchy](/openwiki/domain/tasks.md)
