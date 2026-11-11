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
- `formatDurationCompact` renders `2h 30m`, `2h`, `30m`, or `45s`.
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
- Invalid transitions throw typed errors rather than silently returning the current loop.
- Calendar math uses the interval's stored time zone, not the device's current zone.

## Related pages

<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
<!-- openwiki: broken internal link [/openwiki/database/persistence.md] link "/openwiki/database/persistence.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [SQLite Persistence and Migrations](/openwiki/database/persistence.md)
<!-- openwiki: broken internal link [/openwiki/domain/intentions-and-history.md] link "/openwiki/domain/intentions-and-history.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Intentions and History](/openwiki/domain/intentions-and-history.md)
