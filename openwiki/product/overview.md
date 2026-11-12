---
type: product
title: Product Overview
description: Product vision, core concepts, lifecycle rules, screen map, and scope for the fully offline Hour Loop focus timer.
tags: [product, vision, loops, capsules, intentions, history, offline-first]
---

# Product Overview

Hour Loop is a calm, fully offline focus timer for people who want to be intentional with their time. Instead of counting arbitrary pomodoros, it treats a focus session as a **Loop**: a bounded, timestamped stretch of attention that can be paused, resumed, and closed with a short reflection.

There are no accounts, no cloud sync, no network dependency, and no streak mechanics that punish rest. The app works the same in airplane mode and after a force-quit because every durable fact lives in local SQLite.

## Core concepts

### Loop

A Loop is one focus session.

- Loops are numbered `H1`, `H2`, `H3` per local calendar day and reset at local midnight.
- Only one loop may be `ACTIVE` or `PAUSED` at a time.
- A loop has a target duration, an optional subtask, capsule items, and a completion journal.
- Elapsed time is stored as intervals (`started_at` / `ended_at`), so pause, resume, backgrounding, and crash recovery are exact.
- The interval log is also shown as a session log with local start, pause, resume, and stop times.

### Lifecycle

```text
IDLE -> ACTIVE -> PAUSED -> ACTIVE -> COMPLETED
               \-> COMPLETED
```

- **Start** creates the loop and its first open interval.
- **Pause** closes the open interval; elapsed time stops growing.
- **Resume** opens a new interval.
- **Stop** freezes the timer and opens the completion journal.
- **Target reached** pauses the loop automatically at the exact target instant. Overtime is trimmed from the interval log, active elapsed time is clamped to the target, and the UI does not offer resume past the target.
- **Save & close** writes the journal and marks the loop complete.
- **Keep looping** returns to the active loop and resumes only if it was paused before the target.

### Completion journal

All fields are optional, with focus and carry-in pre-filled when available:

- Focus: what the loop was for.
- Carry in: what was brought into the loop.
- Done: what was actually accomplished.
- Roll forward: what the next loop should pick up, optionally linked to a subtask.
- Note: free-form observation.

### Tasks and capsules

- Top-level tasks are containers, roughly like epics or stories. Tasks form an arbitrary-depth hierarchy.
- Any task nested under a top-level task is a **subtask** and is the only kind of task that can be selected as a loop target. Containers group work but cannot own loops directly.
- Task statuses are not started, in progress, completed, and archived. Completing or reopening a task is manual; loops never change task status silently.
- A task detail view aggregates focus time from the task and all descendants.
- Capsules are the small checklist units added while starting a loop. An active or paused loop can still gain new capsules or have existing capsules removed.
- A loop attached to a subtask groups its capsules under that subtask. A loop without a subtask creates **loose capsules**.
- Open, uncarried loose capsules appear in the Tasks screen even when their loop is active or closed. Tapping one marks it complete.
- The start-loop screen also lists loose capsules from older loops so one can be carried into the next loop.
- Capsules that are complete, or that were carried into a later loop, do not appear in the task pool.

### Intentions

- Daily and monthly focus-time targets are stored independently of loops.
- Settings defines default daily and monthly targets. A day or month without its own target inherits the matching default.
- Built-in defaults are 8 hours per day and 160 hours per month; both can be changed or cleared in Settings.
- The intention editor adds preset increments of 15m, 30m, 1h, 2h, 4h, and 8h. The target is the running total, not the last preset tapped.
- Clearing an individual day or month target removes the override and returns to the configured default. Clearing a default removes the fallback.
- Progress is computed from interval time, not loop counts. An interval crossing midnight contributes real seconds to both days in the device's current time zone.

### History and day view

- History has **Day**, **Week**, and **Month** modes. Each mode supports previous/next navigation, a tappable period label, and a calendar picker for past dates.
- Day mode shows total focus time, loop count, daily intention progress, the day's loops, and a link to the detailed capsule timeline.
- Week mode shows total focus time, unique loop count, days on target, average focus per active day, and a seven-day bar chart.
- Month mode shows total focus time, unique loop count, monthly intention progress, and a daily heatmap.
- Switching modes keeps the selected date as the anchor. A loop crossing midnight appears on both days with the correct split.
- The **Day view** is task-first: it groups focused time by task capsule, shows per-task and per-capsule totals, and offers a timeline or a numbered 24-hour clock. Selecting a capsule dims other segments and highlights its time in both views.
- Clock times, history totals, and intention totals use the device's current IANA zone, so travel does not change which civil day an interval belongs to.

### Notifications

- An optional early warning fires before an active loop reaches its target. The default is 5 minutes; presets are Off, 1, 5, 10, 15, and 30 minutes.
- A target-reached notification fires when an active loop reaches its target.
- Paused or completed loops never notify. Pausing, stopping, or closing a loop cancels both alerts.
- Notification identifiers are persisted so cancellation is reliable. Scheduling is reconciled whenever the app returns to the foreground.
- Permissions are requested when starting a loop or enabling notifications.

### Languages

- The app supports English, Russian, Arabic, Simplified Chinese, Turkish, and Malayalam.
- Settings offers **System** plus each language explicitly. System follows the device language and falls back to English.
- Arabic is right-to-left; the other supported languages are left-to-right.
- Dates, durations, alerts, notifications, backup dialogs, and accessibility labels are localized. Language changes apply immediately, except native RTL layout changes, which require a restart.

## Screens

| Screen | Purpose |
| --- | --- |
| Today | Date, daily/monthly intention bars, active-loop banner with live progress and pause/resume, recent loops |
| Start loop | Capsules, loose capsules, carry-in, optional subtask, target duration |
| Active loop | Live timer, progress, focus, capsules with add/remove, session log, pause/resume/stop, back to Today, delete with confirmation |
| Complete loop | Journal form, capsule summary, elapsed summary, subtask link for roll-forward |
| Tasks | Loose capsules, filterable flattened tree with expand/collapse and quick complete |
| Task detail | Metrics, subtasks, open capsules, loop history, start loop from a subtask, edit, complete, archive |
| Day view | Task-first focus breakdown, period switcher, timeline, numbered 24-hour clock |
| History | Day/week/month navigation, summaries, weekly bars, monthly heatmap |
| Settings | Duration, intentions, language, theme, notifications, backup/restore, about |

## Behaviour rules

1. Loop numbering resets at local midnight.
2. One active or paused loop exists globally.
3. A loop may reference zero or one subtask; container tasks cannot own loops.
4. Roll-forward is free text plus an optional subtask reference.
5. Appearance follows the system by default and can be forced to light or dark.
6. The default loop duration is 60 minutes; changing it affects new loops only.
7. Archived tasks are hidden from the task pool; their loops remain in history.
8. A capsule belongs to the loop's subtask when one is selected; otherwise it is a loose capsule.
9. Only open, uncarried capsules appear in the task pool, whether their loop is active or closed.
10. A per-day or per-month target override takes precedence over the matching Settings default.
11. Deleting a loop permanently removes its intervals and focused-time contribution after confirmation.

## Scope

In scope:

- Local JSON backup and restore through the device file system.
- Local notifications and exact-alarm guidance.
- Manual light/dark/system theming.
- Manual or device-driven language selection.

Out of scope:

- Accounts, sync, or cloud storage.
- Recurring tasks.
- Multiple simultaneous loops.
- Widgets, watch apps, or a production web app.
