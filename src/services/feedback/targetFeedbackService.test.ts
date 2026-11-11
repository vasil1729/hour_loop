/* eslint-disable import/first -- Jest mocks must be registered before the service import. */
import { AppState } from 'react-native';

const mockPlay = jest.fn();
const mockSeekTo = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: mockPlay,
    seekTo: mockSeekTo,
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../assets/sounds/target-reached.wav', () => 1);

import * as Haptics from 'expo-haptics';

import {
  cancelTargetFeedback,
  scheduleTargetFeedback,
} from './targetFeedbackService';

function setAppState(state: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: state,
  });
}

describe('targetFeedbackService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setAppState('active');
    mockPlay.mockClear();
    mockSeekTo.mockClear();
  });

  afterEach(() => {
    cancelTargetFeedback();
    jest.useRealTimers();
  });

  it('plays the chime and haptic when an active loop reaches its target', async () => {
    scheduleTargetFeedback('loop-active', 2);

    await jest.advanceTimersByTimeAsync(1999);
    expect(mockPlay).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the app is in the background', async () => {
    setAppState('background');
    scheduleTargetFeedback('loop-background', 1);

    await jest.advanceTimersByTimeAsync(1000);

    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('does not fire after the schedule is cancelled', async () => {
    scheduleTargetFeedback('loop-cancelled', 1);
    cancelTargetFeedback('loop-cancelled');

    await jest.advanceTimersByTimeAsync(1000);

    expect(mockPlay).not.toHaveBeenCalled();
  });
});
