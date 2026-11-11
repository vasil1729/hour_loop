import { AppState, Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import targetReachedSound from '../../../assets/sounds/target-reached.wav';

let player: AudioPlayer | null = null;
let audioModeConfigured = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let scheduledLoopId: string | null = null;
let lastFiredLoopId: string | null = null;

async function prepareAudio(): Promise<AudioPlayer | null> {
  if (Platform.OS === 'web') return null;

  try {
    if (!audioModeConfigured) {
      audioModeConfigured = true;
      await setAudioModeAsync({
        playsInSilentMode: false,
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

export async function playTargetFeedback(): Promise<void> {
  if (Platform.OS === 'web') return;

  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined
  );

  const audio = await prepareAudio();
  if (!audio) return;

  try {
    await audio.seekTo(0).catch(() => undefined);
    audio.play();
  } catch {
    // Audio feedback is best-effort; haptics still run.
  }
}

/**
 * Schedules an in-app alert for the moment the active loop reaches its target.
 * The timer only fires when the app is in the foreground; background delivery
 * is handled by the OS notification.
 */
export function scheduleTargetFeedback(
  loopId: string,
  remainingSeconds: number
): void {
  cancelTargetFeedback();

  if (Platform.OS === 'web' || remainingSeconds <= 0) return;

  if (lastFiredLoopId !== loopId) {
    lastFiredLoopId = null;
  }

  scheduledLoopId = loopId;
  primeTargetFeedback();

  timer = setTimeout(
    () => {
      timer = null;
      const firedLoopId = scheduledLoopId;
      scheduledLoopId = null;

      if (!firedLoopId || firedLoopId !== loopId) return;
      if (AppState.currentState !== 'active') return;
      if (lastFiredLoopId === loopId) return;

      lastFiredLoopId = loopId;
      void playTargetFeedback();
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
}
