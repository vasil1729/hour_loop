import type { SQLiteDatabase } from 'expo-sqlite';

export type AssistantProviderId = 'groq' | 'openai' | 'custom';

export type AssistantConfig = {
  enabled: boolean;
  provider: AssistantProviderId;
  model: string;
  baseUrl: string | null;
  writesEnabled: boolean;
};

export type AssistantChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status?: 'streaming' | 'sent' | 'error';
  actionId?: string;
};

export type ProviderToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ProviderTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
};

export type ProviderRequest = {
  messages: ProviderMessage[];
  tools: ProviderTool[];
  signal?: AbortSignal;
  onTextDelta?: (text: string) => void;
};

export type ProviderResponse = {
  content: string;
  toolCalls: ProviderToolCall[];
  finishReason: string | null;
};

export type AssistantRisk = 'read' | 'write' | 'timer';

export type AssistantToolContext = {
  db: SQLiteDatabase;
  signal?: AbortSignal;
};

export type AssistantToolResult = {
  summary: string;
  data?: unknown;
};

export type AssistantActionDetailKey =
  | 'duration'
  | 'focus'
  | 'task'
  | 'capsules'
  | 'target'
  | 'title'
  | 'description'
  | 'journalDone'
  | 'rollForward'
  | 'note';

export type AssistantActionDetail = {
  key: AssistantActionDetailKey;
  value: string;
};

export type AssistantActionPreview = {
  description: string;
  targetIds: string[];
  details?: AssistantActionDetail[];
};

export type AssistantTool = {
  name: string;
  description: string;
  risk: AssistantRisk;
  parameters: Record<string, unknown>;
  parse: (args: unknown) => unknown;
  describe: (args: unknown) => string;
  targetIds: (args: unknown) => string[];
  execute: (
    context: AssistantToolContext,
    args: unknown
  ) => Promise<AssistantToolResult>;
  prepare?: (
    context: AssistantToolContext,
    args: unknown
  ) => Promise<AssistantActionPreview>;
  revalidate?: (
    context: AssistantToolContext,
    args: unknown
  ) => Promise<void>;
};

export type AssistantPendingAction = {
  id: string;
  toolName: string;
  args: unknown;
  description: string;
  details: AssistantActionDetail[];
  risk: Exclude<AssistantRisk, 'read'>;
  targetIds: string[];
  createdAt: number;
  expiresAt: number;
  status:
    | 'pending'
    | 'executing'
    | 'executed'
    | 'cancelled'
    | 'failed'
    | 'expired';
  result?: string;
  error?: string;
};
