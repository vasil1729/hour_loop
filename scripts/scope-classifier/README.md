# Hour Loop local scope classifier

This directory contains the reproducible training and evaluation pipeline for
the assistant's **on-device scope gate**. The gate runs before the API key is
read and before any provider request. It is not a second cloud LLM call.

## Why this model

The target was a 5–15 MB classifier with <100 ms latency and no network access.
The transformer options investigated were not viable inside that budget:

| Candidate | Approx. packaged weights | Runtime | Verdict |
|---|---:|---|---|
| `jhu-clsp/mmBERT-small` | 140M params → ~140 MB INT8 | ONNX Runtime RN + tokenizer | Rejected: far above size target; native prebuild/runtime risk |
| `intfloat/multilingual-e5-small` | 118M params → ~118 MB INT8 | ONNX Runtime RN + tokenizer | Rejected: far above size target; native prebuild/runtime risk |
| ONNX Runtime React Native | native module | Expo config plugin/prebuild | Not needed for the selected model; Expo compatibility would add maintenance risk |
| fastText-style hashed n-gram model | **32 KB INT8 weights** | Pure TypeScript/Hermes | **Selected** |

The selected model is a compact linear logistic classifier over multilingual
word unigrams/bigrams and character 3–5 grams. It is dependency-free, runs
synchronously on Hermes and the web, and requires no native prebuild changes.
This is a fastText-style baseline, not a transformer. The trade-off is
documented rather than hidden.

## Dataset

The training corpus is synthetic and authored for this repository. It contains:

- Legitimate Hour Loop requests.
- General-knowledge and unrelated requests.
- Hard negatives using overlapping words (`loop`, `focus`, `task`, `capsule`,
  `timer`, `start`) in unrelated contexts.
- Mixed requests.
- Ambiguous fragments.
- English, Hindi (Devanagari and Roman), Malayalam (script and Roman), and
  English–Hindi/English–Malayalam code-switching.
- Prompt-injection examples.

No private user conversations are used. The data is split by template group,
not by individual paraphrase, to reduce leakage between train/validation/test.
License: AGPL-3.0-or-later, matching this repository.

## Reproduce training

```bash
node --experimental-strip-types scripts/scope-classifier/train.mjs
```

This writes:

- `src/features/assistant/scope/scopeModelData.generated.ts`
- `scripts/scope-classifier/report.json`
- `scripts/scope-classifier/test-samples.json`

## Evaluate

```bash
npx jest src/features/assistant/scope/scopeClassifier.test.ts --runInBand
npx jest src/features/assistant/scope/scopeEvaluation.test.ts --runInBand
npx jest src/features/assistant/scope/scopeBenchmark.test.ts --runInBand
npx jest src/store/assistantStore.test.ts --runInBand
```

## Measured results

These are results from the repository's synthetic held-out split. They are not
claims about real-user accuracy.

### Binary in/out test split (305 samples)

| Language | Samples | Accuracy | False accepts | False rejects |
|---|---:|---:|---:|---:|
| English | 142 | 91.5% | 0% | 7.7% |
| Hindi | 9 | 100% | 0% | 0% |
| English–Hindi | 64 | 90.6% | 0% | 9.4% |
| Malayalam | 5 | 80.0% | 0% | 20.0% |
| English–Malayalam | 85 | 100% | 0% | 0% |
| **All** | **305** | **93.8%** | **0%** | **12.5%** |

### Composite held-out test split (394 samples, including MIXED/AMBIGUOUS)

- Exact category accuracy: **92.1%**
- Safe routing rate (in-scope allowed, all non-in-scope kept local): **94.9%**
- False acceptance (non-in-scope routed to the provider): **0%**
- MIXED examples routed to MIXED: **40/40**
- AMBIGUOUS examples kept local: **49/49** (39 AMBIGUOUS, 10 safe OUT)

Per-language composite results:

| Language | Samples | Exact | Safe | False accepts |
|---|---:|---:|---:|---:|
| English | 194 | 90.7% | 94.3% | 0 |
| Hindi | 9 | 100% | 100% | 0 |
| English–Hindi | 77 | 92.2% | 92.2% | 0 |
| Malayalam | 5 | 80.0% | 80.0% | 0 |
| English–Malayalam | 109 | 94.5% | 98.2% | 0 |

The Malayalam/Hindi script test partitions are small; the numbers are reported
with their sample counts rather than presented as broad language claims.

## Performance

Measured in the desktop/Jest Node environment, not on a device:

- Cold initialization/inference: **~6–10 ms**
- Warm inference average (2,000 calls): **~0.14–0.17 ms**
- Model weights: **32,768 bytes** (INT8)
- Generated TypeScript model artifact: **~47 KB**
- Android release APK before scope integration: **35,096,045 bytes**
- Android release APK after scope integration: **35,204,793 bytes**
- APK delta: **+108,748 bytes (~106 KB)**
- Native runtime dependency: **none**
- Additional native libraries: **none**
- Web support: yes, pure JavaScript

Device CPU/RAM/latency must still be measured on representative Android and iOS
hardware before a release-candidate claim. The model is decoded lazily on the
first assistant send, so it is not initialized at app startup.

## Integration

`src/store/assistantStore.ts` calls `classifyScope()` after basic input checks
and before `getAssistantApiKey()`. Non-`IN_SCOPE` outcomes produce a localized
local response and return to idle immediately. No key is read and
`runAssistantTurn()` is not called. MIXED and AMBIGUOUS outcomes never reach the
provider. If the model/inference fails, the decision is AMBIGUOUS (fail closed).

The classifier uses one bounded bit of context: the previous turn's scope
category, which enables deictic follow-ups such as “What about the previous
day?” or “Pause it.” It does not feed raw conversation history or application
records into the classifier, which prevents record content from changing the
classification policy.

## Limitations

- Synthetic data; real-user evaluation is still required.
- English, Hindi, Malayalam and code-switching are represented; the other app
  locales are not yet evaluated.
- Linear n-gram model rather than a transformer; unusual paraphrases may fall
  back to local clarification.
- MIXED/AMBIGUOUS are composed from clause splitting and calibrated confidence,
  not a transformer head.
- No device benchmark was performed in this environment.
- The model weights are repository-generated and licensed AGPL-3.0-or-later.
