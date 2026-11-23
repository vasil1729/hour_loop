import type { TranslationKey } from '../i18n/types';

/**
 * The only on-device models Hour Loop offers. Artifacts are downloaded on
 * demand and are never bundled in the APK.
 *
 * Every URL is pinned to an immutable Hugging Face revision. Sizes and
 * SHA-256 values were read from the Hugging Face LFS metadata for those
 * revisions. If a file is re-uploaded, update the revision, size and hash
 * together.
 */
export type EdgeModelRamTier = '4gb' | '6gb';

export type EdgeModel = {
  id: string;
  displayName: string;
  ramTier: EdgeModelRamTier;
  minRamGb: number;
  downloadSizeBytes: number;
  estimatedRamMb: number;
  contextLimit: number;
  maxOutputTokens: number;
  downloadUrl: string;
  revision: string;
  sha256: string;
  supportsNativeToolCalls: boolean;
  license: string;
  licenseUrl: string;
  noteKey?: TranslationKey;
};

const HF = 'https://huggingface.co';

export const EDGE_MODELS: readonly EdgeModel[] = [
  {
    id: 'qwen3.5-0.8b',
    displayName: 'Qwen3.5 0.8B',
    ramTier: '4gb',
    minRamGb: 4,
    downloadSizeBytes: 532_517_120,
    estimatedRamMb: 1024,
    contextLimit: 2048,
    maxOutputTokens: 512,
    downloadUrl: `${HF}/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf`,
    revision: '6ab461498e2023f6e3c1baea90a8f0fe38ab64d0',
    sha256:
      'bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517',
    supportsNativeToolCalls: true,
    license: 'Apache-2.0',
    licenseUrl: `${HF}/unsloth/Qwen3.5-0.8B-GGUF`,
    noteKey: 'settings.edgeNoteQwen08',
  },
  {
    id: 'lfm2.5-1.2b',
    displayName: 'LFM2.5 1.2B',
    ramTier: '4gb',
    minRamGb: 4,
    downloadSizeBytes: 730_895_168,
    estimatedRamMb: 1280,
    contextLimit: 2048,
    maxOutputTokens: 512,
    downloadUrl: `${HF}/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-Q4_K_M.gguf`,
    revision: '8ed288026e23958ad9dfa92d53ed773a8eee7125',
    sha256:
      'b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5',
    supportsNativeToolCalls: true,
    license: 'LFM Open License v1.0',
    licenseUrl: `${HF}/LiquidAI/LFM2.5-1.2B-Instruct-GGUF`,
    noteKey: 'settings.edgeNoteLfm',
  },
  {
    id: 'qwen3.5-2b',
    displayName: 'Qwen3.5 2B',
    ramTier: '6gb',
    minRamGb: 6,
    downloadSizeBytes: 1_280_835_840,
    estimatedRamMb: 2048,
    contextLimit: 3072,
    maxOutputTokens: 768,
    downloadUrl: `${HF}/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf`,
    revision: 'f6d5376be1edb4d416d56da11e5397a961aca8ae',
    sha256:
      'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    supportsNativeToolCalls: true,
    license: 'Apache-2.0',
    licenseUrl: `${HF}/unsloth/Qwen3.5-2B-GGUF`,
    noteKey: 'settings.edgeNoteQwen2',
  },
  {
    id: 'gemma-4-e2b',
    displayName: 'Gemma 4 E2B',
    ramTier: '6gb',
    minRamGb: 6,
    downloadSizeBytes: 3_106_738_272,
    estimatedRamMb: 5120,
    contextLimit: 3072,
    maxOutputTokens: 768,
    downloadUrl: `${HF}/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf`,
    revision: '0314792d7f1f7e229411f620751375812bb9faf2',
    sha256:
      '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8',
    supportsNativeToolCalls: true,
    license: 'Gemma Terms of Use',
    licenseUrl: 'https://ai.google.dev/gemma/docs/gemma_4_license',
    noteKey: 'settings.edgeNoteGemma',
  },
] as const;

export const EDGE_MODELS_BY_ID: Record<string, EdgeModel> = Object.fromEntries(
  EDGE_MODELS.map((model) => [model.id, model])
);

export const EDGE_MODEL_TIERS: Record<
  EdgeModelRamTier,
  { labelKey: string; models: readonly EdgeModel[] }
> = {
  '4gb': {
    labelKey: 'settings.edgeTierLight',
    models: EDGE_MODELS.filter((model) => model.ramTier === '4gb'),
  },
  '6gb': {
    labelKey: 'settings.edgeTierBalanced',
    models: EDGE_MODELS.filter((model) => model.ramTier === '6gb'),
  },
};

export const DEFAULT_EDGE_MODEL_ID = EDGE_MODELS[0]!.id;

export function getEdgeModel(id: string): EdgeModel {
  const model = EDGE_MODELS_BY_ID[id];
  if (!model) {
    throw new Error(`Unknown on-device model: ${id}`);
  }
  return model;
}

export function isEdgeModelId(id: string): boolean {
  return Boolean(EDGE_MODELS_BY_ID[id]);
}

export function formatEdgeModelSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  return `${Math.round(bytes / 1_000)} KB`;
}
