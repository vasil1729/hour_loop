/* eslint-disable import/first */
import type { LlamaContext } from 'llama.rn';

import type { ProviderTool } from '../assistantTypes';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockInitLlama = jest.fn();
const mockLoadLlamaModelInfo = jest.fn();
const mockLlamaModuleLoad = jest.fn();

jest.mock('llama.rn', () => {
  mockLlamaModuleLoad();
  return {
    initLlama: (...args: unknown[]) => mockInitLlama(...args),
    loadLlamaModelInfo: (...args: unknown[]) => mockLoadLlamaModelInfo(...args),
  };
});

jest.mock('../edge/edgeModelManager', () => ({
  EdgeModelError: class EdgeModelError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'EdgeModelError';
      this.code = code;
    }
  },
  edgeModelManager: {
    getDownloadedModelPath: jest.fn(),
  },
}));

import { EDGE_MODELS } from '../../../constants/edgeModels';
import {
  EdgeModelError,
  edgeModelManager,
} from '../edge/edgeModelManager';
import {
  createAssistantProvider,
  listAssistantProviderModels,
} from './providerFactory';
import {
  createOnDeviceProvider,
  isOnDeviceModelLoaded,
  releaseOnDeviceModel,
} from './onDeviceProvider';

const MODEL_ID = 'qwen3.5-0.8b';
const MODEL = EDGE_MODELS.find((entry) => entry.id === MODEL_ID)!;
const manager = jest.mocked(edgeModelManager);

type MockContext = {
  completion: jest.Mock;
  stopCompletion: jest.Mock;
  release: jest.Mock;
  model: {
    chatTemplates: {
      jinja: { toolUse: boolean };
    };
  };
};

let context: MockContext;

function completionResult(overrides: Record<string, unknown> = {}) {
  return {
    text: '',
    content: '',
    tool_calls: [],
    interrupted: false,
    context_full: false,
    stopped_eos: true,
    ...overrides,
  };
}

function tool(name: string, description = 'long cloud description'): ProviderTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties: {} },
    },
  };
}

function request(
  text: string,
  tools: ProviderTool[] = [],
  signal?: AbortSignal
) {
  return {
    messages: [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: text },
    ],
    tools,
    signal,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  context = {
    completion: jest.fn(async () => completionResult({ content: 'Done.' })),
    stopCompletion: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    model: { chatTemplates: { jinja: { toolUse: true } } },
  };
  mockInitLlama.mockResolvedValue(context as unknown as LlamaContext);
  mockLoadLlamaModelInfo.mockResolvedValue({});
  manager.getDownloadedModelPath.mockResolvedValue(
    'file:///documents/assistant-models/qwen3.5-0.8b.gguf'
  );
});

afterEach(async () => {
  await releaseOnDeviceModel();
});

describe('on-device provider factory', () => {
  it('creates an on-device provider without an API key', () => {
    const provider = createAssistantProvider(
      {
        enabled: true,
        provider: 'on-device',
        model: MODEL_ID,
        baseUrl: null,
        writesEnabled: true,
      },
      ''
    );
    expect(provider.id).toBe('on-device');
  });

  it('rejects an unknown on-device model', () => {
    expect(() =>
      createAssistantProvider(
        {
          enabled: true,
          provider: 'on-device',
          model: 'not-a-model',
          baseUrl: null,
          writesEnabled: true,
        },
        ''
      )
    ).toThrow(expect.objectContaining({ code: 'config' }));
  });

  it('lists the catalog without an API key', async () => {
    await expect(
      listAssistantProviderModels(
        {
          enabled: true,
          provider: 'on-device',
          model: MODEL_ID,
          baseUrl: null,
          writesEnabled: true,
        },
        ''
      )
    ).resolves.toEqual(EDGE_MODELS.map((entry) => entry.id));
  });

  it('still requires a key for cloud providers', () => {
    expect(() =>
      createAssistantProvider(
        {
          enabled: true,
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          baseUrl: null,
          writesEnabled: true,
        },
        ''
      )
    ).toThrow(expect.objectContaining({ code: 'config' }));
  });
});

