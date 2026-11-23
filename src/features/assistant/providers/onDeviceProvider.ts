import type {
  LlamaContext,
  RNLlamaOAICompatibleMessage,
  ToolCall,
} from 'llama.rn';

import {
  EDGE_MODELS,
  getEdgeModel,
  isEdgeModelId,
} from '../../../constants/edgeModels';
import type {
  ProviderMessage,
  ProviderRequest,
  ProviderResponse,
  ProviderTool,
  ProviderToolCall,
} from '../assistantTypes';
import {
  EdgeModelError,
  edgeModelManager,
} from '../edge/edgeModelManager';
import { pruneEdgeTools } from '../edge/edgeToolRouter';
import { buildEdgeSystemPrompt } from '../assistantPrompt';
import {
  AssistantProviderError,
  type AssistantProvider,
} from './providerTypes';

type ActiveContext = {
  modelId: string;
  context: LlamaContext;
};

let activeContext: ActiveContext | null = null;
let loading: Promise<ActiveContext> | null = null;

function getLastUserText(request: ProviderRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index];
    if (message?.role === 'user' && typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
}

function toLlamaMessages(
  messages: ProviderMessage[],
  extraSystemPrompt = ''
): RNLlamaOAICompatibleMessage[] {
  return messages.map((message) => {
    const output: Record<string, unknown> = {
      role: message.role,
      content:
        message.role === 'system'
          ? [buildEdgeSystemPrompt(), extraSystemPrompt]
              .filter(Boolean)
              .join('\n\n')
          : (message.content ?? ''),
    };
    if (message.tool_call_id) output.tool_call_id = message.tool_call_id;
    if (message.tool_calls) output.tool_calls = message.tool_calls;
    return output as RNLlamaOAICompatibleMessage;
  });
}

function toolParameterNames(tool: ProviderTool): string {
  const parameters = tool.function.parameters as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const names = Object.keys(parameters.properties ?? {});
  if (names.length === 0) return '()';
  const required = new Set(parameters.required ?? []);
  return `(${names
    .map((name) => (required.has(name) ? name : `${name}?`))
    .join(', ')})`;
}

function buildJsonToolPrompt(tools: readonly ProviderTool[]): string {
  return [
    'You must respond with exactly one JSON object and no markdown or extra text.',
    'To use a tool, return {"tool":"<tool_name>","arguments":{...}}.',
    'To answer without a tool, return {"tool":"none","answer":"<your answer>"}.',
    'Use a tool whenever the user asks about live Hour Loop data.',
    'If the user asks for an action (start, pause, resume, complete, add, create, rename, move, or set), you must call the matching tool. Never answer an action request with tool "none".',
    'Examples:',
    '{"tool":"get_tasks","arguments":{}}',
    '{"tool":"start_loop","arguments":{"durationMinutes":25}}',
    'Available tools:',
    ...tools.map(
      (tool) =>
        `- ${tool.function.name}${toolParameterNames(tool)}: ${tool.function.description}`
    ),
  ].join('\n');
}

function buildJsonToolSchema(names: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      tool: { type: 'string', enum: [...names, 'none'] },
      arguments: { type: 'object' },
      answer: { type: 'string' },
    },
    required: ['tool'],
    additionalProperties: false,
  };
}

function parseJsonToolProtocol(
  text: string,
  allowedNames: Set<string>
): { content: string; toolCalls: ProviderToolCall[] } | null {
  const cleaned = text
    .replace(/<\|im_start\|>assistant\s*/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const trimmed = cleaned.slice(start, end + 1).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const tool = typeof record.tool === 'string' ? record.tool : '';
  if (tool === 'none') {
    return {
      content: typeof record.answer === 'string' ? record.answer : '',
      toolCalls: [],
    };
  }
  if (!tool || !allowedNames.has(tool)) return null;
  return {
    content: '',
    toolCalls: [
      {
        id: 'call_0',
        type: 'function',
        function: {
          name: tool,
          arguments: JSON.stringify(record.arguments ?? {}),
        },
      },
    ],
  };
}

function normalizeToolCalls(calls: ToolCall[] | undefined): ProviderToolCall[] {
  if (!Array.isArray(calls)) return [];
  return calls.slice(0, 6).flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    return [
      {
        id: call.id ?? `call_${index}`,
        type: 'function' as const,
        function: {
          name,
          arguments: call.function.arguments || '{}',
        },
      },
    ];
  });
}

