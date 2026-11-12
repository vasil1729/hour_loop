import type { AssistantProviderId } from '../features/assistant/assistantTypes';

export const ASSISTANT_SETTING_PREFIX = 'assistant_';

export const ASSISTANT_ENABLED_KEY = 'assistant_enabled';
export const ASSISTANT_PROVIDER_KEY = 'assistant_provider';
export const ASSISTANT_MODEL_KEY = 'assistant_model';
export const ASSISTANT_BASE_URL_KEY = 'assistant_base_url';
export const ASSISTANT_WRITES_KEY = 'assistant_writes_enabled';

export const ASSISTANT_PROVIDER_IDS: AssistantProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'groq',
  'deepseek',
  'opencode',
  'custom',
];

export const ASSISTANT_DEFAULT_BASE_URLS: Record<
  Exclude<AssistantProviderId, 'custom'>,
  string
> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com',
  opencode: 'https://opencode.ai/inference/openai/v1',
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
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5-5',
  gemini: 'gemini-3.5-flash',
  openrouter: '~openai/gpt-sol-latest',
  groq: 'openai/gpt-oss-120b',
  deepseek: 'deepseek-flash',
  opencode: 'deepseek-v4.1-flash',
};

/** Offline fallback lists; live model discovery supplements these. */
export const ASSISTANT_MODEL_PRESETS: Record<
  Exclude<AssistantProviderId, 'custom'>,
  string[]
> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5'],
  gemini: ['gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-3-flash'],
  openrouter: [
    '~openai/gpt-sol-latest',
    '~deepseek/deepseek-v4-flash-latest',
  ],
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
  ],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  opencode: [
    'deepseek-v4.1-flash',
    'kimi-k3',
    'claude-sonnet-5-5',
    'gemini-3.5-flash',
  ],
};
