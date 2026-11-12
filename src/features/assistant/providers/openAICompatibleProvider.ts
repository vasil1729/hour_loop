import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  ProviderRequest,
  ProviderResponse,
  ProviderToolCall,
} from '../assistantTypes';
import { AssistantProviderError } from './providerTypes';

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_CONTENT_CHARS = 20_000;
const MAX_TOOL_CALLS = 8;

type StreamState = {
  content: string;
  toolCalls: Map<number, ToolCallAccumulator>;
  finishReason: string | null;
};

type ChatOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
};

function providerErrorForStatus(status: number, message: string): AssistantProviderError {
  if (status === 401 || status === 403) {
    return new AssistantProviderError(
      'auth',
      message || 'The provider rejected the API key.'
    );
  }
  if (status === 429) {
    return new AssistantProviderError(
      'rate_limit',
      message || 'The provider is rate limiting requests. Try again later.'
    );
  }
  if (status >= 500) {
    return new AssistantProviderError(
      'server',
      message || 'The provider returned a server error.'
    );
  }
  if (/tool|function/i.test(message)) {
    return new AssistantProviderError(
      'unsupported',
      message || 'This model does not support the requested tool call.'
    );
  }
  return new AssistantProviderError(
    'request',
    message || 'The provider rejected the request.'
  );
}

async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, maxBytes);
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new AssistantProviderError(
          'malformed',
          'The provider response was too large.'
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed or errored.
    }
    reader.releaseLock();
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = (await readBoundedText(response, 4000)).slice(0, 4000);
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const message = parsed.error?.message ?? parsed.message;
      if (typeof message === 'string') return message.slice(0, 500);
    } catch {
      // Keep the bounded plain text fallback.
    }
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

function normalizeToolCalls(value: unknown): ProviderToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: ProviderToolCall[] = [];
  for (const entry of value.slice(0, MAX_TOOL_CALLS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const fn = record.function;
    if (typeof fn !== 'object' || fn === null) continue;
    const fnRecord = fn as Record<string, unknown>;
    if (typeof fnRecord.name !== 'string' || !fnRecord.name.trim()) continue;
    const rawArguments = fnRecord.arguments;
    let args: string;
    if (typeof rawArguments === 'string') {
      args = rawArguments;
    } else if (rawArguments !== undefined) {
      args = JSON.stringify(rawArguments);
    } else {
      args = '{}';
    }
    calls.push({
      id:
        typeof record.id === 'string' && record.id
          ? record.id
          : `call_${calls.length}`,
      type: 'function',
      function: {
        name: fnRecord.name.trim(),
        arguments: args,
      },
    });
  }
  return calls;
}

function parseJsonResponse(payload: unknown): ProviderResponse {
  if (typeof payload !== 'object' || payload === null) {
    throw new AssistantProviderError('malformed', 'The provider returned an invalid response.');
  }
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AssistantProviderError('malformed', 'The provider returned no choices.');
  }
  const choice = choices[0];
  if (typeof choice !== 'object' || choice === null) {
    throw new AssistantProviderError('malformed', 'The provider returned an invalid choice.');
  }
  const choiceRecord = choice as Record<string, unknown>;
  const message = choiceRecord.message;
  if (typeof message !== 'object' || message === null) {
    throw new AssistantProviderError('malformed', 'The provider returned no message.');
  }
  const messageRecord = message as Record<string, unknown>;
  const content =
    typeof messageRecord.content === 'string'
      ? messageRecord.content.slice(0, MAX_CONTENT_CHARS)
      : '';
  return {
    content,
    toolCalls: normalizeToolCalls(messageRecord.tool_calls),
    finishReason:
      typeof choiceRecord.finish_reason === 'string'
        ? choiceRecord.finish_reason
        : null,
  };
}

function handleStreamChunk(
  payload: unknown,
  state: StreamState,
  request: ProviderRequest
): void {
  if (typeof payload !== 'object' || payload === null) return;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return;
  const choice = choices[0];
  if (typeof choice !== 'object' || choice === null) return;
  const record = choice as Record<string, unknown>;
  if (typeof record.finish_reason === 'string') {
    state.finishReason = record.finish_reason;
  }
  const delta =
    typeof record.delta === 'object' && record.delta !== null
      ? (record.delta as Record<string, unknown>)
      : typeof record.message === 'object' && record.message !== null
        ? (record.message as Record<string, unknown>)
        : null;
  if (!delta) return;

  if (typeof delta.content === 'string' && delta.content) {
    state.content += delta.content;
    if (state.content.length > MAX_CONTENT_CHARS) {
      throw new AssistantProviderError(
        'malformed',
        'The provider response was too large.'
      );
    }
    request.onTextDelta?.(delta.content);
  }

  if (Array.isArray(delta.tool_calls)) {
    for (const entry of delta.tool_calls) {
      if (typeof entry !== 'object' || entry === null) continue;
      const recordEntry = entry as Record<string, unknown>;
      const index =
        typeof recordEntry.index === 'number' ? recordEntry.index : 0;
      if (index < 0 || index >= MAX_TOOL_CALLS) continue;
      const fn =
        typeof recordEntry.function === 'object' && recordEntry.function !== null
          ? (recordEntry.function as Record<string, unknown>)
          : {};
      const current = state.toolCalls.get(index) ?? {
        id: `call_${index}`,
        name: '',
        arguments: '',
      };
      if (typeof recordEntry.id === 'string' && recordEntry.id) {
        current.id = recordEntry.id;
      }
      if (typeof fn.name === 'string' && fn.name) {
        current.name += fn.name;
      }
      if (typeof fn.arguments === 'string') {
        current.arguments += fn.arguments;
      }
      state.toolCalls.set(index, current);
    }
  }
}

