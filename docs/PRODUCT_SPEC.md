# Hour Loop — Product Specification

## Vision

Hour Loop is a calm, fully offline focus timer for people who want to be intentional with their time. Instead of counting arbitrary pomodoros, it treats a focus session as a **Loop**: a bounded, timestamped stretch of attention that can be paused, resumed, and closed with a short reflection.

No accounts. No cloud sync. No streaks that punish rest. The app should work identically in airplane mode and after a force-quit.

## Core concepts

### Loop

A Loop is one focus session.

- Loops are numbered `H1`, `H2`, `H3` per local calendar day, resetting at midnight.
- Only one loop may be `ACTIVE` or `PAUSED` at a time.
- A loop has a target duration, an optional subtask, capsule items, and a completion journal.
- Elapsed time is stored as intervals (`started_at` / `ended_at`) so pause/resume and crash recovery are exact.
- The interval log is also shown as a session log with the local start, pause, resume, and stop times.

### Loop lifecycle

```
IDLE → ACTIVE → PAUSED → ACTIVE → COMPLETED
              ↘ COMPLETED ↗
```

- **Start** creates the loop and its first open interval.
- **Pause** closes the open interval. Elapsed time stops growing.
- **Resume** opens a new interval.
- **Stop** freezes the timer and opens the completion journal.
- **Save & close** writes the journal and marks the loop complete.
- **Keep looping** returns to the active loop and resumes timing if it was paused.

### Completion journal

All fields are optional, with focus and carry-in pre-filled when available:

- Focus — what this loop was for.
- Carry in — what you brought into the loop.
- Done — what you actually accomplished.
- Roll forward — what the next loop should pick up, optionally linked to a subtask.
- Note — free-form observation.

### Task pool

- Top-level tasks are containers, roughly like epics or user stories. Tasks form a hierarchy of arbitrary depth.
- Any task nested underneath a top-level task is a **subtask** and is the only kind of task that can be selected as a loop target. Container tasks group work and cannot own loops directly.
- Tasks have statuses: not started, in progress, completed, archived.
- Completing or reopening a task is manual; loops do not silently complete tasks.
- A task detail view aggregates focus time from the task and all descendants.
- Starting a loop from a subtask marks a not-started subtask as in progress.
- When a new loop is started for the same subtask, the previous loop's roll-forward text is suggested as carry-in.

### Capsules

- Capsules are the small checklist units added while starting a loop.
- A loop with a subtask groups all of its capsules under that subtask.
- A loop without a subtask creates **loose capsules**. Open loose capsules appear in the Tasks screen under **Loose capsules**, even though they were created from the loop-start screen.
- The start-loop screen also lists loose capsules from older loops so one can be brought into the next loop.
- Capsules that are complete, or that have been carried into a later loop, are not shown in the task pool. Tapping a loose capsule in Tasks marks it complete.
- The task detail view shows the open capsules grouped under that task and its descendants.

### Intentions

- Daily and monthly focus-time targets are stored independently of loops.
- Settings defines default daily and monthly targets. A day or month without its own target inherits the matching default.
- The built-in defaults are 8 hours per day and 160 hours per month; both can be changed or disabled in Settings.
- The intention editor adds preset increments of 15m, 30m, 1h, 2h, 4h, and 8h. Values are displayed as human durations such as `5h 30min`.
- Clearing an individual day/month target removes the override and returns to the configured default. Clearing a default removes it.
- Progress is computed from actual interval time, not from loop counts.
- An interval that crosses midnight contributes to both days, proportionally to real seconds, using the device's current time zone.
- The Today cards show actual time against the effective target; they can still open the editor for a per-day or per-month override.

### History

- A single History screen switches between **Day**, **Week**, and **Month** tracking.
- Every mode has previous/next period navigation, a tappable period label, and a calendar picker for jumping to any past date.
- Day view shows total focus time, loop count, daily intention progress, the day's loops, and a link to the detailed capsule timeline.
- Week view shows total focus time, unique loop count, days on target, average focus per active day, and a seven-day bar chart. Tapping a bar opens that day.
- Month view shows total focus time, unique loop count, monthly intention progress, and a calendar heatmap of daily focus intensity. Tapping a day opens that day.
- Switching modes keeps the selected date as the anchor, so moving from a day to its week or month is one tap.
- A loop that crosses midnight appears on both days with the correct split.
- Tapping a loop opens its read-only journal.
- A loop can be permanently deleted from its journal or, before completion, from the active loop or completion screen. Deletion asks for confirmation and also removes the loop's recorded intervals and focus time.
- Clock times are displayed in the device's current time zone, so the app follows the user's location.
- History and intention totals also split intervals in the device's current time zone, keeping day bounds and allocation consistent when the user travels.

### Notifications

- A configurable early warning fires before an active loop reaches its target. The default is 5 minutes; presets include Off, 1, 5, 10, 15, and 30 minutes.
- When an active loop reaches its target, a target-reached local notification fires.
- Paused or completed loops never notify; pausing or closing a loop cancels both alerts.
- Notification identifiers are persisted so they can be cancelled reliably.
- Permissions are requested when the user starts a loop or enables notifications.

## Screens

| Screen | Purpose |
|---|---|
| Today | Date, daily/monthly intention bars, active-loop banner with live progress and pause/resume, recent loops |
| Start loop | Capsules, loose capsules, carry-in, optional subtask, target duration |
| Active loop | Live timer, progress, focus, capsules, session log, pause/resume/stop, back to Today, delete with confirmation |
| Complete loop | Journal form, capsule summary, elapsed summary, subtask link for roll-forward |
| Tasks | Loose capsules, filterable flattened tree with expand/collapse and quick complete |
| Task detail | Metrics, subtasks, open capsules, loop history, start loop from a subtask, edit, complete, archive |
| History | Day navigation, day summary, loops, monthly summary |
| Settings | Default duration, default daily/monthly intentions, theme, notifications, version/about |

## Behaviour rules and assumptions

1. Loop numbering resets at local midnight.
2. One active or paused loop globally at MVP.
3. One loop → zero or one optional subtask; a subtask may have many loops. Container tasks cannot own loops.
4. Roll-forward is free text plus an optional subtask FK.
5. Dark mode is the default, but the system colour scheme is respected unless overridden.
6. Default loop duration is 60 minutes; changing it affects new loops only.
7. Archived tasks are hidden from the task pool; their loops remain in history.
8. A capsule belongs to the loop's subtask when one is selected; otherwise it is a loose capsule.
9. Only open, uncarried capsules appear in the task pool, whether their loop is active or closed.
10. A daily or monthly target override takes precedence over the matching default in Settings.
11. Default intention presets are additive; the target is the running total, not the last preset tapped.

## Out of scope for MVP

- Accounts, sync, or cloud backup.
- Data export/import.
- Recurring tasks.
- Multiple simultaneous loops.
- Richer analytics or charts.
- Widgets, watch apps, or web deployment.
