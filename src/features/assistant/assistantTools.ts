import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AssistantActionPreview,
  AssistantTool,
  AssistantToolContext,
  AssistantToolResult,
} from './assistantTypes';
import {
  AssistantToolError,
  optionalInteger,
  optionalString,
  requireEnum,
  requireObject,
  requireString,
} from './assistantValidation';
import {
  optionalIntegerLike,
  optionalJournalText,
  optionalSequence,
  optionalTitle,
  parsePeriodRequest,
  parseStringItems,
} from './assistantToolArgs';
import { getAssistantFocusStats } from './assistantStatsService';
import {
  getIntentionSummary,
  setIntention,
} from '../intentions/intentionsService';
import { formatIntentionDuration } from '../../domain/intentions/intentionsDomain';
import { currentDayKey } from '../../domain/shared/dateUtils';
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
import {
  listAllLoops,
  listRecentLoops,
} from '../../database/repositories/loopsRepository';
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

type TaskRefArgs = {
  taskId?: string | null;
  taskTitle?: string | null;
};

async function resolveTaskRef(
  db: SQLiteDatabase,
  args: TaskRefArgs,
  required: boolean
): Promise<string | null> {
  if (args.taskId) return args.taskId;
  const title = args.taskTitle?.trim();
  if (!title) {
    if (required) {
      throw new AssistantToolError(
        'invalid_arguments',
        'Provide a task id or task title.'
      );
    }
    return null;
  }
  const tasks = await listTasks(db, 'all');
  let matches = tasks.filter(
    (task) => task.title.trim().toLowerCase() === title.toLowerCase()
  );
  if (matches.length === 0) {
    matches = tasks.filter((task) =>
      task.title.trim().toLowerCase().includes(title.toLowerCase())
    );
  }
  if (matches.length === 1) return matches[0]?.id ?? null;
  if (matches.length === 0) {
    throw new AssistantToolError('not_found', `Task “${title}” was not found.`);
  }
  throw new AssistantToolError(
    'invalid_arguments',
    `Multiple tasks match “${title}”. Use the task id.`
  );
}

type LoopRefArgs = {
  loopId?: string | null;
  loopSequence?: number;
};

async function resolveLoopRef(
  db: SQLiteDatabase,
  args: LoopRefArgs,
  options: { required?: boolean; allowActive?: boolean } = {}
): Promise<string | null> {
  if (args.loopId) return args.loopId;
  if (args.loopSequence !== undefined) {
    const loops = await listAllLoops(db);
    const match = loops.find(
      (loop) => loop.sequence_number === args.loopSequence
    );
    if (match) return match.id;
    throw new AssistantToolError(
      'not_found',
      `Loop H${args.loopSequence} was not found.`
    );
  }
  if (options.allowActive) {
    const active = await loopService.getActiveLoop(db);
    if (active) return active.id;
  }
  if (options.required) {
    throw new AssistantToolError(
      'invalid_arguments',
      'Provide a loop id or loop number.'
    );
  }
  return null;
}

type LoopItemRefArgs = {
  itemId?: string | null;
  itemText?: string | null;
};

async function resolveLoopItemRef(
  db: SQLiteDatabase,
  loopId: string,
  args: LoopItemRefArgs,
  options: { unfinishedOnly?: boolean } = {}
): Promise<{ id: string; text: string }> {
  if (args.itemId) {
    const item = await getLoopItemById(db, args.itemId);
    if (!item || item.loop_id !== loopId) {
      throw new AssistantToolError('not_found', 'Capsule not found.');
    }
    if (options.unfinishedOnly && item.done) {
      throw new AssistantToolError('not_found', 'That capsule is already done.');
    }
    return { id: item.id, text: item.text };
  }
  const text = args.itemText?.trim();
  if (!text) {
    throw new AssistantToolError(
      'invalid_arguments',
      'Provide a capsule id or capsule text.'
    );
  }
  const items = await loopService.getLoopItems(db, loopId);
  let matches = items.filter(
    (item) =>
      item.text.trim().toLowerCase() === text.toLowerCase() &&
      (!options.unfinishedOnly || !item.done)
  );
  if (matches.length === 0) {
    matches = items.filter(
      (item) =>
        item.text.trim().toLowerCase().includes(text.toLowerCase()) &&
        (!options.unfinishedOnly || !item.done)
    );
  }
  if (matches.length === 1 && matches[0]) {
    return { id: matches[0].id, text: matches[0].text };
  }
  if (matches.length === 0) {
    throw new AssistantToolError(
      'not_found',
      `Capsule “${text}” was not found in this loop.`
    );
  }
  throw new AssistantToolError(
    'invalid_arguments',
    `Multiple capsules match “${text}”. Use the capsule id.`
  );
}

