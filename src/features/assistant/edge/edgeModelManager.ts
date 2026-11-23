import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { sha256 } from 'js-sha256';

import { readNativeBytesChunk } from './nativeFileChunk';
import { nativeSha256File } from './nativeSha256';

import { EDGE_MODELS, type EdgeModel } from '../../../constants/edgeModels';

export type EdgeModelErrorCode =
  | 'unsupported'
  | 'disk_space'
  | 'network'
  | 'download'
  | 'checksum'
  | 'missing'
  | 'cancelled'
  | 'io';

export class EdgeModelError extends Error {
  readonly code: EdgeModelErrorCode;

  constructor(code: EdgeModelErrorCode, message: string) {
    super(message);
    this.name = 'EdgeModelError';
    this.code = code;
  }
}

export type EdgeDownloadPhase = 'downloading' | 'verifying';

export type EdgeDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  percent: number;
  phase: EdgeDownloadPhase;
};

export type EdgeDownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: EdgeDownloadProgress) => void;
};

export type EdgeModelFileState = {
  model: EdgeModel;
  downloaded: boolean;
  partialBytes: number | null;
};

export type EdgeFileInfo = {
  exists: boolean;
  size?: number;
  isDirectory?: boolean;
};

export type EdgeDownloadHandle = {
  downloadAsync: () => Promise<{ uri: string } | undefined>;
  pauseAsync: () => Promise<{ resumeData?: string } | undefined>;
  resumeAsync: () => Promise<{ uri: string } | undefined>;
  cancelAsync: () => Promise<void>;
  savable: () => { resumeData?: string } | undefined;
};

