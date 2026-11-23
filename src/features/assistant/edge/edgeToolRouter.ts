import type { ProviderTool } from '../assistantTypes';
import {
  normalizeScopeText,
  tokenizeScopeText,
} from '../scope/scopeFeatures';

export type EdgeToolCategory =
  | 'loop'
  | 'capsule'
  | 'task'
  | 'stats'
  | 'intention';

type EdgeToolInfo = {
  summary: string;
  category: EdgeToolCategory;
};

/**
 * Concise descriptions are used instead of the full cloud-tool descriptions.
 * The full text is intentionally kept out of small-model prompts to reduce
 * prefill cost and instruction dilution.
 */
export const EDGE_TOOL_INFO: Record<string, EdgeToolInfo> = {
  get_active_loop: {
    summary: 'Read the active or paused loop, elapsed time and capsules.',
    category: 'loop',
  },
  get_loop: {
    summary: 'Read one loop and its capsules by id.',
    category: 'loop',
  },
  get_loop_items: {
    summary: 'Read the capsules in a loop.',
    category: 'capsule',
  },
  get_recent_loops: {
    summary: 'Read recent completed loops.',
    category: 'stats',
  },
  get_tasks: {
    summary: 'Read task containers and capsules with their ids.',
    category: 'task',
  },
  get_task_detail: {
    summary: 'Read one task, its children and open capsules.',
    category: 'task',
  },
  get_loose_capsules: {
    summary: 'Read loose loop capsules that are not attached to a task.',
    category: 'capsule',
  },
  get_standalone_capsules: {
    summary: 'Read standalone capsules.',
    category: 'capsule',
  },
  get_focus_stats: {
    summary: 'Read focused-time totals for a day, week or month.',
    category: 'stats',
  },
  get_previous_loop: {
    summary: 'Read the latest completed loop and its capsules.',
    category: 'stats',
  },
  create_task: {
    summary: 'Prepare a new task or subtask.',
    category: 'task',
  },
  update_task: {
    summary: 'Prepare a task title or description change.',
    category: 'task',
  },
  move_task: {
    summary: 'Prepare moving a task under another task or to the root.',
    category: 'task',
  },
  create_standalone_capsule: {
    summary: 'Prepare a standalone capsule.',
    category: 'capsule',
  },
  add_loop_item: {
    summary: 'Prepare adding a capsule to a loop.',
    category: 'capsule',
  },
  complete_standalone_capsule: {
    summary: 'Prepare completing a standalone capsule.',
    category: 'capsule',
  },
  complete_loop_item: {
    summary: 'Prepare completing a capsule in a loop.',
    category: 'capsule',
  },
  start_loop: {
    summary: 'Prepare a real focus loop with a target duration.',
    category: 'loop',
  },
  pause_loop: {
    summary: 'Prepare pausing the active loop.',
    category: 'loop',
  },
  resume_loop: {
    summary: 'Prepare resuming the paused loop.',
    category: 'loop',
  },
  complete_loop: {
    summary: 'Prepare completing the current loop.',
    category: 'loop',
  },
  set_current_loop_item: {
    summary: 'Prepare moving focus to a specific loop capsule.',
    category: 'capsule',
  },
  get_intention: {
    summary: 'Read the daily or monthly focus target.',
    category: 'intention',
  },
  set_intention: {
    summary:
      'Set a daily or monthly focus target; use targetMinutes 0 to clear it.',
    category: 'intention',
  },
};

const READ_FALLBACK = [
  'get_active_loop',
  'get_tasks',
  'get_focus_stats',
] as const;

const MIN_EDGE_TOOL_COUNT = 3;

function words(message: string): Set<string> {
  return new Set(tokenizeScopeText(normalizeScopeText(message)));
}

function hasAny(message: string, wordsToFind: readonly string[]): boolean {
  const normalized = normalizeScopeText(message);
  return wordsToFind.some((word) => normalized.includes(word));
}

