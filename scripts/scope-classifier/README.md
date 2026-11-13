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
npx jest src/features/assistant/scope/scopeRegression.test.ts --runInBand
npx jest src/features/assistant/scope/scopeAdversarialSweep.test.ts --runInBand
npx jest src/features/assistant/scope/scopeEvaluation.test.ts --runInBand
npx jest src/features/assistant/scope/scopeBenchmark.test.ts --runInBand
npx jest src/store/assistantStore.test.ts --runInBand
npx jest src/store/assistantStore.scopeIntegration.test.ts --runInBand
```

## Contextual follow-up policy

The gate uses only the previous turn's scope category as context, and only as a
necessary condition. A previous `IN_SCOPE` category is never sufficient
evidence on its own.

A follow-up is allowed only when the message itself contains an explicit
reference to the ongoing task:

- a pronoun/object plus an action: “pause it”, “how do I stop it?”;
- an explicit anaphor: “uske baare mein aur batao”, “athine pause cheyyu”,
  “അത് തന്നെ കാണിക്കൂ”;
- a time window: “what about the previous day?”;
- an explicit request to continue the explanation: “show me the steps”,
  “can you give me an example?”.

Generic sentence openers are not follow-ups. Messages beginning with `do`,
`continue`, `go on`, `kal`, `pichle`, `innale`, `pinne`, etc. are classified on
their own content. Regression tests assert that, after an `IN_SCOPE` turn,
unrelated questions such as “Do you know the capital of France?”, “Continue with
the history of India.”, “Kal India ka capital kya hai?”, “Innale Kerala-yude
history parayu.” and “Pinne oru biryani recipe parayu.” stay local.

Ambiguous fragments (`continue`, `do it`, `what about that?`, `why?`, `can
you?`) remain `AMBIGUOUS` even with previous `IN_SCOPE` context.

## Deterministic guards

Before the model, a small rules layer handles:

- empty, punctuation-only and oversized input;
- greetings and short ambiguous fragments;
- prompt-injection and credential-reveal phrases (`OUT_OF_SCOPE`, local);
- explicit app-help questions containing Hour Loop terminology or app concepts
  (`loop`, `timer`, `interval`, `capsule`, `focus session`, `backup`,
  `checklist`) combined with an action and a help marker;
- media-control requests, external shopping/grocery lists, and clear external
  actions (ordering food, booking travel, recipes, movies) that the compact
  model can confuse with app actions.

The app-help rule is disabled when the message names a different domain
(JavaScript, Python, music, video editing, physics, circuits, medicine, computer
backups, graph theory, and similar), so hard negatives such as “Explain loops in
JavaScript” and “How does a timer circuit work?” still fail closed.

## Mixed-intent handling

Clauses are split at sentence boundaries, newlines, semicolons, `and`/`aur`/
`plus`/`और`/`ഒപ്പം`/`കൂടാതെ`, and `, pinne`/`, phir`/`, then`. A message with
both an in-scope and an out-of-scope clause is `MIXED` and never reaches the
provider. Sentence boundaries matter: “How do I create a loop? Write me a poem.”
is `MIXED`, not an accepted app-help request.

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
- Safe routing rate (in-scope allowed, all non-in-scope kept local): **95.4%**
- False acceptance (non-in-scope routed to the provider): **0%**
- MIXED examples routed to MIXED: **40/40**
- AMBIGUOUS examples kept local: **49/49** (37 AMBIGUOUS, 12 safe OUT)

Per-language composite results:

| Language | Samples | Exact | Safe | False accepts |
|---|---:|---:|---:|---:|
| English | 194 | 90.7% | 94.3% | 0 |
| Hindi | 9 | 100% | 100% | 0 |
| English–Hindi | 77 | 92.2% | 92.2% | 0 |
| Malayalam | 5 | 80.0% | 80.0% | 0 |
| English–Malayalam | 109 | 94.5% | 100% | 0 |

The Malayalam/Hindi script test partitions are small; the numbers are reported
with their sample counts rather than presented as broad language claims.

## Performance

Measured in the desktop/Jest Node environment, not on a device:

- Cold initialization/inference: **~6–22 ms** (desktop/Jest, load-dependent)
- Warm inference average (2,000 calls): **~0.11–0.23 ms**
- Model weights: **32,768 bytes** (INT8)
- Generated TypeScript model artifact: **~47 KB**
- Android release APK before scope integration (1.7.3): **35,096,045 bytes**
- Android release APK with scope integration (1.8.0): **35,205,597 bytes**
- Scope integration delta: **+109,552 bytes (~107 KB)**
- Current hardened release APK (1.8.3): **35,251,177 bytes**
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
category. That bit is necessary but not sufficient: a message must also contain
an explicit deictic/referential expression to inherit the previous topic. Raw
conversation history and application records are not fed into the classifier,
which prevents record content or prompt-injection text from changing the
classification policy.

## Regression coverage

The hardening suite adds 152 tests:

- 144 A–G regression tests covering clearly in-scope requests, clearly
  out-of-scope requests, contextual false-accept pairs, genuine follow-ups,
  mixed intent, ambiguous fragments with and without context, multilingual and
  code-switched input, hard negatives, app-help boundaries, prompt injection,
  and clause splitting.
- 2 adversarial corpus sweeps that assert 60+ non-app requests stay out of
  scope both with and without previous `IN_SCOPE` context, while 30+ app
  requests remain allowed.
- 6 real-classifier assistant-store integration tests proving that
  `OUT_OF_SCOPE`, `MIXED`, and `AMBIGUOUS` messages after an in-scope turn never
  call `getAssistantApiKey()` or `runAssistantTurn()`, while a genuine
  follow-up still does.

## Limitations

- Synthetic data; real-user evaluation is still required.
- English, Hindi, Malayalam and code-switching are represented; the other app
  locales are not yet evaluated.
- Linear n-gram model rather than a transformer; unusual paraphrases may fall
  back to local clarification.
- `MIXED`/`AMBIGUOUS` are composed from clause splitting and calibrated
  confidence, not a transformer head.
- The deterministic app-help/media/list guards are deliberately narrow and
  English/Romanized-Hindi/Romanized-Malayalam-centric; unusual phrasings fall
  back to the statistical model or local clarification.
- No physical-device benchmark or iOS build was performed in this environment.
- The model weights are repository-generated and licensed AGPL-3.0-or-later.
