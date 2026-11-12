import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { AssistantProviderId } from '../assistantTypes';

export class CredentialStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialStorageError';
  }
}

const memoryKeys = new Map<string, string>();

/** Web has no secure native store; keys stay in memory for this page session. */
export const CREDENTIALS_PERSIST = Platform.OS !== 'web';

function storageKey(provider: AssistantProviderId): string {
  return `hour-loop.assistant.key.${provider}`;
}

export async function getAssistantApiKey(
  provider: AssistantProviderId
): Promise<string | null> {
  if (Platform.OS === 'web') {
    return memoryKeys.get(storageKey(provider)) ?? null;
  }
  try {
    return await SecureStore.getItemAsync(storageKey(provider));
  } catch {
    throw new CredentialStorageError(
      'The saved API key could not be read from secure storage.'
    );
  }
}

export async function setAssistantApiKey(
  provider: AssistantProviderId,
  key: string
): Promise<void> {
  const value = key.trim();
  if (!value) {
    throw new CredentialStorageError('Enter an API key.');
  }
  if (Platform.OS === 'web') {
    memoryKeys.set(storageKey(provider), value);
    return;
  }
  try {
    await SecureStore.setItemAsync(storageKey(provider), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    throw new CredentialStorageError(
      'The API key could not be saved to secure storage.'
    );
  }
}

export async function deleteAssistantApiKey(
  provider: AssistantProviderId
): Promise<void> {
  if (Platform.OS === 'web') {
    memoryKeys.delete(storageKey(provider));
    return;
  }
  try {
    await SecureStore.deleteItemAsync(storageKey(provider));
  } catch {
    throw new CredentialStorageError(
      'The API key could not be removed from secure storage.'
    );
  }
}

export async function hasAssistantApiKey(
  provider: AssistantProviderId
): Promise<boolean> {
  return Boolean(await getAssistantApiKey(provider));
}
