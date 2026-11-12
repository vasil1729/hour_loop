import type { AssistantConfig } from '../assistantTypes';
import { AssistantConfigError, normalizeBaseUrl } from '../storage/assistantSettings';
import { chatCompletion } from './openAICompatibleProvider';
import { AssistantProviderError } from './providerTypes';
import { createAssistantProvider, createCustomProvider } from './providerFactory';

jest.mock('expo/fetch', () => ({
  fetch: (url: string, init?: RequestInit) =>
    (globalThis.fetch as typeof fetch)(url, init),
}));

const KEY = 'test-secret-key';

function config(overrides: Partial<AssistantConfig> = {}): AssistantConfig {
  return {
    enabled: true,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    baseUrl: null,
    writesEnabled: true,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: { message } }, status);
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: AssistantProviderError['code']
): Promise<AssistantProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AssistantProviderError);
    expect((error as AssistantProviderError).code).toBe(code);
    return error as AssistantProviderError;
  }
  throw new Error(`Expected provider error ${code}`);
}

describe('assistant provider configuration', () => {
  it('accepts a valid Groq configuration', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'OK' } }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createAssistantProvider(config(), KEY);
    expect(provider.id).toBe('groq');
    await provider.test();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.groq.com/openai/v1/chat/completions'
    );
  });

  it('accepts a valid OpenAI configuration', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'OK' } }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = createAssistantProvider(
      config({ provider: 'openai', model: 'gpt-4o-mini' }),
      KEY
    );
    expect(provider.id).toBe('openai');
    await provider.test();

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('accepts and normalizes a custom OpenAI-compatible endpoint', () => {
    expect(normalizeBaseUrl('https://ai.example.com/v1/')).toBe(
      'https://ai.example.com/v1'
    );
    const provider = createCustomProvider(
      'https://ai.example.com/v1/',
      KEY,
      'custom-model'
    );
    expect(provider.id).toBe('custom');
  });

  it('rejects a missing API key', () => {
    expect(() => createAssistantProvider(config(), '   ')).toThrow(
      AssistantProviderError
    );
  });

  it('rejects an invalid, insecure, or local plaintext endpoint', () => {
    expect(() => normalizeBaseUrl('not-a-url')).toThrow(AssistantConfigError);
    expect(() => normalizeBaseUrl('https://user:pass@example.com/v1')).toThrow(
      AssistantConfigError
    );
    expect(() => normalizeBaseUrl('http://example.com/v1')).toThrow(
      AssistantConfigError
    );
    expect(() => normalizeBaseUrl('http://127.0.0.1:11434/v1')).toThrow(
      AssistantConfigError
    );
    expect(() => normalizeBaseUrl('http://192.168.1.20:8080/v1')).toThrow(
      AssistantConfigError
    );
    expect(() =>
      createCustomProvider('ftp://example.com/v1', KEY, 'model')
    ).toThrow(AssistantConfigError);
  });
});

describe('OpenAI-compatible request handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps HTTP 401 to an auth error without leaking the key', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      errorResponse(401, `Incorrect key ${KEY}`)
    ) as unknown as typeof fetch;

    const error = await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'auth'
    );
    expect(error.message).toContain('[redacted]');
    expect(error.message).not.toContain(KEY);
  });

  it('maps HTTP 429 to a rate limit error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      errorResponse(429, 'Too many requests')
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'rate_limit'
    );
  });

  it('maps HTTP 500 to a server error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      errorResponse(500, 'Internal error')
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'server'
    );
  });

  it('reports unsupported tool behavior from a provider rejection', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      errorResponse(400, 'tool_choice is not supported by this model')
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'unsupported'
    );
  });

  it('times out an unresponsive request', async () => {
    global.fetch = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        {
          baseUrl: 'https://api.example.com/v1',
          apiKey: KEY,
          model: 'm',
          timeoutMs: 15,
        },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'timeout'
    );
  });

  it('honors request cancellation before sending', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        {
          messages: [{ role: 'user', content: 'hi' }],
          tools: [],
          signal: controller.signal,
        }
      ),
      'cancelled'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON responses', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('{not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'malformed'
    );
  });

  it('normalizes a stream interruption', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'
          )
        );
        controller.error(new Error('connection lost'));
      },
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'network'
    );
  });

  it('parses JSON responses without a content-type header', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
        status: 200,
      })
    ) as unknown as typeof fetch;

    const result = await chatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], tools: [] }
    );
    expect(result.content).toBe('OK');
  });

  it('parses SSE text returned without an event-stream header', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        'data: {"choices":[{"delta":{"content":"Fallback"}}]}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { 'content-type': 'text/plain' } }
      )
    ) as unknown as typeof fetch;

    const result = await chatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], tools: [] }
    );
    expect(result.content).toBe('Fallback');
  });

  it('returns an empty response without crashing', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' } }] })
    ) as unknown as typeof fetch;

    const result = await chatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], tools: [] }
    );
    expect(result.content).toBe('');
    expect(result.toolCalls).toEqual([]);
  });

  it('rejects an oversized non-stream response', async () => {
    const oversized = JSON.stringify({
      choices: [{ message: { content: 'x'.repeat(1_100_000) } }],
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(oversized, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'malformed'
    );
  });

  it('maps an invalid model rejection to a request error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      errorResponse(400, 'The model `missing-model` does not exist')
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'request'
    );
  });

  it('rejects a redirected response even if a transport followed it', async () => {
    const response = jsonResponse({
      choices: [{ message: { content: 'OK' } }],
    });
    Object.defineProperty(response, 'redirected', { value: true });
    global.fetch = jest.fn().mockResolvedValue(
      response
    ) as unknown as typeof fetch;

    await expectProviderError(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      ),
      'network'
    );
  });

  it('parses streamed text and tool-call deltas', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Checking "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"now."}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_active_loop","arguments":"{}"}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    ) as unknown as typeof fetch;

    const deltas: string[] = [];
    const result = await chatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
      {
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        onTextDelta: (delta) => deltas.push(delta),
      }
    );

    expect(result.content).toBe('Checking now.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe('get_active_loop');
    expect(deltas.join('')).toBe('Checking now.');
  });
});
