import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createBackupPayload,
  MAX_BACKUP_BYTES,
  orderLoopItemsParentFirst,
  orderTasksParentFirst,
  parseBackupJson,
  prepareBackupForImport,
  type BackupCounts,
  type BackupLoopItem,
  type HourLoopBackup,
} from '../../domain/backup/backup';
import { getDeviceTimeZone, nowUtcIso } from '../../domain/shared/dateUtils';
import { getAllIntentions, createIntention } from '../../database/repositories/intentionsRepository';
import {
  getAllIntervals,
  createInterval,
} from '../../database/repositories/intervalsRepository';
import {
  createLoop,
  listAllLoops,
} from '../../database/repositories/loopsRepository';
import {
  getAllSettings,
  insertSetting,
} from '../../database/repositories/settingsRepository';
import {
  createTask,
  listTasks,
} from '../../database/repositories/tasksRepository';

export type ImportResult = BackupCounts & {
  pausedLoops: number;
  closedIntervals: number;
};

function backupFilename(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  return `hour-loop-backup-${stamp}.json`;
}

function downloadTextFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type LoopItemRow = Omit<BackupLoopItem, 'done'> & { done: number };

async function loopItemsTableExists(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_items'"
  );
  return Boolean(row);
}

async function readLoopItems(db: SQLiteDatabase): Promise<BackupLoopItem[]> {
  if (!(await loopItemsTableExists(db))) {
    return [];
  }
  const rows = await db.getAllAsync<LoopItemRow>(`
    SELECT id, loop_id, text, done, sort_order, carried_from_item_id,
           created_at, updated_at
    FROM loop_items
    ORDER BY loop_id ASC, sort_order ASC, created_at ASC
  `);
  return rows.map((row) => ({ ...row, done: row.done === 1 }));
}

export async function createBackup(db: SQLiteDatabase): Promise<HourLoopBackup> {
  const [tasks, loops, intervals, loopItems, intentions, settings] =
    await Promise.all([
      listTasks(db, { includeArchived: true }),
      listAllLoops(db),
      getAllIntervals(db),
      readLoopItems(db),
      getAllIntentions(db),
      getAllSettings(db),
    ]);

  return createBackupPayload({
    tasks,
    loops,
    intervals,
    loopItems,
    intentions,
    settings,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    exportedAt: nowUtcIso(),
    timeZone: getDeviceTimeZone(),
  });
}

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const backup = await createBackup(db);
  const text = JSON.stringify(backup, null, 2);
  const filename = backupFilename();

  if (Platform.OS === 'web') {
    downloadTextFile(text, filename);
    return;
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('The app cache directory is unavailable.');
  }

  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, text, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Hour Loop backup',
    UTI: 'public.json',
  });
}

export async function pickBackupFile(): Promise<HourLoopBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: Platform.OS !== 'web',
    multiple: false,
    base64: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset) {
    throw new Error('No file was selected.');
  }

  if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) {
    throw new Error('That backup is too large to import.');
  }

  let text: string;
  if (Platform.OS === 'web') {
    if (asset.file) {
      text = await asset.file.text();
    } else {
      const response = await fetch(asset.uri);
      text = await response.text();
    }
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  if (text.length > MAX_BACKUP_BYTES) {
    throw new Error('That backup is too large to import.');
  }

  return parseBackupJson(text);
}

export async function importBackup(
  db: SQLiteDatabase,
  rawBackup: HourLoopBackup
): Promise<ImportResult> {
  const { backup, pausedLoops, closedIntervals } = prepareBackupForImport(rawBackup);
  const orderedTasks = orderTasksParentFirst(backup.data.tasks);
  const orderedLoopItems = orderLoopItemsParentFirst(backup.data.loopItems);
  const hasLoopItemsTable = await loopItemsTableExists(db);

  if (orderedLoopItems.length > 0 && !hasLoopItemsTable) {
    throw new Error(
      'This backup contains loop checklist items, but this app version cannot restore them.'
    );
  }

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM loop_intervals;
      DELETE FROM loops;
      DELETE FROM tasks;
      DELETE FROM intentions;
      DELETE FROM settings;
    `);

    for (const task of orderedTasks) {
      await createTask(db, task);
    }
    for (const loop of backup.data.loops) {
      await createLoop(db, loop);
    }
    for (const item of orderedLoopItems) {
      await db.runAsync(
        `INSERT INTO loop_items (
           id, loop_id, text, done, sort_order, carried_from_item_id,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.loop_id,
          item.text,
          item.done ? 1 : 0,
          item.sort_order,
          item.carried_from_item_id,
          item.created_at,
          item.updated_at,
        ]
      );
    }
    for (const interval of backup.data.intervals) {
      await createInterval(db, interval);
    }
    for (const intention of backup.data.intentions) {
      await createIntention(db, intention);
    }
    for (const setting of backup.data.settings) {
      await insertSetting(db, setting);
    }

    await db.execAsync(`
      INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
        ('default_duration_seconds', '3600', datetime('now')),
        ('theme', 'system', datetime('now')),
        ('notifications_enabled', 'true', datetime('now'));
    `);

    const violations = await db.getAllAsync('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error('The backup contains inconsistent relationships.');
    }
  });

  return {
    ...backup.counts,
    pausedLoops,
    closedIntervals,
  };
}
