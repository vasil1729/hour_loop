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

jest.mock('../features/assistant/assistantErrors', () => ({
  describeAssistantError: () => 'assistant.errorGeneric',
}));

import type { AssistantConfig, AssistantPendingAction } from '../features/assistant/assistantTypes';
import { createAssistantTools } from '../features/assistant/assistantTools';
import { runAssistantTurn } from '../features/assistant/assistantConversation';
import { getAssistantApiKey } from '../features/assistant/storage/credentialStorage';
import { useAssistantStore } from './assistantStore';
import fs from 'node:fs';
import path from 'node:path';

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

const isolation = {
  rejectedRequestsTested: 0,
  apiKeyLookupsForRejected: 0,
  providerInvocationsForRejected: 0,
  databaseAccessesForRejected: 0,
  inScopeProviderInvocations: 0,
};

function recordRejectedRequest() {
  isolation.rejectedRequestsTested += 1;
  isolation.apiKeyLookupsForRejected += key.mock.calls.length;
  isolation.providerInvocationsForRejected += turn.mock.calls.length;
}

function makePendingAction(): AssistantPendingAction {
  const now = Date.now();
  return {
    id: 'action-scope-test',
    toolName: 'create_loop',
    args: {},
    description: 'Create a loop',
    details: [],
    risk: 'write',
    targetIds: [],
    createdAt: now,
    expiresAt: now + 60_000,
    status: 'pending',
  };
}

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
  isolation.inScopeProviderInvocations += turn.mock.calls.length;
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

    recordRejectedRequest();
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

    recordRejectedRequest();
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

    recordRejectedRequest();
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

    recordRejectedRequest();
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

    recordRejectedRequest();
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

  it('keeps the fixed media and shopping-list bypasses local', async () => {
    for (const text of [
      'Play a song during my focus session.',
      'Add milk to my shopping list for my loop.',
    ]) {
      await useAssistantStore.getState().send(db, config, text);
      recordRejectedRequest();
      expect(key).not.toHaveBeenCalled();
      expect(turn).not.toHaveBeenCalled();
      expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
        'assistant.scopeRefusal'
      );
    }
  });

  it.each(['OUT_OF_SCOPE', 'MIXED', 'AMBIGUOUS'] as const)(
    'does not inherit a previous %s category',
    async (previousCategory) => {
      resetStore();
      useAssistantStore.setState({ lastScopeCategory: previousCategory });
      clearProviderMocks();

      await useAssistantStore
        .getState()
        .send(db, config, 'What about the previous interval?');

      recordRejectedRequest();
      expect(key).not.toHaveBeenCalled();
      expect(turn).not.toHaveBeenCalled();
      expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
        'assistant.scopeClarification'
      );
      expect(useAssistantStore.getState().lastScopeCategory).toBe('AMBIGUOUS');
    }
  );

  it('does not call the provider when the API key is missing', async () => {
    key.mockResolvedValue(null);
    turn.mockResolvedValue({ content: 'unused', pendingAction: null });

    await useAssistantStore.getState().send(db, config, 'Show my focus stats');

    expect(key).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.errorNoKey'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });

  it('does not classify or call the provider when the assistant is disabled', async () => {
    await useAssistantStore
      .getState()
      .send(db, { ...config, enabled: false }, 'Show my focus stats');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().error).toBe(
      'assistant.errorUnavailable'
    );
    expect(useAssistantStore.getState().lastScopeCategory).toBeNull();
  });

  it('blocks a new message while an action is pending', async () => {
    useAssistantStore.setState({ pendingAction: makePendingAction() });

    await useAssistantStore
      .getState()
      .send(db, config, 'What is the capital of France?');

    recordRejectedRequest();
    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().error).toBe(
      'assistant.errorActionPending'
    );
    expect(useAssistantStore.getState().lastScopeCategory).toBeNull();
  });

  it('keeps repeated rejected sends local and updates context each time', async () => {
    await sendInScopeSetup();
    clearProviderMocks();

    await useAssistantStore
      .getState()
      .send(db, config, 'Do you know the capital of France?');
    recordRejectedRequest();
    expect(useAssistantStore.getState().lastScopeCategory).toBe(
      'OUT_OF_SCOPE'
    );

    await useAssistantStore
      .getState()
      .send(db, config, 'Continue with the history of India.');
    recordRejectedRequest();
    expect(useAssistantStore.getState().lastScopeCategory).toBe(
      'OUT_OF_SCOPE'
    );

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(
      useAssistantStore
        .getState()
        .messages.filter((message) => message.content === 'assistant.scopeRefusal')
    ).toHaveLength(2);
  });

  it('resets contextual scope when the conversation is cleared', async () => {
    await sendInScopeSetup();
    clearProviderMocks();
    useAssistantStore.getState().clear();
    expect(useAssistantStore.getState().lastScopeCategory).toBeNull();

    await useAssistantStore
      .getState()
      .send(db, config, 'What about the previous interval?');

    recordRejectedRequest();
    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeClarification'
    );
  });

  it('retries an in-scope provider failure without bypassing classification', async () => {
    key.mockResolvedValue('sk-test-key');
    turn
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ content: 'Recovered response.', pendingAction: null });

    await useAssistantStore.getState().send(db, config, 'Show my focus stats');
    expect(turn).toHaveBeenCalledTimes(1);
    expect(useAssistantStore.getState().messages.at(-1)?.status).toBe('error');

    await useAssistantStore.getState().retryLast(db, config);

    expect(key).toHaveBeenCalledTimes(2);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'Recovered response.'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
    isolation.inScopeProviderInvocations += 2;
  });

  it('does not retry a locally rejected message', async () => {
    await useAssistantStore
      .getState()
      .send(db, config, 'What is the capital of France?');
    recordRejectedRequest();
    const messageCount = useAssistantStore.getState().messages.length;

    await useAssistantStore.getState().retryLast(db, config);

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages).toHaveLength(messageCount);
  });
});

afterAll(() => {
  if (process.env.SCOPE_EVAL_REPORT !== '1') return;
  fs.writeFileSync(
    path.join(__dirname, '../../scripts/scope-classifier/provider-isolation.json'),
    `${JSON.stringify(
      {
        generator: 'src/store/assistantStore.scopeIntegration.test.ts',
        runtime: 'desktop/Jest Node environment',
        ...isolation,
        modelFailureFailClosed:
          'src/store/assistantStore.scopeFailure.test.ts',
      },
      null,
      2
    )}\n`,
    'utf8'
  );
});
