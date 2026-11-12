import type { AssistantProviderId } from '../features/assistant/assistantTypes';

export const ASSISTANT_SETTING_PREFIX = 'assistant_';

export const ASSISTANT_ENABLED_KEY = 'assistant_enabled';
export const ASSISTANT_PROVIDER_KEY = 'assistant_provider';
export const ASSISTANT_MODEL_KEY = 'assistant_model';
export const ASSISTANT_BASE_URL_KEY = 'assistant_base_url';
export const ASSISTANT_WRITES_KEY = 'assistant_writes_enabled';

export const ASSISTANT_PROVIDER_IDS: AssistantProviderId[] = [
  'groq',
  'openai',
  'custom',
];

export const ASSISTANT_DEFAULT_BASE_URLS: Record<
  Exclude<AssistantProviderId, 'custom'>,
  string
> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
};

export const ASSISTANT_MESSAGE_LIMIT = 40;
export const ASSISTANT_TOOL_ITERATION_LIMIT = 3;
export const ASSISTANT_ACTION_TTL_MS = 5 * 60 * 1000;
export const ASSISTANT_MAX_KEY_LENGTH = 512;
export const ASSISTANT_MAX_MESSAGE_LENGTH = 2000;
export const ASSISTANT_MAX_TOOL_RESULT_CHARS = 12000;
export const ASSISTANT_MAX_TURN_TOOL_RESULT_CHARS = 60000;
export const ASSISTANT_MAX_TOOL_ARGUMENT_CHARS = 20000;

export const ASSISTANT_SUGGESTED_MODELS: Record<
  Exclude<AssistantProviderId, 'custom'>,
  string
> = {
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
};
