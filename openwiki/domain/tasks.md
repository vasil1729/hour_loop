---
type: domain
title: Task Hierarchy
description: The adjacency-list task model, tree building and flattening, cycle prevention, status filters, progress, and loop-time aggregation.
tags: [tasks, hierarchy, tree, progress, aggregation]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-d171f79fca5b1e155e4aa8c0
    resource: repo://src/components/tasks/TaskTree.tsx
  - id: openwiki-source-ff385a65eaba1b8e35bc34a0
    resource: repo://src/database/migrations.ts
  - id: openwiki-source-7d24fbcd9fbfe98357e67e98
    resource: repo://src/database/repositories/loopsRepository.ts
  - id: openwiki-source-8dc27761df215cf22ab07fa9
    resource: repo://src/database/repositories/tasksRepository.ts
  - id: openwiki-source-f4ef5f0f1d4bf573f877fe06
    resource: repo://src/domain/tasks/taskDomain.ts
  - id: openwiki-source-65430091e6dc8d6d8559103b
    resource: repo://src/features/tasks/taskService.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Task Hierarchy

Tasks form an arbitrarily deep adjacency-list hierarchy. A task may have one parent, many children, and many loops. Loops never change task status automatically; completion and archiving are explicit user actions.

## Data model

`tasks` stores `parent_task_id` as a self-referencing foreign key with `ON DELETE CASCADE`. Root tasks use `NULL`. Each task also has:

- `status`: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, or `ARCHIVED`
- `sort_order`: sibling ordering
- `created_at` / `updated_at`, plus nullable `completed_at` / `archived_at`
- optional `title` and `description`

Loops reference tasks with `task_id` and `roll_forward_task_id`; both use `ON DELETE SET NULL`, so deleting a task never deletes focus history. Deleting a parent task does cascade to its descendant tasks.

## Capsules

Capsules are `loop_items` rows: snapshots of checklist text that belong to one loop. They carry `done`, `current`, `sort_order`, and `carried_from_item_id` fields. A loop attached to a subtask groups its capsules under that task; a loop without a task produces loose capsules.

- Starting a loop creates its capsule rows in the same transaction as the loop and first interval.
- An active or paused loop can add capsules and remove existing capsules. Removing the current capsule closes its open focus interval first.
- Selecting a capsule clears the previous `current` flag and opens a `loop_item_intervals` row for capsule-level focus time. Marking the current capsule done, pausing, completing, or removing it closes that interval.
- Capsule totals and the Day view are derived from `loop_item_intervals`, not from the loop-level interval log.
- Open, uncarried loose capsules are derived from `loop_items` joined to loops with `task_id IS NULL`. They are not a separate table.
- Carrying an item into a new loop creates a new row whose `carried_from_item_id` points at the source item. Open, already-carried capsules are excluded from the loose pool and from start-loop suggestions.

The Tasks screen shows loose capsules above the task tree. Task detail shows open capsules grouped under the task and its descendants. Tapping a loose capsule completes it.

## Tree construction and flattening

`sortTasks` orders siblings by `sort_order`, then by `created_at` as a tiebreaker. `buildTaskTree` maps tasks by ID and treats a task as a root when its parent ID is missing from the supplied set or when the parent was archived and therefore excluded. This prevents orphaned subtrees from disappearing.

`flattenTree` walks the built tree and emits `{ task, depth, hasChildren, isExpanded }` rows. Children are included only when their parent's ID is in `expandedIds`. The UI renders these rows in a single `FlatList`, indenting by `depth`; it never recursively nests views. That keeps long hierarchies performant and avoids unbounded layout cost.

## Cycle prevention

`assertValidParent` rejects:

- assigning a task as its own parent, and
- assigning one of its descendants as the new parent.

`collectDescendantIds` performs a breadth-first walk with a `seen` set, so malformed cyclic data cannot loop forever. `moveTask` loads all tasks including archived ones before validating, then appends the moved task to the end of the new sibling list.

## Status filters and progress

`listTasks` applies three filters:

- `active`: `NOT_STARTED` or `IN_PROGRESS`
- `completed`: `COMPLETED`
- `all`: every non-archived task from the repository

`childProgress` counts direct children that are not archived, counts how many are completed, and returns a ratio of zero when there are no children. Progress is therefore one level deep; descendants are not rolled into the ratio.

## Creation, editing, and deletion

Creating a task trims the title, rejects an empty title, assigns `sort_order = max(sibling order) + 1`, and starts in `NOT_STARTED`. Updating details trims the title/description and rejects an empty title. Setting a status also stamps `completed_at` or `archived_at` when applicable.

`markTaskInProgress` is a conditional transition: it changes only a task currently in `NOT_STARTED`, which is what the start-loop flow calls when a loop is attached to a task.

## Task detail aggregation

`getTaskDetail` returns the task, direct children, all descendant tasks, and every loop attached to the task or any descendant. Loop metrics are computed with `attachLoopMetrics`, and `totalSeconds` is the sum of those loop elapsed values. The detail screen can therefore show focus time for the whole subtree, not just the selected task.

`getSuggestedCarryIn` looks at loops for the task ordered by start time descending and returns the first completed loop's non-empty `roll_forward` text. The start screen uses that as carry-in when a task is selected.

## Invariants and edge cases

- Archived tasks are excluded from the normal task pool but still participate in `includeArchived` queries used for cycle checks and detail aggregation.
- A missing or archived parent promotes its children to roots rather than hiding them.
- Delete cascades through descendants; loops survive with a null task link.
- Loop completion does not complete its task.
- Capsules are loop snapshots: editing or removing one does not rewrite an older loop's carried provenance.
- Sibling order is append-only through `max + 1`; there is no reordering UI in the current code.

## Related pages

- [SQLite Persistence and Migrations](../database/persistence.md)
- [Navigation, Screens, and Theming](../ui/navigation-and-theming.md)
- [Loop Lifecycle End to End](../workflows/loop-lifecycle.md)
- [Product Overview](../product/overview.md)
