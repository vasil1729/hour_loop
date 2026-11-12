import {
  INTENTION_PERIOD,
  LOOP_STATUS,
  TASK_STATUS,
} from '../../constants/loopStatus';
import type { Intention, Loop, LoopInterval, Setting, Task } from '../types';
import {
  BackupValidationError,
  createBackupPayload,
  orderLoopItemsParentFirst,
  orderTasksParentFirst,
  parseBackupJson,
  prepareBackupForImport,
  validateBackup,
  type BackupLoopItem,
  type BackupStandaloneCapsule,
} from './backup';

const CREATED_AT = '2026-11-11T10:00:00.000Z';
const EXPORTED_AT = '2026-11-11T12:00:00.000Z';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parent_task_id: null,
    description: null,
    status: TASK_STATUS.NOT_STARTED,
    sort_order: 0,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    completed_at: null,
    archived_at: null,
    ...overrides,
  };
}

function makeLoop(overrides: Partial<Loop> & Pick<Loop, 'id'>): Loop {
  return {
    sequence_number: 1,
    local_date: '2026-11-11',
    focus: null,
    carry_in: null,
    done: null,
    roll_forward: null,
    roll_forward_task_id: null,
    note: null,
    task_id: null,
    target_duration_seconds: 3600,
    status: LOOP_STATUS.COMPLETED,
    started_at: CREATED_AT,
    stopped_at: EXPORTED_AT,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeInterval(
  overrides: Partial<LoopInterval> & Pick<LoopInterval, 'id' | 'loop_id'>
): LoopInterval {
  return {
    started_at: CREATED_AT,
    ended_at: EXPORTED_AT,
    time_zone: 'UTC',
    created_at: CREATED_AT,
    ...overrides,
  };
}

function makeIntention(
  overrides: Partial<Intention> & Pick<Intention, 'id'>
): Intention {
  return {
    period_type: INTENTION_PERIOD.DAILY,
    period_key: '2026-11-11',
    target_duration_seconds: 3600,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeSetting(key: string, value: string): Setting {
  return { key, value, updated_at: CREATED_AT };
}

function makeLoopItem(
  overrides: Partial<BackupLoopItem> & Pick<BackupLoopItem, 'id' | 'loop_id'>
): BackupLoopItem {
  return {
    text: 'Checklist item',
    done: false,
    sort_order: 0,
    carried_from_item_id: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeStandaloneCapsule(
  overrides: Partial<BackupStandaloneCapsule> &
    Pick<BackupStandaloneCapsule, 'id'>
): BackupStandaloneCapsule {
  return {
    text: 'Loose capsule',
    done: false,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    completed_at: null,
    ...overrides,
  };
}

function makeBackup(
  overrides: {
    tasks?: Task[];
    loops?: Loop[];
    intervals?: LoopInterval[];
    loopItems?: BackupLoopItem[];
    standaloneCapsules?: BackupStandaloneCapsule[];
    intentions?: Intention[];
    settings?: Setting[];
  } = {}
) {
  return createBackupPayload({
    tasks: overrides.tasks ?? [
      makeTask({ id: 'task-1', title: 'Parent' }),
      makeTask({ id: 'task-2', title: 'Child', parent_task_id: 'task-1' }),
    ],
    loops: overrides.loops ?? [
      makeLoop({ id: 'loop-1', task_id: 'task-1' }),
    ],
    intervals: overrides.intervals ?? [
      makeInterval({ id: 'interval-1', loop_id: 'loop-1' }),
    ],
    loopItems: overrides.loopItems ?? [
      makeLoopItem({ id: 'item-1', loop_id: 'loop-1' }),
    ],
    standaloneCapsules: overrides.standaloneCapsules ?? [],
    intentions: overrides.intentions ?? [
      makeIntention({ id: 'intention-1' }),
    ],
    settings: overrides.settings ?? [
      makeSetting('theme', 'dark'),
      makeSetting('notif_loop-1', 'scheduled-id'),
    ],
    appVersion: '1.0.1',
    exportedAt: EXPORTED_AT,
    timeZone: 'UTC',
  });
}

describe('createBackupPayload', () => {
  it('adds metadata, counts, and drops device-specific notification settings', () => {
    const backup = makeBackup();

    expect(backup.format).toBe('hour-loop-backup');
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(EXPORTED_AT);
    expect(backup.counts).toEqual({
      tasks: 2,
      loops: 1,
      intervals: 1,
      loopItems: 1,
      standaloneCapsules: 0,
      intentions: 1,
      settings: 1,
    });
    expect(backup.data.settings.map((setting) => setting.key)).toEqual(['theme']);
  });

  it('drops assistant preferences and cannot carry credentials', () => {
    const backup = makeBackup({
      settings: [
        makeSetting('theme', 'dark'),
        makeSetting('assistant_provider', 'openai'),
        makeSetting('assistant_model', 'gpt-4o-mini'),
        makeSetting('assistant_api_key', 'sk-should-never-export'),
      ],
    });

    expect(backup.data.settings.map((setting) => setting.key)).toEqual([
      'theme',
    ]);
    expect(JSON.stringify(backup)).not.toContain('sk-should-never-export');
  });
});

describe('validateBackup', () => {
  it('accepts a well-formed backup and recomputes counts', () => {
    const parsed = parseBackupJson(JSON.stringify(makeBackup()));

    expect(parsed.counts.tasks).toBe(2);
    expect(parsed.counts.settings).toBe(1);
    expect(parsed.data.tasks.map((task) => task.id)).toEqual(['task-1', 'task-2']);
  });

  it('rejects a file from another app', () => {
    const backup = { ...makeBackup(), format: 'something-else' };
    expect(() => validateBackup(backup)).toThrow(BackupValidationError);
  });

  it('rejects a backup from a newer format version', () => {
    const backup = { ...makeBackup(), version: 2 };
    expect(() => validateBackup(backup)).toThrow(/newer Hour Loop version/);
  });

  it('rejects missing data arrays', () => {
    const backup = makeBackup();
    const broken = {
      ...backup,
      data: { ...backup.data, tasks: undefined },
    };
    expect(() => validateBackup(broken)).toThrow(/data.tasks/);
  });

  it('rejects a missing task parent', () => {
    const backup = makeBackup({
      tasks: [
        makeTask({
          id: 'orphan',
          title: 'Orphan',
          parent_task_id: 'missing-parent',
        }),
      ],
      loops: [],
      intervals: [],
      loopItems: [],
    });
    expect(() => validateBackup(backup)).toThrow(/missing parent/);
  });

  it('rejects a task cycle', () => {
    const backup = makeBackup({
      tasks: [
        makeTask({ id: 'a', title: 'A', parent_task_id: 'b' }),
        makeTask({ id: 'b', title: 'B', parent_task_id: 'a' }),
      ],
      loops: [],
      intervals: [],
      loopItems: [],
    });
    expect(() => validateBackup(backup)).toThrow(/cycle/);
  });

  it('rejects more than one active or paused loop', () => {
    const backup = makeBackup({
      loops: [
        makeLoop({ id: 'loop-1', status: LOOP_STATUS.PAUSED }),
        makeLoop({ id: 'loop-2', status: LOOP_STATUS.PAUSED }),
      ],
      intervals: [],
    });
    expect(() => validateBackup(backup)).toThrow(/more than one active or paused/);
  });

  it('rejects an interval whose loop is missing', () => {
    const backup = makeBackup({
      loops: [],
      intervals: [makeInterval({ id: 'interval-1', loop_id: 'loop-1' })],
      loopItems: [],
    });
    expect(() => validateBackup(backup)).toThrow(/missing loop/);
  });

  it('rejects an open interval on a completed loop', () => {
    const backup = makeBackup({
      intervals: [
        makeInterval({
          id: 'interval-1',
          loop_id: 'loop-1',
          ended_at: null,
        }),
      ],
    });
    expect(() => validateBackup(backup)).toThrow(/open interval/);
  });

  it('rejects duplicate intentions for the same period', () => {
    const backup = makeBackup({
      intentions: [
        makeIntention({ id: 'intention-1' }),
        makeIntention({ id: 'intention-2' }),
      ],
    });
    expect(() => validateBackup(backup)).toThrow(/appears more than once/);
  });

  it('rejects a loop item whose loop is missing', () => {
    const backup = makeBackup({
      loopItems: [makeLoopItem({ id: 'item-1', loop_id: 'missing-loop' })],
    });
    expect(() => validateBackup(backup)).toThrow(/missing loop/);
  });

  it('rejects a carried loop item cycle', () => {
    const backup = makeBackup({
      loopItems: [
        makeLoopItem({
          id: 'item-1',
          loop_id: 'loop-1',
          carried_from_item_id: 'item-2',
        }),
        makeLoopItem({
          id: 'item-2',
          loop_id: 'loop-1',
          carried_from_item_id: 'item-1',
        }),
      ],
    });
    expect(() => validateBackup(backup)).toThrow(/cycle/);
  });

  it('accepts standalone capsules and counts them', () => {
    const backup = makeBackup({
      standaloneCapsules: [
        makeStandaloneCapsule({ id: 'loose-1', text: 'Buy milk' }),
        makeStandaloneCapsule({
          id: 'loose-2',
          text: 'Call bank',
          done: true,
          completed_at: EXPORTED_AT,
        }),
      ],
    });

    const parsed = validateBackup(backup);
    expect(parsed.counts.standaloneCapsules).toBe(2);
    expect(parsed.data.standaloneCapsules.map((capsule) => capsule.text)).toEqual([
      'Buy milk',
      'Call bank',
    ]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackupJson('{not json')).toThrow(/valid JSON/);
  });
});

describe('orderLoopItemsParentFirst', () => {
  it('returns carried items after their source item', () => {
    const items = [
      makeLoopItem({
        id: 'child',
        loop_id: 'loop-1',
        carried_from_item_id: 'root',
      }),
      makeLoopItem({ id: 'root', loop_id: 'loop-1' }),
    ];

    expect(orderLoopItemsParentFirst(items).map((item) => item.id)).toEqual([
      'root',
      'child',
    ]);
  });
});

describe('orderTasksParentFirst', () => {
  it('returns every parent before its children', () => {
    const tasks = [
      makeTask({ id: 'root', title: 'Root' }),
      makeTask({ id: 'child', title: 'Child', parent_task_id: 'root' }),
      makeTask({ id: 'grandchild', title: 'Grandchild', parent_task_id: 'child' }),
    ];

    const ordered = orderTasksParentFirst(tasks);
    expect(ordered.map((task) => task.id)).toEqual(['root', 'child', 'grandchild']);
  });
});

describe('prepareBackupForImport', () => {
  it('pauses active loops and closes open intervals at the export time', () => {
    const activeBackup = makeBackup({
      loops: [makeLoop({ id: 'loop-1', status: LOOP_STATUS.ACTIVE, stopped_at: null })],
      intervals: [
        makeInterval({ id: 'interval-1', loop_id: 'loop-1', ended_at: null }),
      ],
    });
    const validated = validateBackup(activeBackup);

    const prepared = prepareBackupForImport(validated);

    expect(prepared.pausedLoops).toBe(1);
    expect(prepared.closedIntervals).toBe(1);
    expect(prepared.backup.data.loops[0]?.status).toBe(LOOP_STATUS.PAUSED);
    expect(prepared.backup.data.intervals[0]?.ended_at).toBe(EXPORTED_AT);
  });
});
