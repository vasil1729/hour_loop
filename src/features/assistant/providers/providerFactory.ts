import type { AssistantConfig } from '../assistantTypes';
import {
  normalizeBaseUrl,
  resolveBaseUrl,
  AssistantConfigError,
} from '../storage/assistantSettings';
import { chatCompletion } from './openAICompatibleProvider';
import {
  AssistantProviderError,
  type AssistantProvider,
} from './providerTypes';

function providerBaseUrl(config: AssistantConfig): string {
  try {
    return resolveBaseUrl(config);
  } catch (error) {
    throw new AssistantProviderError(
      'config',
      error instanceof AssistantConfigError
        ? error.message
        : 'The provider configuration is invalid.'
    );
  }
}

export function createAssistantProvider(
  config: AssistantConfig,
  apiKey: string
): AssistantProvider {
  const baseUrl = providerBaseUrl(config);
  const model = config.model.trim();
  if (!model) {
    throw new AssistantProviderError('config', 'No model is configured.');
  }
  if (!apiKey.trim()) {
    throw new AssistantProviderError('config', 'No API key is configured.');
  }

  return {
    id: config.provider,
    chat: (request) =>
      chatCompletion({ baseUrl, apiKey, model }, request),
    test: async (signal) => {
      const result = await chatCompletion(
        { baseUrl, apiKey, model, timeoutMs: 20_000 },
        {
          messages: [
            {
              role: 'user',
              content: 'Reply with the single word OK.',
            },
          ],
          tools: [],
          signal,
        }
      );
      if (!result.content.trim() && result.toolCalls.length === 0) {
        throw new AssistantProviderError(
          'malformed',
          'The provider returned an empty test response.'
        );
      }
    },
  };
}

/** Exposed for a custom endpoint where the caller already validated the URL. */
export function createCustomProvider(
  baseUrl: string,
  apiKey: string,
  model: string
): AssistantProvider {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    id: 'custom',
    chat: (request) =>
      chatCompletion({ baseUrl: normalized, apiKey, model }, request),
    test: async (signal) => {
      const result = await chatCompletion(
        { baseUrl: normalized, apiKey, model, timeoutMs: 20_000 },
        {
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
          tools: [],
          signal,
        }
      );
      if (!result.content.trim() && result.toolCalls.length === 0) {
        throw new AssistantProviderError(
          'malformed',
          'The provider returned an empty test response.'
        );
      }
    },
  };
}
