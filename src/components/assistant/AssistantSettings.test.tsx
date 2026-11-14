/* eslint-disable import/first */
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AssistantProviderError } from '../../features/assistant/providers/providerTypes';
import type { AssistantConfig } from '../../features/assistant/assistantTypes';

let mockScheme: 'light' | 'dark' = 'dark';

const mockConfig: AssistantConfig = {
  enabled: true,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
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
    expect(screen.getByText('GPT OSS 120B')).toBeTruthy();
    expect(screen.getByText('settings.assistantGroq')).toBeTruthy();
  });

  it('selects a friendly model and its provider', async () => {
    await render(<AssistantSettings />);

    await fireEvent.press(
      await screen.findByLabelText('settings.assistantModel')
    );
    await fireEvent.press(await screen.findByText('Claude Opus 5.5'));

    expect(screen.getByText('Claude Opus 5.5')).toBeTruthy();
    expect(screen.getByText('settings.assistantAnthropic')).toBeTruthy();
    expect(mockSetKey).not.toHaveBeenCalled();
  });

  it('links to the free Groq API key page for the default provider', async () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(true as never);

    await render(<AssistantSettings />);
    const link = await screen.findByRole('link', {
      name: 'settings.assistantGroqKeyHelp',
    });
    await fireEvent.press(link);

    expect(openURL).toHaveBeenCalledWith('https://console.groq.com/keys');
    openURL.mockRestore();
  });

  it('shows friendly model names without raw model ids', async () => {
    await render(<AssistantSettings />);

    await fireEvent.press(
      await screen.findByLabelText('settings.assistantModel')
    );
    await fireEvent.press(await screen.findByText('GPT-4o mini'));

    expect(screen.getByText('GPT-4o mini')).toBeTruthy();
    expect(screen.getByText('settings.assistantOpenAI')).toBeTruthy();
    expect(screen.queryByText('gpt-4o-mini')).toBeNull();
    expect(screen.queryByText('settings.modelPickerCustom')).toBeNull();
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