export function selectEdgeToolNames(
  message: string,
  availableNames?: readonly string[]
): string[] {
  const available = availableNames
    ? new Set(availableNames)
    : new Set(Object.keys(EDGE_TOOL_INFO));
  const tokens = words(message);
  const selected: string[] = [];
  const add = (name: string) => {
    if (available.has(name) && !selected.includes(name)) selected.push(name);
  };

  const startIntent =
    hasAny(message, ['start', 'begin', 'new loop', 'focus session', 'focus loop']) &&
    !hasAny(message, ['pause', 'resume', 'stop', 'complete', 'finish', 'end']);
  const pauseIntent = hasAny(message, ['pause', 'hold']);
  const resumeIntent = hasAny(message, ['resume', 'continue', 'unpause']);
  const completeLoopIntent =
    hasAny(message, [
      'complete loop',
      'finish loop',
      'stop loop',
      'end loop',
      'close loop',
    ]) ||
    (tokens.has('loop') &&
      (tokens.has('complete') ||
        tokens.has('finish') ||
        tokens.has('stop') ||
        tokens.has('end') ||
        tokens.has('close')));
  const capsuleIntent =
    tokens.has('capsule') ||
    tokens.has('capsules') ||
    hasAny(message, ['checklist item', 'loop item']);
  const switchIntent = hasAny(message, [
    'switch',
    'move focus',
    'work on',
    'focus on',
    'current capsule',
  ]);
  const addCapsuleIntent = hasAny(message, [
    'add a capsule',
    'add capsule',
    'create a capsule',
    'new capsule',
  ]);
  const completeCapsuleIntent = hasAny(message, [
    'complete the capsule',
    'complete this capsule',
    'complete capsule',
    'finish the capsule',
    'finish this capsule',
  ]);
  const previousLoopIntent = hasAny(message, [
    'previous loop',
    'last loop',
    'last completed loop',
  ]);
  const activeLoopIntent =
    hasAny(message, ['active loop', 'current loop', 'running loop']) ||
    tokens.has('timer');
  const loopDetailIntent =
    hasAny(message, ['loop details', 'details of the loop', 'loop info']) ||
    (tokens.has('loop') && tokens.has('details'));
  const loopItemsIntent =
    capsuleIntent && (tokens.has('loop') || hasAny(message, ['in the loop']));
  const looseCapsulesIntent = hasAny(message, [
    'loose capsule',
    'loose capsules',
    'unassigned capsules',
  ]);
  const standaloneCapsulesIntent = hasAny(message, [
    'standalone capsule',
    'standalone capsules',
  ]);
  const taskIntent =
    tokens.has('task') ||
    tokens.has('tasks') ||
    tokens.has('subtask') ||
    tokens.has('project');
  const taskDetailIntent =
    taskIntent &&
    (tokens.has('details') ||
      tokens.has('detail') ||
      hasAny(message, ['task info']));
  const createTaskIntent = hasAny(message, [
    'create a task',
    'create task',
    'new task',
    'add a task',
    'add task',
    'make a task',
  ]);
  const updateTaskIntent = hasAny(message, [
    'rename',
    'update the task',
    'update my task',
    'edit the task',
    'edit my task',
    'change the task',
  ]);
  const moveTaskIntent =
    hasAny(message, ['move the task', 'move my task', 'move task', 'move it under']) ||
    (taskIntent && tokens.has('move'));
  const statsIntent = hasAny(message, [
    'focus time',
    'focus stats',
    'statistics',
    'history',
    'recent',
    'yesterday',
    'today',
    'this week',
    'last week',
    'this month',
    'last month',
    'streak',
    'progress',
    'time spent',
    'how much time',
  ]);
  const intentionIntent = hasAny(message, [
    'intention',
    'target',
    'goal',
    'daily focus',
    'monthly focus',
  ]);

  if (startIntent) add('start_loop');
  if (pauseIntent) add('pause_loop');
  if (resumeIntent) add('resume_loop');
  if (completeLoopIntent) add('complete_loop');
  if (switchIntent) {
    add('get_loop_items');
    add('set_current_loop_item');
  }
  if (addCapsuleIntent) {
    add('get_active_loop');
    add('add_loop_item');
  }
  if (completeCapsuleIntent) {
    add('get_loop_items');
    add('complete_loop_item');
  }
  if (createTaskIntent) {
    add('get_tasks');
    add('create_task');
  }
  if (updateTaskIntent) {
    add('get_tasks');
    add('update_task');
  }
  if (moveTaskIntent) {
    add('get_tasks');
    add('move_task');
  }
  if (intentionIntent) {
    add('get_intention');
    if (
      hasAny(message, ['set', 'change', 'update', 'clear', 'remove', 'make'])
    ) {
      add('set_intention');
    }
  }
  if (previousLoopIntent) add('get_previous_loop');
  if (activeLoopIntent) add('get_active_loop');
  if (loopDetailIntent) add('get_loop');
  if (loopItemsIntent) add('get_loop_items');
  if (taskDetailIntent) {
    add('get_tasks');
    add('get_task_detail');
  }
  if (looseCapsulesIntent) add('get_loose_capsules');
  if (standaloneCapsulesIntent) add('get_standalone_capsules');

  // Grounding reads for a question that did not match a specific tool.
  if (selected.length === 0) {
    add('get_active_loop');
    add('get_tasks');
    add('get_focus_stats');
  }
  if (statsIntent) {
    add('get_focus_stats');
    add('get_recent_loops');
    add('get_previous_loop');
  }

  // Keep prompts small. Specific action tools are added first, then grounded
  // reads fill the prompt to the 3–6 tool budget.
  for (const name of READ_FALLBACK) {
    if (selected.length >= MIN_EDGE_TOOL_COUNT) break;
    add(name);
  }
  return selected.slice(0, 6);
}

export function pruneEdgeTools(
  tools: readonly ProviderTool[],
  message: string
): ProviderTool[] {
  const byName = new Map(tools.map((tool) => [tool.function.name, tool]));
  const selected = selectEdgeToolNames(
    message,
    tools.map((tool) => tool.function.name)
  );
  return selected
    .map((name) => byName.get(name))
    .filter((tool): tool is ProviderTool => Boolean(tool))
    .map((tool) => ({
      ...tool,
      function: {
        ...tool.function,
        description:
          EDGE_TOOL_INFO[tool.function.name]?.summary ??
          tool.function.description,
      },
    }));
}
