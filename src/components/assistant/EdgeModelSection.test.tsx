/* eslint-disable import/first */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { EdgeModel } from '../../constants/edgeModels';
import { EDGE_MODELS } from '../../constants/edgeModels';

const mockGetState = jest.fn();
const mockDownload = jest.fn();
const mockCancel = jest.fn();
const mockDelete = jest.fn();
const mockCellular = jest.fn(async () => false);

jest.mock('../../features/assistant/edge/edgeModelManager', () => ({
  EdgeModelError: class EdgeModelError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'EdgeModelError';
      this.code = code;
    }
  },
  edgeModelManager: {
    getModelFileState: (id: string) => mockGetState(id),
    downloadModel: (...args: unknown[]) => mockDownload(...args),
    cancelModelDownload: (...args: unknown[]) => mockCancel(...args),
    deleteModel: (...args: unknown[]) => mockDelete(...args),
    isCellularConnection: () => mockCellular(),
  },
}));

jest.mock('../../i18n/I18nProvider', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    isRTL: false,
  }),
}));

jest.mock('../../theme/ThemeContext', () => {
  const tokens = jest.requireActual('../../theme/tokens') as {
    palette: Record<'light' | 'dark', unknown>;
  };
  return {
    useTheme: () => ({
      colors: tokens.palette.dark,
      scheme: 'dark',
    }),
  };
});

import { EdgeModelSection } from './EdgeModelSection';

function fileState(model: EdgeModel, downloaded: boolean) {
  return { model, downloaded, partialBytes: null };
}

function resetStates(downloadedIds: string[] = ['qwen3.5-0.8b']) {
  mockGetState.mockImplementation(async (id: string) => {
    const model = EDGE_MODELS.find((entry) => entry.id === id)!;
    return fileState(model, downloadedIds.includes(id));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStates();
  mockCellular.mockResolvedValue(false);
  mockDownload.mockResolvedValue('file:///models/downloaded.gguf');
  mockDelete.mockResolvedValue(undefined);
  mockCancel.mockResolvedValue(undefined);
});

describe('on-device model section', () => {
  it('renders all four curated models grouped by RAM tier', async () => {
    await render(
      <EdgeModelSection
        activeModelId="qwen3.5-0.8b"
        onUseModel={jest.fn()}
        onActiveModelDeleted={jest.fn()}
      />
    );

    for (const model of EDGE_MODELS) {
      expect(await screen.findByText(model.displayName)).toBeTruthy();
    }
    expect(screen.getByText('settings.edgeTierLight')).toBeTruthy();
    expect(screen.getByText('settings.edgeTierBalanced')).toBeTruthy();
    expect(screen.getByText('settings.edgeActive')).toBeTruthy();
  });

  it('downloads a model and reports progress', async () => {
    let finish!: (value: string) => void;
    mockDownload.mockImplementation(
      (_id, options) =>
        new Promise((resolve) => {
          finish = resolve;
          options.onProgress({ percent: 42, phase: 'downloading' });
        })
    );
    await render(
      <EdgeModelSection
        activeModelId={null}
        onUseModel={jest.fn()}
        onActiveModelDeleted={jest.fn()}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('settings.edgeDownload Qwen3.5 2B')
    );

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith(
        'qwen3.5-2b',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
    expect(
      await screen.findByText('settings.edgeDownloading:{"percent":42}')
    ).toBeTruthy();
    await act(async () => {
      finish('file:///models/qwen3.5-2b.gguf');
    });
  });

  it('warns before downloading over cellular data', async () => {
    mockCellular.mockResolvedValue(true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(
      <EdgeModelSection
        activeModelId={null}
        onUseModel={jest.fn()}
        onActiveModelDeleted={jest.fn()}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('settings.edgeDownload Qwen3.5 2B')
    );

    expect(alert).toHaveBeenCalledWith(
      'settings.edgeCellularTitle',
      expect.stringContaining('settings.edgeCellularBody'),
      expect.any(Array)
    );
    expect(mockDownload).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === 'settings.edgeDownload')?.onPress?.();
    });
    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    alert.mockRestore();
  });

  it('selects a downloaded model by tapping the model card', async () => {
    resetStates(['qwen3.5-0.8b', 'lfm2.5-1.2b']);
    const onUseModel = jest.fn();
    await render(
      <EdgeModelSection
        activeModelId="qwen3.5-0.8b"
        onUseModel={onUseModel}
        onActiveModelDeleted={jest.fn()}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('LFM2.5 1.2B, settings.edgeUse')
    );

    expect(onUseModel).toHaveBeenCalledWith('lfm2.5-1.2b');
  });

  it('switches to a downloaded model', async () => {
    resetStates(['qwen3.5-0.8b', 'lfm2.5-1.2b']);
    const onUseModel = jest.fn();
    await render(
      <EdgeModelSection
        activeModelId="qwen3.5-0.8b"
        onUseModel={onUseModel}
        onActiveModelDeleted={jest.fn()}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('settings.edgeUse LFM2.5 1.2B')
    );

    expect(onUseModel).toHaveBeenCalledWith('lfm2.5-1.2b');
  });

  it('cancels an in-flight download', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDownload.mockImplementation(
      (_id, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
          options.onProgress({ percent: 10, phase: 'downloading' });
        })
    );
    await render(
      <EdgeModelSection
        activeModelId={null}
        onUseModel={jest.fn()}
        onActiveModelDeleted={jest.fn()}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('settings.edgeDownload Qwen3.5 2B')
    );
    await fireEvent.press(await screen.findByLabelText('settings.edgeCancel'));

    expect(mockCancel).toHaveBeenCalledWith('qwen3.5-2b');
    alert.mockRestore();
  });

  it('deletes the active model and asks the settings screen for fallback', async () => {
    const onActiveModelDeleted = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(
      <EdgeModelSection
        activeModelId="qwen3.5-0.8b"
        onUseModel={jest.fn()}
        onActiveModelDeleted={onActiveModelDeleted}
      />
    );

    await fireEvent.press(
      await screen.findByLabelText('settings.edgeDelete Qwen3.5 0.8B')
    );
    const buttons = alert.mock.calls[0]?.[2] as {
      style?: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });

    expect(mockDelete).toHaveBeenCalledWith('qwen3.5-0.8b');
    await waitFor(() =>
      expect(onActiveModelDeleted).toHaveBeenCalledWith('qwen3.5-0.8b')
    );
    alert.mockRestore();
  });
});
