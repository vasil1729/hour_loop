import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AssistantActionPreview,
  AssistantTool,
  AssistantToolContext,
  AssistantToolResult,
} from './assistantTypes';
import {
  AssistantToolError,
  optionalArray,
  optionalInteger,
  optionalString,
  requireEnum,
  requireObject,
  requireString,
} from './assistantValidation';
import { getAssistantFocusStats } from './assistantStatsService';
import {
  cancelLoopNotification,
  syncLoopNotification,
} from '../../services/notifications/notificationService';
import {
  createStandaloneCapsule,
  listCompletedLooseCapsules,
  listLooseCapsules,
  listStandaloneCapsules,
  setStandaloneCapsuleDone,
} from '../capsules/capsuleService';
import { loopService } from '../loops/loopService';
import { attachLoopMetrics } from '../loops/loopMetrics';
import {
  createTask,
  getTaskDetail,
  listTasks,
  markTaskInProgress,
  moveTask,
  updateTaskDetails,
  type TaskFilter,
} from '../tasks/taskService';
import {
  getLoopItemById,
} from '../../database/repositories/loopItemsRepository';
import { listRecentLoops } from '../../database/repositories/loopsRepository';
import { getStandaloneCapsuleById } from '../../database/repositories/standaloneCapsulesRepository';
import { getTaskById } from '../../database/repositories/tasksRepository';
import { useLoopStore } from '../../store/loopStore';
import { t } from '../../i18n';

const MAX_LIST = 50;

function defineTool<TArgs>(config: {
  name: string;
  description: string;
  risk: AssistantTool['risk'];
  parameters: Record<string, unknown>;
  parse: (args: unknown) => TArgs;
  describe: (args: TArgs) => string;
  targetIds?: (args: TArgs) => string[];
  execute: (
    context: AssistantToolContext,
    args: TArgs
  ) => Promise<AssistantToolResult>;
  prepare?: (
    context: AssistantToolContext,
    args: TArgs
  ) => Promise<AssistantActionPreview>;
  revalidate?: (
    context: AssistantToolContext,
    args: TArgs
  ) => Promise<void>;
}): AssistantTool {
  return {
    name: config.name,
    description: config.description,
    risk: config.risk,
    parameters: config.parameters,
    parse: config.parse,
    describe: (args) => config.describe(args as TArgs),
    targetIds: (args) => config.targetIds?.(args as TArgs) ?? [],
    execute: (context, args) => config.execute(context, args as TArgs),
    prepare: config.prepare
      ? (context, args) => config.prepare!(context, args as TArgs)
      : undefined,
    revalidate: config.revalidate
      ? (context, args) => config.revalidate!(context, args as TArgs)
      : undefined,
  };
}

function parseStringItems(
  record: Record<string, unknown>,
  key: string
): { text: string }[] {
  const raw = optionalArray(record, key, 10) ?? [];
  return raw.map((entry) => {
    const item = requireObject(entry);
    return { text: requireString(item, 'text', { max: 200 }) };
  });
}

async function requireTask(
  db: SQLiteDatabase,
  taskId: string | null | undefined
) {
  if (!taskId) return null;
  const task = await getTaskById(db, taskId);
  if (!task) {
    throw new AssistantToolError('not_found', 'Task not found.');
  }
  return task;
}

async function requireTaskTitle(
  db: SQLiteDatabase,
  taskId: string | null | undefined
): Promise<string | null> {
  const task = await requireTask(db, taskId);
  return task?.title ?? null;
}

async function requireLoop(db: SQLiteDatabase, loopId: string) {
  try {
    return await loopService.getLoopWithElapsed(db, loopId);
  } catch {
    throw new AssistantToolError('not_found', 'Loop not found.');
  }
}

function loopSummary(
  loop: Awaited<ReturnType<typeof loopService.getLoopWithElapsed>>['loop'],
  elapsedSeconds: number,
  items: Awaited<ReturnType<typeof loopService.getLoopItems>>
) {
  return {
    id: loop.id,
    sequenceNumber: loop.sequence_number,
    localDate: loop.local_date,
    status: loop.status,
    focus: loop.focus,
    targetSeconds: loop.target_duration_seconds,
    elapsedSeconds,
    taskId: loop.task_id,
    items: items.map((item) => ({
      id: item.id,
      text: item.text,
      done: item.done,
      current: item.current,
    })),
  };
}

