import { createHash } from 'node:crypto';

import type { EdgeModel } from '../../../constants/edgeModels';
import {
  EdgeModelError,
  createEdgeModelManager,
  type EdgeDownloadProgress,
  type EdgeModelManagerDeps,
} from './edgeModelManager';

const PAYLOAD = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function model(overrides: Partial<EdgeModel> = {}): EdgeModel {
  return {
    id: 'tiny',
    displayName: 'Tiny',
    ramTier: '4gb',
    minRamGb: 4,
    downloadSizeBytes: PAYLOAD.length,
    estimatedRamMb: 128,
    contextLimit: 512,
    maxOutputTokens: 64,
    downloadUrl: 'https://example.test/tiny.gguf',
    revision: 'rev',
    sha256: digest(PAYLOAD),
    supportsNativeToolCalls: true,
    license: 'MIT',
    licenseUrl: 'https://example.test/license',
    ...overrides,
  };
}

type FakeDownload = {
  url: string;
  fileUri: string;
  resumeData?: string;
  progress: (data: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => void;
};

type FakeFileSystemContract = EdgeModelManagerDeps['fs'];

class FakeFileSystem implements FakeFileSystemContract {
  documentDirectory: string | null = 'file:///documents/';

  readonly files = new Map<string, Uint8Array>();

  private readonly directories = new Set<string>();

  freeBytes = PAYLOAD.length * 2;

  readonly downloads: FakeDownload[] = [];

  payload = PAYLOAD;

  gate: Promise<void> | null = null;

  moves: { from: string; to: string }[] = [];

  readBytesChunk?: (uri: string, position: number, length: number) => Uint8Array;

  async getInfoAsync(uri: string) {
    if (this.directories.has(uri)) {
      return { exists: true, isDirectory: true };
    }
    const bytes = this.files.get(uri);
    return bytes
      ? { exists: true, size: bytes.length, isDirectory: false }
      : { exists: false };
  }

  async makeDirectoryAsync(uri: string) {
    this.directories.add(uri);
  }

  async readAsStringAsync(
    uri: string,
    options: { encoding: 'base64'; position: number; length: number }
  ) {
    const bytes = this.files.get(uri);
    if (!bytes) throw new Error(`Missing file: ${uri}`);
    return Buffer.from(
      bytes.slice(options.position, options.position + options.length)
    ).toString('base64');
  }

  async deleteAsync(uri: string) {
    this.files.delete(uri);
    this.directories.delete(uri);
  }

  async moveAsync(options: { from: string; to: string }) {
    const bytes = this.files.get(options.from);
    if (!bytes) throw new Error(`Missing file: ${options.from}`);
    this.files.delete(options.from);
    this.files.set(options.to, bytes);
    this.moves.push(options);
  }

  async getFreeDiskStorageAsync() {
    return this.freeBytes;
  }

  createDownloadResumable(
    url: string,
    fileUri: string,
    _options: Record<string, unknown>,
    progress: FakeDownload['progress'],
    resumeData?: string
  ) {
    const record: FakeDownload = { url, fileUri, progress, resumeData };
    this.downloads.push(record);
    let paused = false;
    let cancelled = false;
    const self = this;

    const writeNextChunk = () => {
      const current = self.files.get(fileUri) ?? new Uint8Array();
      if (current.length >= self.payload.length) return false;
      const end = Math.min(current.length + 4, self.payload.length);
      const next = new Uint8Array(end);
      next.set(current);
      next.set(self.payload.slice(current.length, end), current.length);
      self.files.set(fileUri, next);
      progress({
        totalBytesWritten: next.length,
        totalBytesExpectedToWrite: self.payload.length,
      });
      return true;
    };

    const run = async () => {
      if (self.gate) await self.gate;
      for (;;) {
        if (cancelled || paused) throw new Error('download interrupted');
        if (!writeNextChunk()) break;
        await Promise.resolve();
      }
      return { uri: fileUri };
    };

    return {
      downloadAsync: run,
      resumeAsync: run,
      pauseAsync: async () => {
        paused = true;
        const size = self.files.get(fileUri)?.length ?? 0;
        return { resumeData: `resume:${size}` };
      },
      cancelAsync: async () => {
        cancelled = true;
      },
      savable: () => ({ resumeData: 'resume:fallback' }),
    };
  }
}

function setup(overrides: Partial<EdgeModelManagerDeps> = {}) {
  const fs = new FakeFileSystem();
  const network = { isCellular: jest.fn(async () => false) };
  const manager = createEdgeModelManager({
    fs,
    network,
    models: [model()],
    hashChunkSize: 5,
    ...overrides,
  });
  const finalUri = 'file:///documents/assistant-models/tiny.gguf';
  const partialUri = 'file:///documents/assistant-models/tiny.gguf.partial';
  return { fs, network, manager, finalUri, partialUri };
}

describe('edge model manager', () => {
  it('refuses a download when free space is below 1.5x the model size', async () => {
    const { fs, manager, partialUri } = setup();
    fs.freeBytes = PAYLOAD.length * 1.5 - 1;

    await expect(manager.downloadModel('tiny')).rejects.toMatchObject({
      code: 'disk_space',
    });

    expect(fs.downloads).toHaveLength(0);
    expect(fs.files.has(partialUri)).toBe(false);
  });

  it('downloads, verifies SHA-256 and atomically moves the partial file', async () => {
    const { fs, manager, finalUri, partialUri } = setup();
    const progress: EdgeDownloadProgress[] = [];

    const path = await manager.downloadModel('tiny', {
      onProgress: (value) => progress.push(value),
    });

    expect(path).toBe(finalUri);
    expect(progress.some((entry) => entry.phase === 'downloading')).toBe(true);
    expect(progress.at(-1)).toMatchObject({
      phase: 'verifying',
      percent: 100,
    });
    expect(fs.moves).toEqual([{ from: partialUri, to: finalUri }]);
    expect(fs.files.get(finalUri)).toEqual(PAYLOAD);
    expect(fs.files.has(partialUri)).toBe(false);
    expect(await manager.getDownloadedModelPath('tiny')).toBe(finalUri);
    expect(await manager.listDownloadedModels()).toEqual([model()]);
    expect(await manager.getTotalEdgeStorageBytes()).toBe(PAYLOAD.length);
  });

  it('uses the injected native SHA-256 implementation when present', async () => {
    const hashFile = jest.fn(async () => digest(PAYLOAD));
    const { fs, manager, finalUri, partialUri } = setup({ hashFile });

    await manager.downloadModel('tiny');

    expect(hashFile).toHaveBeenCalledWith(partialUri);
    expect(fs.files.get(finalUri)).toEqual(PAYLOAD);
  });

  it('hashes through raw byte reads without the base64 bridge', async () => {
    const { fs, manager, finalUri } = setup();
    const readSpy = jest.spyOn(fs, 'readAsStringAsync');
    fs.readBytesChunk = (uri, position, length) => {
      const bytes = fs.files.get(uri);
      if (!bytes) throw new Error(`Missing file: ${uri}`);
      return bytes.slice(position, position + length);
    };

    await manager.downloadModel('tiny');

    expect(fs.files.get(finalUri)).toEqual(PAYLOAD);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('deletes the partial file when the checksum does not match', async () => {
    const { fs, manager, finalUri, partialUri } = setup();
    fs.payload = Uint8Array.from(PAYLOAD);
    fs.payload[0] = 99;

    await expect(manager.downloadModel('tiny')).rejects.toMatchObject({
      code: 'checksum',
    });

    expect(fs.files.has(partialUri)).toBe(false);
    expect(fs.files.has(finalUri)).toBe(false);
    expect(fs.moves).toHaveLength(0);
  });

  it('deletes the partial file when the downloaded size is wrong', async () => {
    const { fs, manager, finalUri, partialUri } = setup();
    fs.payload = PAYLOAD.slice(0, 8);

    await expect(manager.downloadModel('tiny')).rejects.toMatchObject({
      code: 'download',
    });

    expect(fs.files.has(partialUri)).toBe(false);
    expect(fs.files.has(finalUri)).toBe(false);
  });

  it('cancels an in-flight download and removes the partial file', async () => {
    const { fs, manager, partialUri } = setup();
    const controller = new AbortController();

    await expect(
      manager.downloadModel('tiny', {
        signal: controller.signal,
        onProgress: ({ bytesWritten }) => {
          if (bytesWritten >= 4) controller.abort();
        },
      })
    ).rejects.toMatchObject({ code: 'cancelled' });

    expect(fs.downloads).toHaveLength(1);
    expect(fs.files.has(partialUri)).toBe(false);
  });

  it('pauses and resumes from the retained partial file', async () => {
    const { fs, manager, finalUri, partialUri } = setup();
    let paused = false;

    await expect(
      manager.downloadModel('tiny', {
        onProgress: ({ bytesWritten }) => {
          if (!paused && bytesWritten >= 4) {
            paused = true;
            void manager.pauseModelDownload('tiny');
          }
        },
      })
    ).rejects.toMatchObject({ code: 'cancelled' });

    expect(fs.files.get(partialUri)?.length).toBe(4);
    expect(fs.downloads[0]?.resumeData).toBeUndefined();

    await manager.downloadModel('tiny');

    expect(fs.downloads[1]?.resumeData).toBe('resume:4');
    expect(fs.files.get(finalUri)).toEqual(PAYLOAD);
    expect(fs.files.has(partialUri)).toBe(false);
  });

  it('rejects a second download of the same model while active', async () => {
    const { fs, manager } = setup();
    let release!: () => void;
    fs.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = manager.downloadModel('tiny');
    while (fs.downloads.length === 0) await Promise.resolve();
    await expect(manager.downloadModel('tiny')).rejects.toMatchObject({
      code: 'download',
    });
    release();
    await first;
  });

  it('reports downloaded, partial and missing state', async () => {
    const { fs, manager, finalUri, partialUri } = setup();

    expect(await manager.getModelFileState('tiny')).toMatchObject({
      downloaded: false,
      partialBytes: null,
    });

    fs.files.set(partialUri, PAYLOAD.slice(0, 4));
    expect(await manager.getModelFileState('tiny')).toMatchObject({
      downloaded: false,
      partialBytes: 4,
    });

    fs.files.set(finalUri, PAYLOAD);
    fs.files.delete(partialUri);
    expect(await manager.getModelFileState('tiny')).toMatchObject({
      downloaded: true,
      partialBytes: null,
    });
  });

  it('does not treat a truncated final file as downloaded', async () => {
    const { fs, manager, finalUri } = setup();
    fs.files.set(finalUri, PAYLOAD.slice(0, 4));

    expect(await manager.listDownloadedModels()).toEqual([]);
    expect(await manager.getTotalEdgeStorageBytes()).toBe(4);
    await expect(manager.getDownloadedModelPath('tiny')).rejects.toMatchObject({
      code: 'missing',
    });
  });

  it('deletes a downloaded model and its partial file', async () => {
    const { fs, manager, finalUri, partialUri } = setup();
    fs.files.set(finalUri, PAYLOAD);
    fs.files.set(partialUri, PAYLOAD.slice(0, 4));

    await manager.deleteModel('tiny');

    expect(fs.files.has(finalUri)).toBe(false);
    expect(fs.files.has(partialUri)).toBe(false);
    expect(await manager.listDownloadedModels()).toEqual([]);
  });

  it('reports unsupported when there is no document directory', async () => {
    const fs = new FakeFileSystem();
    fs.documentDirectory = null;
    const manager = createEdgeModelManager({
      fs,
      network: { isCellular: async () => false },
      models: [model()],
    });

    expect(await manager.listDownloadedModels()).toEqual([]);
    await expect(manager.downloadModel('tiny')).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('exposes the cellular network state', async () => {
    const { network, manager } = setup();
    network.isCellular.mockResolvedValue(true);
    await expect(manager.isCellularConnection()).resolves.toBe(true);
  });

  it('wraps unknown models as a missing-model error', async () => {
    const { manager } = setup();
    await expect(manager.downloadModel('nope')).rejects.toMatchObject({
      code: 'missing',
    });
  });

  it('creates EdgeModelError instances with stable names', () => {
    const error = new EdgeModelError('checksum', 'bad');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EdgeModelError');
  });
});
