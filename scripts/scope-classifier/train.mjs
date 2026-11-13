#!/usr/bin/env node
/**
 * Train the compact, dependency-free Hour Loop scope classifier.
 *
 * Run from the repository root:
 *   node --experimental-strip-types scripts/scope-classifier/train.mjs
 *
 * The core model is a binary (in-scope vs out-of-scope) linear logistic
 * classifier over hashed word/character n-grams. MIXED and AMBIGUOUS are
 * composed at runtime from clause splitting and calibrated confidence bands.
 *
 * This script writes:
 *   - src/features/assistant/scope/scopeModelData.generated.ts
 *   - scripts/scope-classifier/report.json
 *
 * The dataset is synthetic and authored for this repository. No private user
 * conversations are used.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCOPE_FEATURE_BUCKETS,
  extractScopeFeatures,
} from '../../src/features/assistant/scope/scopeFeatures.ts';
import {
  LABELS,
  LABEL_NAMES,
  buildScopeDataset,
} from './dataset.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUTPUT_MODEL = path.join(
  ROOT,
  'src/features/assistant/scope/scopeModelData.generated.ts'
);
const OUTPUT_REPORT = path.join(__dirname, 'report.json');
const OUTPUT_TEST_SAMPLES = path.join(__dirname, 'test-samples.json');

const EPOCHS = 40;
const LEARNING_RATE = 0.8;
const L2 = 1e-2;
const RANDOM_SEED = 0x5eed1234;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function score(features, weights, bias) {
  const norm = Math.sqrt(Math.max(1, features.length));
  let sum = 0;
  for (const feature of features) sum += weights[feature];
  return bias + sum / norm;
}

function probability(features, weights, bias, temperature) {
  return sigmoid(score(features, weights, bias) / temperature);
}

function evaluate(samples, weights, bias, temperature, inThreshold, outThreshold) {
  const matrix = {
    IN_SCOPE: { IN_SCOPE: 0, OUT_OF_SCOPE: 0, AMBIGUOUS: 0 },
    OUT_OF_SCOPE: { IN_SCOPE: 0, OUT_OF_SCOPE: 0, AMBIGUOUS: 0 },
  };
  const perLanguage = new Map();
  let correct = 0;
  let inTotal = 0;
  let outTotal = 0;
  let falseAccept = 0;
  let falseReject = 0;

  for (const sample of samples) {
    if (sample.label !== LABELS.IN_SCOPE && sample.label !== LABELS.OUT_OF_SCOPE) {
      continue;
    }
    const p = probability(sample.features, weights, bias, temperature);
    const predicted =
      p >= inThreshold
        ? 'IN_SCOPE'
        : p <= outThreshold
          ? 'OUT_OF_SCOPE'
          : 'AMBIGUOUS';
    const expected = LABEL_NAMES[sample.label];
    matrix[expected][predicted] += 1;
    if (predicted === expected) correct += 1;
    if (sample.label === LABELS.IN_SCOPE) inTotal += 1;
    if (sample.label === LABELS.OUT_OF_SCOPE) outTotal += 1;
    if (predicted === 'IN_SCOPE' && sample.label !== LABELS.IN_SCOPE) {
      falseAccept += 1;
    }
    if (predicted !== 'IN_SCOPE' && sample.label === LABELS.IN_SCOPE) {
      falseReject += 1;
    }

    const entry =
      perLanguage.get(sample.lang) ?? {
        total: 0,
        correct: 0,
        falseAccept: 0,
        falseReject: 0,
      };
    entry.total += 1;
    if (predicted === expected) entry.correct += 1;
    if (predicted === 'IN_SCOPE' && sample.label !== LABELS.IN_SCOPE) {
      entry.falseAccept += 1;
    }
    if (predicted !== 'IN_SCOPE' && sample.label === LABELS.IN_SCOPE) {
      entry.falseReject += 1;
    }
    perLanguage.set(sample.lang, entry);
  }

  const total = Object.values(matrix).reduce(
    (sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0),
    0
  );
  return {
    total,
    accuracy: total ? correct / total : 0,
    falseAcceptRate: outTotal ? falseAccept / outTotal : 0,
    falseRejectRate: inTotal ? falseReject / inTotal : 0,
    confusionMatrix: matrix,
    perLanguage: Object.fromEntries(
      Array.from(perLanguage.entries()).map(([language, entry]) => [
        language,
        {
          total: entry.total,
          accuracy: entry.total ? entry.correct / entry.total : 0,
          falseAcceptRate: entry.total
            ? entry.falseAccept / entry.total
            : 0,
          falseRejectRate: entry.total
            ? entry.falseReject / entry.total
            : 0,
        },
      ])
    ),
  };
}

function calibrateTemperature(samples, weights, bias) {
  let bestTemperature = 1;
  let bestLoss = Number.POSITIVE_INFINITY;
  for (let temperature = 0.4; temperature <= 3.0001; temperature += 0.05) {
    let loss = 0;
    let count = 0;
    for (const sample of samples) {
      if (sample.label !== LABELS.IN_SCOPE && sample.label !== LABELS.OUT_OF_SCOPE) {
        continue;
      }
      const p = probability(sample.features, weights, bias, temperature);
      const expected = sample.label === LABELS.IN_SCOPE ? 1 : 0;
      loss -= Math.log(
        Math.max(1e-9, expected ? p : 1 - p)
      );
      count += 1;
    }
    loss /= Math.max(1, count);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestTemperature = temperature;
    }
  }
  return { temperature: bestTemperature, loss: bestLoss };
}

function calibrateThresholds(samples, weights, bias, temperature) {
  let best = {
    inThreshold: 0.7,
    outThreshold: 0.3,
    score: -Infinity,
    evaluation: null,
  };
  for (let inThreshold = 0.5; inThreshold <= 0.9501; inThreshold += 0.01) {
    for (let outThreshold = 0.05; outThreshold < inThreshold; outThreshold += 0.01) {
      const evaluation = evaluate(
        samples,
        weights,
        bias,
        temperature,
        inThreshold,
        outThreshold
      );
      // Security-first: false acceptance of an out-of-scope request is five
      // times as costly as sending a valid request to local clarification.
      const score =
        evaluation.accuracy -
        evaluation.falseAcceptRate * 5 -
        evaluation.falseRejectRate * 0.25;
      if (score > best.score) {
        best = {
          inThreshold: Number(inThreshold.toFixed(2)),
          outThreshold: Number(outThreshold.toFixed(2)),
          score,
          evaluation,
        };
      }
    }
  }
  return best;
}

function quantize(weights) {
  let maxAbs = 0;
  for (const value of weights) maxAbs = Math.max(maxAbs, Math.abs(value));
  const scale = maxAbs > 0 ? maxAbs / 127 : 1;
  const quantized = new Int8Array(weights.length);
  for (let index = 0; index < weights.length; index += 1) {
    quantized[index] = Math.max(
      -127,
      Math.min(127, Math.round(weights[index] / scale))
    );
  }
  return { quantized, scale };
}

function dequantize(quantized, scale) {
  const weights = new Float32Array(quantized.length);
  for (let index = 0; index < quantized.length; index += 1) {
    weights[index] = quantized[index] * scale;
  }
  return weights;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const dataset = buildScopeDataset();
for (const sample of dataset) {
  sample.features = extractScopeFeatures(sample.text);
}
const train = dataset.filter(
  (sample) =>
    sample.split === 'train' &&
    (sample.label === LABELS.IN_SCOPE || sample.label === LABELS.OUT_OF_SCOPE)
);
const validation = dataset.filter(
  (sample) =>
    sample.split === 'validation' &&
    (sample.label === LABELS.IN_SCOPE || sample.label === LABELS.OUT_OF_SCOPE)
);
const test = dataset.filter(
  (sample) =>
    sample.split === 'test' &&
    (sample.label === LABELS.IN_SCOPE || sample.label === LABELS.OUT_OF_SCOPE)
);
const fullTest = dataset.filter((sample) => sample.split === 'test');

if (!train.length || !validation.length || !test.length) {
  throw new Error('Dataset split produced an empty partition.');
}

const trainIn = train.filter((sample) => sample.label === LABELS.IN_SCOPE).length;
const trainOut = train.length - trainIn;
const weightIn = train.length / (2 * Math.max(1, trainIn));
const weightOut = train.length / (2 * Math.max(1, trainOut));

const weights = new Float32Array(SCOPE_FEATURE_BUCKETS);
const adagrad = new Float32Array(SCOPE_FEATURE_BUCKETS).fill(1e-8);
let bias = 0;
let biasAdagrad = 1e-8;
const random = mulberry32(RANDOM_SEED);

for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
  shuffle(train, random);
  for (const sample of train) {
    const features = sample.features;
    if (!features.length) continue;
    const norm = Math.sqrt(Math.max(1, features.length));
    const p = sigmoid(score(features, weights, bias));
    const expected = sample.label === LABELS.IN_SCOPE ? 1 : 0;
    const classWeight =
      sample.label === LABELS.IN_SCOPE ? weightIn : weightOut;
    const gradient = (p - expected) * classWeight;
    if (Math.abs(gradient) < 1e-9) continue;

    biasAdagrad += gradient * gradient;
    bias -= (LEARNING_RATE * gradient) / Math.sqrt(biasAdagrad);
    for (const feature of features) {
      const value = gradient / norm + L2 * weights[feature];
      adagrad[feature] += value * value;
      weights[feature] -=
        (LEARNING_RATE * value) / Math.sqrt(adagrad[feature]);
    }
  }
}

const calibration = calibrateTemperature(validation, weights, bias);
const thresholds = calibrateThresholds(
  validation,
  weights,
  bias,
  calibration.temperature
);
const { quantized, scale } = quantize(weights);
const runtimeWeights = dequantize(quantized, scale);
const quantizedValidation = evaluate(
  validation,
  runtimeWeights,
  bias,
  calibration.temperature,
  thresholds.inThreshold,
  thresholds.outThreshold
);
const quantizedTest = evaluate(
  test,
  runtimeWeights,
  bias,
  calibration.temperature,
  thresholds.inThreshold,
  thresholds.outThreshold
);
const trainEvaluation = evaluate(
  train,
  runtimeWeights,
  bias,
  calibration.temperature,
  thresholds.inThreshold,
  thresholds.outThreshold
);

const base64 = Buffer.from(
  quantized.buffer,
  quantized.byteOffset,
  quantized.byteLength
).toString('base64');
const chunks = base64.match(/.{1,120}/g) ?? [];
const modelSource = `// AUTO-GENERATED by scripts/scope-classifier/train.mjs. Do not edit by hand.
// Model: hashed multilingual word/character n-gram linear logistic classifier.
// Training data: synthetic, repository-authored; no private user data.
// License: AGPL-3.0-or-later (same as this repository).

export const SCOPE_MODEL_DATA = {
  version: 1,
  featureBuckets: ${SCOPE_FEATURE_BUCKETS},
  weightsBase64: [
${chunks.map((chunk) => `    '${chunk}',`).join('\n')}
  ].join(''),
  scale: ${Number(scale.toFixed(8))},
  bias: ${Number(bias.toFixed(7))},
  temperature: ${Number(calibration.temperature.toFixed(3))},
  inScopeThreshold: ${thresholds.inThreshold},
  outOfScopeThreshold: ${thresholds.outThreshold},
  training: {
    samples: ${dataset.length},
    binaryTrainSamples: ${train.length},
    binaryValidationSamples: ${validation.length},
    binaryTestSamples: ${test.length},
    epochs: ${EPOCHS},
    randomSeed: ${RANDOM_SEED},
  },
} as const;
`;
fs.writeFileSync(OUTPUT_MODEL, modelSource, 'utf8');

const report = {
  generatedAt: new Date().toISOString(),
  model:
    'hashed multilingual word/char n-gram linear logistic classifier (int8); MIXED/AMBIGUOUS composed at runtime',
  dataset: {
    total: dataset.length,
    train: dataset.filter((sample) => sample.split === 'train').length,
    validation: dataset.filter((sample) => sample.split === 'validation').length,
    test: fullTest.length,
    languages: Object.fromEntries(
      Array.from(
        dataset.reduce((counts, sample) => {
          counts.set(sample.lang, (counts.get(sample.lang) ?? 0) + 1);
          return counts;
        }, new Map())
      )
    ),
    labelCounts: LABEL_NAMES.map((name, index) => ({
      label: name,
      count: dataset.filter((sample) => sample.label === index).length,
    })),
    provenance:
      'Synthetic examples authored for this repository; no private conversations; AGPL-3.0-or-later.',
  },
  modelSizeBytes: Buffer.from(
    quantized.buffer,
    quantized.byteOffset,
    quantized.byteLength
  ).length,
  weightsBase64Chars: base64.length,
  temperature: calibration.temperature,
  validationNll: calibration.loss,
  inScopeThreshold: thresholds.inThreshold,
  outOfScopeThreshold: thresholds.outThreshold,
  quantizationScale: scale,
  trainEvaluation,
  quantizedValidation,
  quantizedTest,
  languages: ['en', 'hi', 'hi-en', 'ml', 'ml-en'],
  limitations: [
    'Synthetic dataset; accuracy on real users is not yet measured.',
    'English, Hindi, Malayalam and English-Hindi/Malayalam code-switching are represented.',
    'Other app locales are not represented in evaluation; uncertain cases fall back locally.',
    'The model is a compact linear n-gram classifier, not a transformer.',
    'MIXED and AMBIGUOUS are composed at runtime, not predicted by the binary head.',
  ],
};
fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  OUTPUT_TEST_SAMPLES,
  `${JSON.stringify(
    fullTest.map((sample) => ({
      text: sample.text,
      label: sample.label,
      lang: sample.lang,
    })),
    null,
    2
  )}\n`,
  'utf8'
);

console.log('Scope classifier trained.');
console.log(
  `binary train=${train.length} validation=${validation.length} test=${test.length}`
);
console.log(
  `train accuracy=${formatPercent(
    trainEvaluation.accuracy
  )} validation accuracy=${formatPercent(
    quantizedValidation.accuracy
  )} falseAccept=${formatPercent(
    quantizedValidation.falseAcceptRate
  )}`
);
console.log(
  `test accuracy=${formatPercent(
    quantizedTest.accuracy
  )} falseAccept=${formatPercent(
    quantizedTest.falseAcceptRate
  )} falseReject=${formatPercent(quantizedTest.falseRejectRate)}`
);
console.log(
  `thresholds in=${thresholds.inThreshold} out=${thresholds.outThreshold}`
);
console.log(`model bytes=${report.modelSizeBytes}`);
console.log(`wrote ${path.relative(ROOT, OUTPUT_MODEL)}`);
console.log(`wrote ${path.relative(ROOT, OUTPUT_REPORT)}`);