export function createAssistantTools(db: SQLiteDatabase): AssistantTool[] {
  return [
    defineTool<Record<string, never>>({
      name: 'get_active_loop',
      description:
        'Read the current active or paused loop, including elapsed time and capsules.',
      risk: 'read',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      parse: () => ({}),
      describe: () => 'Read the active loop.',
      execute: async () => {
        const loop = await loopService.getActiveLoop(db);
        if (!loop) {
          return { summary: 'No active or paused loop.', data: { loop: null } };
        }
        const result = await loopService.getLoopWithElapsed(db, loop.id);
        const items = await loopService.getLoopItems(db, loop.id);
        return {
          summary: `Loop H${loop.sequence_number} is ${loop.status.toLowerCase()}.`,
          data: loopSummary(result.loop, result.elapsedSeconds, items),
        };
      },
    }),

    defineTool<{ loopId: string }>({
      name: 'get_loop',
      description: 'Read a specific loop and its capsules by loop id.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: { loopId: { type: 'string' } },
        required: ['loopId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { loopId: requireString(record, 'loopId', { max: 128 }) };
      },
      describe: (args) => `Read loop ${args.loopId}.`,
      execute: async (context, args) => {
        const result = await requireLoop(context.db, args.loopId);
        const items = await loopService.getLoopItems(context.db, args.loopId);
        return {
          summary: `Loop H${result.loop.sequence_number} ${result.loop.status.toLowerCase()}.`,
          data: loopSummary(result.loop, result.elapsedSeconds, items),
        };
      },
    }),

    defineTool<{ loopId: string }>({
      name: 'get_loop_items',
      description: 'Read the capsules belonging to a loop.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: { loopId: { type: 'string' } },
        required: ['loopId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { loopId: requireString(record, 'loopId', { max: 128 }) };
      },
      describe: (args) => `Read capsules for loop ${args.loopId}.`,
      execute: async (context, args) => {
        await requireLoop(context.db, args.loopId);
        const items = await loopService.getLoopItems(context.db, args.loopId);
        return {
          summary: `${items.length} capsules.`,
          data: items.map((item) => ({
            id: item.id,
            text: item.text,
            done: item.done,
            current: item.current,
          })),
        };
      },
    }),

    defineTool<{ limit: number }>({
      name: 'get_recent_loops',
      description: 'Read the most recent completed loops.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { limit: optionalInteger(record, 'limit', { min: 1, max: 10 }) ?? 5 };
      },
      describe: (args) => `Read the last ${args.limit} completed loops.`,
      execute: async (context, args) => {
        const loops = await listRecentLoops(context.db, args.limit);
        const metrics = await attachLoopMetrics(context.db, loops);
        return {
          summary: `${metrics.length} recent loops.`,
          data: metrics.map((entry) => ({
            id: entry.loop.id,
            sequenceNumber: entry.loop.sequence_number,
            localDate: entry.loop.local_date,
            focus: entry.loop.focus,
            done: entry.loop.done,
            elapsedSeconds: entry.elapsedSeconds,
            status: entry.loop.status,
          })),
        };
      },
    }),

    defineTool<{ filter: TaskFilter; limit: number }>({
      name: 'get_tasks',
      description:
        'Read task containers and capsules. Use the returned ids for task-specific questions or actions.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['active', 'completed', 'all'] },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          filter:
            record.filter === undefined
              ? 'active'
              : requireEnum(record, 'filter', ['active', 'completed', 'all'] as const),
          limit: optionalInteger(record, 'limit', { min: 1, max: MAX_LIST }) ?? 30,
        };
      },
      describe: (args) => `Read ${args.filter} tasks.`,
      execute: async (context, args) => {
        const tasks = (await listTasks(context.db, args.filter)).slice(0, args.limit);
        return {
          summary: `${tasks.length} ${args.filter} tasks.`,
          data: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            parentTaskId: task.parent_task_id,
            isSubtask: task.parent_task_id !== null,
          })),
        };
      },
    }),

    defineTool<{ taskId: string }>({
      name: 'get_task_detail',
      description:
        'Read one task, its child capsules, open capsules, and total focused time.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { taskId: requireString(record, 'taskId', { max: 128 }) };
      },
      describe: (args) => `Read task ${args.taskId}.`,
      execute: async (context, args) => {
        const detail = await getTaskDetail(context.db, args.taskId);
        if (!detail) {
          throw new AssistantToolError('not_found', 'Task not found.');
        }
        return {
          summary: `${detail.task.title}: ${detail.totalSeconds} focused seconds.`,
          data: {
            id: detail.task.id,
            title: detail.task.title,
            status: detail.task.status,
            parentTaskId: detail.task.parent_task_id,
            totalSeconds: detail.totalSeconds,
            progress: detail.progress,
            children: detail.children.slice(0, 30).map((child) => ({
              id: child.id,
              title: child.title,
              status: child.status,
            })),
            openCapsules: detail.capsules.slice(0, 40).map((capsule) => ({
              id: capsule.item.id,
              loopId: capsule.loop.id,
              text: capsule.item.text,
              loopSequence: capsule.loop.sequence_number,
            })),
          },
        };
      },
    }),

    defineTool<{ includeCompleted: boolean }>({
      name: 'get_loose_capsules',
      description:
        'Read loose capsules: open loop capsules that are not attached to a task.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: { includeCompleted: { type: 'boolean' } },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          includeCompleted:
            typeof record.includeCompleted === 'boolean'
              ? record.includeCompleted
              : false,
        };
      },
      describe: () => 'Read loose capsules.',
      execute: async (context, args) => {
        const open = await listLooseCapsules(context.db);
        const completed = args.includeCompleted
          ? await listCompletedLooseCapsules(context.db)
          : [];
        const rows = [...open, ...completed].slice(0, 40);
        return {
          summary: `${rows.length} loose capsules.`,
          data: rows.map((capsule) => ({
            id: capsule.item.id,
            loopId: capsule.loop.id,
            text: capsule.item.text,
            done: capsule.item.done,
            current: capsule.item.current,
            loopSequence: capsule.loop.sequence_number,
          })),
        };
      },
    }),

    defineTool<{ done: boolean }>({
      name: 'get_standalone_capsules',
      description: 'Read standalone capsules that are open or completed.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: { done: { type: 'boolean' } },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          done: typeof record.done === 'boolean' ? record.done : false,
        };
      },
      describe: (args) =>
        args.done ? 'Read completed standalone capsules.' : 'Read open standalone capsules.',
      execute: async (context, args) => {
        const capsules = (await listStandaloneCapsules(context.db, args.done)).slice(
          0,
          40
        );
        return {
          summary: `${capsules.length} standalone capsules.`,
          data: capsules.map((capsule) => ({
            id: capsule.id,
            text: capsule.text,
            done: capsule.done,
          })),
        };
      },
    }),

    defineTool<{
      period: 'day' | 'week' | 'month';
      anchorDate?: string;
      taskId?: string;
    }>({
      name: 'get_focus_stats',
      description:
        'Read focused-time totals for a day, week, or month, optionally limited to a task and its descendants.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month'] },
          anchorDate: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          taskId: { type: 'string' },
        },
        required: ['period'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const anchorDate = optionalString(record, 'anchorDate', 10) ?? undefined;
        if (anchorDate && !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
          throw new AssistantToolError(
            'invalid_arguments',
            '"anchorDate" must use YYYY-MM-DD.'
          );
        }
        return {
          period: requireEnum(record, 'period', ['day', 'week', 'month'] as const),
          anchorDate,
          taskId: optionalString(record, 'taskId', 128) ?? undefined,
        };
      },
      describe: (args) => `Read ${args.period} focus stats.`,
      execute: async (context, args) => {
        const stats = await getAssistantFocusStats(context.db, args);
        return {
          summary: `${stats.totalSeconds} focused seconds across ${stats.activeDays} active days.`,
          data: stats,
        };
      },
    }),

    defineTool<Record<string, never>>({
      name: 'get_previous_loop',
      description: 'Read the latest completed loop and its capsules.',
      risk: 'read',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      parse: () => ({}),
      describe: () => 'Read the previous loop.',
      execute: async (context) => {
        const previous = await loopService.getPreviousLoopWithItems(context.db);
        if (!previous) {
          return { summary: 'No completed loop.', data: { loop: null } };
        }
        const result = await loopService.getLoopWithElapsed(
          context.db,
          previous.loop.id
        );
        return {
          summary: `Previous loop H${previous.loop.sequence_number}.`,
          data: loopSummary(result.loop, result.elapsedSeconds, previous.items),
        };
      },
    }),

    defineTool<{
      title: string;
      description?: string | null;
      parentTaskId?: string | null;
    }>({
      name: 'create_task',
      description:
        'Create a task container or capsule. Parent is optional; only subtasks can be loop targets.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          parentTaskId: { type: 'string' },
        },
        required: ['title'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          title: requireString(record, 'title', { max: 120 }),
          description: optionalString(record, 'description', 1000) ?? null,
          parentTaskId: optionalString(record, 'parentTaskId', 128) ?? null,
        };
      },
      describe: (args) => `Create task “${args.title}”.`,
      targetIds: (args) => (args.parentTaskId ? [args.parentTaskId] : []),
      prepare: async (context, args) => {
        const parentTitle = await requireTaskTitle(context.db, args.parentTaskId);
        return {
          description: parentTitle
            ? t('assistant.actionCreateSubtask', {
                title: args.title,
                parent: parentTitle,
              })
            : t('assistant.actionCreateTask', { title: args.title }),
          targetIds: args.parentTaskId ? [args.parentTaskId] : [],
          details: [
            { key: 'title', value: args.title },
            ...(args.description
              ? [
                  {
                    key: 'description' as const,
                    value: args.description,
                  },
                ]
              : []),
            ...(parentTitle
              ? [{ key: 'target' as const, value: parentTitle }]
              : []),
          ],
        };
      },
      execute: async (context, args) => {
        const task = await createTask(context.db, {
          title: args.title,
          description: args.description,
          parentTaskId: args.parentTaskId,
        });
        return {
          summary: t('assistant.resultTaskCreated'),
          data: { id: task.id },
        };
      },
    }),

    defineTool<{ taskId: string; title?: string; description?: string | null }>({
      name: 'update_task',
      description: 'Update a task title or description.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const title = optionalString(record, 'title', 120);
        const description = optionalString(record, 'description', 1000);
        if (title === undefined && description === undefined) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a title or description to update.'
          );
        }
        return {
          taskId: requireString(record, 'taskId', { max: 128 }),
          title: title ?? undefined,
          description,
        };
      },
      describe: (args) => `Update task ${args.taskId}.`,
      targetIds: (args) => [args.taskId],
      prepare: async (context, args) => {
        const title = await requireTaskTitle(context.db, args.taskId);
        return {
          description: t('assistant.actionUpdateTask', {
            title: title ?? args.taskId,
          }),
          targetIds: [args.taskId],
          details: [
            ...(args.title
              ? [{ key: 'title' as const, value: args.title }]
              : []),
            ...(args.description !== undefined
              ? [
                  {
                    key: 'description' as const,
                    value: args.description ?? '',
                  },
                ]
              : []),
          ],
        };
      },
      revalidate: async (context, args) => {
        await requireTaskTitle(context.db, args.taskId);
      },
      execute: async (context, args) => {
        await updateTaskDetails(context.db, args.taskId, {
          title: args.title,
          description: args.description,
        });
        return { summary: t('assistant.resultTaskUpdated') };
      },
    }),

    defineTool<{ taskId: string; newParentId: string | null }>({
      name: 'move_task',
      description: 'Move a task under another task, or to the root.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          newParentId: { type: 'string' },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          taskId: requireString(record, 'taskId', { max: 128 }),
          newParentId: optionalString(record, 'newParentId', 128) ?? null,
        };
      },
      describe: (args) => `Move task ${args.taskId}.`,
      targetIds: (args) => [args.taskId, ...(args.newParentId ? [args.newParentId] : [])],
      prepare: async (context, args) => {
        const title = await requireTaskTitle(context.db, args.taskId);
        const parentTitle = await requireTaskTitle(context.db, args.newParentId);
        return {
          description: parentTitle
            ? t('assistant.actionMoveTask', {
                title: title ?? args.taskId,
                parent: parentTitle,
              })
            : t('assistant.actionMoveTaskRoot', {
                title: title ?? args.taskId,
              }),
          targetIds: [args.taskId],
        };
      },
      revalidate: async (context, args) => {
        await requireTaskTitle(context.db, args.taskId);
        await requireTaskTitle(context.db, args.newParentId);
      },
      execute: async (context, args) => {
        await moveTask(context.db, args.taskId, args.newParentId);
        return { summary: t('assistant.resultTaskMoved') };
      },
    }),

    defineTool<{ text: string }>({
      name: 'create_standalone_capsule',
      description: 'Create a standalone capsule not attached to a task.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { text: requireString(record, 'text', { max: 200 }) };
      },
      describe: (args) => `Create standalone capsule “${args.text}”.`,
      prepare: async (_context, args) => ({
        description: t('assistant.actionCreateCapsule', { text: args.text }),
        targetIds: [],
      }),
      execute: async (context, args) => {
        const capsule = await createStandaloneCapsule(context.db, args.text);
        return {
          summary: t('assistant.resultCapsuleCreated'),
          data: { id: capsule.id },
        };
      },
    }),

    defineTool<{ loopId: string; text: string }>({
      name: 'add_loop_item',
      description: 'Add a capsule to an active or paused loop.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['loopId', 'text'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: requireString(record, 'loopId', { max: 128 }),
          text: requireString(record, 'text', { max: 200 }),
        };
      },
      describe: (args) => `Add capsule “${args.text}” to loop ${args.loopId}.`,
      targetIds: (args) => [args.loopId],
      prepare: async (context, args) => {
        const loop = await requireLoop(context.db, args.loopId);
        if (loop.loop.status === 'COMPLETED') {
          throw new AssistantToolError('stale', 'That loop is already complete.');
        }
        return {
          description: t('assistant.actionAddCapsule', {
            text: args.text,
            sequence: loop.loop.sequence_number,
          }),
          targetIds: [args.loopId],
        };
      },
      revalidate: async (context, args) => {
        await requireLoop(context.db, args.loopId);
      },
      execute: async (context, args) => {
        const item = await loopService.addLoopItem(
          context.db,
          args.loopId,
          args.text
        );
        return {
          summary: t('assistant.resultCapsuleAdded'),
          data: { id: item.id },
        };
      },
    }),

    defineTool<{ capsuleId: string }>({
      name: 'complete_standalone_capsule',
      description: 'Mark a standalone capsule completed.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: { capsuleId: { type: 'string' } },
        required: ['capsuleId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return { capsuleId: requireString(record, 'capsuleId', { max: 128 }) };
      },
      describe: (args) => `Complete standalone capsule ${args.capsuleId}.`,
      targetIds: (args) => [args.capsuleId],
      prepare: async (context, args) => {
        const capsule = await getStandaloneCapsuleById(context.db, args.capsuleId);
        if (!capsule) {
          throw new AssistantToolError('not_found', 'Capsule not found.');
        }
        return {
          description: t('assistant.actionCompleteCapsule', {
            text: capsule.text,
          }),
          targetIds: [args.capsuleId],
        };
      },
      revalidate: async (context, args) => {
        const capsule = await getStandaloneCapsuleById(context.db, args.capsuleId);
        if (!capsule) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
      },
      execute: async (context, args) => {
        const capsule = await getStandaloneCapsuleById(context.db, args.capsuleId);
        if (!capsule) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
        await setStandaloneCapsuleDone(context.db, capsule, true);
        return { summary: t('assistant.resultCapsuleCompleted') };
      },
    }),

    defineTool<{ loopId: string; itemId: string }>({
      name: 'complete_loop_item',
      description: 'Mark a capsule in a loop completed.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          itemId: { type: 'string' },
        },
        required: ['loopId', 'itemId'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: requireString(record, 'loopId', { max: 128 }),
          itemId: requireString(record, 'itemId', { max: 128 }),
        };
      },
      describe: (args) => `Complete loop capsule ${args.itemId}.`,
      targetIds: (args) => [args.loopId, args.itemId],
      prepare: async (context, args) => {
        const item = await getLoopItemById(context.db, args.itemId);
        if (!item || item.loop_id !== args.loopId) {
          throw new AssistantToolError('not_found', 'Capsule not found.');
        }
        return {
          description: t('assistant.actionCompleteCapsule', { text: item.text }),
          targetIds: [args.loopId, args.itemId],
        };
      },
      revalidate: async (context, args) => {
        const item = await getLoopItemById(context.db, args.itemId);
        if (!item || item.loop_id !== args.loopId) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
      },
      execute: async (context, args) => {
        await loopService.setLoopItemDone(
          context.db,
          args.loopId,
          args.itemId,
          true
        );
        return { summary: t('assistant.resultCapsuleCompleted') };
      },
    }),

    defineTool<{
      durationMinutes: number;
      focus?: string | null;
      taskId?: string | null;
      items: { text: string }[];
    }>({
      name: 'start_loop',
      description:
        'Start a real focus loop. Requires explicit user confirmation before execution.',
      risk: 'timer',
      parameters: {
        type: 'object',
        properties: {
          durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          focus: { type: 'string' },
          taskId: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        },
        required: ['durationMinutes'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const durationMinutes = optionalInteger(record, 'durationMinutes', {
          min: 1,
          max: 1440,
        });
        if (durationMinutes === undefined) {
          throw new AssistantToolError(
            'invalid_arguments',
            'A duration is required.'
          );
        }
        return {
          durationMinutes,
          focus: optionalString(record, 'focus', 280) ?? null,
          taskId: optionalString(record, 'taskId', 128) ?? null,
          items: parseStringItems(record, 'items'),
        };
      },
      describe: (args) =>
        `Start a ${args.durationMinutes}-minute loop${
          args.focus ? ` for “${args.focus}”` : ''
        }.`,
      targetIds: (args) => (args.taskId ? [args.taskId] : []),
      prepare: async (context, args) => {
        const existing = await loopService.getActiveLoop(context.db);
        if (existing) {
          throw new AssistantToolError(
            'stale',
            `Loop H${existing.sequence_number} is already ${existing.status.toLowerCase()}.`
          );
        }
        const task = await requireTask(context.db, args.taskId);
        const taskTitle = task?.title ?? null;
        if (task && task.parent_task_id === null) {
          throw new AssistantToolError(
            'forbidden',
            'Loops can only target a subtask.'
          );
        }
        return {
          description: args.focus
            ? t('assistant.actionStartLoopFocus', {
                duration: args.durationMinutes,
                focus: args.focus,
              })
            : t('assistant.actionStartLoop', {
                duration: args.durationMinutes,
              }),
          targetIds: args.taskId ? [args.taskId] : [],
          details: [
            { key: 'duration', value: String(args.durationMinutes) },
            ...(args.focus ? [{ key: 'focus' as const, value: args.focus }] : []),
            ...(taskTitle ? [{ key: 'task' as const, value: taskTitle }] : []),
            ...(args.items.length
              ? [
                  {
                    key: 'capsules' as const,
                    value: args.items.map((item) => item.text).join(', '),
                  },
                ]
              : []),
          ],
        };
      },
      revalidate: async (context, args) => {
        const existing = await loopService.getActiveLoop(context.db);
        if (existing) {
          throw new AssistantToolError(
            'stale',
            'Another loop is already active or paused.'
          );
        }
        await requireTaskTitle(context.db, args.taskId);
      },
      execute: async (context, args) => {
        const loop = await loopService.startLoop(context.db, {
          focus: args.focus,
          taskId: args.taskId,
          targetDurationSeconds: args.durationMinutes * 60,
          items: args.items,
        });
        await syncLoopNotification(context.db, loop, {
          requestPermission: true,
        }).catch(() => undefined);
        if (args.taskId) {
          await markTaskInProgress(context.db, args.taskId).catch(() => undefined);
        }
        await useLoopStore.getState().refresh(context.db).catch(() => undefined);
        return {
          summary: t('assistant.resultLoopStarted', {
            sequence: loop.sequence_number,
            duration: args.durationMinutes,
          }),
          data: { loopId: loop.id, sequenceNumber: loop.sequence_number },
        };
      },
    }),

    defineTool<Record<string, never>>({
      name: 'pause_loop',
      description: 'Pause the currently active loop.',
      risk: 'timer',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      parse: () => ({}),
      describe: () => 'Pause the active loop.',
      prepare: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop || loop.status !== 'ACTIVE') {
          throw new AssistantToolError('stale', 'There is no active loop to pause.');
        }
        return {
          description: t('assistant.actionPauseLoop', {
            sequence: loop.sequence_number,
          }),
          targetIds: [loop.id],
        };
      },
      revalidate: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop || loop.status !== 'ACTIVE') {
          throw new AssistantToolError('stale', 'There is no active loop to pause.');
        }
      },
      execute: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active loop to pause.');
        }
        const paused = await loopService.pauseLoop(context.db, loop.id);
        await syncLoopNotification(context.db, paused).catch(() => undefined);
        await useLoopStore.getState().refresh(context.db).catch(() => undefined);
        return {
          summary: t('assistant.resultLoopPaused', {
            sequence: paused.sequence_number,
          }),
        };
      },
    }),

    defineTool<Record<string, never>>({
      name: 'resume_loop',
      description: 'Resume the paused loop.',
      risk: 'timer',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      parse: () => ({}),
      describe: () => 'Resume the paused loop.',
      prepare: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop || loop.status !== 'PAUSED') {
          throw new AssistantToolError('stale', 'There is no paused loop to resume.');
        }
        return {
          description: t('assistant.actionResumeLoop', {
            sequence: loop.sequence_number,
          }),
          targetIds: [loop.id],
        };
      },
      revalidate: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop || loop.status !== 'PAUSED') {
          throw new AssistantToolError('stale', 'There is no paused loop to resume.');
        }
      },
      execute: async (context) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no paused loop to resume.');
        }
        const resumed = await loopService.resumeLoop(context.db, loop.id);
        await syncLoopNotification(context.db, resumed, {
          requestPermission: true,
        }).catch(() => undefined);
        await useLoopStore.getState().refresh(context.db).catch(() => undefined);
        return {
          summary: t('assistant.resultLoopResumed', {
            sequence: resumed.sequence_number,
          }),
        };
      },
    }),

    defineTool<{
      done?: string | null;
      rollForward?: string | null;
      note?: string | null;
      rollForwardTaskId?: string | null;
    }>({
      name: 'complete_loop',
      description: 'Complete the current loop and save optional journal fields.',
      risk: 'timer',
      parameters: {
        type: 'object',
        properties: {
          done: { type: 'string' },
          rollForward: { type: 'string' },
          note: { type: 'string' },
          rollForwardTaskId: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          done: optionalString(record, 'done', 2000) ?? null,
          rollForward: optionalString(record, 'rollForward', 2000) ?? null,
          note: optionalString(record, 'note', 2000) ?? null,
          rollForwardTaskId:
            optionalString(record, 'rollForwardTaskId', 128) ?? null,
        };
      },
      describe: () => 'Complete the current loop.',
      prepare: async (context, args) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active or paused loop.');
        }
        if (args.rollForwardTaskId) {
          await requireTask(context.db, args.rollForwardTaskId);
        }
        return {
          description: t('assistant.actionCompleteLoop', {
            sequence: loop.sequence_number,
          }),
          targetIds: [
            loop.id,
            ...(args.rollForwardTaskId ? [args.rollForwardTaskId] : []),
          ],
          details: [
            ...(args.done
              ? [{ key: 'journalDone' as const, value: args.done }]
              : []),
            ...(args.rollForward
              ? [{ key: 'rollForward' as const, value: args.rollForward }]
              : []),
            ...(args.note ? [{ key: 'note' as const, value: args.note }] : []),
          ],
        };
      },
      revalidate: async (context, args) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active or paused loop.');
        }
        if (args.rollForwardTaskId) {
          await requireTask(context.db, args.rollForwardTaskId);
        }
      },
      execute: async (context, args) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active or paused loop.');
        }
        const completed = await loopService.completeLoop(context.db, loop.id, {
          done: args.done,
          rollForward: args.rollForward,
          note: args.note,
          rollForwardTaskId: args.rollForwardTaskId,
        });
        await cancelLoopNotification(context.db, completed.id).catch(() => undefined);
        await useLoopStore.getState().refresh(context.db).catch(() => undefined);
        return {
          summary: t('assistant.resultLoopCompleted', {
            sequence: completed.sequence_number,
          }),
        };
      },
    }),
  ];
}
