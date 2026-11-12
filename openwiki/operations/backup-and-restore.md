---
type: operations
title: Backup and Restore
description: The portable JSON backup envelope, validation rules, import replacement semantics, active-loop handling, and the mobile export/restore workflow.
tags: [backup, restore, json, data-portability, settings]
---

# Backup and Restore

Hour Loop backups are single, human-readable JSON files. They are designed to be saved to Files, Drive, email, or any other file store and restored on a fresh install. The feature is entirely local: no account, upload, or cloud service is involved.

## Envelope

```json
{
  "format": "hour-loop-backup",
  "version": 1,
  "appVersion": "1.5.0",
  "exportedAt": "2026-11-11T19:01:23.000Z",
  "timeZone": "Asia/Kolkata",
  "counts": {
    "tasks": 12,
    "loops": 34,
    "intervals": 41,
    "loopItems": 18,
    "intentions": 8,
    "settings": 3
  },
  "data": {
    "tasks": [],
    "loops": [],
    "intervals": [],
    "loopItems": [],
    "intentions": [],
    "settings": []
  }
}
```

`format` is always `hour-loop-backup`. `version` is the backup format version, currently `1`, and `appVersion` records the Hour Loop version that created the file. Timestamps are UTC ISO-8601 strings, calendar keys are local civil dates, and durations are integer seconds.

The arrays mirror the logical fields of the corresponding SQLite tables. `loopItems` intentionally excludes the transient current-capsule flag; restored capsules start with no current item.

## Rules

- A backup from a newer format version is rejected rather than partially imported.
- Device-specific setting keys beginning with `notif_` are excluded from exports and ignored on import. Notification schedules are rebuilt for the restored data.
- Import is a full replacement. Existing tasks, loops, intervals, intentions, and settings are deleted inside one transaction, then the backup is inserted and checked with `PRAGMA foreign_key_check`.
- Task rows are inserted parent-first so self-referencing task hierarchies remain valid.
- Loop checklist items are inserted after their loops and after any item they were carried from.
- A loop that was `ACTIVE` when exported is restored as `PAUSED`, and its open interval is closed at `exportedAt`. This prevents all the time between export and restore from being counted as focus time.
- If a backup contains checklist items but the installed app predates the checklist table, the import is rejected rather than silently dropping them.
- Unknown extra fields are ignored. A backup containing unknown future tables should use a higher `version` and be rejected by older apps.
- Imports larger than 20 MiB are rejected before parsing.

After insertion, the import re-seeds the default settings keys that may be absent from older backups, including `default_duration_seconds`, `theme`, `language`, and `notifications_enabled`.

## Mobile workflow

1. Settings -> Backup & restore -> **Export data**.
2. Save the JSON file to Files, Drive, or email.
3. After reinstalling, open Settings -> Backup & restore -> **Import data**.
4. Pick the JSON file and confirm the replacement.

The import preview shows task, loop, interval, checklist-item, intention, and setting counts, plus the export time and app version, before anything is changed. If the backup contains a running loop, the preview also notes that it will be restored as paused at the export time.

## Related pages

- [SQLite Persistence and Migrations](../database/persistence.md)
- [Loop Lifecycle End to End](../workflows/loop-lifecycle.md)
- [Product Overview](../product/overview.md)
