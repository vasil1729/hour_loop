/* eslint-disable import/first */
import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../features/assistant/scope/scopeModel', () => ({
  predictScopeProbability: jest.fn(() => {
    throw new Error('model unavailable');
  }),
  getScopeModelThresholds: jest.fn(() => ({
    inScope: 0.92,
    outOfScope: 0.91,
  })),
  getScopeModelInfo: jest.fn(() => ({
    version: 1,
    featureBuckets: 32768,
    modelBytes: 32768,
    trainingSamples: 2165,
  })),
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

import fs from 'node:fs';
import path from 'node:path';

import type { AssistantConfig } from '../features/assistant/assistantTypes';
import { runAssistantTurn } from '../features/assistant/assistantConversation';
import { getAssistantApiKey } from '../features/assistant/storage/credentialStorage';
import { useAssistantStore } from './assistantStore';

const turn = jest.mocked(runAssistantTurn);
const key = jest.mocked(getAssistantApiKey);

const config: AssistantConfig = {
  enabled: true,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  baseUrl: null,
  writesEnabled: true,
};

const guardedDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database should not be accessed');
    },
  }
) as SQLiteDatabase;

const isolation = {
  failClosedRequestsTested: 0,
  apiKeyLookups: 0,
  providerInvocations: 0,
  databaseAccesses: 0,
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

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('assistant store fails closed when the semantic model fails', () => {
  it('keeps an unknown request local when inference throws', async () => {
    await useAssistantStore
      .getState()
      .send(guardedDb, config, 'Show my focus stats');

    isolation.failClosedRequestsTested += 1;
    isolation.apiKeyLookups += key.mock.calls.length;
    isolation.providerInvocations += turn.mock.calls.length;

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeClarification'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
    expect(useAssistantStore.getState().lastScopeCategory).toBe('AMBIGUOUS');
  });

  it('keeps a clearly unrelated request local when inference throws', async () => {
    await useAssistantStore
      .getState()
      .send(guardedDb, config, 'What is the capital of France?');

    isolation.failClosedRequestsTested += 1;
    isolation.apiKeyLookups += key.mock.calls.length;
    isolation.providerInvocations += turn.mock.calls.length;

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages.at(-1)?.content).toBe(
      'assistant.scopeClarification'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });
});

afterAll(() => {
  if (process.env.SCOPE_EVAL_REPORT !== '1') return;
  fs.writeFileSync(
    path.join(
      __dirname,
      '../../scripts/scope-classifier/provider-isolation-failclosed.json'
    ),
    `${JSON.stringify(
      {
        generator: 'src/store/assistantStore.scopeFailure.test.ts',
        runtime: 'desktop/Jest Node environment',
        ...isolation,
        failClosed: true,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
});
