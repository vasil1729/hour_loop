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
npx jest src/features/assistant/scope/scopeFollowUp.test.ts --runInBand
npx jest src/features/assistant/scope/scopeAdversarialSweep.test.ts --runInBand
npx jest src/features/assistant/scope/scopeEvaluation.test.ts --runInBand
npx jest src/features/assistant/scope/scopeBenchmark.test.ts --runInBand
npx jest src/store/assistantStore.test.ts --runInBand
npx jest src/store/assistantStore.scopeIntegration.test.ts --runInBand
npx jest src/store/assistantStore.scopeFailure.test.ts --runInBand

# Regenerate the machine-readable reports (optional).
SCOPE_EVAL_REPORT=1 npx jest scripts/scope-classifier/runtime-evaluation.test.ts --runInBand
SCOPE_EVAL_REPORT=1 npx jest src/store/assistantStore.scopeIntegration.test.ts --runInBand
SCOPE_EVAL_REPORT=1 npx jest src/store/assistantStore.scopeFailure.test.ts --runInBand
```

The generated reports are:

- `scripts/scope-classifier/runtime-evaluation.json`
- `scripts/scope-classifier/provider-isolation.json`
- `scripts/scope-classifier/provider-isolation-failclosed.json`

## Contextual follow-up policy

The gate uses only the previous turn's scope category as context, and only as a
necessary condition. A previous `IN_SCOPE` category is never sufficient
evidence on its own.

A follow-up is allowed only when the message itself contains an explicit
reference to the ongoing task:

- a pronoun/object plus an action: “pause it”, “how do I stop it?”;
- an unresolved elapsed-time question: “how long has it been?”, “how long has
  it been running?”, “how long did it take?”;
- an explicit anaphor: “uske baare mein aur batao”, “athine pause cheyyu”,
  “അതിനെ പോസ് ചെയ്യൂ”, “അത് തന്നെ കാണിക്കൂ”;
- a time window: “what about the previous day?”;
- an explicit request to continue the explanation: “show me the steps”,
  “give me an example”, “what happens next?”.

Generic sentence openers are not follow-ups. Messages beginning with `do`,
`continue`, `go on`, `kal`, `pichle`, `innale`, `pinne`, etc. are classified on
their own content. Regression tests assert that, after an `IN_SCOPE` turn,
unrelated questions such as “Do you know the capital of France?”, “Continue with
the history of India.”, “Kal India ka capital kya hai?”, “Innale Kerala-yude
history parayu.” and “Pinne oru biryani recipe parayu.” stay local.

A follow-up matrix tests every retained pattern with no context, `IN_SCOPE`,
`OUT_OF_SCOPE`, `MIXED`, and `AMBIGUOUS`: only `IN_SCOPE` may make it
`IN_SCOPE`; every other state yields `AMBIGUOUS`.

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

Media controls are rejected even when the message also mentions a focus session
or loop (for example, “Play a song during my focus session.”). An app task or
capsule named after a shopping list remains in scope, but a request to modify an
actual shopping list does not.

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

## End-to-end runtime harness

`scripts/scope-classifier/runtime-evaluation.test.ts` evaluates the actual
application decision boundary, `classifyScope()`, not just
`predictScopeProbability()`. It records every case's input, previous category,
expected category, actual category, source, reason, pass/fail, and language.

The harness covers 333 deterministic cases across:

| Group | Cases |
|---|---:|
| A. Clear Hour Loop requests | 12 |
| B. Clear unrelated requests | 12 |
| C. Contextual false-accept regressions (four previous states) | 52 |
| D. Follow-up matrix (five previous states) | 175 |
| E. Mixed intent | 12 |
| F. Ambiguous with and without context | 26 |
| G. Multilingual/code-switched | 14 |
| Deterministic guard boundary | 20 |
| Prompt injection / credential disclosure | 10 |

It also evaluates the 394-sample synthetic held-out dataset through the full
runtime and re-computes the model-only binary metrics. The JSON report is
`scripts/scope-classifier/runtime-evaluation.json`.

Result of the recorded run: **333/333 cases exact and safe, 0 false accepts,
0 false rejects**. Of those cases, 69 were resolved by deterministic rules, 89
by the trained model, and 175 by contextual follow-up logic. This is
deterministic adversarial/unit evidence, not a production-accuracy claim.

## Provider isolation

`assistantStore.scopeIntegration.test.ts` uses the real classifier and real model
(no `classifyScope` mock). It verifies the complete store path for rejected
messages, genuine follow-ups, missing API keys, disabled assistant, pending
actions, repeated sends, conversation reset, and retry behaviour.

`assistantStore.scopeFailure.test.ts` mocks only the model inference function so
the real classifier's failure path is exercised. The result is a local
clarification, never a provider call.

Generated evidence:

- `scripts/scope-classifier/provider-isolation.json`
- `scripts/scope-classifier/provider-isolation-failclosed.json`

Recorded provider-isolation result: **17 rejected messages tested** (15
integration + 2 fail-closed), **0 API-key lookups**, **0 provider invocations**,
and **0 database accesses** for rejected messages. Nine in-scope provider
invocations were confirmed to still work.

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

### Model-only vs full runtime

The model alone is not the security boundary. On the 394-sample composite
dataset, model-only threshold routing has **92.6% safe routing** but **11 false
accepts (4.4%)** because it lacks the deterministic guards. The full runtime
routes those same samples with **0 false accepts**, demonstrating why the guards
remain part of the pipeline.

The binary model-only split remains **93.8% accuracy, 0% false accepts, 12.5%
false rejects** on 305 samples.

### Full runtime synthetic held-out split (394 samples)

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

- Cold initialization/inference: **~1–22 ms** (desktop/Jest, load-dependent)
- Warm inference average (2,000 calls): **~0.11–0.23 ms**
- Model weights: **32,768 bytes** (INT8)
- Generated TypeScript model artifact: **~47 KB**
- Android release APK before scope integration (1.7.3): **35,096,045 bytes**
- Android release APK with scope integration (1.8.0): **35,205,597 bytes**
- Scope integration delta: **+109,552 bytes (~107 KB)**
- Current hardened release APK (1.8.3): **35,251,177 bytes**
- Current hardened release APK (1.8.4): **35,254,465 bytes**
- Delta 1.8.3 → 1.8.4: **+3,288 bytes**
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

The hardening suite adds 257 tests:

- 165 A–G regression tests covering clearly in-scope requests, clearly
  out-of-scope requests, contextual false-accept pairs under four previous
  states, genuine follow-ups, mixed intent, ambiguous fragments with and
  without context, multilingual and code-switched input, hard negatives,
  app-help boundaries, prompt injection, and clause splitting.
- 70 follow-up matrix tests: every retained pattern is checked with no context,
  `IN_SCOPE`, `OUT_OF_SCOPE`, `MIXED`, and `AMBIGUOUS`.
- 2 adversarial corpus sweeps that assert 80+ non-app requests stay out of
  scope under all five context states, while 37 app requests remain allowed.
- 17 real-classifier assistant-store integration tests covering rejection,
  missing keys, disabled state, pending actions, repeated sends, reset, retry,
  and contextual-state updates.
- 2 real-classifier model-failure store tests proving fail-closed behaviour.
- 1 end-to-end runtime harness that records 333 cases and writes the JSON
  evaluation report.

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