export type EdgeModelManagerFileSystem = {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<EdgeFileInfo>;
  makeDirectoryAsync: (
    uri: string,
    options?: { intermediates?: boolean }
  ) => Promise<void>;
  readAsStringAsync: (
    uri: string,
    options: { encoding: 'base64'; position: number; length: number }
  ) => Promise<string>;
  readBytesChunk?: (uri: string, position: number, length: number) => Uint8Array;
  deleteAsync: (
    uri: string,
    options?: { idempotent?: boolean }
  ) => Promise<void>;
  moveAsync: (options: { from: string; to: string }) => Promise<void>;
  getFreeDiskStorageAsync: () => Promise<number>;
  createDownloadResumable: (
    url: string,
    fileUri: string,
    options: Record<string, unknown>,
    callback: (data: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void,
    resumeData?: string
  ) => EdgeDownloadHandle;
};

export type EdgeModelManagerNetwork = {
  isCellular: () => Promise<boolean>;
};

export type EdgeModelManagerDeps = {
  fs: EdgeModelManagerFileSystem;
  network: EdgeModelManagerNetwork;
  models?: readonly EdgeModel[];
  hashFile?: (uri: string) => Promise<string>;
  hashChunkSize?: number;
};

type ActiveDownload = {
  handle: EdgeDownloadHandle;
  paused: boolean;
  cancelled: boolean;
};

const DEFAULT_HASH_CHUNK_SIZE = 4 * 1024 * 1024;

const defaultFileSystem: EdgeModelManagerFileSystem = {
  documentDirectory: FileSystem.documentDirectory,
  getInfoAsync: (uri) =>
    FileSystem.getInfoAsync(uri) as Promise<EdgeFileInfo>,
  makeDirectoryAsync: (uri, options) =>
    FileSystem.makeDirectoryAsync(uri, options),
  readAsStringAsync: (uri, options) =>
    FileSystem.readAsStringAsync(uri, options),
  readBytesChunk: readNativeBytesChunk,
  deleteAsync: (uri, options) => FileSystem.deleteAsync(uri, options),
  moveAsync: (options) => FileSystem.moveAsync(options),
  getFreeDiskStorageAsync: () => FileSystem.getFreeDiskStorageAsync(),
  createDownloadResumable: (url, fileUri, options, callback, resumeData) =>
    FileSystem.createDownloadResumable(
      url,
      fileUri,
      options as never,
      callback as never,
      resumeData
    ) as unknown as EdgeDownloadHandle,
};

const defaultNetwork: EdgeModelManagerNetwork = {
  isCellular: async () => {
    const state = await Network.getNetworkStateAsync();
    return (
      state.type === Network.NetworkStateType.CELLULAR &&
      state.isConnected !== false
    );
  },
};

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

function decodeBase64(value: string): Uint8Array {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 61) end -= 1;
  const output = new Uint8Array(Math.floor((end * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (let index = 0; index < end; index += 1) {
    const decoded = BASE64_LOOKUP[value.charCodeAt(index)] ?? -1;
    if (decoded < 0) continue;
    buffer = (buffer << 6) | decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return offset === output.length ? output : output.slice(0, offset);
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function createEdgeModelManager(deps: EdgeModelManagerDeps) {
  const models = deps.models ?? EDGE_MODELS;
  const modelById = new Map(models.map((model) => [model.id, model]));
  const modelsDirectory = deps.fs.documentDirectory
    ? `${deps.fs.documentDirectory}assistant-models/`
    : null;
  const hashChunkSize = deps.hashChunkSize ?? DEFAULT_HASH_CHUNK_SIZE;
  const active = new Map<string, ActiveDownload>();
  const resumeDataById = new Map<string, string>();

  function requireModel(id: string): EdgeModel {
    const model = modelById.get(id);
    if (!model) {
      throw new EdgeModelError('missing', `Unknown model: ${id}`);
    }
    return model;
  }

  function requireDirectory(): string {
    if (!modelsDirectory) {
      throw new EdgeModelError(
        'unsupported',
        'On-device models are not available on this platform.'
      );
    }
    return modelsDirectory;
  }

  function finalUri(id: string): string {
    return `${requireDirectory()}${id}.gguf`;
  }

  function partialUri(id: string): string {
    return `${requireDirectory()}${id}.gguf.partial`;
  }

  async function ensureDirectory(): Promise<void> {
    const directory = requireDirectory();
    const info = await deps.fs.getInfoAsync(directory);
    if (!info.exists) {
      await deps.fs.makeDirectoryAsync(directory, { intermediates: true });
    }
  }

  async function hashFile(
    uri: string,
    size: number,
    signal?: AbortSignal
  ): Promise<string> {
    const hash = sha256.create();
    for (let position = 0; position < size; position += hashChunkSize) {
      if (signal?.aborted) {
        throw new EdgeModelError('cancelled', 'The download was cancelled.');
      }
      const length = Math.min(hashChunkSize, size - position);
      if (deps.fs.readBytesChunk) {
        hash.update(deps.fs.readBytesChunk(uri, position, length));
      } else {
        const encoded = await deps.fs.readAsStringAsync(uri, {
          encoding: 'base64',
          position,
          length,
        });
        hash.update(decodeBase64(encoded));
      }
      await nextTick();
    }
    return hash.hex();
  }

  async function listDownloadedModels(): Promise<EdgeModel[]> {
    const downloaded: EdgeModel[] = [];
    for (const model of models) {
      try {
        const info = await deps.fs.getInfoAsync(finalUri(model.id));
        if (
          info.exists &&
          (info.size === undefined || info.size === model.downloadSizeBytes)
        ) {
          downloaded.push(model);
        }
      } catch {
        // A missing document directory means no models are downloaded.
      }
    }
    return downloaded;
  }

  async function getModelFileState(
    id: string
  ): Promise<EdgeModelFileState> {
    const model = requireModel(id);
    const [finalInfo, partialInfo] = await Promise.all([
      deps.fs
        .getInfoAsync(finalUri(id))
        .catch((): EdgeFileInfo => ({ exists: false })),
      deps.fs
        .getInfoAsync(partialUri(id))
        .catch((): EdgeFileInfo => ({ exists: false })),
    ]);
    return {
      model,
      downloaded:
        finalInfo.exists &&
        (finalInfo.size === undefined ||
          finalInfo.size === model.downloadSizeBytes),
      partialBytes:
        partialInfo.exists && typeof partialInfo.size === 'number'
          ? partialInfo.size
          : null,
    };
  }

  async function getDownloadedModelPath(id: string): Promise<string> {
    const model = requireModel(id);
    const info = await deps.fs.getInfoAsync(finalUri(id));
    if (
      !info.exists ||
      (info.size !== undefined && info.size !== model.downloadSizeBytes)
    ) {
      throw new EdgeModelError(
        'missing',
        'Download this model before using it.'
      );
    }
    return finalUri(id);
  }

  async function downloadModel(
    id: string,
    options: EdgeDownloadOptions = {}
  ): Promise<string> {
    const model = requireModel(id);
    if (active.has(id)) {
      throw new EdgeModelError(
        'download',
        'This model is already downloading.'
      );
    }
    await ensureDirectory();

    const target = finalUri(id);
    const partial = partialUri(id);
    const finalInfo = await deps.fs.getInfoAsync(target);
    if (
      finalInfo.exists &&
      (finalInfo.size === undefined ||
        finalInfo.size === model.downloadSizeBytes)
    ) {
      return target;
    }
    if (finalInfo.exists) {
      await deps.fs.deleteAsync(target, { idempotent: true });
    }

    const freeBytes = await deps.fs.getFreeDiskStorageAsync();
    if (freeBytes < model.downloadSizeBytes * 1.5) {
      throw new EdgeModelError(
        'disk_space',
        'Not enough free space for this download.'
      );
    }

    let partialInfo = await deps.fs.getInfoAsync(partial);
    let resumeData = resumeDataById.get(id);
    if (partialInfo.exists && !resumeData) {
      await deps.fs.deleteAsync(partial, { idempotent: true });
      partialInfo = { exists: false };
    }

    const state: ActiveDownload = {
      handle: undefined as unknown as EdgeDownloadHandle,
      paused: false,
      cancelled: false,
    };
    state.handle = deps.fs.createDownloadResumable(
      model.downloadUrl,
      partial,
      {},
      (data) => {
        if (state.cancelled || state.paused) return;
        const totalBytes =
          data.totalBytesExpectedToWrite > 0
            ? data.totalBytesExpectedToWrite
            : model.downloadSizeBytes;
        options.onProgress?.({
          bytesWritten: data.totalBytesWritten,
          totalBytes,
          percent:
            totalBytes > 0
              ? Math.min(100, (data.totalBytesWritten / totalBytes) * 100)
              : 0,
          phase: 'downloading',
        });
      },
      resumeData
    );
    active.set(id, state);

    const onAbort = () => {
      state.cancelled = true;
      void state.handle.cancelAsync();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const result = resumeData
        ? await state.handle.resumeAsync()
        : await state.handle.downloadAsync();
      if (state.paused) {
        throw new EdgeModelError('cancelled', 'The download was paused.');
      }
      if (state.cancelled || options.signal?.aborted || !result?.uri) {
        throw new EdgeModelError('cancelled', 'The download was cancelled.');
      }

      const downloaded = await deps.fs.getInfoAsync(partial);
      if (
        !downloaded.exists ||
        (downloaded.size !== undefined &&
          downloaded.size !== model.downloadSizeBytes)
      ) {
        throw new EdgeModelError(
          'download',
          'The downloaded file size does not match the catalog.'
        );
      }

      options.onProgress?.({
        bytesWritten: model.downloadSizeBytes,
        totalBytes: model.downloadSizeBytes,
        percent: 100,
        phase: 'verifying',
      });
      if (options.signal?.aborted) {
        throw new EdgeModelError('cancelled', 'The download was cancelled.');
      }
      let digest: string;
      if (deps.hashFile) {
        try {
          digest = await deps.hashFile(partial);
        } catch (error) {
          // A missing native module must not crash a completed download.
          console.warn(
            '[edge] Native SHA-256 unavailable; using the JavaScript fallback.',
            error
          );
          digest = await hashFile(
            partial,
            model.downloadSizeBytes,
            options.signal
          );
        }
      } else {
        digest = await hashFile(
          partial,
          model.downloadSizeBytes,
          options.signal
        );
      }
      if (options.signal?.aborted) {
        throw new EdgeModelError('cancelled', 'The download was cancelled.');
      }
      if (digest.toLowerCase() !== model.sha256.toLowerCase()) {
        throw new EdgeModelError(
          'checksum',
          'The downloaded model failed integrity verification.'
        );
      }

      await deps.fs.deleteAsync(target, { idempotent: true });
      await deps.fs.moveAsync({ from: partial, to: target });
      resumeDataById.delete(id);
      return target;
    } catch (error) {
      if (state.paused || state.cancelled || options.signal?.aborted) {
        if (!state.paused) {
          await deps.fs
            .deleteAsync(partial, { idempotent: true })
            .catch(() => undefined);
          resumeDataById.delete(id);
        }
        throw new EdgeModelError(
          'cancelled',
          state.paused ? 'The download was paused.' : 'The download was cancelled.'
        );
      }
      await deps.fs.deleteAsync(partial, { idempotent: true }).catch(() => undefined);
      resumeDataById.delete(id);
      if (error instanceof EdgeModelError) throw error;
      throw new EdgeModelError(
        'download',
        'The model could not be downloaded.'
      );
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      active.delete(id);
    }
  }

  async function pauseModelDownload(id: string): Promise<void> {
    const state = active.get(id);
    if (!state) return;
    state.paused = true;
    const result = await state.handle.pauseAsync();
    const resumeData =
      result?.resumeData ?? state.handle.savable()?.resumeData ?? undefined;
    if (resumeData) {
      resumeDataById.set(id, resumeData);
    }
    active.delete(id);
  }

  async function cancelModelDownload(id: string): Promise<void> {
    const state = active.get(id);
    if (state) {
      state.cancelled = true;
      await state.handle.cancelAsync().catch(() => undefined);
      active.delete(id);
    }
    resumeDataById.delete(id);
    await deps.fs
      .deleteAsync(partialUri(id), { idempotent: true })
      .catch(() => undefined);
  }

  async function deleteModel(id: string): Promise<void> {
    await cancelModelDownload(id);
    await deps.fs
      .deleteAsync(finalUri(id), { idempotent: true })
      .catch(() => undefined);
  }

  async function getTotalEdgeStorageBytes(): Promise<number> {
    let total = 0;
    for (const model of models) {
      try {
        const info = await deps.fs.getInfoAsync(finalUri(model.id));
        if (info.exists) total += info.size ?? model.downloadSizeBytes;
      } catch {
        // No storage directory yet.
      }
    }
    return total;
  }

  return {
    listDownloadedModels,
    getDownloadedModelPath,
    getModelFileState,
    downloadModel,
    pauseModelDownload,
    cancelModelDownload,
    deleteModel,
    getTotalEdgeStorageBytes,
    isCellularConnection: () => deps.network.isCellular(),
  };
}

export const edgeModelManager = createEdgeModelManager({
  fs: defaultFileSystem,
  network: defaultNetwork,
  models: EDGE_MODELS,
  hashFile: nativeSha256File,
});
