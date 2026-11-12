import type { SQLiteDatabase } from 'expo-sqlite';

import type { Loop, LoopItem } from '../../domain/types';
import { executeAssistantAction, createPendingAction } from './assistantActionApproval';
import { createAssistantTools } from './assistantTools';
import type { AssistantTool, AssistantToolContext } from './assistantTypes';
import { loopService } from '../loops/loopService';
import { syncLoopNotification } from '../../services/notifications/notificationService';
import { getLoopItemById } from '../../database/repositories/loopItemsRepository';

jest.mock('../loops/loopService', () => ({
  loopService: {
    startLoop: jest.fn(),
    pauseLoop: jest.fn(),
    resumeLoop: jest.fn(),
    completeLoop: jest.fn(),
    getActiveLoop: jest.fn(),
    getLoop: jest.fn(),
    getLoopWithElapsed: jest.fn(),
    getLoopItems: jest.fn(),
    getElapsedSeconds: jest.fn(),
    addLoopItem: jest.fn(),
    deleteLoopItem: jest.fn(),
    setLoopItemDone: jest.fn(),
    setCurrentLoopItem: jest.fn(),
    ensureCurrentItemInterval: jest.fn(),
    getPreviousLoopWithItems: jest.fn(),
  },
}));

jest.mock('../../services/notifications/notificationService', () => ({
  syncLoopNotification: jest.fn(async () => undefined),
  cancelLoopNotification: jest.fn(async () => undefined),
}));

jest.mock('../../store/loopStore', () => ({
  useLoopStore: {
    getState: () => ({ refresh: jest.fn(async () => undefined) }),
  },
}));

jest.mock('../../database/repositories/loopItemsRepository', () => ({
  getLoopItemById: jest.fn(),
}));

const db = {} as SQLiteDatabase;
const context: AssistantToolContext = { db };
const loops = jest.mocked(loopService);
const notifications = {
  syncLoopNotification: jest.mocked(syncLoopNotification),
};
const items = jest.mocked(getLoopItemById);

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    sequence_number: 2,
    local_date: '2026-11-12',
    focus: 'Write tests',
    carry_in: null,
    done: null,
    roll_forward: null,
    roll_forward_task_id: null,
    note: null,
    task_id: null,
    target_duration_seconds: 1500,
    status: 'ACTIVE',
    started_at: '2026-11-12T09:00:00.000Z',
    stopped_at: null,
    created_at: '2026-11-12T09:00:00.000Z',
    updated_at: '2026-11-12T09:00:00.000Z',
    ...overrides,
  };
}

function findTool(name: string): AssistantTool {
  const tool = createAssistantTools(db).find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

async function prepare(tool: AssistantTool, rawArgs: Record<string, unknown>) {
  const args = tool.parse(rawArgs);
  const preview = await tool.prepare!(context, args);
  return createPendingAction(tool, args, preview);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AI loop actions use the existing timer service', () => {
  it('starts a real loop only after confirmation', async () => {
    loops.getActiveLoop.mockResolvedValue(null);
    loops.startLoop.mockResolvedValue(makeLoop());
    const tool = findTool('start_loop');
    const action = await prepare(tool, {
      durationMinutes: 45,
      focus: 'Deep work',
      items: [{ text: 'Outline' }],
    });

    expect(loops.startLoop).not.toHaveBeenCalled();
    const result = await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });

    expect(loops.startLoop).toHaveBeenCalledWith(db, {
      focus: 'Deep work',
      taskId: null,
      targetDurationSeconds: 45 * 60,
      items: [{ text: 'Outline' }],
    });
    expect(notifications.syncLoopNotification).toHaveBeenCalled();
    expect(result.summary).toContain('H2');
  });

  it('respects the single active-or-paused loop rule', async () => {
    loops.getActiveLoop.mockResolvedValue(makeLoop({ status: 'PAUSED' }));
    const tool = findTool('start_loop');

    await expect(prepare(tool, { durationMinutes: 25 })).rejects.toThrow(
      'already paused'
    );
    expect(loops.startLoop).not.toHaveBeenCalled();
  });

  it('pauses the active loop through the existing service', async () => {
    loops.getActiveLoop.mockResolvedValue(makeLoop());
    loops.pauseLoop.mockResolvedValue(makeLoop({ status: 'PAUSED' }));
    const tool = findTool('pause_loop');
    const action = await prepare(tool, {});

    await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });

    expect(loops.pauseLoop).toHaveBeenCalledWith(db, 'loop-1');
    expect(notifications.syncLoopNotification).toHaveBeenCalled();
  });

  it('resumes the paused loop through the existing service', async () => {
    const paused = makeLoop({ status: 'PAUSED' });
    loops.getActiveLoop.mockResolvedValue(paused);
    loops.resumeLoop.mockResolvedValue(makeLoop());
    const tool = findTool('resume_loop');
    const action = await prepare(tool, {});

    await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });

    expect(loops.resumeLoop).toHaveBeenCalledWith(db, 'loop-1');
  });

  it('completes the loop with journal data through the existing service', async () => {
    loops.getActiveLoop.mockResolvedValue(makeLoop());
    loops.completeLoop.mockResolvedValue(
      makeLoop({ status: 'COMPLETED', stopped_at: '2026-11-12T10:00:00.000Z' })
    );
    const tool = findTool('complete_loop');
    const action = await prepare(tool, {
      done: 'Finished the outline',
      rollForward: 'Draft the section',
      note: 'Good focus',
    });

    await executeAssistantAction(context, tool, action, {
      writesEnabled: true,
    });

    expect(loops.completeLoop).toHaveBeenCalledWith(db, 'loop-1', {
      done: 'Finished the outline',
      rollForward: 'Draft the section',
      note: 'Good focus',
      rollForwardTaskId: null,
    });
  });

  it('rejects invalid status transitions before preparing an action', async () => {
    loops.getActiveLoop.mockResolvedValue(makeLoop({ status: 'PAUSED' }));
    const tool = findTool('pause_loop');

    await expect(prepare(tool, {})).rejects.toThrow(
      'There is no active loop to pause.'
    );
  });

  it('does not report a successful action when the service fails', async () => {
    loops.getActiveLoop.mockResolvedValue(null);
    loops.startLoop.mockRejectedValue(new Error('Timer write failed.'));
    const tool = findTool('start_loop');
    const action = await prepare(tool, { durationMinutes: 25 });

    await expect(
      executeAssistantAction(context, tool, action, { writesEnabled: true })
    ).rejects.toThrow('Timer write failed.');
  });

  it('rejects a missing capsule target', async () => {
    items.mockResolvedValue(null);
    const tool = findTool('complete_loop_item');

    await expect(
      prepare(tool, { loopId: 'loop-1', itemId: 'missing' })
    ).rejects.toThrow('Capsule not found.');
  });

  it('rejects a capsule that belongs to another loop', async () => {
    const foreignItem: LoopItem = {
      id: 'item-1',
      loop_id: 'loop-other',
      text: 'Not yours',
      done: false,
      current: false,
      sort_order: 0,
      carried_from_item_id: null,
      created_at: '2026-11-12T09:00:00.000Z',
      updated_at: '2026-11-12T09:00:00.000Z',
    };
    items.mockResolvedValue(foreignItem);
    const tool = findTool('complete_loop_item');

    await expect(
      prepare(tool, { loopId: 'loop-1', itemId: 'item-1' })
    ).rejects.toThrow('Capsule not found.');
  });
});
