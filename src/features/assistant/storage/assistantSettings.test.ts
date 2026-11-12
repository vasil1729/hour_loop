/* eslint-disable import/first */
import type { SQLiteDatabase } from 'expo-sqlite';

const mockGetSetting = jest.fn(async (_db: SQLiteDatabase, _key: string) => null as string | null);
const mockSetSetting = jest.fn(
  async (_db: SQLiteDatabase, _key: string, _value: string) => undefined
);

jest.mock('../../../database/repositories/settingsRepository', () => ({
  getSetting: (db: SQLiteDatabase, key: string) => mockGetSetting(db, key),
  setSetting: (db: SQLiteDatabase, key: string, value: string) =>
    mockSetSetting(db, key, value),
}));

import {
  AssistantConfigError,
  assistantConfigIsUsable,
  loadAssistantConfig,
  normalizeBaseUrl,
  saveAssistantConfig,
} from './assistantSettings';

const db = {} as SQLiteDatabase;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSetting.mockResolvedValue(null);
});

describe('assistant settings', () => {
  it('loads safe defaults when nothing is configured', async () => {
    const config = await loadAssistantConfig(db);
    expect(config).toEqual({
      enabled: true,
      provider: 'groq',
      model: '',
      baseUrl: null,
      writesEnabled: true,
    });
    expect(assistantConfigIsUsable(config)).toBe(false);
  });

  it('persists only non-secret assistant_* settings', async () => {
    await saveAssistantConfig(db, {
      enabled: true,
      provider: 'openai',
      model: ' gpt-4o-mini ',
      baseUrl: null,
      writesEnabled: false,
    });

    const keys = mockSetSetting.mock.calls.map((call) => call[1]);
    expect(keys).toEqual([
      'assistant_enabled',
      'assistant_provider',
      'assistant_model',
      'assistant_base_url',
      'assistant_writes_enabled',
    ]);
    expect(keys.every((key) => key.startsWith('assistant_'))).toBe(true);
    const serialized = JSON.stringify(mockSetSetting.mock.calls);
    expect(serialized).not.toMatch(/sk-|api[_-]?key/i);
  });

  it('validates custom endpoints and requires HTTPS off the local network', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe(
      'https://example.com/v1'
    );
    expect(normalizeBaseUrl('http://192.168.1.20:8080/v1')).toBe(
      'http://192.168.1.20:8080/v1'
    );
    expect(() => normalizeBaseUrl('http://example.com/v1')).toThrow(
      AssistantConfigError
    );
    expect(() => normalizeBaseUrl('https://user:pass@example.com/v1')).toThrow(
      AssistantConfigError
    );
    expect(() => normalizeBaseUrl('https://example.com/v1#fragment')).toThrow(
      AssistantConfigError
    );
  });
});