function parseFallbackToolCalls(
  text: string,
  allowedNames: Set<string>
): ProviderToolCall[] {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.tool_calls)) {
    return normalizeToolCalls(record.tool_calls as ToolCall[]).filter((call) =>
      allowedNames.has(call.function.name)
    );
  }
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || !allowedNames.has(name)) return [];
  const rawArgs = record.arguments;
  const args =
    typeof rawArgs === 'string'
      ? rawArgs
      : rawArgs !== undefined
        ? JSON.stringify(rawArgs)
        : '{}';
  return [
    {
      id: 'call_0',
      type: 'function',
      function: { name, arguments: args },
    },
  ];
}

async function loadLlamaModule(): Promise<typeof import('llama.rn')> {
  try {
    // Lazy require keeps llama.rn out of the web bundle and out of tests that
    // never touch the on-device provider.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('llama.rn') as typeof import('llama.rn');
  } catch {
    throw new AssistantProviderError(
      'unsupported',
      'On-device inference is not available on this build.'
    );
  }
}

async function getContext(modelId: string): Promise<ActiveContext> {
  if (activeContext?.modelId === modelId) return activeContext;
  if (loading) return loading;

  loading = (async () => {
    const model = getEdgeModel(modelId);
    const path = await edgeModelManager.getDownloadedModelPath(modelId);
    const llama = await loadLlamaModule();
    await releaseOnDeviceModel();
    const base = {
      model: path,
      n_ctx: model.contextLimit,
      n_batch: 256,
      n_ubatch: 128,
      n_threads: 4,
      n_gpu_layers: 0,
      use_mlock: false,
      use_mmap: true,
    };
    let context: LlamaContext;
    try {
      context = await llama.initLlama({
        ...base,
        cache_type_k: 'q8_0',
        cache_type_v: 'q8_0',
      });
    } catch {
      context = await llama.initLlama(base);
    }
    const next = { modelId, context };
    activeContext = next;
    return next;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function releaseOnDeviceModel(): Promise<void> {
  const current = activeContext;
  activeContext = null;
  if (!current) return;
  await current.context.release().catch(() => undefined);
}

export function isOnDeviceModelLoaded(): boolean {
  return activeContext !== null;
}

function toContextLoadError(error: unknown): AssistantProviderError {
  if (error instanceof AssistantProviderError) return error;
  if (error instanceof EdgeModelError) {
    return new AssistantProviderError(
      error.code === 'missing' || error.code === 'unsupported'
        ? 'config'
        : 'request',
      error.message
    );
  }
  return new AssistantProviderError(
    'request',
    'The on-device model could not be loaded.'
  );
}

export function createOnDeviceProvider(modelId: string): AssistantProvider {
  if (!isEdgeModelId(modelId)) {
    throw new AssistantProviderError(
      'config',
      'Choose and download an on-device model first.'
    );
  }

  return {
    id: 'on-device',
    listModels: async () => EDGE_MODELS.map((model) => model.id),
    test: async (signal) => {
      if (signal?.aborted) {
        throw new AssistantProviderError('cancelled', 'The request was cancelled.');
      }
      const path = await edgeModelManager.getDownloadedModelPath(modelId);
      const llama = await loadLlamaModule();
      if (signal?.aborted) {
        throw new AssistantProviderError('cancelled', 'The request was cancelled.');
      }
      await llama.loadLlamaModelInfo(path);
    },
    chat: async (request) => {
      if (request.signal?.aborted) {
        throw new AssistantProviderError('cancelled', 'The request was cancelled.');
      }
      const model = getEdgeModel(modelId);
      const allowedTools = pruneEdgeTools(
        request.tools,
        getLastUserText(request)
      );
      const allowedNames = new Set(
        allowedTools.map((tool) => tool.function.name)
      );

      let loaded: ActiveContext;
      try {
        loaded = await getContext(modelId);
      } catch (error) {
        throw toContextLoadError(error);
      }
      const context = loaded.context;
      const nativeToolUse =
        context.model?.chatTemplates?.jinja?.toolUse === true;
      const jsonToolProtocol = !nativeToolUse && allowedTools.length > 0;
      const jsonToolSchema = jsonToolProtocol
        ? buildJsonToolSchema(allowedTools.map((tool) => tool.function.name))
        : null;
      if (request.signal?.aborted) {
        throw new AssistantProviderError('cancelled', 'The request was cancelled.');
      }

      let cancelled = false;
      const onAbort = () => {
        cancelled = true;
        void context.stopCompletion();
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const result = await context.completion({
            messages: toLlamaMessages(
              request.messages,
              jsonToolProtocol ? buildJsonToolPrompt(allowedTools) : ''
            ),
            tools:
              !jsonToolProtocol && allowedTools.length > 0
                ? allowedTools
                : undefined,
            tool_choice:
              !jsonToolProtocol && allowedTools.length > 0
                ? 'auto'
                : undefined,
            response_format: jsonToolSchema
              ? {
                  type: 'json_schema' as const,
                  json_schema: { strict: true, schema: jsonToolSchema },
                }
              : undefined,
            jinja: true,
            enable_thinking: false,
            chat_template_kwargs: { enable_thinking: false },
            reasoning_format: 'auto',
            n_predict: model.maxOutputTokens,
            temperature: 0.1,
            top_k: 20,
            top_p: 0.9,
            penalty_repeat: 1.05,
          });

        if (cancelled || request.signal?.aborted) {
          throw new AssistantProviderError(
            'cancelled',
            'The request was cancelled.'
          );
        }

        let toolCalls = normalizeToolCalls(result.tool_calls).filter((call) =>
          allowedNames.has(call.function.name)
        );
        let content = (result.content || '').trim();
        if (jsonToolProtocol) {
          const parsedProtocol = parseJsonToolProtocol(
            result.text || content,
            allowedNames
          );
          if (parsedProtocol) {
            toolCalls = parsedProtocol.toolCalls;
            content = parsedProtocol.content.trim();
          }
        }
        if (toolCalls.length === 0 && allowedNames.size > 0) {
          const fallback = parseFallbackToolCalls(
            result.text || content,
            allowedNames
          );
          if (fallback.length > 0) {
            toolCalls = fallback;
            content = '';
          }
        }

        if (!content && toolCalls.length === 0) {
          throw new AssistantProviderError(
            'malformed',
            'The on-device model returned an empty response.'
          );
        }

        const finishReason = result.interrupted
          ? 'cancelled'
          : result.context_full
            ? 'length'
            : result.stopped_eos
              ? 'stop'
              : null;

        return {
          content,
          toolCalls,
          finishReason,
        } satisfies ProviderResponse;
      } catch (error) {
        if (error instanceof AssistantProviderError) throw error;
        if (cancelled || request.signal?.aborted) {
          throw new AssistantProviderError(
            'cancelled',
            'The request was cancelled.'
          );
        }
        if (error instanceof EdgeModelError) {
          throw new AssistantProviderError(
            error.code === 'missing' || error.code === 'unsupported'
              ? 'config'
              : 'request',
            error.message
          );
        }
        throw new AssistantProviderError(
          'request',
          'The on-device model could not complete the request.'
        );
      } finally {
        request.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
