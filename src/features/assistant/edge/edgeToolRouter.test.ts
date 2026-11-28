/* eslint-disable import/first */
jest.mock('../../../services/notifications/notificationService', () => ({
  syncLoopNotification: jest.fn(async () => undefined),
  cancelLoopNotification: jest.fn(async () => undefined),
}));

import { createAssistantTools } from '../assistantTools';
import {
  EDGE_TOOL_INFO,
  pruneEdgeTools,
  selectEdgeToolNames,
} from './edgeToolRouter';

const allTools = createAssistantTools({} as never);
const allNames = allTools.map((tool) => tool.name);

function providerTools() {
  return allTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

describe('edge tool catalog', () => {
  it('covers every assistant tool with a concise edge summary', () => {
    expect(Object.keys(EDGE_TOOL_INFO).sort()).toEqual([...allNames].sort());
    for (const info of Object.values(EDGE_TOOL_INFO)) {
      expect(info.summary.length).toBeLessThanOrEqual(90);
      expect(info.summary.endsWith('.')).toBe(true);
    }
  });
});

describe('selectEdgeToolNames', () => {
  it.each([
    ['Start a 25 minute loop on the report', ['start_loop']],
    ['Pause my timer', ['pause_loop']],
    ['Resume the loop', ['resume_loop']],
    ['Complete this loop', ['complete_loop']],
    [
      'Switch to the second capsule',
      ['get_loop_items', 'set_current_loop_item'],
    ],
    ['Add a capsule called tests', ['get_active_loop', 'add_loop_item']],
    [
      'Finish the capsule about the report',
      ['get_loop_items', 'complete_loop_item'],
    ],
    ['Mark capsule Review done', ['get_loop_items', 'complete_loop_item']],
    ['Create a task called launch', ['get_tasks', 'create_task']],
    ['Rename the launch task', ['get_tasks', 'update_task']],
    ['Move the launch task under work', ['get_tasks', 'move_task']],
    ['What was my previous loop?', ['get_previous_loop']],
    ['Show details for task task-1', ['get_task_detail']],
    ['Show my loose capsules', ['get_loose_capsules']],
    ['List my standalone capsules', ['get_standalone_capsules']],
    [
      'Create a standalone capsule Buy milk',
      ['get_standalone_capsules', 'create_standalone_capsule'],
    ],
    [
      'Complete standalone capsule Buy milk',
      ['get_standalone_capsules', 'complete_standalone_capsule'],
    ],
    ['Show details for loop loop-1', ['get_loop']],
    ['Show the capsules in loop loop-1', ['get_loop_items']],
    ['Show my monthly intention', ['get_intention']],
    [
      'Set my daily focus target to two hours',
      ['get_intention', 'set_intention'],
    ],
  ])('routes "%s" to its action tools', (message, expected) => {
    const selected = selectEdgeToolNames(message);
    expect(selected).toEqual(expect.arrayContaining(expected));
    expect(selected.length).toBeLessThanOrEqual(6);
  });

  it('uses grounding reads for a general question', () => {
    const selected = selectEdgeToolNames('How is my focus going?');
    expect(selected).toEqual(
      expect.arrayContaining(['get_active_loop', 'get_tasks', 'get_focus_stats'])
    );
    expect(selected.length).toBeLessThanOrEqual(6);
  });

  it('adds history reads for stats questions', () => {
    const selected = selectEdgeToolNames('Show my focus time this week');
    expect(selected).toEqual(
      expect.arrayContaining([
        'get_focus_stats',
        'get_recent_loops',
        'get_previous_loop',
      ])
    );
    expect(selected.length).toBeLessThanOrEqual(6);
  });

  it('never selects tools that are not available', () => {
    const selected = selectEdgeToolNames('Start a loop and create a task', [
      'start_loop',
    ]);
    expect(selected).toEqual(['start_loop']);
  });

  it('keeps at least three tools when the full catalog is available', () => {
    for (const message of [
      'Pause my timer',
      'Resume the loop',
      'Complete the current loop',
      'Start a 25 minute loop',
      'Show my tasks',
    ]) {
      const selected = selectEdgeToolNames(message);
      expect({ message, count: selected.length }).toEqual({
        message,
        count: expect.any(Number),
      });
      expect(selected.length).toBeGreaterThanOrEqual(3);
      expect(selected.length).toBeLessThanOrEqual(6);
    }
  });

  it('caps the selection at six tools', () => {
    const selected = selectEdgeToolNames(
      'Start a loop, pause it, add a capsule, create a task, show stats and set my intention'
    );
    expect(selected.length).toBeLessThanOrEqual(6);
  });
});

describe('pruneEdgeTools', () => {
  it('keeps only selected tools and replaces long descriptions', () => {
    const pruned = pruneEdgeTools(providerTools(), 'Start a 25 minute loop');
    const names = pruned.map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining(['start_loop', 'get_active_loop'])
    );
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(pruned[0]?.function.description).toBe(
      EDGE_TOOL_INFO.start_loop?.summary
    );
    for (const tool of pruned) {
      expect(tool.function.description).toBe(
        EDGE_TOOL_INFO[tool.function.name]?.summary
      );
    }
  });

  it('returns no tools when the catalog is empty', () => {
    expect(pruneEdgeTools([], 'Start a loop')).toEqual([]);
  });

  it('preserves valid JSON schemas', () => {
    const pruned = pruneEdgeTools(providerTools(), 'Create a task called launch');
    for (const tool of pruned) {
      expect(tool.function.parameters.type).toBe('object');
      expect(() => JSON.stringify(tool.function.parameters)).not.toThrow();
    }
  });
});
