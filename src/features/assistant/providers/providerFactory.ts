import type { AssistantConfig } from '../assistantTypes';
import {
  normalizeBaseUrl,
  resolveBaseUrl,
  AssistantConfigError,
} from '../storage/assistantSettings';
import { chatCompletion, listModels } from './openAICompatibleProvider';
import {
  AssistantProviderError,
  type AssistantProvider,
} from './providerTypes';

const OPENCODE_MODELS_URL = 'https://opencode.ai/inference/v1/models';

function modelListOptions(
  config: AssistantConfig,
  apiKey: string,
  baseUrl: string
): { baseUrl: string; apiKey: string; modelsUrl?: string } {
  return {
    baseUrl,
    apiKey,
    modelsUrl: config.provider === 'opencode' ? OPENCODE_MODELS_URL : undefined,
  };
}

export async function listAssistantProviderModels(
  config: AssistantConfig,
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const baseUrl = providerBaseUrl(config);
  if (!apiKey.trim()) {
    throw new AssistantProviderError('config', 'No API key is configured.');
  }
  return listModels(modelListOptions(config, apiKey, baseUrl), signal);
}

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
    listModels: (signal) =>
      listModels(modelListOptions(config, apiKey, baseUrl), signal),
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
    listModels: (signal) =>
      listModels(
        { baseUrl: normalized, apiKey, modelsUrl: `${normalized}/models` },
        signal
      ),
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
