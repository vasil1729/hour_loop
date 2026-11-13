/* eslint-disable import/first */
import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../features/assistant/assistantConversation', () => ({
  runAssistantTurn: jest.fn(),
}));

jest.mock('../features/assistant/storage/credentialStorage', () => ({
  getAssistantApiKey: jest.fn(),
}));

jest.mock('../features/assistant/assistantTools', () => ({
  createAssistantTools: jest.fn(() => []),
}));

import type { AssistantConfig } from '../features/assistant/assistantTypes';
import { createAssistantTools } from '../features/assistant/assistantTools';
import { runAssistantTurn } from '../features/assistant/assistantConversation';
import { getAssistantApiKey } from '../features/assistant/storage/credentialStorage';
import { useAssistantStore } from './assistantStore';

const turn = jest.mocked(runAssistantTurn);
const key = jest.mocked(getAssistantApiKey);
const tools = jest.mocked(createAssistantTools);

const db = {} as SQLiteDatabase;
const config: AssistantConfig = {
  enabled: true,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  baseUrl: null,
  writesEnabled: true,
};

function resetStore() {
  useAssistantStore.setState({
    messages: [],
    pendingAction: null,
    status: 'idle',
    error: null,
    lastFailedText: null,
    lastScopeCategory: null,
  });
}

async function sendInScopeSetup() {
  key.mockResolvedValue('sk-test-key');
  turn.mockResolvedValue({ content: 'In-scope response.', pendingAction: null });
  await useAssistantStore.getState().send(db, config, 'Show my focus stats');
  expect(useAssistantStore.getState().lastScopeCategory).toBe('IN_SCOPE');
  expect(key).toHaveBeenCalledTimes(1);
  expect(turn).toHaveBeenCalledTimes(1);
}

function clearProviderMocks() {
  key.mockClear();
  turn.mockClear();
  tools.mockClear();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('real classifier + assistant store boundary', () => {
  it('does not read the key or call the provider for out-of-scope input after an in-scope turn', async () => {
    await sendInScopeSetup();
    clearProviderMocks();

    await useAssistantStore
      .getState()
      .send(db, config, 'Do you know the capital of France?');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(tools).not.toHaveBeenCalled();
    const state = useAssistantStore.getState();
    expect(state.status).toBe('idle');
    expect(state.messages.at(-1)?.content).toBe('assistant.scopeRefusal');
    expect(state.lastScopeCategory).toBe('OUT_OF_SCOPE');
  });

  it('does not touch the database for a rejected message', async () => {
    const guardedDb = new Proxy(
      {},
      {
        get() {
          throw new Error('database should not be accessed');
        },
      }
    ) as SQLiteDatabase;

    await useAssistantStore
      .getState()
      .send(guardedDb, config, 'What is the capital of France?');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeRefusal'
    );
  });

  it('does not inherit in-scope context for a different-language unrelated question', async () => {
    await sendInScopeSetup();
    clearProviderMocks();

    await useAssistantStore
      .getState()
      .send(db, config, 'Kal India ka capital kya hai?');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeRefusal'
    );
  });

  it('keeps mixed requests local after an in-scope turn', async () => {
    await sendInScopeSetup();
    clearProviderMocks();

    await useAssistantStore
      .getState()
      .send(db, config, 'Show my tasks and tell me a joke');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeMixed'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });

  it('keeps ambiguous fragments local even with in-scope context', async () => {
    await sendInScopeSetup();
    clearProviderMocks();

    await useAssistantStore.getState().send(db, config, 'Continue');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeClarification'
    );
  });

  it('still allows a genuine contextual follow-up through the real classifier', async () => {
    await sendInScopeSetup();
    clearProviderMocks();
    turn.mockResolvedValue({
      content: 'The previous interval was 45 minutes.',
      pendingAction: null,
    });

    await useAssistantStore
      .getState()
      .send(db, config, 'What about the previous interval?');

    expect(key).toHaveBeenCalledTimes(1);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'What about the previous interval?' })
    );
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'The previous interval was 45 minutes.'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });
});
