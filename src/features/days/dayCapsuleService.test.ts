import type { Loop, LoopItem, LoopItemInterval, Task } from '../../domain/types';
import { getRangeCapsuleData } from './dayCapsuleService';
import { getLoopItemIntervalsOverlapping } from '../../database/repositories/loopItemIntervalsRepository';
import { getLoopItemsByIds } from '../../database/repositories/loopItemsRepository';
import { getLoopsByIds } from '../../database/repositories/loopsRepository';
import { getTasksByIds } from '../../database/repositories/tasksRepository';

jest.mock('../../domain/shared/dateUtils', () => {
  const actual = jest.requireActual('../../domain/shared/dateUtils');
  return {
    ...actual,
    getDeviceTimeZone: () => 'UTC',
  };
});

jest.mock('../../database/repositories/loopItemIntervalsRepository', () => ({
  getLoopItemIntervalsOverlapping: jest.fn(),
}));

jest.mock('../../database/repositories/loopItemsRepository', () => ({
  getLoopItemsByIds: jest.fn(),
}));

jest.mock('../../database/repositories/loopsRepository', () => ({
  getLoopsByIds: jest.fn(),
}));

jest.mock('../../database/repositories/tasksRepository', () => ({
  getTasksByIds: jest.fn(),
}));

const intervalMock = getLoopItemIntervalsOverlapping as jest.Mock;
const itemsMock = getLoopItemsByIds as jest.Mock;
const loopsMock = getLoopsByIds as jest.Mock;
const tasksMock = getTasksByIds as jest.Mock;

function makeItem(id: string, text: string, loopId: string): LoopItem {
  return {
    id,
    loop_id: loopId,
    text,
  } as LoopItem;
}

function makeLoop(id: string, sequence: number, taskId: string | null): Loop {
  return {
    id,
    sequence_number: sequence,
    task_id: taskId,
  } as Loop;
}

function makeTask(
  id: string,
  title: string,
  parentTaskId: string | null
): Task {
  return {
    id,
    title,
    parent_task_id: parentTaskId,
  } as Task;
}

function makeInterval(
  itemId: string,
  loopId: string,
  startedAt: string,
  endedAt: string | null
): LoopItemInterval {
  return {
    id: `${itemId}-${startedAt}`,
    loop_id: loopId,
    item_id: itemId,
    started_at: startedAt,
    ended_at: endedAt,
    time_zone: 'UTC',
  } as LoopItemInterval;
}

describe('getRangeCapsuleData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clips to the range, caps open intervals, and aggregates by capsule/task', async () => {
    intervalMock.mockResolvedValue([
      // 30 minutes on Monday.
      makeInterval('i1', 'l1', '2026-11-09T10:00:00.000Z', '2026-11-09T10:30:00.000Z'),
      // Another 10 minutes on Tuesday; same capsule.
      makeInterval('i1', 'l1', '2026-11-10T09:00:00.000Z', '2026-11-10T09:10:00.000Z'),
      // Starts before the week and is clipped at the range start.
      makeInterval('i2', 'l2', '2026-11-08T23:00:00.000Z', '2026-11-09T01:00:00.000Z'),
      // Still open when the range is read; capped at the reference time.
      makeInterval('i3', 'l3', '2026-11-15T10:00:00.000Z', null),
    ]);

    itemsMock.mockResolvedValue([
      makeItem('i1', 'Draft', 'l1'),
      makeItem('i2', 'Review', 'l2'),
      makeItem('i3', 'Ship', 'l3'),
    ]);
    loopsMock.mockResolvedValue([
      makeLoop('l1', 1, 't1'),
      makeLoop('l2', 2, 't1'),
      makeLoop('l3', 3, null),
    ]);
    tasksMock.mockResolvedValue([
      makeTask('t1', 'Feature', 'p1'),
      makeTask('p1', 'Project', null),
    ]);

    const data = await getRangeCapsuleData(
      {} as never,
      '2026-11-09',
      '2026-11-15',
      new Date('2026-11-15T12:00:00.000Z')
    );

    expect(data.startDayKey).toBe('2026-11-09');
    expect(data.endDayKey).toBe('2026-11-15');
    // 30m + 10m + 1h clipped + 2h open = 3h 40m.
    expect(data.totalSeconds).toBe(13_200);
    expect(data.segments).toHaveLength(4);

    expect(data.capsules.map((capsule) => capsule.itemId)).toEqual([
      'i3',
      'i2',
      'i1',
    ]);
    const byItem = new Map(
      data.capsules.map((capsule) => [capsule.itemId, capsule])
    );
    expect(byItem.get('i1')?.seconds).toBe(2400);
    expect(byItem.get('i1')?.taskTitle).toBe('Feature');
    expect(byItem.get('i1')?.parentTaskTitle).toBe('Project');
    expect(byItem.get('i2')?.seconds).toBe(3600);
    expect(byItem.get('i3')?.seconds).toBe(7200);
    expect(byItem.get('i3')?.taskId).toBeNull();
  });
});
