import { AppState, Platform, Vibration } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import {
  NOTIFICATION_VIBRATION_PATTERNS,
  type NotificationVibration,
} from '../../constants/notifications';
import targetReachedSound from '../../../assets/sounds/target-reached.wav';

type TargetFeedbackOptions = {
  vibration?: NotificationVibration;
  sound?: boolean;
};

let player: AudioPlayer | null = null;
let audioModeConfigured = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let scheduledLoopId: string | null = null;
let lastFiredLoopId: string | null = null;
let scheduledOptions: TargetFeedbackOptions = {};

async function prepareAudio(): Promise<AudioPlayer | null> {
  if (Platform.OS === 'web') return null;

  try {
    if (!audioModeConfigured) {
      audioModeConfigured = true;
      await setAudioModeAsync({
        // A focus timer alert must be audible even when the phone is muted.
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        interruptionModeAndroid: 'duckOthers',
      }).catch(() => undefined);
    }
    if (!player) {
      player = createAudioPlayer(targetReachedSound);
    }
    return player;
  } catch {
    // Audio feedback is best-effort; haptics still run.
    return null;
  }
}

/**
 * Loads the chime ahead of time so the target alert is not delayed by asset
 * loading on the first run.
 */
export function primeTargetFeedback(): void {
  void prepareAudio();
}

export async function playTargetFeedback(
  options: TargetFeedbackOptions = {}
): Promise<void> {
  if (Platform.OS === 'web') return;

  const vibration = options.vibration ?? 'short';
  if (vibration === 'long') {
    if (Platform.OS === 'android') {
      Vibration.vibrate(NOTIFICATION_VIBRATION_PATTERNS.long, false);
    } else {
      Vibration.vibrate(1000);
    }
  } else if (vibration === 'short') {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => undefined);
  }

  if (options.sound === false) return;

  const audio = await prepareAudio();
  if (!audio) return;

  try {
    await audio.seekTo(0).catch(() => undefined);
    audio.play();
  } catch {
    // Audio feedback is best-effort; vibration still runs.
  }
}

/**
 * Schedules an in-app alert for the moment the active loop reaches its target.
 * The timer only fires when the app is in the foreground; background delivery
 * is handled by the OS notification.
 */
export function scheduleTargetFeedback(
  loopId: string,
  remainingSeconds: number,
  options: TargetFeedbackOptions = {}
): void {
  cancelTargetFeedback();

  if (Platform.OS === 'web' || remainingSeconds <= 0) return;

  if (lastFiredLoopId !== loopId) {
    lastFiredLoopId = null;
  }

  scheduledLoopId = loopId;
  scheduledOptions = options;
  primeTargetFeedback();

  timer = setTimeout(
    () => {
      timer = null;
      const firedLoopId = scheduledLoopId;
      const firedOptions = scheduledOptions;
      scheduledLoopId = null;
      scheduledOptions = {};

      if (!firedLoopId || firedLoopId !== loopId) return;
      if (AppState.currentState !== 'active') return;
      if (lastFiredLoopId === loopId) return;

      lastFiredLoopId = loopId;
      void playTargetFeedback(firedOptions);
    },
    Math.max(1000, Math.round(remainingSeconds * 1000))
  );
}

export function cancelTargetFeedback(loopId?: string): void {
  if (loopId && scheduledLoopId !== null && scheduledLoopId !== loopId) {
    return;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  scheduledLoopId = null;
  scheduledOptions = {};
}
