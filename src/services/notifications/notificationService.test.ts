import type { SQLiteDatabase } from 'expo-sqlite';

import {
  cancelLoopNotification,
  reconcileLoopNotifications,
} from './notificationService';

const mockGetAllSettings = jest.fn();
const mockGetSetting = jest.fn();
const mockDeleteSetting = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockCancelTargetFeedback = jest.fn();

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: (...args: unknown[]) =>
    mockCancelScheduledNotificationAsync(...args),
}));

jest.mock('../../database/repositories/settingsRepository', () => ({
  getAllSettings: (...args: unknown[]) => mockGetAllSettings(...args),
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  deleteSetting: (...args: unknown[]) => mockDeleteSetting(...args),
  setSetting: jest.fn(),
}));

jest.mock('../feedback/targetFeedbackService', () => ({
  cancelTargetFeedback: (...args: unknown[]) => mockCancelTargetFeedback(...args),
  scheduleTargetFeedback: jest.fn(),
}));

jest.mock('./exactAlarmService', () => ({
  promptForExactAlarmAccess: jest.fn(),
}));

const db = {} as SQLiteDatabase;

function setting(key: string, value: string) {
  return { key, value, updated_at: '2026-11-13T10:00:00.000Z' };
}

describe('cancelLoopNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSetting.mockResolvedValue(null);
  });

  it('clears in-app target feedback even when cancelling another loop id', async () => {
    await cancelLoopNotification(db, 'loop-2');

    expect(mockCancelTargetFeedback).toHaveBeenCalledWith();
  });
});

describe('reconcileLoopNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockDeleteSetting.mockResolvedValue(undefined);
  });

  it('cancels notifications that do not belong to the active loop', async () => {
    const settings = [
      setting('notif_loop-1', 'target-1'),
      setting('notif_early_loop-1', 'early-1'),
      setting('notif_loop-2', 'target-2'),
      setting('theme', 'dark'),
    ];
    mockGetAllSettings.mockResolvedValue(settings);
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      return Promise.resolve(
        settings.find((entry) => entry.key === key)?.value ?? null
      );
    });

    await reconcileLoopNotifications(db, 'loop-2');

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('target-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('early-1');
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      'target-2'
    );
    expect(mockDeleteSetting).toHaveBeenCalledWith(db, 'notif_loop-1');
    expect(mockDeleteSetting).toHaveBeenCalledWith(db, 'notif_early_loop-1');
    expect(mockDeleteSetting).not.toHaveBeenCalledWith(db, 'notif_loop-2');
    expect(mockCancelTargetFeedback).toHaveBeenCalled();
  });

  it('cancels every loop notification when nothing is active', async () => {
    const settings = [
      setting('notif_loop-1', 'target-1'),
      setting('notif_early_loop-1', 'early-1'),
    ];
    mockGetAllSettings.mockResolvedValue(settings);
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      return Promise.resolve(
        settings.find((entry) => entry.key === key)?.value ?? null
      );
    });

    await reconcileLoopNotifications(db, null);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteSetting).toHaveBeenCalledTimes(2);
    expect(mockCancelTargetFeedback).toHaveBeenCalled();
  });
});
