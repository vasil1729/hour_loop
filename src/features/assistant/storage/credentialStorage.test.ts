/* eslint-disable import/first */
import { Platform } from 'react-native';

const mockSecureValues = new Map<string, string>();
const mockGetItem = jest.fn(async (key: string) => mockSecureValues.get(key) ?? null);
const mockSetItem = jest.fn(
  async (key: string, value: string, _options?: Record<string, unknown>) => {
    mockSecureValues.set(key, value);
  }
);
const mockDeleteItem = jest.fn(async (key: string) => {
  mockSecureValues.delete(key);
});

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: (key: string) => mockGetItem(key),
  setItemAsync: (key: string, value: string, options?: Record<string, unknown>) =>
    mockSetItem(key, value, options),
  deleteItemAsync: (key: string) => mockDeleteItem(key),
}));

import {
  CREDENTIALS_PERSIST,
  deleteAssistantApiKey,
  getAssistantApiKey,
  hasAssistantApiKey,
  setAssistantApiKey,
} from './credentialStorage';

beforeEach(() => {
  mockSecureValues.clear();
  jest.clearAllMocks();
});

describe('assistant credential storage', () => {
  it('keeps keys outside the app database and deletes them on request', async () => {
    expect(CREDENTIALS_PERSIST).toBe(Platform.OS !== 'web');
    expect(await getAssistantApiKey('groq')).toBeNull();

    await setAssistantApiKey('groq', '  sk-secret-value  ');
    expect(mockSetItem).toHaveBeenCalledWith(
      'hour-loop.assistant.key.groq',
      'sk-secret-value',
      expect.objectContaining({
        keychainAccessible: 'whenUnlockedThisDeviceOnly',
      })
    );
    expect(await getAssistantApiKey('groq')).toBe('sk-secret-value');
    expect(await hasAssistantApiKey('groq')).toBe(true);

    await deleteAssistantApiKey('groq');
    expect(await getAssistantApiKey('groq')).toBeNull();
    expect(await hasAssistantApiKey('groq')).toBe(false);
    expect(mockDeleteItem).toHaveBeenCalledWith('hour-loop.assistant.key.groq');
  });

  it('replaces an existing key for the same provider', async () => {
    await setAssistantApiKey('groq', 'sk-first');
    await setAssistantApiKey('groq', 'sk-second');
    expect(await getAssistantApiKey('groq')).toBe('sk-second');
    expect(mockSetItem).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty key without touching secure storage', async () => {
    await expect(setAssistantApiKey('openai', '   ')).rejects.toThrow(
      'Enter an API key.'
    );
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('reports secure storage failures without exposing the key', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await expect(getAssistantApiKey('openai')).rejects.toThrow(
      'could not be read from secure storage'
    );

    mockSetItem.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await expect(setAssistantApiKey('openai', 'sk-hidden')).rejects.toThrow(
      'could not be saved to secure storage'
    );
  });
});
