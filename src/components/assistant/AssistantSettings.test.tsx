/* eslint-disable import/first */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AssistantProviderError } from '../../features/assistant/providers/providerTypes';
import type { AssistantConfig } from '../../features/assistant/assistantTypes';

let mockScheme: 'light' | 'dark' = 'dark';

const mockConfig: AssistantConfig = {
  enabled: true,
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  baseUrl: null,
  writesEnabled: true,
};

const mockLoadConfig = jest.fn(async () => ({ ...mockConfig }));
const mockSaveConfig = jest.fn(async (_db: unknown, value: AssistantConfig) => ({
  ...value,
}));
const mockSetKey = jest.fn(async (_provider: string, _key: string) => undefined);
const mockProviderTest = jest.fn(async () => undefined);

const mockDb = {};
jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDb,
}));

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    isRTL: false,
  }),
}));

jest.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../../theme/ThemeContext', () => {
  const tokens = jest.requireActual('../../theme/tokens') as {
    palette: Record<'light' | 'dark', unknown>;
  };
  return {
    useTheme: () => ({
      colors: tokens.palette[mockScheme],
      scheme: mockScheme,
    }),
  };
});

jest.mock('../../store/assistantStore', () => ({
  useAssistantStore: (selector: (state: { clear: () => void }) => unknown) =>
    selector({ clear: jest.fn() }),
}));

jest.mock('../../features/assistant/storage/credentialStorage', () => ({
  CREDENTIALS_PERSIST: true,
  hasAssistantApiKey: jest.fn(async () => true),
  getAssistantApiKey: jest.fn(async () => 'sk-saved'),
  setAssistantApiKey: (provider: string, key: string) =>
    mockSetKey(provider, key),
  deleteAssistantApiKey: jest.fn(async () => undefined),
}));

jest.mock('../../features/assistant/storage/assistantSettings', () => ({
  loadAssistantConfig: () => mockLoadConfig(),
  saveAssistantConfig: (db: unknown, value: AssistantConfig) =>
    mockSaveConfig(db, value),
  validateAssistantConfig: (value: AssistantConfig) => value,
  assistantConfigIsUsable: () => true,
}));

jest.mock('../../features/assistant/providers/providerFactory', () => ({
  createAssistantProvider: () => ({
    id: 'groq',
    chat: jest.fn(),
    test: () => mockProviderTest(),
  }),
  listAssistantProviderModels: jest.fn(async () => [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'unrelated/audio-model',
  ]),
}));

import { AssistantSettings } from './AssistantSettings';

beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = 'dark';
  mockProviderTest.mockResolvedValue(undefined);
});

describe('assistant settings UI', () => {
  it.each(['light', 'dark'] as const)('renders in %s mode', async (scheme) => {
    mockScheme = scheme;
    await render(<AssistantSettings />);
    expect(await screen.findByText('settings.assistantEnable')).toBeTruthy();
    expect(screen.getByText('settings.assistantGroq')).toBeTruthy();
    expect(screen.getByText('settings.assistantOpenAI')).toBeTruthy();
    expect(screen.getByText('settings.assistantAnthropic')).toBeTruthy();
    expect(screen.getByText('settings.assistantGemini')).toBeTruthy();
    expect(screen.getByText('settings.assistantOpenRouter')).toBeTruthy();
    expect(screen.getByText('settings.assistantDeepSeek')).toBeTruthy();
    expect(screen.getByText('settings.assistantOpenCode')).toBeTruthy();
    expect(screen.getByText('settings.assistantCustom')).toBeTruthy();
  });

  it('updates the selected provider', async () => {
    await render(<AssistantSettings />);
    const openAI = await screen.findByRole('button', {
      name: 'settings.assistantOpenAI',
    });
    await fireEvent.press(openAI);
    expect(openAI.props.accessibilityState).toEqual({ selected: true });
  });

  it('selects a model from the model picker', async () => {
    await render(<AssistantSettings />);

    await fireEvent.press(
      await screen.findByLabelText('settings.assistantModel')
    );
    const model = await screen.findByText('openai/gpt-oss-120b');
    await fireEvent.press(model);

    expect(screen.getByText('openai/gpt-oss-120b')).toBeTruthy();
    expect(screen.queryByText('unrelated/audio-model')).toBeNull();
    expect(mockSetKey).not.toHaveBeenCalled();
  });

  it('shows a safe connection failure state', async () => {
    mockProviderTest.mockRejectedValueOnce(
      new AssistantProviderError('auth', 'secret provider text')
    );
    await render(<AssistantSettings />);

    await fireEvent.changeText(
      await screen.findByLabelText('settings.assistantApiKey'),
      'sk-temporary'
    );
    await fireEvent.press(screen.getByText('settings.assistantTest'));

    expect(await screen.findByText('assistant.errorAuth')).toBeTruthy();
    expect(screen.queryByText('secret provider text')).toBeNull();
    expect(mockSetKey).not.toHaveBeenCalled();
  });

  it('saves non-secret configuration and stores the key separately', async () => {
    await render(<AssistantSettings />);

    await fireEvent.changeText(
      await screen.findByLabelText('settings.assistantApiKey'),
      'sk-new-key'
    );
    await fireEvent.press(screen.getByText('settings.assistantSave'));

    await waitFor(() => {
      expect(mockSaveConfig).toHaveBeenCalledTimes(1);
      expect(mockSetKey).toHaveBeenCalledWith('groq', 'sk-new-key');
    });
    expect(screen.getByText('settings.assistantSaved')).toBeTruthy();
    expect(screen.queryByDisplayValue('sk-new-key')).toBeNull();
  });
});
