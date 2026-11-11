# Hour Loop — Product Specification

## Vision

Hour Loop is a calm, fully offline focus timer for people who want to be intentional with their time. Instead of counting arbitrary pomodoros, it treats a focus session as a **Loop**: a bounded, timestamped stretch of attention that can be paused, resumed, and closed with a short reflection.

No accounts. No cloud sync. No streaks that punish rest. The app should work identically in airplane mode and after a force-quit.

## Core concepts

### Loop

A Loop is one focus session.

- Loops are numbered `H1`, `H2`, `H3` per local calendar day, resetting at midnight.
- Only one loop may be `ACTIVE` or `PAUSED` at a time.
- A loop has a target duration, an optional task, optional focus text, and a completion journal.
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
- Roll forward — what the next loop should pick up, optionally linked to a task.
- Note — free-form observation.

### Task pool

- Tasks form a hierarchy of arbitrary depth.
- Tasks have statuses: not started, in progress, completed, archived.
- Completing or reopening a task is manual; loops do not silently complete tasks.
- A task detail view aggregates focus time from the task and all descendants.
- Starting a loop from a task marks a not-started task as in progress.
- When a new loop is started for the same task, the previous loop's roll-forward text is suggested as carry-in.

### Intentions

- Daily and monthly focus-time targets are stored independently of loops.
- Progress is computed from actual interval time, not from loop counts.
- An interval that crosses midnight contributes to both days, proportionally to real seconds, using the device's current time zone.
- Intentions are editable at any time; clearing a target removes it.

### History

- Day view: previous/next navigation, a calendar picker for jumping directly to any past date, total focus time, loop count, daily intention progress, and per-loop time for that day.
- A loop that crosses midnight appears on both days with the correct split.
- Monthly section: total focus time, unique loop count, and monthly intention progress.
- Tapping a loop opens its read-only journal.
- A loop can be permanently deleted from its journal or, before completion, from the active loop or completion screen. Deletion asks for confirmation and also removes the loop's recorded intervals and focus time.
- Clock times are displayed in the device's current time zone, so the app follows the user's location.
- History and intention totals also split intervals in the device's current time zone, keeping day bounds and allocation consistent when the user travels.

### Notifications

- When an active loop reaches its target, a local notification fires.
- Paused or completed loops never notify.
- Notification identifiers are persisted so they can be cancelled reliably.
- Permissions are requested when the user starts a loop or enables notifications.

## Screens

| Screen | Purpose |
|---|---|
| Today | Date, daily/monthly intention bars, active-loop banner with live progress and pause/resume, recent loops |
| Start loop | Focus, carry-in, optional task, target duration |
| Active loop | Live timer, progress, focus, session log, pause/resume/stop, back to Today, delete with confirmation |
| Complete loop | Journal form, elapsed summary, task link for roll-forward |
| Tasks | Filterable flattened tree with expand/collapse and quick complete |
| Task detail | Metrics, subtasks, loop history, start loop, edit, complete, archive |
| History | Day navigation, day summary, loops, monthly summary |
| Settings | Default duration, theme, notifications, version/about |

## Behaviour rules and assumptions

1. Loop numbering resets at local midnight.
2. One active or paused loop globally at MVP.
3. One loop → zero or one optional task; a task may have many loops.
4. Roll-forward is free text plus an optional task FK.
5. Dark mode is the default, but the system colour scheme is respected unless overridden.
6. Default loop duration is 60 minutes; changing it affects new loops only.
7. Archived tasks are hidden from the task pool; their loops remain in history.

## Out of scope for MVP

- Accounts, sync, or cloud backup.
- Data export/import.
- Recurring tasks.
- Multiple simultaneous loops.
- Richer analytics or charts.
- Widgets, watch apps, or web deployment.
