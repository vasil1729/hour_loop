/* eslint-disable import/first */
const mockLlamaLoad = jest.fn();

jest.mock('llama.rn', () => {
  mockLlamaLoad();
  return {
    initLlama: jest.fn(),
    loadLlamaModelInfo: jest.fn(),
  };
});

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import { EDGE_MODELS } from '../../../constants/edgeModels';
import {
  createOnDeviceProvider,
  isOnDeviceModelLoaded,
  releaseOnDeviceModel,
} from './onDeviceProvider.web';

describe('on-device provider on web', () => {
  it('never imports the native llama module', () => {
    expect(mockLlamaLoad).not.toHaveBeenCalled();
  });

  it('lists the curated models without touching native code', async () => {
    const provider = createOnDeviceProvider('qwen3.5-0.8b');
    expect(provider.id).toBe('on-device');
    await expect(provider.listModels?.()).resolves.toEqual(
      EDGE_MODELS.map((model) => model.id)
    );
    expect(mockLlamaLoad).not.toHaveBeenCalled();
  });

  it('rejects chat with a clean unsupported error', async () => {
    const provider = createOnDeviceProvider('qwen3.5-0.8b');
    await expect(
      provider.chat({
        messages: [{ role: 'user', content: 'Start a loop' }],
        tools: [],
      })
    ).rejects.toMatchObject({
      code: 'unsupported',
      message: 'On-device models are available on Android builds.',
    });
    expect(mockLlamaLoad).not.toHaveBeenCalled();
  });

  it('rejects test with a clean unsupported error', async () => {
    const provider = createOnDeviceProvider('qwen3.5-0.8b');
    await expect(provider.test?.()).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(mockLlamaLoad).not.toHaveBeenCalled();
  });

  it('reports no loaded native context', async () => {
    expect(isOnDeviceModelLoaded()).toBe(false);
    await expect(releaseOnDeviceModel()).resolves.toBeUndefined();
  });
});
