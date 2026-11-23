# On-device device smoke test

Date: 2026-11-22  
Target: Android emulator API 36, x86_64, 4 GB RAM, 4 vCPU, CPU-only  
Build: release APK from the working tree  
Model: `qwen3.5-0.8b` Q4_K_M, 532,517,120 bytes, SHA-256 verified

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

## Limits

- This is one x86_64 emulator run, not a physical 4 GB phone.
- Only Qwen3.5 0.8B was exercised end-to-end on device. LFM2.5 1.2B,
  Qwen3.5 2B, and Gemma 4 E2B have not been device-smoke-tested.
- The runtime used for this test is `llama.rn@0.13.0-rc.12`. The stable
  0.12.9 engine failed to produce tool calls with this GGUF on the emulator.
- The JSON tool protocol is a compatibility path, not the native tool-calling
  path. It is covered by provider tests and this smoke test, but a larger
  device evaluation is still needed before calling the feature production-ready
  on all four models.
