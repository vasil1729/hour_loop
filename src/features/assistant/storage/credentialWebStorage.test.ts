/* eslint-disable import/first */
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import * as SecureStore from 'expo-secure-store';

describe('assistant web credential storage', () => {
  it('keeps keys in memory only and never touches secure storage', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('./credentialStorage') as typeof import('./credentialStorage');
    expect(storage.CREDENTIALS_PERSIST).toBe(false);
    expect(await storage.getAssistantApiKey('groq')).toBeNull();

    await storage.setAssistantApiKey('groq', 'sk-web-session');
    expect(await storage.getAssistantApiKey('groq')).toBe('sk-web-session');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();

    await storage.deleteAssistantApiKey('groq');
    expect(await storage.getAssistantApiKey('groq')).toBeNull();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