function createStreamState(): StreamState {
  return {
    content: '',
    toolCalls: new Map<number, ToolCallAccumulator>(),
    finishReason: null,
  };
}

function consumeSseLine(
  line: string,
  state: StreamState,
  request: ProviderRequest
): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return false;
  if (!trimmed.startsWith('data:')) return false;
  const data = trimmed.slice(5).trim();
  if (data === '[DONE]') return true;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new AssistantProviderError(
      'malformed',
      'The provider stream contained invalid JSON.'
    );
  }
  handleStreamChunk(payload, state, request);
  return false;
}

function parseSseText(
  text: string,
  request: ProviderRequest
): ProviderResponse {
  const state = createStreamState();
  for (const line of text.split(/\r?\n/)) {
    if (consumeSseLine(line, state, request)) break;
  }
  return finalizeStream(state);
}

async function parseStreamResponse(
  response: Response,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AssistantProviderError('malformed', 'The provider stream was empty.');
  }
  const decoder = new TextDecoder();
  const state = createStreamState();
  let buffer = '';
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          throw new AssistantProviderError(
            'malformed',
            'The provider response was too large.'
          );
        }
        buffer += decoder.decode(value, { stream: true });
      }
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (consumeSseLine(line, state, request)) return finalizeStream(state);
        newline = buffer.indexOf('\n');
      }
    }
    if (buffer) consumeSseLine(buffer, state, request);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed or errored.
    }
    reader.releaseLock();
  }
  return finalizeStream(state);
}

function finalizeStream(state: {
  content: string;
  toolCalls: Map<number, ToolCallAccumulator>;
  finishReason: string | null;
}): ProviderResponse {
  const toolCalls: ProviderToolCall[] = Array.from(state.toolCalls.entries())
    .filter(([, call]) => call.name.trim().length > 0)
    .sort(([a], [b]) => a - b)
    .map(([index, call]) => ({
      id: call.id || `call_${index}`,
      type: 'function' as const,
      function: {
        name: call.name.trim(),
        arguments: call.arguments || '{}',
      },
    }));
  return {
    content: state.content,
    toolCalls,
    finishReason: state.finishReason,
  };
}

function redactSecret(value: string, apiKey: string): string {
  if (!apiKey) return value;
  return value.split(apiKey).join('[redacted]');
}

export async function chatCompletion(
  options: ChatOptions,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey) {
    throw new AssistantProviderError('config', 'No API key is configured.');
  }
  if (!model) {
    throw new AssistantProviderError('config', 'No model is configured.');
  }
  if (request.signal?.aborted) {
    throw new AssistantProviderError('cancelled', 'The request was cancelled.');
  }

  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const onAbort = () => {
    externallyAborted = true;
    controller.abort();
  };
  request.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        tools: request.tools.length > 0 ? request.tools : undefined,
        tool_choice: request.tools.length > 0 ? 'auto' : undefined,
        stream: true,
      }),
      credentials: 'omit' as const,
      signal: controller.signal,
    };
    const response =
      Platform.OS === 'web'
        ? await globalThis.fetch(endpoint, {
            ...requestInit,
            redirect: 'error',
          })
        : await expoFetch(endpoint, requestInit);

    if (response.redirected) {
      throw new AssistantProviderError(
        'network',
        'The provider redirected the request. Use its final HTTPS endpoint directly.'
      );
    }
    if (response.url) {
      const expectedOrigin = new URL(options.baseUrl).origin;
      let actualOrigin = '';
      try {
        actualOrigin = new URL(response.url).origin;
      } catch {
        actualOrigin = '';
      }
      if (actualOrigin && actualOrigin !== expectedOrigin) {
        throw new AssistantProviderError(
          'network',
          'The provider redirected the request to a different origin.'
        );
      }
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw providerErrorForStatus(response.status, message);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      return await parseStreamResponse(response, request);
    }

    let payload: unknown;
    try {
      const text = (await readBoundedText(response, MAX_RESPONSE_BYTES)).trim();
      if (!text) {
        throw new AssistantProviderError(
          'malformed',
          'The provider returned an empty response.'
        );
      }
      try {
        payload = JSON.parse(text);
      } catch {
        const sse = parseSseText(text, request);
        if (sse.content || sse.toolCalls.length > 0) {
          return sse;
        }
        throw new AssistantProviderError(
          'malformed',
          'The provider returned invalid JSON.'
        );
      }
    } catch (error) {
      if (error instanceof AssistantProviderError) throw error;
      throw new AssistantProviderError(
        'malformed',
        'The provider returned invalid JSON.'
      );
    }
    const parsed = parseJsonResponse(payload);
    if (parsed.content) request.onTextDelta?.(parsed.content);
    return parsed;
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      throw new AssistantProviderError(
        error.code,
        redactSecret(error.message, apiKey)
      );
    }
    if (timedOut) {
      throw new AssistantProviderError(
        'timeout',
        'The provider request timed out. Try again.'
      );
    }
    if (
      externallyAborted ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new AssistantProviderError('cancelled', 'The request was cancelled.');
    }
    if (error instanceof TypeError) {
      throw new AssistantProviderError(
        'network',
        'Could not reach the provider. Check the endpoint and connection.'
      );
    }
    throw new AssistantProviderError(
      'network',
      'The provider request failed. Try again.'
    );
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener('abort', onAbort);
  }
}