describe('on-device provider', () => {
  it('lists exactly the four curated models', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    await expect(provider.listModels?.()).resolves.toEqual(
      EDGE_MODELS.map((entry) => entry.id)
    );
  });

  it('does not load the native context until chat is called', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    expect(mockLlamaModuleLoad).not.toHaveBeenCalled();
    expect(mockInitLlama).not.toHaveBeenCalled();
    expect(isOnDeviceModelLoaded()).toBe(false);

    await provider.chat(request('Start a 25 minute loop'));

    expect(mockLlamaModuleLoad).toHaveBeenCalledTimes(1);
    expect(mockInitLlama).toHaveBeenCalledTimes(1);
    expect(isOnDeviceModelLoaded()).toBe(true);
  });

  it('loads the downloaded file with capped context and batch sizes', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    await provider.chat(request('Start a loop'));

    expect(manager.getDownloadedModelPath).toHaveBeenCalledWith(MODEL_ID);
    expect(mockInitLlama).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'file:///documents/assistant-models/qwen3.5-0.8b.gguf',
        n_ctx: MODEL.contextLimit,
        n_batch: 256,
        n_ubatch: 128,
        n_gpu_layers: 0,
        use_mmap: true,
      })
    );
  });

  it('fails with a config error when the model is not downloaded', async () => {
    manager.getDownloadedModelPath.mockRejectedValue(
      new EdgeModelError('missing', 'Download this model first.')
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(provider.chat(request('Start a loop'))).rejects.toMatchObject({
      code: 'config',
    });
    expect(mockInitLlama).not.toHaveBeenCalled();
  });

  it('prunes tools to the routed set before prompting', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    await provider.chat(
      request('Start a 25 minute loop', [
        tool('start_loop'),
        tool('create_task'),
        tool('get_intention'),
      ])
    );

    const params = context.completion.mock.calls[0]?.[0];
    expect(params.messages[0].role).toBe('system');
    expect(params.messages[0].content).toContain('offline assistant');
    expect(params.messages[0].content).not.toContain('get_focus_stats');
    expect(params.messages[1]).toEqual({
      role: 'user',
      content: 'Start a 25 minute loop',
    });
    expect(params.tools.map((entry: ProviderTool) => entry.function.name)).toEqual([
      'start_loop',
    ]);
    expect(params.tools[0].function.description).toContain(
      'Prepare a focus loop'
    );
    expect(params.tools[0].function.description.length).toBeLessThan(90);
    expect(params.tool_choice).toBe('auto');
    expect(params.jinja).toBe(true);
    expect(params.n_predict).toBe(MODEL.maxOutputTokens);
  });

  it('omits tools when the request has none', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    await provider.chat(request('Hello'));

    const params = context.completion.mock.calls[0]?.[0];
    expect(params.tools).toBeUndefined();
    expect(params.tool_choice).toBeUndefined();
  });

  it('uses a JSON tool protocol when the model template lacks tool_use', async () => {
    context.model.chatTemplates.jinja.toolUse = false;
    context.completion.mockResolvedValue(
      completionResult({ content: '{"tool":"get_tasks","arguments":{}}' })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Show my tasks', [tool('get_tasks')])
    );

    const params = context.completion.mock.calls[0]?.[0];
    expect(params.tools).toBeUndefined();
    expect(params.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: expect.objectContaining({ strict: true }),
    });
    expect(params.messages[0].content).toContain(
      '{"tool":"<tool_name>","arguments":{...}}'
    );
    expect(result.content).toBe('');
    expect(result.toolCalls[0]?.function.name).toBe('get_tasks');
    expect(result.toolCalls[0]?.function.arguments).toBe('{}');
  });

  it('extracts a JSON tool call from template-decorated output', async () => {
    context.model.chatTemplates.jinja.toolUse = false;
    context.completion.mockResolvedValue(
      completionResult({
        text: '<|im_start|>assistant\n<think>\n\n</think>\n\n{"tool":"get_tasks","arguments":{}}',
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Show my tasks', [tool('get_tasks')])
    );

    expect(result.content).toBe('');
    expect(result.toolCalls[0]?.function.name).toBe('get_tasks');
  });

  it('uses a plain JSON answer when the model chooses no tool', async () => {
    context.model.chatTemplates.jinja.toolUse = false;
    context.completion.mockResolvedValue(
      completionResult({
        content: '{"tool":"none","answer":"You have no tasks."}',
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Show my tasks', [tool('get_tasks')])
    );

    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe('You have no tasks.');
  });

  it('returns valid native tool calls with their JSON arguments', async () => {
    context.completion.mockResolvedValue(
      completionResult({
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'start_loop',
              arguments: '{"durationMinutes":25}',
            },
          },
        ],
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Start a 25 minute loop', [tool('start_loop')])
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'start_loop',
          arguments: '{"durationMinutes":25}',
        },
      },
    ]);
    expect(result.finishReason).toBe('stop');
  });

  it('drops native calls to tools that were not routed', async () => {
    context.completion.mockResolvedValue(
      completionResult({
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'delete_everything', arguments: '{}' },
          },
        ],
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(
      provider.chat(request('Start a loop', [tool('start_loop')]))
    ).rejects.toMatchObject({ code: 'malformed' });
  });

  it('accepts a JSON fallback tool call when the chat template does not emit one', async () => {
    context.completion.mockResolvedValue(
      completionResult({
        text: '{"name":"start_loop","arguments":{"durationMinutes":15}}',
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Start a 15 minute loop', [tool('start_loop')])
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe('start_loop');
    expect(JSON.parse(result.toolCalls[0]!.function.arguments)).toEqual({
      durationMinutes: 15,
    });
  });

  it('filters fallback calls through the routed tool names', async () => {
    context.completion.mockResolvedValue(
      completionResult({
        text: '{"name":"delete_everything","arguments":{}}',
      })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(
      provider.chat(request('Start a loop', [tool('start_loop')]))
    ).rejects.toMatchObject({ code: 'malformed' });
  });

  it('does not treat unrelated JSON prose as a tool call', async () => {
    context.completion.mockResolvedValue(
      completionResult({ content: '{"answer":"no tools needed"}' })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat(
      request('Start a loop', [tool('start_loop')])
    );

    expect(result.content).toBe('{"answer":"no tools needed"}');
    expect(result.toolCalls).toEqual([]);
  });

  it('returns the final content without duplicate token streaming', async () => {
    const onTextDelta = jest.fn();
    context.completion.mockResolvedValue(
      completionResult({ content: 'You have no active tasks.' })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const result = await provider.chat({
      ...request('Show my stats'),
      onTextDelta,
    });

    expect(result.content).toBe('You have no active tasks.');
    expect(onTextDelta).not.toHaveBeenCalled();
  });

  it('stops native generation when aborted', async () => {
    const controller = new AbortController();
    context.completion.mockImplementation(
      () =>
        new Promise((resolve) => {
          context.stopCompletion.mockImplementation(async () => {
            resolve(completionResult({ interrupted: true }));
          });
        })
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    const pending = provider.chat(
      request('Start a loop', [tool('start_loop')], controller.signal)
    );
    while (context.completion.mock.calls.length === 0) {
      await Promise.resolve();
    }
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(context.stopCompletion).toHaveBeenCalledTimes(1);
  });

  it('maps a cancelled signal before generation to a cancelled error', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(
      provider.chat(request('Start a loop', [tool('start_loop')], controller.signal))
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(context.completion).not.toHaveBeenCalled();
  });

  it('reports an empty native response as malformed', async () => {
    context.completion.mockResolvedValue(completionResult());
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(provider.chat(request('Start a loop'))).rejects.toMatchObject({
      code: 'malformed',
    });
  });

  it('releases the native context on demand', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    await provider.chat(request('Start a loop'));
    expect(isOnDeviceModelLoaded()).toBe(true);

    await releaseOnDeviceModel();

    expect(context.release).toHaveBeenCalledTimes(1);
    expect(isOnDeviceModelLoaded()).toBe(false);
    await releaseOnDeviceModel();
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('releases the previous context before switching models', async () => {
    const first = createOnDeviceProvider(MODEL_ID);
    await first.chat(request('Start a loop'));

    const secondContext = {
      completion: jest.fn(async () => completionResult({ content: 'Ok.' })),
      stopCompletion: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      model: { chatTemplates: { jinja: { toolUse: true } } },
    };
    mockInitLlama.mockResolvedValue(secondContext as unknown as LlamaContext);
    const second = createOnDeviceProvider('qwen3.5-2b');
    await second.chat(request('Show my stats'));

    expect(context.release).toHaveBeenCalledTimes(1);
    expect(mockInitLlama).toHaveBeenCalledTimes(2);
    expect(isOnDeviceModelLoaded()).toBe(true);
  });

  it('tests the downloaded model without running a completion', async () => {
    const provider = createOnDeviceProvider(MODEL_ID);
    const signal = new AbortController().signal;

    await provider.test?.(signal);

    expect(mockLoadLlamaModelInfo).toHaveBeenCalledWith(
      'file:///documents/assistant-models/qwen3.5-0.8b.gguf'
    );
    expect(context.completion).not.toHaveBeenCalled();
  });

  it('rejects test() for a missing model without loading native code', async () => {
    manager.getDownloadedModelPath.mockRejectedValue(
      new EdgeModelError('missing', 'Download this model first.')
    );
    const provider = createOnDeviceProvider(MODEL_ID);

    await expect(provider.test?.()).rejects.toBeInstanceOf(EdgeModelError);
    expect(mockInitLlama).not.toHaveBeenCalled();
  });
});
