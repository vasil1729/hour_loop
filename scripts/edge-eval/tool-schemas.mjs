/**
 * Tool schemas used only by the real-model evaluation harness.
 *
 * These mirror the app's assistant tool schemas and risk levels. The harness
 * deliberately does not import assistantTools.ts because that module pulls in
 * native app dependencies that cannot run in Node.
 */

const empty = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

export const EVAL_TOOLS = [
  {
    name: 'get_active_loop',
    risk: 'read',
    parameters: empty,
  },
  {
    name: 'get_loop',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: { loopId: { type: 'string' } },
      required: ['loopId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_loop_items',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: { loopId: { type: 'string' } },
      required: ['loopId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recent_loops',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_tasks',
    risk: 'read',
    parameters: empty,
  },
  {
    name: 'get_task_detail',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_loose_capsules',
    risk: 'read',
    parameters: empty,
  },
  {
    name: 'get_standalone_capsules',
    risk: 'read',
    parameters: empty,
  },
  {
    name: 'get_focus_stats',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        anchorDate: { type: 'string' },
        taskId: { type: 'string' },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_previous_loop',
    risk: 'read',
    parameters: empty,
  },
  {
    name: 'create_task',
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
  },
  {
    name: 'update_task',
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
  },
  {
    name: 'move_task',
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
  },
  {
    name: 'create_standalone_capsule',
    risk: 'write',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_loop_item',
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
  },
  {
    name: 'complete_standalone_capsule',
    risk: 'write',
    parameters: {
      type: 'object',
      properties: { capsuleId: { type: 'string' } },
      required: ['capsuleId'],
      additionalProperties: false,
    },
  },
  {
    name: 'complete_loop_item',
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
  },
  {
    name: 'start_loop',
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
  },
  {
    name: 'pause_loop',
    risk: 'timer',
    parameters: empty,
  },
  {
    name: 'resume_loop',
    risk: 'timer',
    parameters: empty,
  },
  {
    name: 'complete_loop',
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
  },
  {
    name: 'set_current_loop_item',
    risk: 'timer',
    parameters: {
      type: 'object',
      properties: {
        loopId: { type: 'string' },
        itemId: { type: 'string' },
      },
      required: ['loopId', 'itemId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_intention',
    risk: 'read',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'month'] },
        anchorDate: { type: 'string' },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_intention',
    risk: 'write',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'month'] },
        anchorDate: { type: 'string' },
        targetMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
      },
      required: ['period', 'targetMinutes'],
      additionalProperties: false,
    },
  },
];

export const TOOL_RISK = Object.fromEntries(
  EVAL_TOOLS.map((tool) => [tool.name, tool.risk])
);
