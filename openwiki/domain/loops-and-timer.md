---
type: domain
title: Loops, Intervals, and Timer Math
description: The loop state machine, persisted interval log, elapsed-time calculation, progress helpers, and local calendar allocation.
tags: [loops, timer, intervals, state-machine, time-zones]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-58396033ee1e161336848adf
    resource: repo://src/constants/loopStatus.ts
  - id: openwiki-source-7d24fbcd9fbfe98357e67e98
    resource: repo://src/database/repositories/loopsRepository.ts
  - id: openwiki-source-1516210c9959508512e92699
    resource: repo://src/domain/shared/dateUtils.ts
  - id: openwiki-source-8b212d0866cc1af6a99bb6fc
    resource: repo://src/domain/timer/timerEngine.ts
  - id: openwiki-source-3e828fad62b80c588fe594bf
    resource: repo://src/features/loops/loopMetrics.ts
  - id: openwiki-source-d32aa26ef745f6a7c3488f36
    resource: repo://src/features/loops/loopService.ts
  - id: openwiki-source-e947b46637b047b567cbbf1c
    resource: repo://src/hooks/useActiveLoop.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Loops, Intervals, and Timer Math

A Loop is one focus session. Its elapsed time is not a counter stored on the loop; it is the sum of persisted interval rows. This design makes pause/resume, backgrounding, force-quit, and crash recovery converge to the same answer because every read recomputes from timestamps.

## State machine

The persisted loop statuses are `ACTIVE`, `PAUSED`, and `COMPLETED`; `IDLE` exists as a UI-level status but no loop row is created for it.

| From | Action | To | Side effects |
| --- | --- | --- | --- |
| none | start | `ACTIVE` | insert loop and first open interval |
| `ACTIVE` | pause | `PAUSED` | close the open interval |
| `PAUSED` | resume | `ACTIVE` | open a new interval |
| `ACTIVE` | complete | `COMPLETED` | close the open interval, write journal |
| `PAUSED` | complete | `COMPLETED` | write journal, no interval to close |
| `COMPLETED` | complete | error | `InvalidStateTransitionError` |

`loopService` also rejects pausing anything other than `ACTIVE`, resuming anything other than `PAUSED`, and starting while any loop is `ACTIVE` or `PAUSED`. Missing loops raise `LoopNotFoundError`.

## Exact target handling

A target is a hard stop, not a checkpoint. `targetTimeForIntervals` walks the ordered interval log and returns the exact instant cumulative active time first reaches `target_duration_seconds`. `pauseAtTarget` then, inside one transaction:

1. truncates the loop interval log at the target instant;
2. truncates the capsule interval log at the same instant;
3. marks the loop `PAUSED`.

The defensive fallback handles malformed interval math by deriving the equivalent target instant from current elapsed time, so overtime cannot continue to accumulate. `getElapsedSeconds` and `getLoopWithElapsed` clamp active-loop elapsed time to the target, so the visible timer never shows overtime.

`useTargetGuard` runs at the app root. It schedules a service call for the remaining time plus a small cushion, retries if it fires early, reconciles the target notification, and refreshes the loop store. Because it is global, a loop is paused at its target even when the user is on another tab and no timer screen is mounted. The active and Today screens also call the same service path on their own refresh cadence.

## Interval log

`loop_intervals` rows contain `started_at`, nullable `ended_at`, and the interval's IANA `time_zone`. Start creates one open interval. Pause closes it at the clock instant. Resume creates a new open interval. Complete closes it only if the loop is still `ACTIVE`.

The service enforces at most one open interval per loop by always closing the open interval before pausing/completing and only opening a new one on resume. The database does not express that rule as a unique constraint, so direct writes outside the service must preserve it.

## Elapsed-time calculation

`calculateElapsedSeconds` sums each interval as:

```text
closed: ended_at - started_at
open:   referenceTime - started_at
```

Negative intervals contribute zero, then the total is floored to whole seconds and clamped at zero. Because `referenceTime` is supplied by the caller, tests can freeze time. The active screen ticks once per second only to trigger a re-read and re-render; it never adds one second to a stored value.

`attachLoopMetrics` batches the same calculation for a list of loops: it fetches all intervals in one query, groups them by `loop_id`, and computes elapsed seconds per loop with a single reference time.

## Progress and formatting helpers

- `remainingSeconds(target, elapsed)` returns `max(0, target - elapsed)`.
- `progressRatio(target, elapsed)` returns `[0,1]`; a non-positive target yields `1` only when elapsed time is positive.
- `formatElapsed` renders `HH:MM:SS` with zero padding.
- `formatDurationCompact` renders `2h 30m`, `2h`, `30m`, or `45s` in English. The compact unit wording follows the active language for Russian, Arabic, Chinese, Turkish, and Malayalam.
- Loop start clamps the target to at least one second and rounds it to an integer.

## Local calendar allocation

Timer math also has to answer "how much of this interval belongs to each local day/month?" `allocateIntervalToDays` walks the interval from its start to each next local midnight in the interval's stored time zone, splitting seconds at the boundary. `allocateIntervalToMonths` builds on the day map by grouping `YYYY-MM` prefixes.

`localMidnightAfter` first obtains the wall-clock date parts with `Intl.DateTimeFormat`, advances the civil date by one day, and converts that midnight back to UTC. `zonedTimeToUtc` guesses the UTC instant, computes the zone offset there, and refines the offset once around the guessed instant. That two-pass refinement is what handles DST transitions when converting a civil midnight to an actual instant.

Consequences:

- A midnight-crossing interval appears in both day keys with real seconds, not a copied total.
- A DST day may contain 23 or 25 real hours; allocation follows local midnights, not fixed 24-hour chunks.
- A zero-length or reversed interval returns an empty allocation.
- A guard limits the walk to 10,000 segments to avoid an infinite loop on malformed data.

## Sequence numbers and dates

Loops are numbered `H1`, `H2`, ... per local calendar day. Start computes `local_date` from the current instant in the device time zone, reads the maximum sequence for that date, and inserts `max + 1`. `local_date` labels the loop; it is not used for history attribution. That distinction matters for loops that cross midnight.

## Invariants

- Elapsed time is recomputed from intervals on every read; no accumulated timer state is persisted.
- Only `ACTIVE` loops have an open interval.
- Completing a `PAUSED` loop does not create or close an interval.
- A target-reached loop is paused at the exact crossing instant, with both loop and capsule intervals truncated there.
- Invalid transitions throw typed errors rather than silently returning the current loop.
- Calendar math uses the interval's stored time zone, not the device's current zone.

## Related pages

- [Loop Lifecycle End to End](../workflows/loop-lifecycle.md)
- [SQLite Persistence and Migrations](../database/persistence.md)
- [Intentions and History](../domain/intentions-and-history.md)
- [Product Overview](../product/overview.md)
