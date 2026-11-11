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
- Sibling order is append-only through `max + 1`; there is no reordering UI in the current code.

## Related pages

<!-- openwiki: broken internal link [/openwiki/database/persistence.md] link "/openwiki/database/persistence.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [SQLite Persistence and Migrations](/openwiki/database/persistence.md)
<!-- openwiki: broken internal link [/openwiki/ui/navigation-and-theming.md] link "/openwiki/ui/navigation-and-theming.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Navigation, Screens, and Theming](/openwiki/ui/navigation-and-theming.md)
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
