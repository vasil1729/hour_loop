import {
  INTENTION_PERIOD,
  LOOP_STATUS,
  TASK_STATUS,
  type IntentionPeriodType,
  type LoopStatus,
  type TaskStatus,
} from '../../constants/loopStatus';
import type {
  Intention,
  Loop,
  LoopInterval,
  Setting,
  StandaloneCapsule,
  Task,
} from '../types';

export const BACKUP_FORMAT = 'hour-loop-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const LOOP_STATUSES: LoopStatus[] = [
  LOOP_STATUS.ACTIVE,
  LOOP_STATUS.PAUSED,
  LOOP_STATUS.COMPLETED,
];
const TASK_STATUSES: TaskStatus[] = [
  TASK_STATUS.NOT_STARTED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.COMPLETED,
  TASK_STATUS.ARCHIVED,
];
const INTENTION_PERIODS: IntentionPeriodType[] = [
  INTENTION_PERIOD.DAILY,
  INTENTION_PERIOD.MONTHLY,
];

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export type BackupData = {
  tasks: Task[];
  loops: Loop[];
  intervals: LoopInterval[];
  loopItems: BackupLoopItem[];
  standaloneCapsules: BackupStandaloneCapsule[];
  intentions: Intention[];
  settings: Setting[];
};

export type BackupLoopItem = {
  id: string;
  loop_id: string;
  text: string;
  done: boolean;
  sort_order: number;
  carried_from_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BackupStandaloneCapsule = Omit<StandaloneCapsule, 'done'> & {
  done: boolean;
};

export type BackupCounts = {
  tasks: number;
  loops: number;
  intervals: number;
  loopItems: number;
  standaloneCapsules: number;
  intentions: number;
  settings: number;
};

export type HourLoopBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  exportedAt: string;
  timeZone: string;
  counts: BackupCounts;
  data: BackupData;
};

export type BackupSource = {
  tasks: Task[];
  loops: Loop[];
  intervals: LoopInterval[];
  loopItems: BackupLoopItem[];
  standaloneCapsules: BackupStandaloneCapsule[];
  intentions: Intention[];
  settings: Setting[];
  appVersion: string;
  exportedAt: string;
  timeZone: string;
};

export type PreparedImport = {
  backup: HourLoopBackup;
  pausedLoops: number;
  closedIntervals: number;
};

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must be an object.`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array.`);
  }
  return value;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  path: string
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${path}.${key} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string
): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(`${path}.${key} must be a string or null.`);
  }
  return value;
}

function optionalTimestamp(
  record: Record<string, unknown>,
  key: string,
  path: string
): string | null {
  const value = optionalString(record, key, path);
  if (value !== null && Number.isNaN(Date.parse(value))) {
    fail(`${path}.${key} must be a valid timestamp.`);
  }
  return value;
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string,
  path: string
): string {
  const value = requireString(record, key, path);
  if (Number.isNaN(Date.parse(value))) {
    fail(`${path}.${key} must be a valid timestamp.`);
  }
  return value;
}

function requireInteger(
  record: Record<string, unknown>,
  key: string,
  path: string
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(`${path}.${key} must be an integer.`);
  }
  return value;
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  path: string
): number {
  const value = requireInteger(record, key, path);
  if (value <= 0) {
    fail(`${path}.${key} must be greater than zero.`);
  }
  return value;
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string
): T {
  const value = requireString(record, key, path);
  if (!allowed.includes(value as T)) {
    fail(`${path}.${key} has an unsupported value: ${value}`);
  }
  return value as T;
}

