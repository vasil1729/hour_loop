/* eslint-disable import/first */
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(),
}));

import * as expoFetch from 'expo/fetch';

import { chatCompletion } from './openAICompatibleProvider';

const KEY = 'test-secret-key';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('assistant provider on web', () => {
  it('uses browser fetch with redirects rejected and no cookies', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'OK' } }] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await chatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }], tools: [] }
    );

    expect(result.content).toBe('OK');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        redirect: 'error',
        credentials: 'omit',
      })
    );
    expect(expoFetch.fetch).not.toHaveBeenCalled();
  });

  it('rejects a response that reports a redirect', async () => {
    const response = jsonResponse({
      choices: [{ message: { content: 'OK' } }],
    });
    Object.defineProperty(response, 'redirected', { value: true });
    global.fetch = jest
      .fn()
      .mockResolvedValue(response) as unknown as typeof fetch;

    await expect(
      chatCompletion(
        { baseUrl: 'https://api.example.com/v1', apiKey: KEY, model: 'm' },
        { messages: [{ role: 'user', content: 'hi' }], tools: [] }
      )
    ).rejects.toMatchObject({ code: 'network' });
  });
});
