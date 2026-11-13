import type { SQLiteDatabase } from 'expo-sqlite';

import { recoverAppState } from './appLifecycleService';

const mockRefresh = jest.fn();
const mockGetActiveLoop = jest.fn();
const mockEnsureCurrentItemInterval = jest.fn();
const mockPauseAtTarget = jest.fn();
const mockGetElapsedSeconds = jest.fn();
const mockReconcileLoopNotifications = jest.fn();
const mockSyncLoopNotification = jest.fn();

jest.mock('../../store/loopStore', () => ({
  useLoopStore: {
    getState: () => ({
      refresh: mockRefresh,
      activeLoop: null,
    }),
  },
}));

jest.mock('../../features/loops/loopService', () => ({
  loopService: {
    getActiveLoop: (...args: unknown[]) => mockGetActiveLoop(...args),
    getElapsedSeconds: (...args: unknown[]) => mockGetElapsedSeconds(...args),
    pauseAtTarget: (...args: unknown[]) => mockPauseAtTarget(...args),
    ensureCurrentItemInterval: (...args: unknown[]) =>
      mockEnsureCurrentItemInterval(...args),
  },
}));

jest.mock('../notifications/notificationService', () => ({
  reconcileLoopNotifications: (...args: unknown[]) =>
    mockReconcileLoopNotifications(...args),
  syncLoopNotification: (...args: unknown[]) => mockSyncLoopNotification(...args),
}));

describe('recoverAppState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears stale loop notifications when no loop is active', async () => {
    mockGetActiveLoop.mockResolvedValue(null);
    const db = {} as SQLiteDatabase;

    await recoverAppState(db);

    expect(mockReconcileLoopNotifications).toHaveBeenCalledWith(db, null);
    expect(mockSyncLoopNotification).not.toHaveBeenCalled();
  });
});