function requireDayKey(
  record: Record<string, unknown>,
  key: string,
  path: string
): string {
  const value = requireString(record, key, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${path}.${key} must use YYYY-MM-DD format.`);
  }
  return value;
}

function requireMonthKey(
  record: Record<string, unknown>,
  key: string,
  path: string
): string {
  const value = requireString(record, key, path);
  if (!/^\d{4}-\d{2}$/.test(value)) {
    fail(`${path}.${key} must use YYYY-MM format.`);
  }
  return value;
}

function isDeviceSpecificSetting(key: string): boolean {
  return key.startsWith('notif_');
}

function countData(data: BackupData): BackupCounts {
  return {
    tasks: data.tasks.length,
    loops: data.loops.length,
    intervals: data.intervals.length,
    loopItems: data.loopItems.length,
    standaloneCapsules: data.standaloneCapsules.length,
    intentions: data.intentions.length,
    settings: data.settings.length,
  };
}

export function createBackupPayload(source: BackupSource): HourLoopBackup {
  const data: BackupData = {
    tasks: source.tasks,
    loops: source.loops,
    intervals: source.intervals,
    loopItems: source.loopItems,
    standaloneCapsules: source.standaloneCapsules,
    intentions: source.intentions,
    settings: source.settings.filter(
      (setting) => !isDeviceSpecificSetting(setting.key)
    ),
  };

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: source.appVersion,
    exportedAt: source.exportedAt,
    timeZone: source.timeZone,
    counts: countData(data),
    data,
  };
}

function parseTask(value: unknown, index: number): Task {
  const path = `data.tasks[${index}]`;
  const record = requireRecord(value, path);
  return {
    id: requireString(record, 'id', path),
    parent_task_id: optionalString(record, 'parent_task_id', path),
    title: requireString(record, 'title', path),
    description: optionalString(record, 'description', path),
    status: requireEnum(record, 'status', TASK_STATUSES, path),
    sort_order: requireInteger(record, 'sort_order', path),
    created_at: requireTimestamp(record, 'created_at', path),
    updated_at: requireTimestamp(record, 'updated_at', path),
    completed_at: optionalTimestamp(record, 'completed_at', path),
    archived_at: optionalTimestamp(record, 'archived_at', path),
  };
}

function parseLoop(value: unknown, index: number): Loop {
  const path = `data.loops[${index}]`;
  const record = requireRecord(value, path);
  return {
    id: requireString(record, 'id', path),
    sequence_number: requirePositiveInteger(record, 'sequence_number', path),
    local_date: requireDayKey(record, 'local_date', path),
    focus: optionalString(record, 'focus', path),
    carry_in: optionalString(record, 'carry_in', path),
    done: optionalString(record, 'done', path),
    roll_forward: optionalString(record, 'roll_forward', path),
    roll_forward_task_id: optionalString(record, 'roll_forward_task_id', path),
    note: optionalString(record, 'note', path),
    task_id: optionalString(record, 'task_id', path),
    target_duration_seconds: requirePositiveInteger(
      record,
      'target_duration_seconds',
      path
    ),
    status: requireEnum(record, 'status', LOOP_STATUSES, path),
    started_at: requireTimestamp(record, 'started_at', path),
    stopped_at: optionalTimestamp(record, 'stopped_at', path),
    created_at: requireTimestamp(record, 'created_at', path),
    updated_at: requireTimestamp(record, 'updated_at', path),
  };
}

function parseInterval(value: unknown, index: number): LoopInterval {
  const path = `data.intervals[${index}]`;
  const record = requireRecord(value, path);
  const startedAt = requireTimestamp(record, 'started_at', path);
  const endedAt = optionalTimestamp(record, 'ended_at', path);
  if (endedAt !== null && Date.parse(endedAt) < Date.parse(startedAt)) {
    fail(`${path}.ended_at cannot be before started_at.`);
  }
  return {
    id: requireString(record, 'id', path),
    loop_id: requireString(record, 'loop_id', path),
    started_at: startedAt,
    ended_at: endedAt,
    time_zone: requireString(record, 'time_zone', path),
    created_at: requireTimestamp(record, 'created_at', path),
  };
}

function parseLoopItem(value: unknown, index: number): BackupLoopItem {
  const path = `data.loopItems[${index}]`;
  const record = requireRecord(value, path);
  const done = record.done;
  if (typeof done !== 'boolean') {
    fail(`${path}.done must be a boolean.`);
  }
  return {
    id: requireString(record, 'id', path),
    loop_id: requireString(record, 'loop_id', path),
    text: requireString(record, 'text', path),
    done,
    sort_order: requireInteger(record, 'sort_order', path),
    carried_from_item_id: optionalString(record, 'carried_from_item_id', path),
    created_at: requireTimestamp(record, 'created_at', path),
    updated_at: requireTimestamp(record, 'updated_at', path),
  };
}

function parseStandaloneCapsule(
  value: unknown,
  index: number
): BackupStandaloneCapsule {
  const path = `data.standaloneCapsules[${index}]`;
  const record = requireRecord(value, path);
  const done = record.done;
  if (typeof done !== 'boolean') {
    fail(`${path}.done must be a boolean.`);
  }
  return {
    id: requireString(record, 'id', path),
    text: requireString(record, 'text', path),
    done,
    created_at: requireTimestamp(record, 'created_at', path),
    updated_at: requireTimestamp(record, 'updated_at', path),
    completed_at: optionalTimestamp(record, 'completed_at', path),
  };
}

function parseIntention(value: unknown, index: number): Intention {
  const path = `data.intentions[${index}]`;
  const record = requireRecord(value, path);
  const periodType = requireEnum(record, 'period_type', INTENTION_PERIODS, path);
  const periodKey =
    periodType === INTENTION_PERIOD.DAILY
      ? requireDayKey(record, 'period_key', path)
      : requireMonthKey(record, 'period_key', path);
  return {
    id: requireString(record, 'id', path),
    period_type: periodType,
    period_key: periodKey,
    target_duration_seconds: requirePositiveInteger(
      record,
      'target_duration_seconds',
      path
    ),
    created_at: requireTimestamp(record, 'created_at', path),
    updated_at: requireTimestamp(record, 'updated_at', path),
  };
}

function parseSetting(value: unknown, index: number): Setting {
  const path = `data.settings[${index}]`;
  const record = requireRecord(value, path);
  return {
    key: requireString(record, 'key', path),
    value: requireString(record, 'value', path),
    updated_at: requireString(record, 'updated_at', path),
  };
}

export function orderTasksParentFirst(tasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    if (byId.has(task.id)) {
      fail(`Task id ${task.id} appears more than once.`);
    }
    byId.set(task.id, task);
  }

  const childrenByParent = new Map<string | null, Task[]>();
  for (const task of tasks) {
    if (task.parent_task_id !== null) {
      if (!byId.has(task.parent_task_id)) {
        fail(`Task ${task.id} references a missing parent task.`);
      }
      if (task.parent_task_id === task.id) {
        fail(`Task ${task.id} cannot be its own parent.`);
      }
    }
    const siblings = childrenByParent.get(task.parent_task_id) ?? [];
    siblings.push(task);
    childrenByParent.set(task.parent_task_id, siblings);
  }

  const ordered: Task[] = [];
  const queue = [...(childrenByParent.get(null) ?? [])];
  let cursor = 0;

  while (cursor < queue.length) {
    const task = queue[cursor];
    cursor += 1;
    if (!task) {
      break;
    }
    ordered.push(task);
    queue.push(...(childrenByParent.get(task.id) ?? []));
  }

  if (ordered.length !== tasks.length) {
    fail('The task hierarchy contains a cycle or an unreachable task.');
  }

  return ordered;
}

export function orderLoopItemsParentFirst(
  loopItems: BackupLoopItem[]
): BackupLoopItem[] {
  const byId = new Map<string, BackupLoopItem>();
  for (const item of loopItems) {
    if (byId.has(item.id)) {
      fail(`Loop item id ${item.id} appears more than once.`);
    }
    byId.set(item.id, item);
  }

  const childrenByParent = new Map<string | null, BackupLoopItem[]>();
  for (const item of loopItems) {
    if (item.carried_from_item_id !== null) {
      if (!byId.has(item.carried_from_item_id)) {
        fail(`Loop item ${item.id} references a missing carried item.`);
      }
      if (item.carried_from_item_id === item.id) {
        fail(`Loop item ${item.id} cannot carry from itself.`);
      }
    }
    const siblings = childrenByParent.get(item.carried_from_item_id) ?? [];
    siblings.push(item);
    childrenByParent.set(item.carried_from_item_id, siblings);
  }

  const ordered: BackupLoopItem[] = [];
  const queue = [...(childrenByParent.get(null) ?? [])];
  let cursor = 0;

  while (cursor < queue.length) {
    const item = queue[cursor];
    cursor += 1;
    if (!item) {
      break;
    }
    ordered.push(item);
    queue.push(...(childrenByParent.get(item.id) ?? []));
  }

  if (ordered.length !== loopItems.length) {
    fail('The carried loop items contain a cycle or an unreachable item.');
  }

  return ordered;
}

function assertUniqueIds(
  items: { id: string }[],
  label: string
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      fail(`${label} id ${item.id} appears more than once.`);
    }
    seen.add(item.id);
  }
}

export function validateBackup(value: unknown): HourLoopBackup {
  const root = requireRecord(value, 'backup');

  if (root.format !== BACKUP_FORMAT) {
    fail('This file is not an Hour Loop backup.');
  }

  const version = requireInteger(root, 'version', 'backup');
  if (version < 1) {
    fail('This backup has an unsupported format version.');
  }
  if (version > BACKUP_VERSION) {
    fail(
      `This backup was created by a newer Hour Loop version (format ${version}).`
    );
  }

  const exportedAt = requireTimestamp(root, 'exportedAt', 'backup');
  const appVersion =
    typeof root.appVersion === 'string' && root.appVersion.length > 0
      ? root.appVersion
      : 'unknown';
  const timeZone =
    typeof root.timeZone === 'string' && root.timeZone.length > 0
      ? root.timeZone
      : 'UTC';

  const dataRecord = requireRecord(root.data, 'backup.data');
  const tasks = requireArray(dataRecord.tasks, 'backup.data.tasks').map(parseTask);
  const loops = requireArray(dataRecord.loops, 'backup.data.loops').map(parseLoop);
  const intervals = requireArray(dataRecord.intervals, 'backup.data.intervals').map(
    parseInterval
  );
  const loopItems = requireArray(
    dataRecord.loopItems ?? [],
    'backup.data.loopItems'
  ).map(parseLoopItem);
  const standaloneCapsules = requireArray(
    dataRecord.standaloneCapsules ?? [],
    'backup.data.standaloneCapsules'
  ).map(parseStandaloneCapsule);
  const intentions = requireArray(
    dataRecord.intentions,
    'backup.data.intentions'
  ).map(parseIntention);
  const settings = requireArray(dataRecord.settings, 'backup.data.settings')
    .map(parseSetting)
    .filter((setting) => !isDeviceSpecificSetting(setting.key));

  orderTasksParentFirst(tasks);
  orderLoopItemsParentFirst(loopItems);
  assertUniqueIds(loops, 'Loop');
  assertUniqueIds(intervals, 'Interval');
  assertUniqueIds(standaloneCapsules, 'Standalone capsule');
  assertUniqueIds(intentions, 'Intention');

  const taskIds = new Set(tasks.map((task) => task.id));
  for (const loop of loops) {
    if (loop.task_id !== null && !taskIds.has(loop.task_id)) {
      fail(`Loop ${loop.id} references a missing task.`);
    }
    if (
      loop.roll_forward_task_id !== null &&
      !taskIds.has(loop.roll_forward_task_id)
    ) {
      fail(`Loop ${loop.id} references a missing roll-forward task.`);
    }
  }

  const loopIds = new Set(loops.map((loop) => loop.id));
  for (const item of loopItems) {
    if (!loopIds.has(item.loop_id)) {
      fail(`Loop item ${item.id} references a missing loop.`);
    }
  }

  const openIntervalsByLoop = new Map<string, number>();
  for (const interval of intervals) {
    if (!loopIds.has(interval.loop_id)) {
      fail(`Interval ${interval.id} references a missing loop.`);
    }
    if (interval.ended_at === null) {
      openIntervalsByLoop.set(
        interval.loop_id,
        (openIntervalsByLoop.get(interval.loop_id) ?? 0) + 1
      );
      if (Date.parse(interval.started_at) > Date.parse(exportedAt)) {
        fail(`Intervals cannot start after the backup export time.`);
      }
    }
  }

  for (const [loopId, count] of openIntervalsByLoop) {
    if (count > 1) {
      fail(`Loop ${loopId} has more than one open interval.`);
    }
    const loop = loops.find((entry) => entry.id === loopId);
    if (loop && loop.status !== LOOP_STATUS.ACTIVE) {
      fail(`Loop ${loopId} is not active but has an open interval.`);
    }
  }

  const activeLoops = loops.filter(
    (loop) =>
      loop.status === LOOP_STATUS.ACTIVE || loop.status === LOOP_STATUS.PAUSED
  );
  if (activeLoops.length > 1) {
    fail('A backup cannot contain more than one active or paused loop.');
  }

  const intentionKeys = new Set<string>();
  for (const intention of intentions) {
    const key = `${intention.period_type}:${intention.period_key}`;
    if (intentionKeys.has(key)) {
      fail(`Intention ${key} appears more than once.`);
    }
    intentionKeys.add(key);
  }

  const settingKeys = new Set<string>();
  for (const setting of settings) {
    if (settingKeys.has(setting.key)) {
      fail(`Setting ${setting.key} appears more than once.`);
    }
    settingKeys.add(setting.key);
  }

  const data: BackupData = {
    tasks,
    loops,
    intervals,
    loopItems,
    standaloneCapsules,
    intentions,
    settings,
  };

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt,
    timeZone,
    counts: countData(data),
    data,
  };
}

export function parseBackupJson(text: string): HourLoopBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('This file is not valid JSON.');
  }
  return validateBackup(parsed);
}

/**
 * A backup may contain an active loop with an open interval. Restoring it as
 * active would count all the time between export and import, so close open
 * intervals at the export instant and restore active loops as paused.
 */
export function prepareBackupForImport(backup: HourLoopBackup): PreparedImport {
  let pausedLoops = 0;
  let closedIntervals = 0;

  const loops = backup.data.loops.map((loop) => {
    if (loop.status === LOOP_STATUS.ACTIVE) {
      pausedLoops += 1;
      return { ...loop, status: LOOP_STATUS.PAUSED };
    }
    return loop;
  });

  const intervals = backup.data.intervals.map((interval) => {
    if (interval.ended_at === null) {
      closedIntervals += 1;
      return { ...interval, ended_at: backup.exportedAt };
    }
    return interval;
  });

  return {
    backup: {
      ...backup,
      data: {
        ...backup.data,
        loops,
        intervals,
      },
    },
    pausedLoops,
    closedIntervals,
  };
}
