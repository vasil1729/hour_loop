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

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-4o': 'GPT-4o',
  'gpt-4.1-mini': 'GPT-4.1 mini',
  'gpt-4.1': 'GPT-4.1',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'gemini-3-flash': 'Gemini 3 Flash',
  '~openai/gpt-sol-latest': 'GPT Sol',
  '~deepseek/deepseek-v4-flash-latest': 'DeepSeek V4 Flash',
  'openai/gpt-oss-120b': 'GPT OSS 120B',
  'openai/gpt-oss-20b': 'GPT OSS 20B',
  'qwen/qwen3.8-27b': 'Qwen 3.8 27B',
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'kimi-k3': 'Kimi K3',
};

export type AssistantModelOption = {
  provider: Exclude<AssistantProviderId, 'custom'>;
  model: string;
  label: string;
};

export const ASSISTANT_MODEL_OPTIONS: AssistantModelOption[] = (
  Object.keys(ASSISTANT_MODEL_PRESETS) as Exclude<AssistantProviderId, 'custom'>[]
).flatMap((provider) =>
  ASSISTANT_MODEL_PRESETS[provider].map((model) => ({
    provider,
    model,
    label: MODEL_LABELS[model] ?? model,
  }))
);
