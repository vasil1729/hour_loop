---
type: workflow
title: Loop Lifecycle End to End
description: The screen and persistence path from starting a loop through active timing, pause/resume, stop, journal completion, and history.
tags: [workflow, loops, navigation, journal, notifications]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-105a511030459b519febb828
    resource: repo://app/loop/active.tsx
  - id: openwiki-source-e7855150bad9a1bcf225de42
    resource: repo://app/loop/complete.tsx
  - id: openwiki-source-3c40aa382bd977e33e8aa227
    resource: repo://app/loop/start.tsx
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Loop Lifecycle End to End

This page traces a loop from the start modal through the active timer, the completion journal, and back to Today/History. It focuses on screen behavior and the database/notification side effects at each step.

## 1. Start a loop

The start screen is presented as a modal from Today or a task. It:

- initializes the target duration from the persisted default;
- offers 25/45/60/90-minute presets and a custom minutes field;
- lists active tasks for optional attachment;
- loads a suggested carry-in when a task is selected;
- shows a summary of the selected duration.

Pressing **Start loop** calls `loopService.startLoop`, which atomically inserts the loop and its first open interval. The screen then:

1. calls `syncLoopNotification` with `requestPermission: true` (failures are ignored);
2. marks the selected task `IN_PROGRESS` if it was `NOT_STARTED`;
3. refreshes the loop store;
4. replaces the start modal with the active screen.

An error shows an alert and leaves the user on the start screen.

## 2. Active timing

The active screen waits for the loop store to load, then shows either an empty state or the current loop:

- loop identifier (`H{sequence}`) and the loop's creation date;
- a status pill: `PAUSED`, `TARGET REACHED`, or `FOCUSING`;
- the elapsed timer and target progress;
- optional focus and carry-in text;
- the capsule list, with tap-to-focus, swipe-to-complete, and an inline add composer;
- Pause/Resume and Stop controls, plus a minimize action.

The timer display refreshes once per second, but each refresh re-queries intervals and recomputes elapsed seconds. There is no incremental counter to drift.

Pause calls `pauseLoop` (closes the open interval, sets `PAUSED`) and then reconciles the notification; the service sees a non-ACTIVE loop and cancels the schedule. Resume calls `resumeLoop` (sets `ACTIVE`, opens a new interval) and syncs with a permission request. Minimize dismisses to Today without changing the loop.

Capsules remain editable while the loop runs. Adding appends a loop item; removing deletes the item and closes its open capsule-focus interval if it was the current one. Completed loops reject both operations.

When elapsed time reaches the target, the global guard or a screen check calls `pauseAtTarget`. The service truncates both interval logs at the exact target instant, sets the loop `PAUSED`, and the active screen shows `TARGET REACHED` with the elapsed value clamped to the target. Resume is not offered once the target is reached.

## 3. Stop and journal

**Stop** intentionally pauses before opening the journal:

- If the loop is `ACTIVE`, the screen calls `pauseLoop`, syncs the notification, and refreshes the store.
- If the loop is already `PAUSED`, it syncs and skips the pause.
- In both cases it pushes `/loop/complete` with the loop ID.

Pausing first freezes elapsed time at the stop instant, so time spent writing the journal is not counted as focus time. The completion screen then loads the loop with elapsed metrics and prefills every journal field from the stored loop. A completed loop opens read-only with a notice.

The journal exposes focus, carry-in, done, roll-forward, an optional roll-forward task, and a note. **Save & close loop** calls `completeLoop`, which closes any still-open interval, writes the journal patch, and marks the loop `COMPLETED` in one transaction. The screen then cancels the loop notification, refreshes the store, and returns to Today via `goToToday`.

## 4. Keep looping

If the journaled loop was paused, **Keep looping** calls `resumeLoop`, syncs the notification with a permission request, refreshes the store, and navigates back. If the loop was not paused, it simply navigates back. This is the escape hatch for "I want to continue instead of closing."

## 5. History

Completed loops appear in Today's recent list and in History. History derives per-day time from interval allocation, so a loop that crossed midnight appears on both days with the correct split. Opening a loop from history shows the read-only journal. The loop's `local_date` labels the original day but does not determine history totals.

The separate Day view groups capsule focus by task rather than by loop. Its timeline and numbered 24-hour clock share the same selection model, and its weekday/month range mode uses clipped capsule intervals for the selected period.

## Persistence and notification touchpoints

| Step | Database writes | Notification |
| --- | --- | --- |
| Start | insert loop + open interval + capsule rows (transaction) | schedule for remaining target |
| Pause | close interval + status `PAUSED` (transaction) | cancel |
| Resume | status `ACTIVE` + open interval (transaction) | reschedule |
| Stop | pause if active | cancel via non-ACTIVE sync |
| Target reached | truncate loop/capsule intervals at target + status `PAUSED` (transaction) | cancel via non-ACTIVE sync |
| Save | close interval if needed + journal + status `COMPLETED` (transaction) | cancel by loop ID |
| Keep looping | resume if paused | reschedule with permission request |

Notification failures are caught at the screen boundary so a denied permission or OS error never blocks the timer flow.

## Related pages

- [Loops, Intervals, and Timer Math](../domain/loops-and-timer.md)
- [Bootstrap, Foreground Recovery, and Notifications](../workflows/app-lifecycle-and-notifications.md)
- [Navigation, Screens, and Theming](../ui/navigation-and-theming.md)
- [Product Overview](../product/overview.md)