async function resolveStandaloneCapsule(
  db: SQLiteDatabase,
  args: { capsuleId?: string | null; capsuleText?: string | null }
): Promise<{ id: string; text: string }> {
  if (args.capsuleId) {
    const capsule = await getStandaloneCapsuleById(db, args.capsuleId);
    if (!capsule) {
      throw new AssistantToolError('not_found', 'Capsule not found.');
    }
    return { id: capsule.id, text: capsule.text };
  }
  const text = args.capsuleText?.trim();
  if (!text) {
    throw new AssistantToolError(
      'invalid_arguments',
      'Provide a capsule id or capsule text.'
    );
  }
  const open = await listStandaloneCapsules(db, false);
  const all = [
    ...open,
    ...(await listStandaloneCapsules(db, true)),
  ];
  let matches = all.filter(
    (capsule) => capsule.text.trim().toLowerCase() === text.toLowerCase()
  );
  if (matches.length === 0) {
    matches = all.filter((capsule) =>
      capsule.text.trim().toLowerCase().includes(text.toLowerCase())
    );
  }
  if (matches.length === 1 && matches[0]) {
    return { id: matches[0].id, text: matches[0].text };
  }
  if (matches.length === 0) {
    throw new AssistantToolError(
      'not_found',
      `Standalone capsule “${text}” was not found.`
    );
  }
  throw new AssistantToolError(
    'invalid_arguments',
    `Multiple standalone capsules match “${text}”. Use the capsule id.`
  );
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

    defineTool<{ loopId?: string | null; loopSequence?: number }>({
      name: 'get_loop',
      description:
        'Read a specific loop and its capsules by loop id or loop number (H3).',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          loopSequence: { type: 'integer' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: optionalString(record, 'loopId', 128) ?? undefined,
          loopSequence: optionalSequence(record, 'loopSequence'),
        };
      },
      describe: (args) =>
        args.loopId
          ? `Read loop ${args.loopId}.`
          : `Read loop H${args.loopSequence}.`,
      execute: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
        });
        const result = await requireLoop(context.db, loopId as string);
        const items = await loopService.getLoopItems(context.db, loopId as string);
        return {
          summary: `Loop H${result.loop.sequence_number} ${result.loop.status.toLowerCase()}.`,
          data: loopSummary(result.loop, result.elapsedSeconds, items),
        };
      },
    }),

    defineTool<{ loopId?: string | null; loopSequence?: number }>({
      name: 'get_loop_items',
      description:
        'Read the capsules belonging to a loop by loop id or loop number (H3).',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          loopSequence: { type: 'integer' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: optionalString(record, 'loopId', 128) ?? undefined,
          loopSequence: optionalSequence(record, 'loopSequence'),
        };
      },
      describe: (args) =>
        args.loopId
          ? `Read capsules for loop ${args.loopId}.`
          : `Read capsules for loop H${args.loopSequence}.`,
      execute: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
        });
        await requireLoop(context.db, loopId as string);
        const items = await loopService.getLoopItems(context.db, loopId as string);
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

    defineTool<{ taskId?: string | null; taskTitle?: string | null }>({
      name: 'get_task_detail',
      description:
        'Read one task, its child capsules, open capsules, and total focused time by task id or title.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          taskTitle: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const taskId = optionalString(record, 'taskId', 128) ?? undefined;
        const taskTitle = optionalTitle(record, 'taskTitle', 200) ?? undefined;
        if (!taskId && !taskTitle) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a task id or task title.'
          );
        }
        return { taskId, taskTitle };
      },
      describe: (args) =>
        args.taskId ? `Read task ${args.taskId}.` : `Read task ${args.taskTitle}.`,
      execute: async (context, args) => {
        const taskId = await resolveTaskRef(context.db, args, true);
        const detail = await getTaskDetail(context.db, taskId as string);
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
      taskTitle?: string;
    }>({
      name: 'get_focus_stats',
      description:
        'Read focused-time totals for a day, week, or month, optionally limited to a task and its descendants. Use day for today/yesterday, week for this/last week, month for this/last month.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['day', 'week', 'month'],
            description: 'day = today/yesterday, week = this/last week, month = this/last month',
          },
          anchorDate: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          taskId: { type: 'string' },
          taskTitle: { type: 'string' },
        },
        required: ['period'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const period = parsePeriodRequest(
          record.period,
          record.anchorDate,
          ['day', 'week', 'month'] as const
        );
        return {
          ...period,
          taskId: optionalString(record, 'taskId', 128) ?? undefined,
          taskTitle: optionalTitle(record, 'taskTitle', 200) ?? undefined,
        };
      },
      describe: (args) => `Read ${args.period} focus stats.`,
      execute: async (context, args) => {
        const taskId = await resolveTaskRef(context.db, args, false);
        const stats = await getAssistantFocusStats(context.db, {
          period: args.period,
          anchorDate: args.anchorDate,
          taskId: taskId ?? undefined,
        });
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
      parentTaskTitle?: string | null;
    }>({
      name: 'create_task',
      description:
        'Create a task container or subtask. Parent is optional; only subtasks can be loop targets. Omit description unless the user provided one.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          parentTaskId: { type: 'string' },
          parentTaskTitle: { type: 'string' },
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
          parentTaskTitle:
            optionalTitle(record, 'parentTaskTitle', 200) ?? null,
        };
      },
      describe: (args) => `Create task “${args.title}”.`,
      targetIds: (args) => (args.parentTaskId ? [args.parentTaskId] : []),
      prepare: async (context, args) => {
        const userText = context.userText?.toLowerCase() ?? '';
        if (
          args.description &&
          !userText.includes('description') &&
          !userText.includes(args.description.toLowerCase())
        ) {
          // Models often invent a plausible description for a bare title.
          args.description = null;
        }
        const parentTaskId = await resolveTaskRef(
          context.db,
          { taskId: args.parentTaskId, taskTitle: args.parentTaskTitle },
          false
        );
        const parentTitle = await requireTaskTitle(context.db, parentTaskId);
        return {
          description: parentTitle
            ? t('assistant.actionCreateSubtask', {
                title: args.title,
                parent: parentTitle,
              })
            : t('assistant.actionCreateTask', { title: args.title }),
          targetIds: parentTaskId ? [parentTaskId] : [],
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
        const parentTaskId = await resolveTaskRef(
          context.db,
          { taskId: args.parentTaskId, taskTitle: args.parentTaskTitle },
          false
        );
        const task = await createTask(context.db, {
          title: args.title,
          description: args.description,
          parentTaskId,
        });
        const created = await getTaskById(context.db, task.id);
        if (!created) {
          throw new AssistantToolError('stale', 'The task was not saved.');
        }
        return {
          summary: t('assistant.resultTaskCreated'),
          data: { id: task.id },
        };
      },
    }),

    defineTool<{
      taskId?: string | null;
      taskName?: string | null;
      title?: string;
      description?: string | null;
    }>({
      name: 'update_task',
      description:
        'Update a task title or description by task id or task name. taskName identifies the existing task; title is the new title.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          taskName: { type: 'string', description: 'Existing task name' },
          title: { type: 'string', description: 'New title' },
          description: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const taskId = optionalString(record, 'taskId', 128) ?? undefined;
        const taskName =
          optionalTitle(record, 'taskName', 200) ??
          optionalTitle(record, 'taskTitle', 200) ??
          undefined;
        const title = optionalString(record, 'title', 120);
        const description = optionalString(record, 'description', 1000);
        if (!taskId && !taskName) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a task id or task name.'
          );
        }
        if (title == null && description === undefined) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a title or description to update.'
          );
        }
        return {
          taskId,
          taskName,
          title: title ?? undefined,
          description,
        };
      },
      describe: (args) =>
        args.taskId ? `Update task ${args.taskId}.` : `Update task ${args.taskName}.`,
      targetIds: (args) => (args.taskId ? [args.taskId] : []),
      prepare: async (context, args) => {
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        const title = await requireTaskTitle(context.db, taskId as string);
        return {
          description: t('assistant.actionUpdateTask', {
            title: title ?? taskId ?? 'task',
          }),
          targetIds: taskId ? [taskId] : [],
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
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        await requireTaskTitle(context.db, taskId);
      },
      execute: async (context, args) => {
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        await updateTaskDetails(context.db, taskId as string, {
          title: args.title,
          description: args.description,
        });
        const updated = await getTaskById(context.db, taskId as string);
        if (!updated) {
          throw new AssistantToolError('stale', 'Task no longer exists.');
        }
        return { summary: t('assistant.resultTaskUpdated') };
      },
    }),

    defineTool<{
      taskId?: string | null;
      taskName?: string | null;
      newParentId?: string | null;
      newParentTitle?: string | null;
    }>({
      name: 'move_task',
      description:
        'Move a task under another task by id or name, or to the root. taskName identifies the task being moved.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          taskName: { type: 'string', description: 'Existing task name' },
          newParentId: { type: 'string' },
          newParentTitle: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const taskId = optionalString(record, 'taskId', 128) ?? undefined;
        const taskName =
          optionalTitle(record, 'taskName', 200) ??
          optionalTitle(record, 'taskTitle', 200) ??
          undefined;
        if (!taskId && !taskName) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a task id or task name.'
          );
        }
        return {
          taskId,
          taskName,
          newParentId: optionalString(record, 'newParentId', 128) ?? undefined,
          newParentTitle:
            optionalTitle(record, 'newParentTitle', 200) ?? undefined,
        };
      },
      describe: (args) =>
        args.taskId ? `Move task ${args.taskId}.` : `Move task ${args.taskName}.`,
      targetIds: (args) =>
        args.taskId
          ? [args.taskId, ...(args.newParentId ? [args.newParentId] : [])]
          : [],
      prepare: async (context, args) => {
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        const newParentId = await resolveTaskRef(
          context.db,
          { taskId: args.newParentId, taskTitle: args.newParentTitle },
          false
        );
        const title = await requireTaskTitle(context.db, taskId as string);
        const parentTitle = await requireTaskTitle(context.db, newParentId);
        return {
          description: parentTitle
            ? t('assistant.actionMoveTask', {
                title: title ?? taskId ?? 'task',
                parent: parentTitle,
              })
            : t('assistant.actionMoveTaskRoot', {
                title: title ?? taskId ?? 'task',
              }),
          targetIds: taskId ? [taskId] : [],
        };
      },
      revalidate: async (context, args) => {
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        await requireTaskTitle(context.db, taskId);
        const newParentId = await resolveTaskRef(
          context.db,
          { taskId: args.newParentId, taskTitle: args.newParentTitle },
          false
        );
        await requireTaskTitle(context.db, newParentId);
      },
      execute: async (context, args) => {
        const taskId = await resolveTaskRef(
          context.db,
          { taskId: args.taskId, taskTitle: args.taskName },
          true
        );
        const newParentId = await resolveTaskRef(
          context.db,
          { taskId: args.newParentId, taskTitle: args.newParentTitle },
          false
        );
        await moveTask(context.db, taskId as string, newParentId);
        const moved = await getTaskById(context.db, taskId as string);
        if (!moved || moved.parent_task_id !== newParentId) {
          throw new AssistantToolError('stale', 'Task no longer exists.');
        }
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

    defineTool<{
      loopId?: string | null;
      loopSequence?: number;
      text: string;
    }>({
      name: 'add_loop_item',
      description:
        'Add a capsule to the active or paused loop, or to a loop by id/number.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          loopSequence: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: optionalString(record, 'loopId', 128) ?? undefined,
          loopSequence: optionalSequence(record, 'loopSequence'),
          text: requireString(record, 'text', { max: 200 }),
        };
      },
      describe: (args) => `Add capsule “${args.text}” to the loop.`,
      targetIds: (args) => (args.loopId ? [args.loopId] : []),
      prepare: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        const loop = await requireLoop(context.db, loopId as string);
        if (loop.loop.status === 'COMPLETED') {
          throw new AssistantToolError('stale', 'That loop is already complete.');
        }
        return {
          description: t('assistant.actionAddCapsule', {
            text: args.text,
            sequence: loop.loop.sequence_number,
          }),
          targetIds: [loopId as string],
        };
      },
      revalidate: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        await requireLoop(context.db, loopId as string);
      },
      execute: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        const item = await loopService.addLoopItem(
          context.db,
          loopId as string,
          args.text
        );
        const added = await getLoopItemById(context.db, item.id);
        if (!added || added.loop_id !== loopId) {
          throw new AssistantToolError('stale', 'The capsule was not saved.');
        }
        return {
          summary: t('assistant.resultCapsuleAdded'),
          data: { id: item.id },
        };
      },
    }),

    defineTool<{
      capsuleId?: string | null;
      capsuleText?: string | null;
    }>({
      name: 'complete_standalone_capsule',
      description:
        'Mark a standalone capsule completed by id or capsule text.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          capsuleId: { type: 'string' },
          capsuleText: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const capsuleId = optionalString(record, 'capsuleId', 128) ?? undefined;
        const capsuleText =
          optionalTitle(record, 'capsuleText', 200) ?? undefined;
        if (!capsuleId && !capsuleText) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Provide a capsule id or capsule text.'
          );
        }
        return { capsuleId, capsuleText };
      },
      describe: (args) =>
        args.capsuleId
          ? `Complete standalone capsule ${args.capsuleId}.`
          : `Complete standalone capsule “${args.capsuleText}”.`,
      targetIds: (args) => (args.capsuleId ? [args.capsuleId] : []),
      prepare: async (context, args) => {
        const capsule = await resolveStandaloneCapsule(context.db, args);
        return {
          description: t('assistant.actionCompleteCapsule', {
            text: capsule.text,
          }),
          targetIds: [capsule.id],
        };
      },
      revalidate: async (context, args) => {
        await resolveStandaloneCapsule(context.db, args);
      },
      execute: async (context, args) => {
        const ref = await resolveStandaloneCapsule(context.db, args);
        const capsule = await getStandaloneCapsuleById(context.db, ref.id);
        if (!capsule) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
        await setStandaloneCapsuleDone(context.db, capsule, true);
        const updated = await getStandaloneCapsuleById(context.db, ref.id);
        if (!updated) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
        return { summary: t('assistant.resultCapsuleCompleted') };
      },
    }),

    defineTool<{
      loopId?: string | null;
      loopSequence?: number;
      itemId?: string | null;
      itemText?: string | null;
    }>({
      name: 'complete_loop_item',
      description:
        'Mark a capsule in the active loop or a specific loop completed, by capsule id or text.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          loopSequence: { type: 'integer' },
          itemId: { type: 'string' },
          itemText: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: optionalString(record, 'loopId', 128) ?? undefined,
          loopSequence: optionalSequence(record, 'loopSequence'),
          itemId: optionalString(record, 'itemId', 128) ?? undefined,
          itemText: optionalTitle(record, 'itemText', 200) ?? undefined,
        };
      },
      describe: (args) =>
        args.itemId
          ? `Complete loop capsule ${args.itemId}.`
          : `Complete loop capsule “${args.itemText}”.`,
      targetIds: (args) =>
        args.loopId ? [args.loopId, ...(args.itemId ? [args.itemId] : [])] : [],
      prepare: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        const item = await resolveLoopItemRef(
          context.db,
          loopId as string,
          args
        );
        return {
          description: t('assistant.actionCompleteCapsule', { text: item.text }),
          targetIds: [loopId as string, item.id],
        };
      },
      revalidate: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        await resolveLoopItemRef(context.db, loopId as string, args);
      },
      execute: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        const item = await resolveLoopItemRef(
          context.db,
          loopId as string,
          args
        );
        await loopService.setLoopItemDone(
          context.db,
          loopId as string,
          item.id,
          true
        );
        const updatedItem = await getLoopItemById(context.db, item.id);
        if (!updatedItem || updatedItem.loop_id !== loopId) {
          throw new AssistantToolError('stale', 'That capsule no longer exists.');
        }
        return { summary: t('assistant.resultCapsuleCompleted') };
      },
    }),

    defineTool<{
      durationMinutes: number;
      focus?: string | null;
      taskId?: string | null;
      taskTitle?: string | null;
      items: { text: string }[];
    }>({
      name: 'start_loop',
      description:
        'Start a real focus loop with at least one capsule. Requires explicit user confirmation before execution.',
      risk: 'timer',
      parameters: {
        type: 'object',
        properties: {
          durationMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          focus: { type: 'string' },
          taskId: { type: 'string' },
          taskTitle: { type: 'string' },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        },
        required: ['durationMinutes', 'items'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const durationMinutes = optionalIntegerLike(record, 'durationMinutes', {
          min: 1,
          max: 1440,
        });
        if (durationMinutes === undefined) {
          throw new AssistantToolError(
            'invalid_arguments',
            'A duration is required.'
          );
        }
        const items = parseStringItems(record, 'items');
        if (items.length === 0) {
          throw new AssistantToolError(
            'invalid_arguments',
            'Add at least one capsule before starting a loop.'
          );
        }
        return {
          durationMinutes,
          focus: optionalString(record, 'focus', 280) ?? null,
          taskId: optionalString(record, 'taskId', 128) ?? null,
          taskTitle: optionalTitle(record, 'taskTitle', 200) ?? null,
          items,
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
        const taskId = await resolveTaskRef(context.db, args, false);
        const task = await requireTask(context.db, taskId);
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
          targetIds: taskId ? [taskId] : [],
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
        const taskId = await resolveTaskRef(context.db, args, false);
        await requireTaskTitle(context.db, taskId);
      },
      execute: async (context, args) => {
        const taskId = await resolveTaskRef(context.db, args, false);
        const loop = await loopService.startLoop(context.db, {
          focus: args.focus,
          taskId,
          targetDurationSeconds: args.durationMinutes * 60,
          items: args.items,
        });
        await syncLoopNotification(context.db, loop, {
          requestPermission: true,
        }).catch(() => undefined);
        if (taskId) {
          await markTaskInProgress(context.db, taskId).catch(() => undefined);
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
      rollForwardTaskTitle?: string | null;
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
          rollForwardTaskTitle: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          done: optionalJournalText(record, 'done', 2000) ?? null,
          rollForward: optionalJournalText(record, 'rollForward', 2000) ?? null,
          note: optionalJournalText(record, 'note', 2000) ?? null,
          rollForwardTaskId:
            optionalString(record, 'rollForwardTaskId', 128) ?? null,
          rollForwardTaskTitle:
            optionalTitle(record, 'rollForwardTaskTitle', 200) ?? null,
        };
      },
      describe: () => 'Complete the current loop.',
      prepare: async (context, args) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active or paused loop.');
        }
        const rollForwardTaskId = await resolveTaskRef(
          context.db,
          {
            taskId: args.rollForwardTaskId,
            taskTitle: args.rollForwardTaskTitle,
          },
          false
        );
        return {
          description: t('assistant.actionCompleteLoop', {
            sequence: loop.sequence_number,
          }),
          targetIds: [
            loop.id,
            ...(rollForwardTaskId ? [rollForwardTaskId] : []),
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
        await resolveTaskRef(
          context.db,
          {
            taskId: args.rollForwardTaskId,
            taskTitle: args.rollForwardTaskTitle,
          },
          false
        );
      },
      execute: async (context, args) => {
        const loop = await loopService.getActiveLoop(context.db);
        if (!loop) {
          throw new AssistantToolError('stale', 'There is no active or paused loop.');
        }
        const rollForwardTaskId = await resolveTaskRef(
          context.db,
          {
            taskId: args.rollForwardTaskId,
            taskTitle: args.rollForwardTaskTitle,
          },
          false
        );
        const completed = await loopService.completeLoop(context.db, loop.id, {
          done: args.done,
          rollForward: args.rollForward,
          note: args.note,
          rollForwardTaskId,
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

    defineTool<{
      loopId?: string | null;
      loopSequence?: number;
      itemId?: string | null;
      itemText?: string | null;
    }>({
      name: 'set_current_loop_item',
      description:
        'Move the active focus to a specific unfinished capsule by capsule id or text.',
      risk: 'timer',
      parameters: {
        type: 'object',
        properties: {
          loopId: { type: 'string' },
          loopSequence: { type: 'integer' },
          itemId: { type: 'string' },
          itemText: { type: 'string' },
        },
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        return {
          loopId: optionalString(record, 'loopId', 128) ?? undefined,
          loopSequence: optionalSequence(record, 'loopSequence'),
          itemId: optionalString(record, 'itemId', 128) ?? undefined,
          itemText: optionalTitle(record, 'itemText', 200) ?? undefined,
        };
      },
      describe: (args) =>
        args.itemId
          ? `Move focus to capsule ${args.itemId}.`
          : `Move focus to capsule “${args.itemText}”.`,
      targetIds: (args) =>
        args.loopId ? [args.loopId, ...(args.itemId ? [args.itemId] : [])] : [],
      prepare: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        await requireLoop(context.db, loopId as string);
        const item = await resolveLoopItemRef(
          context.db,
          loopId as string,
          args,
          { unfinishedOnly: true }
        );
        return {
          description: t('assistant.actionSwitchCapsule', {
            text: item.text,
          }),
          targetIds: [loopId as string, item.id],
        };
      },
      revalidate: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        await requireLoop(context.db, loopId as string);
        await resolveLoopItemRef(context.db, loopId as string, args, {
          unfinishedOnly: true,
        });
      },
      execute: async (context, args) => {
        const loopId = await resolveLoopRef(context.db, args, {
          required: true,
          allowActive: true,
        });
        const item = await resolveLoopItemRef(
          context.db,
          loopId as string,
          args,
          { unfinishedOnly: true }
        );
        await loopService.setCurrentLoopItem(
          context.db,
          loopId as string,
          item.id
        );
        await useLoopStore.getState().refresh(context.db).catch(() => undefined);
        return { summary: t('assistant.resultCapsuleCurrent') };
      },
    }),

    defineTool<{ period: 'day' | 'month'; anchorDate: string }>({
      name: 'get_intention',
      description:
        'Read the focus target for a day or month. Use day for today/daily and month for monthly.',
      risk: 'read',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['day', 'month'],
            description: 'day = today/daily, month = this month/monthly',
          },
          anchorDate: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        },
        required: ['period'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const period = parsePeriodRequest(
          record.period,
          record.anchorDate,
          ['day', 'month'] as const
        );
        return {
          period: period.period,
          anchorDate: period.anchorDate ?? currentDayKey(),
        };
      },
      describe: (args) => `Read the ${args.period} focus target.`,
      execute: async (context, args) => {
        const periodType = args.period === 'day' ? 'daily' : 'monthly';
        const periodKey =
          args.period === 'day' ? args.anchorDate : args.anchorDate.slice(0, 7);
        const summary = await getIntentionSummary(
          context.db,
          periodType,
          periodKey
        );
        return {
          summary: `${formatIntentionDuration(summary.targetSeconds)} target, ${formatIntentionDuration(summary.actualSeconds)} focused.`,
          data: summary,
        };
      },
    }),

    defineTool<{
      period: 'day' | 'month';
      anchorDate: string;
      targetMinutes: number;
    }>({
      name: 'set_intention',
      description:
        'Set or clear the focus target for a day or month. targetMinutes 0 clears it.',
      risk: 'write',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['day', 'month'],
            description: 'day = today/daily, month = this month/monthly',
          },
          anchorDate: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          targetMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
        },
        required: ['period', 'targetMinutes'],
        additionalProperties: false,
      },
      parse: (args) => {
        const record = requireObject(args);
        const period = parsePeriodRequest(
          record.period,
          record.anchorDate,
          ['day', 'month'] as const
        );
        const targetMinutes = optionalIntegerLike(record, 'targetMinutes', {
          min: 0,
          max: 1440,
        });
        if (targetMinutes === undefined) {
          throw new AssistantToolError(
            'invalid_arguments',
            'A target duration is required.'
          );
        }
        return {
          period: period.period,
          anchorDate: period.anchorDate ?? currentDayKey(),
          targetMinutes,
        };
      },
      describe: (args) =>
        args.targetMinutes > 0
          ? `Set the ${args.period} focus target to ${formatIntentionDuration(
              args.targetMinutes * 60
            )}.`
          : `Clear the ${args.period} focus target.`,
      targetIds: () => [],
      prepare: async (_context, args) => ({
        description:
          args.targetMinutes > 0
            ? t('assistant.actionSetIntention', {
                period: args.period,
                duration: formatIntentionDuration(args.targetMinutes * 60),
              })
            : t('assistant.actionClearIntention', { period: args.period }),
        targetIds: [],
      }),
      revalidate: async () => undefined,
      execute: async (context, args) => {
        const periodType = args.period === 'day' ? 'daily' : 'monthly';
        const periodKey =
          args.period === 'day' ? args.anchorDate : args.anchorDate.slice(0, 7);
        await setIntention(
          context.db,
          periodType,
          periodKey,
          args.targetMinutes * 60
        );
        return {
          summary:
            args.targetMinutes > 0
              ? t('assistant.resultIntentionUpdated')
              : t('assistant.resultIntentionCleared'),
        };
      },
    }),
  ];
}
