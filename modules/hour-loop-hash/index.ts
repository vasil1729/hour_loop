import { requireNativeModule } from 'expo-modules-core';

type HourLoopHashNativeModule = {
  sha256File(uri: string): Promise<string>;
};

const nativeModule =
  requireNativeModule<HourLoopHashNativeModule>('HourLoopHash');

export function sha256File(uri: string): Promise<string> {
  return nativeModule.sha256File(uri);
}
