import type { ScopeModelInfo } from './scopeTypes';
import {
  SCOPE_FEATURE_BUCKETS,
  extractScopeFeatures,
} from './scopeFeatures';
import { SCOPE_MODEL_DATA } from './scopeModelData.generated';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(value: string): Uint8Array {
  let padding = 0;
  let end = value.length;
  while (end > 0 && value[end - 1] === '=') {
    padding += 1;
    end -= 1;
  }
  const output = new Uint8Array(Math.floor((end * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (let index = 0; index < end; index += 1) {
    const character = value[index];
    if (!character) continue;
    const decoded = BASE64_ALPHABET.indexOf(character);
    if (decoded < 0) continue;
    buffer = (buffer << 6) | decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return padding > 0 ? output.slice(0, offset) : output;
}

type RuntimeModel = {
  weights: Int8Array;
  scale: number;
  bias: number;
  temperature: number;
  inScopeThreshold: number;
  outOfScopeThreshold: number;
  info: ScopeModelInfo;
};

let runtimeModel: RuntimeModel | null = null;

function loadModel(): RuntimeModel {
  if (runtimeModel) return runtimeModel;
  const bytes = decodeBase64(SCOPE_MODEL_DATA.weightsBase64);
  if (bytes.byteLength !== SCOPE_MODEL_DATA.featureBuckets) {
    throw new Error('Scope model weight size does not match its bucket count.');
  }
  const weights = new Int8Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  runtimeModel = {
    weights,
    scale: SCOPE_MODEL_DATA.scale,
    bias: SCOPE_MODEL_DATA.bias,
    temperature: SCOPE_MODEL_DATA.temperature,
    inScopeThreshold: SCOPE_MODEL_DATA.inScopeThreshold,
    outOfScopeThreshold: SCOPE_MODEL_DATA.outOfScopeThreshold,
    info: {
      version: SCOPE_MODEL_DATA.version,
      featureBuckets: SCOPE_MODEL_DATA.featureBuckets,
      modelBytes: bytes.byteLength,
      trainingSamples: SCOPE_MODEL_DATA.training.samples,
    },
  };
  return runtimeModel;
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

/** Returns the calibrated probability that a single text segment is in scope. */
export function predictScopeProbability(text: string): number {
  const model = loadModel();
  const features = extractScopeFeatures(text);
  if (features.length === 0) return 0.5;
  let sum = 0;
  for (const feature of features) {
    sum += model.weights[feature] ?? 0;
  }
  const logit =
    model.bias +
    (model.scale * sum) / Math.sqrt(Math.max(1, features.length));
  return sigmoid(logit / model.temperature);
}

export function getScopeModelThresholds(): {
  inScope: number;
  outOfScope: number;
} {
  const model = loadModel();
  return {
    inScope: model.inScopeThreshold,
    outOfScope: model.outOfScopeThreshold,
  };
}

export function getScopeModelInfo(): ScopeModelInfo {
  return loadModel().info;
}

/** Test-only lifecycle reset; production loads the model once per app session. */
export function resetScopeModelForTests(): void {
  runtimeModel = null;
}

export const SCOPE_MODEL_BUCKETS = SCOPE_FEATURE_BUCKETS;
