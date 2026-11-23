# On-device edge evaluation

This harness evaluates the four curated Q4_K_M GGUF models against a real
`llama.cpp` server. It is intentionally separate from Jest: Jest never loads
native llama code and never claims model quality.

## What is measured

- Local scope block rate: every out-of-scope, mixed and ambiguous prompt must be
  blocked before the model is called. This runs through the app's real
  `classifyScope`.
- Tool-router accuracy: the expected tool must be in the 3–6 tools selected by
  `selectEdgeToolNames`.
- JSON validity of returned tool-call arguments.
- Tool-name accuracy.
- Argument accuracy (partial object match, so extra optional fields are allowed).
- Read vs write/timer approval accuracy, using the app's risk classes.
- Time to first token, latency and tokens/sec.
- Every failed case with expected and actual output.

## Models

Artifacts are pinned in `src/constants/edgeModels.ts`. Download one of:

| Id | File | Size | SHA-256 |
| --- | --- | --- | --- |
| `qwen3.5-0.8b` | [Qwen3.5-0.8B-Q4_K_M.gguf](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf) | 532,517,120 | `bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517` |
| `lfm2.5-1.2b` | [LFM2.5-1.2B-Instruct-Q4_K_M.gguf](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-Q4_K_M.gguf) | 730,895,168 | `b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5` |
| `qwen3.5-2b` | [Qwen3.5-2B-Q4_K_M.gguf](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf) | 1,280,835,840 | `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223` |
| `gemma-4-e2b` | [gemma-4-E2B-it-Q4_K_M.gguf](https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf) | 3,106,738,272 | `740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8` |

Verify a download before running:

```bash
sha256sum /path/to/model.gguf
```

Gemma 4 E2B is 3.11 GB, larger than the original 1.4–1.6 GB target. It is kept
because it is the requested artifact, but 8 GB RAM is recommended.

## Runner

Build or install `llama.cpp` so that `llama-server` is on `PATH`, or point at it
with `LLAMA_SERVER_BIN` / `--server-bin`.

```bash
node scripts/edge-eval/run-eval.mjs \
  --model /models/Qwen3.5-0.8B-Q4_K_M.gguf \
  --model-id qwen3.5-0.8b
```

The harness starts a loopback-only server with the catalog context and output
caps, `--jinja` enabled, and GPU layers disabled. Pass `--base-url` to use an
already-running server instead, for example:

```bash
node scripts/edge-eval/run-eval.mjs \
  --base-url http://127.0.0.1:8080 \
  --model-id qwen3.5-2b
```

Reports are written to `scripts/edge-eval/results/` by default, as both JSON and
Markdown. Use `--out` to choose another directory. The results directory is
git-ignored.

## Honest "not run" behavior

If no GGUF or no `llama-server` is available, the harness writes a report with
`"status": "not_run"` and a concrete reason. It still runs the local scope gate
and tool router, because those are deterministic and do not need a model. It
does not populate any generation metrics.

By default a not-run report exits with status 2. Pass
`--allow-missing-runner` to exit 0 while keeping the report explicitly marked
`not_run`.

## Device smoke test

`DEVICE_SMOKE.md` records the Android emulator run that exercised the actual
APK, native model loading, download verification, read tools, and the native
action-confirmation boundary. Jest alone cannot prove those paths.

## Dataset

`dataset.json` contains 55 prompts:

- 32 in-scope prompts with an expected tool, arguments and risk class.
- 19 clearly out-of-scope prompts.
- 2 mixed prompts.
- 2 ambiguous prompts.

Keep the dataset aligned with the local scope classifier. A prompt that the
classifier deliberately blocks should not be labelled `IN_SCOPE`, because that
would be a false expectation rather than a model failure.

## Limitations

- This is a small, curated dataset, not a general benchmark.
- Tool arguments are matched as a partial object; wording inside free-text
  fields is compared exactly.
- Token/sec uses the server's usage count when available. Without usage, only
  TTFT and latency are reported.
- The harness scores the first tool call per prompt. The app's conversation loop
  may execute a read and then ask the model for an action in a later iteration;
  that multi-step path is not replayed here.
- The harness never mutates Hour Loop data. It validates tool calls only.
- Tool-call sampling is not fully deterministic. Keep the report you actually
  ran and do not compare runs from different model revisions or sampling
  settings as if they were identical.
