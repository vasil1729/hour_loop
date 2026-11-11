---
type: domain
title: Intentions and History
description: Daily and monthly focus targets, interval-based actual time, progress semantics, and day/month history aggregation.
tags: [intentions, history, intervals, time-zones, aggregation]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ff385a65eaba1b8e35bc34a0
    resource: repo://src/database/migrations.ts
  - id: openwiki-source-ed6e74af44dab33733c6befb
    resource: repo://src/database/repositories/intentionsRepository.ts
  - id: openwiki-source-fc3224cbee1d8af94c860dc3
    resource: repo://src/database/repositories/intervalsRepository.ts
  - id: openwiki-source-4d70f3beb0134b3f593e5445
    resource: repo://src/domain/intentions/intentionsDomain.ts
  - id: openwiki-source-8b212d0866cc1af6a99bb6fc
    resource: repo://src/domain/timer/timerEngine.ts
  - id: openwiki-source-59d480e4935b51f6c8cabd73
    resource: repo://src/features/history/historyService.ts
  - id: openwiki-source-d4dd734045be622082a0cd3f
    resource: repo://src/features/intentions/intentionsService.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Intentions and History

Intentions are user-set focus-time targets for a local day or month. History is the retrospective view of the same interval data. Both features intentionally avoid using `loops.local_date` as their source of truth: actual focus time is computed from interval overlap and allocated to local calendar boundaries.

## Data model

An intention row is keyed by `period_type` (`daily` or `monthly`) and `period_key` (`YYYY-MM-DD` or `YYYY-MM`). The database enforces uniqueness on that pair. A target is stored in seconds; there is no row for an unset target.

Setting a target goes through `setIntention`:

- A target less than or equal to zero deletes the row and returns `null`.
- A positive target is rounded to whole seconds and upserted.

Clearing an intention deletes the row directly. There is therefore no distinction between "never set" and "cleared"; both render as no intention.

## Actual time derivation

`getActualSeconds` computes the local day or month bounds in the device's IANA time zone, then queries every interval that overlaps `[start, end)`:

```sql
WHERE started_at < end AND (ended_at IS NULL OR ended_at > start)
```

An open interval counts up to the current reference time. Each overlapping interval is allocated with `allocateIntervalToDays`, which walks from the interval start to each local midnight in the interval's stored time zone, splits the seconds at those boundaries, and accumulates a `dayKey -> seconds` map. Monthly allocation reuses the day map and groups keys by their `YYYY-MM` prefix.

This is why a loop that runs across midnight contributes to both days. The loop's `local_date` remains the day it started; it does not determine history attribution.

## Progress semantics

`computeIntentionProgress` clamps both inputs to non-negative values and produces:

- `ratio`: `actual / target`, clamped to `[0, 1]`. With no target, ratio is `1` only if actual time is positive, otherwise `0`.
- `percent`: `Math.round(ratio * 100)`.
- `remainingSeconds`: `max(0, target - actual)`.
- `reached`: true only when the target is positive and remaining time is zero.

Consequences worth preserving:

- An unset target reports 0% when there is no focus time and 100% when there is any, but `reached` stays false because the target is zero.
- Overshooting a target keeps ratio and percent at 100% while `actualSeconds` continues to grow.
- The UI may show `—` instead of a percentage when no intention exists; that is a presentation decision, not a change to the progress math.

## Day history

`getDayHistory` loads intervals overlapping the selected day, allocates each interval to that specific day key, and sums seconds per loop. Loops with zero allocated seconds are discarded, the remaining loops are fetched by ID, entries are rounded to whole seconds, and the list is sorted by loop `started_at`.

The returned day record contains:

- `loops`: one entry per loop that contributed time, with the day-specific elapsed seconds.
- `totalSeconds`: sum of the per-loop day allocations.
- `loopCount`: number of contributing loops, not the number of intervals.
- `daily`: the day's intention summary.

This means a single loop can appear on multiple days with different elapsed values, and multiple intervals from the same loop on the same day are merged before display.

## Month history

`getMonthHistory` uses the local month bounds, fetches overlapping intervals, and delegates total focus time and progress to the monthly intention summary. The loop count is the size of the set of loop IDs among those intervals, so repeated pause/resume intervals do not inflate it.

The monthly total is derived from monthly allocation, which itself is derived from day allocation. It is therefore consistent with the sum of day history even across midnight and DST boundaries.

## Invariants and edge cases

- Actual time is always interval-based; never derive it from loop counts or `local_date`.
- Day/month bounds are civil-time boundaries converted to UTC with DST-aware offset refinement.
- Open intervals are included and count up to `new Date()` at query time.
- Rounding happens at the display/aggregation boundary (`Math.round` for history totals); the underlying allocation stays fractional-second precise.
- Zero-length or reversed intervals contribute nothing.
- Empty days return zero totals and an empty loop list, not an error.

## Related pages

<!-- openwiki: broken internal link [/openwiki/domain/loops-and-timer.md] link "/openwiki/domain/loops-and-timer.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loops, Intervals, and Timer Math](/openwiki/domain/loops-and-timer.md)
<!-- openwiki: broken internal link [/openwiki/database/persistence.md] link "/openwiki/database/persistence.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [SQLite Persistence and Migrations](/openwiki/database/persistence.md)
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
