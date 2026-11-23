# On-device device smoke test

Date: 2026-11-22 (emulator), 2026-11-23 (physical device)
Targets:
- Android emulator API 36, x86_64, 4 GB RAM, 4 vCPU, CPU-only
- Xiaomi Pad 6 (`23043RP34I`), Android 14, arm64-v8a, 7.8 GB RAM

Build: release APK from the working tree (`v1.9.0`)
Models verified end-to-end (download, SHA-256, activation, real arm64 load,
and a read request):
- `qwen3.5-0.8b` Q4_K_M, 532,517,120 bytes
- `lfm2.5-1.2b` Q4_K_M, 730,895,168 bytes
- `qwen3.5-2b` Q4_K_M, 1,280,835,840 bytes
- `gemma-4-e2b` Q4_K_M, 3,106,738,272 bytes

This is real emulator evidence, not a Jest substitute. It covers the parts that
unit tests cannot prove: Expo prebuild/autolinking, native `llama.rn` loading,
the FileSystem download path, native SHA-256, the action-confirmation boundary,
and the scope gate.

## Flows exercised

1. Fresh on-device provider activation.
   - The settings screen listed all four catalog models.
   - Qwen3.5 0.8B downloaded to app-private storage.
   - Final file was accepted as `ACTIVE` and persisted across an app restart.
2. Read request.
   - Prompt: “Show my tasks”.
   - The model selected `get_tasks`, the read tool executed, and the final
     answer was rendered in the assistant transcript.
3. Timer approval boundary.
   - Prompt: “Start a 25 minute focus loop”.
   - The model prepared `start_loop`.
   - The timer did **not** start until the native `Confirm` button was pressed.
   - After confirmation, Hour Loop showed `H1`, `RUNNING`, target `00:25:00`,
     and a decreasing remaining time.
4. Out-of-scope gate.
   - Prompt: “What is the capital of France?”.
   - The local refusal appeared without any new `RNLlama` log lines, proving the
     GGUF was not loaded or called for that request.
5. Suggested prompt.
   - The empty-state suggestion “What am I working on?” is no longer
     deterministic-refused by the scope gate.
6. App background/foreground.
   - The running loop survived leaving the assistant screen and reopening the
     app.

## Physical-device results (Xiaomi Pad 6)

- Fresh install of the arm64 APK via `pm install` (Xiaomi blocks normal
  `adb install` behind its “Install via USB” account prompt).
- Qwen3.5 0.8B: downloaded and SHA-verified in **116 s**, activated, loaded the
  `arm64-v8a` `librnllama` engine, answered a read request, prepared
  `start_loop`, and started `H1` only after the native **Confirm** tap.
- Out-of-scope “What is the capital of France?” produced the local refusal with
  **zero new `RNLlama` log lines**.
- The on-device privacy note and the saved active-model selection rendered
  correctly.
- LFM2.5 1.2B: downloaded and SHA-verified in **104 s**, activated, loaded, and
  answered after the fixes below.
- Qwen3.5 2B: downloaded and SHA-verified in **174 s**, activated, loaded, and
  answered a read request.
- Gemma 4 E2B: downloaded and SHA-verified in **300 s**, activated, loaded on
  the arm64 tablet, and answered a read request.

## Defects found and fixed during this test

- **SHA-256 verification was effectively unusable.** The first emulator run
  spent more than nine minutes hashing 533 MB through base64 + pure-JS
  `js-sha256`. The fix is a local Expo native module (`modules/hour-loop-hash`)
  that streams the file through Android `MessageDigest` / iOS CryptoKit.
  After the fix, the full download + verification finished in **124 seconds**
  on the emulator (including the 533 MB download).
- **The selected GGUF template has no `tool_use` variant.** Native tool calls
  were not emitted by the bundled runtime. The provider now detects this and
  uses a strict JSON tool protocol plus `response_format` JSON schema for those
  templates. Native tool calling remains the path when the template exposes
  `tool_use`.
- **`enable_thinking` needed explicit Jinja kwargs.** Without
  `chat_template_kwargs: { enable_thinking: false }`, Qwen3.5 emitted loops of
  empty `<think>` tags instead of a result.
- **The active-model `Use` button only changed local state.** It now persists
  the on-device provider selection immediately.
- **The suggested prompt “What am I working on?” was refused.** A narrow
  deterministic IN_SCOPE rule now covers this existing training-set phrase.
- **On-device privacy copy claimed messages were sent to a provider.** The
  assistant now shows an on-device-specific privacy note.
- **LFM2.5 repeated tool calls until the loop limit.** On-device turns now
  remove tools after a read tool result, forcing a final answer from the data.
- **LFM2.5 streaming emitted cumulative prefixes.** The on-device provider now
  uses the final completion text and does not render token deltas.

## Limits

- The physical device is a 7.8 GB tablet, not a 4 GB or 6 GB phone. Real
  low-RAM pressure and thermal throttling remain untested.
- The action-confirmation flow was exercised with Qwen3.5 0.8B only. The other
  three models were exercised for load + read requests.
- iOS was not built or tested.
- The runtime used for this test is `llama.rn@0.13.0-rc.12`. The stable
  0.12.9 engine failed to produce tool calls with this GGUF.
- The JSON tool protocol is a compatibility path for GGUF templates without a
  `tool_use` variant. It is covered by provider tests and this smoke test, but
  a larger device evaluation is still needed before calling all four models
  production-ready.
