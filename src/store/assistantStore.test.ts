/* eslint-disable import/first */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { AssistantConfig } from '../features/assistant/assistantTypes';
import type { ScopeCategory } from '../features/assistant/scope/scopeTypes';

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../features/assistant/scope/scopeClassifier', () => ({
  classifyScope: jest.fn(),
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

import { classifyScope } from '../features/assistant/scope/scopeClassifier';
import { runAssistantTurn } from '../features/assistant/assistantConversation';
import { getAssistantApiKey } from '../features/assistant/storage/credentialStorage';
import { useAssistantStore } from './assistantStore';

const scope = jest.mocked(classifyScope);
const turn = jest.mocked(runAssistantTurn);
const key = jest.mocked(getAssistantApiKey);

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

function scopeDecision(category: ScopeCategory) {
  return {
    category,
    confidence: 0.9,
    source: 'model' as const,
    reason: 'model' as const,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('assistant store local scope enforcement', () => {
  it('does not retrieve the key or contact the provider for out-of-scope input', async () => {
    scope.mockReturnValue(scopeDecision('OUT_OF_SCOPE'));

    await useAssistantStore.getState().send(db, config, 'What is the capital of France?');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    const state = useAssistantStore.getState();
    expect(state.status).toBe('idle');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.content).toBe('What is the capital of France?');
    expect(state.messages[1]?.content).toBe('assistant.scopeRefusal');
    expect(state.lastScopeCategory).toBe('OUT_OF_SCOPE');
  });

  it('does not contact the provider for mixed requests', async () => {
    scope.mockReturnValue(scopeDecision('MIXED'));

    await useAssistantStore
      .getState()
      .send(db, config, 'Show my tasks and tell me a joke');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[1]?.content).toBe(
      'assistant.scopeMixed'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });

  it('does not contact the provider for ambiguous input', async () => {
    scope.mockReturnValue(scopeDecision('AMBIGUOUS'));

    await useAssistantStore.getState().send(db, config, 'loop');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[1]?.content).toBe(
      'assistant.scopeClarification'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });

  it('fails closed if the scope classifier throws', async () => {
    scope.mockImplementation(() => {
      throw new Error('classifier failure');
    });

    await useAssistantStore.getState().send(db, config, 'show my tasks');

    expect(key).not.toHaveBeenCalled();
    expect(turn).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().messages[1]?.content).toBe(
      'assistant.scopeClarification'
    );
    expect(useAssistantStore.getState().status).toBe('idle');
  });

  it('preserves the existing flow for in-scope input', async () => {
    scope.mockReturnValue(scopeDecision('IN_SCOPE'));
    key.mockResolvedValue('sk-test-key');
    turn.mockResolvedValue({ content: 'You focused for two hours.', pendingAction: null });

    await useAssistantStore.getState().send(db, config, 'Show my focus stats');

    expect(key).toHaveBeenCalledWith('groq');
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test-key',
        text: 'Show my focus stats',
      })
    );
    const state = useAssistantStore.getState();
    expect(state.status).toBe('idle');
    expect(state.messages[1]?.content).toBe('You focused for two hours.');
    expect(state.lastScopeCategory).toBe('IN_SCOPE');
  });

  it('passes only the previous scope category as bounded context', async () => {
    useAssistantStore.setState({ lastScopeCategory: 'IN_SCOPE' });
    scope.mockReturnValue(scopeDecision('IN_SCOPE'));
    key.mockResolvedValue('sk-test-key');
    turn.mockResolvedValue({ content: 'Previous day.', pendingAction: null });

    await useAssistantStore
      .getState()
      .send(db, config, 'What about the previous day?');

    expect(scope).toHaveBeenCalledWith('What about the previous day?', {
      previousCategory: 'IN_SCOPE',
    });
  });

  it('clears scope context when the conversation is cleared', () => {
    useAssistantStore.setState({ lastScopeCategory: 'IN_SCOPE' });
    useAssistantStore.getState().clear();
    expect(useAssistantStore.getState().lastScopeCategory).toBeNull();
  });
});
