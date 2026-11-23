# Android APK size investigation (llama.rn native variants)

Status: **investigation only** — no build configuration has been changed yet.

Date: 2026-11-23. Version investigated: **1.9.1**. Installed dependency:
**`llama.rn@0.13.0-rc.12`** (`package.json:43`, `package-lock.json:11117-11121`,
`node_modules/llama.rn/package.json:3`).

Note: this repository has no LangChain Wiki. Its documentation is an OpenWiki
generated index under `openwiki/`; generated pages are not hand-edited here.
This source document lives under `scripts/edge-eval/` alongside
`DEVICE_SMOKE.md`, and is the source of truth for the build results below.

## 1. Baseline size

| Artifact | File size | Installed size (phone) |
| --- | --- | --- |
| `builds/hour-loop-v1.8.8-arm64.apk` (before on-device AI) | 33.7 MiB | — |
| `builds/hour-loop-v1.9.1-arm64.apk` (current) | **135.6 MiB** (142,170,303 bytes) | **136 MB** (`du -sh` on Redmi Note 8 Pro) |

The jump happened in v1.8.9, the first build after `llama.rn` was added.
DEX, React Native runtime libs and the JS bundle are unchanged between
v1.8.8 and v1.9.1: DEX 23.6 MB, other native libs 17.3 MB, JS bundle
3.1 → 3.2 MB. The delta is entirely the llama.rn native payload.

## 2. Native library inventory (v1.9.1)

All libraries are under `lib/arm64-v8a/`; native libs are stored
uncompressed (`extractNativeLibs=false`). Total native: **114.0 MB uncompressed,
32 libraries**. Breakdown:

### llama.cpp engines (7 full copies, ~90.8 MB)

| Library | Bytes | Meaning (`-march` from CMake) |
| --- | --- | --- |
| `librnllama.so` | 12,982,088 | generic baseline (`GGML_CPU_GENERIC`, no `-march`) |
| `librnllama_v8.so` | 13,043,912 | `-march=armv8-a` |
| `librnllama_v8_2.so` | 13,040,752 | `-march=armv8.2-a` (gated on `fp16`/`fphp`) |
| `librnllama_v8_2_dotprod.so` | 13,117,328 | `armv8.2-a+dotprod` |
| `librnllama_v8_2_i8mm.so` | 13,091,392 | `armv8.2-a+i8mm` |
| `librnllama_v8_2_dotprod_i8mm.so` | 13,131,456 | `armv8.2-a+dotprod+i8mm` |
| `librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so` | 16,907,472 | same CPU flags + Hexagon/OpenCL/Adreno kernels |

### llama.rn JNI wrappers (7, ~5.8 MB)

`librnllama_jni.so`, `_jni_v8`, `_jni_v8_2`, `_jni_v8_2_dotprod`,
`_jni_v8_2_i8mm`, `_jni_v8_2_dotprod_i8mm`,
`_jni_v8_2_dotprod_i8mm_hexagon_opencl` — 854,680–860,880 bytes each.
Each wrapper is built from the same source, linked against its matching engine.

### Hexagon DSP assets (~4.9 MB)

`assets/ggml-hexagon/libggml-htp-v73.so` … `v85.so` (5 files, ~1 MB each).
Copied into the app assets by llama.rn's `syncRNLlamaHtpAssets` task
(`node_modules/llama.rn/android/build.gradle:25-72`), independent of the
variant filter.

### Other native libs (unchanged from v1.8.8, 17.3 MB)

`libreactnative.so` 6.26 MB, `libhermes.so` 2.15 MB, `libexpo-sqlite.so`
1.73 MB, `libappmodules.so` 1.29 MB, `libexpo-modules-core.so` 1.25 MB,
`libc++_shared.so` 1.23 MB, plus smaller codegen/image libs.

## 3. ABI configuration

- The build script passes `-PreactNativeArchitectures=arm64-v8a` for the
  arm64 build (`scripts/build-android-apk.sh:54`). The generated
  `android/gradle.properties` still lists all four ABIs, but llama.rn's
  `reactNativeArchitectures()` drops 32-bit ABIs
  (`node_modules/llama.rn/android/build.gradle:96-100`) and the property
  override narrows it to arm64-v8a.
- The APK contains **one ABI only**. CPU-feature variants are *not* ABIs:
  all seven are arm64-v8a. ABI splits therefore cannot remove them.
- No `abiFilters`/`splits` in the app's generated `build.gradle`.
  `minifyEnabled` and `shrinkResources` default to false;
  `expo.useLegacyPackaging=false` (native libs uncompressed).

## 4. Variant build mechanism (installed version, verified in source)

1. `node_modules/llama.rn/android/build.gradle:155-159` reads Gradle property
   `rnllamaVariants` and, when set, passes
   `-DRNLLAMA_ANDROID_VARIANTS=<value>` to CMake. It is **unset** in the repo,
   in llama.rn's own `gradle.properties`, and in the build script. The generated
   `CMakeCache.txt` confirms `RNLLAMA_ANDROID_VARIANTS:STRING=` (empty = all).
2. `android/src/main/cmake/rnllama-build-options.cmake:23-35` parses the value
   as a semicolon/comma-separated list of **engine** names and gates each
   variant. The same predicate is applied to the JNI wrapper
   (`node_modules/llama.rn/android/src/main/CMakeLists.txt:41-46`, 148-160)
   and to the engine (`rnllama/CMakeLists.txt:110-115`, 318-328). Names must be
   `rnllama`, `rnllama_v8`, `rnllama_v8_2`, `rnllama_v8_2_dotprod`,
   `rnllama_v8_2_i8mm`, `rnllama_v8_2_dotprod_i8mm`,
   `rnllama_v8_2_dotprod_i8mm_hexagon_opencl`.
3. Build-from-source is ON (`rnllamaBuildFromSource=true` in llama.rn's
   `android/gradle.properties`), so there are no prebuilt-jniLibs fallbacks;
   changing the filter actually removes the compiled `.so` files.
4. `app.json:67-72` sets `enableOpenCLAndHexagon: false`. That only suppresses
   `<uses-native-library>` manifest entries
   (`node_modules/llama.rn/src/expo-plugin/withLlamaRN.ts:117-152`); it does
   **not** stop the OpenCL/Hexagon variant or the HTP assets from being built
   and packaged.

## 5. Runtime loader selection and fallback (verified)

`node_modules/llama.rn/android/src/main/java/com/rnllama/RNLlama.java:174-268`:

- Reads `/proc/cpuinfo`; detects `dotprod` (`dotprod`/`asimddp`), `i8mm`,
  `fp16`/`fphp`, plus Qualcomm/Adreno hints.
- Tries, in order: hexagon_opencl → dotprod+i8mm → dotprod → i8mm →
  v8_2 (only with FP16) → v8 → generic JNI. `System.loadLibrary("rnllama")`
  at line 260 is **unconditional**.
- `tryLoadLibrary()` (lines 304-311) swallows `UnsatisfiedLinkError`, so a
  removed specialized variant simply falls through to the next candidate.
- **Must keep:** `rnllama` (the unconditional engine load) and `rnllama_jni`
  (the final fallback). `rnllama_v8` is the last ARM-specific rung before the
  generic fallback and is retained for ARMv8-A baseline devices.
- No JS-side variant selection exists; the C++ side only reports the name
  chosen by Java (`cpp/jsi/RNLlamaJSI.cpp:159-161`, 745-748).

The selected variant is reported through the library's model-info path; the
app does not currently surface it in the UI.

## 6. Identified redundant components

| Component | Why removable | Saving |
| --- | --- | --- |
| `rnllama_v8_2_dotprod_i8mm_hexagon_opencl` (+ JNI) | App already disables OpenCL/Hexagon in `app.json`; requires Qualcomm + dotprod + i8mm + Adreno; loader falls through when absent | ~16.9 MB + 0.85 MB |
| `rnllama_v8_2_dotprod_i8mm` (+ JNI) | Optional CPU extension; falls through | ~12.6 MB |
| `rnllama_v8_2_i8mm` (+ JNI) | Optional CPU extension; falls through | ~12.4 MB |
| `rnllama_v8_2` (+ JNI) | Optional FP16-only path; falls through | ~12.4 MB |
| HTP DSP assets (5 × ~1 MB) | Only consumed by the Hexagon backend, which is disabled; extraction is wrapped in try/catch | ~4.9 MB |

Device evidence: Redmi Note 8 Pro (MediaTek MT6785, `/proc/cpuinfo` features
`asimd … asimddp`, **no `i8mm`**, no SVE) would select `dotprod` today.

## 7. Proposed optimization strategy (to be validated by experiment)

- **Baseline**: current 7-variant build (`builds/hour-loop-v1.9.1-arm64.apk`).
- **Experiment A — generic only**: `-PrnllamaVariants=rnllama`; keep generic
  engine + JNI only. Maximum compatibility; measure inference cost.
- **Experiment B — generic + ARMv8.2 CPU set**: all CPU variants except
  Hexagon/OpenCL (keeps dotprod/i8mm paths for modern Snapdragon).
- **Experiment C — minimal optimized set**: generic + `v8` + one optimized
  variant (`dotprod` or `dotprod+i8mm`), chosen after A/B measurements.
- Remove HTP assets when the Hexagon variant is dropped (independent Gradle
  task + stale-asset cleanup in the staging directory).
- Consider R8/resource shrink only after variant savings are measured;
  React Native reflection/serialisation needs care there.
- Keep the generic engine + generic JNI in **every** configuration.

Acceptance gate for any configuration: app launches, model downloads, loads,
answers a prompt, streams tokens, unloads/reloads, and works offline; the
generic path is verified on the non-i8mm MediaTek device. No configuration
will be called compatible with hardware that was not actually tested.

## 8. Test coverage limits

Only one physical ARM64 device is currently connected (Redmi Note 8 Pro,
MT6785, Android 11, no i8mm). The Xiaomi Pad 6 is offline. A modern
Snapdragon device and an old ARM64 device without `dotprod` are **not**
available; those gaps will be recorded, not claimed as tested.

## 9. Experiment results

### Experiment A — generic ARM64 only (`-PrnllamaVariants=rnllama`, no HTP assets)

Build: `builds/hour-loop-v1.9.1-arm64-variant-generic.apk`,
SHA-256 in `.sha256`. Cold build took **14m05s** (first native compile of the
narrowed variant set; Gradle build cache supplied 153 of 437 tasks).

| Metric | Baseline v1.9.1 | Experiment A |
| --- | --- | --- |
| APK file size | 142,170,303 B (135.58 MiB) | **49,346,916 B (47.06 MiB)** |
| Installed size (phone) | 136 MB | not re-measured after install (same uncompressed layout) |
| Native libraries | 32 files / 113.96 MiB | **20 files / 30.54 MiB** |
| llama.rn libraries | 14 files / 96.62 MiB | **2 files / 13.20 MiB** |
| HTP DSP assets | 5 files / 4.94 MiB | **0 files / 0 MiB** |
| DEX | 23.60 MiB | 23.60 MiB (unchanged) |
| JS bundle | 3.20 MiB | 3.20 MiB (unchanged) |

Size reduction: **65.3%** (135.58 → 47.06 MiB). The two retained llama.rn
libraries are exactly the mandatory generic pair (`librnllama.so` +
`librnllama_jni.so`); the loader's unconditional `System.loadLibrary("rnllama")`
therefore still succeeds on every ARM64 device.

### Device functional evidence (Redmi Note 8 Pro / MT6785)

Verified with `builds/hour-loop-v1.9.1-arm64-variant-generic.apk`, model
**Qwen3.5 0.8B Q4_K_M** (already present in app storage), no API key:

- App launches; Timer, Tasks, History and Settings tabs work; Settings → AI
  assistant → on-device model list renders correctly with the active model.
- Prompt "What am I working on?" submitted from the assistant chip; the model
  loaded and produced a grounded in-scope answer. First load from cold storage
  took ~122 s; subsequent process launches with warm page cache answered in
  ~9 s.
- Warm inference (same prompt, same device, identical UI procedure):
  **generic-only 12 s** vs **baseline 15 s** (3 s polling granularity and
  response-length variation; no detectable regression).
- On-device response completes as one final message; **token-delta streaming
  is not supported by the current on-device provider** (commit `7d755fc`
  deliberately removed duplicate streaming). This is unchanged by the build
  optimization.
- GGUF download of LFM2.5 1.2B was started on the generic build and progressed
  from 1% to 61% over ~225 s at ~3 MB/s; completion/SHA-256 verification and
  the subsequent model-switch (unload/reload) were **not confirmed** because
  the device was taken over by the user mid-test. These remain unverified on
  this build.
- Offline inference with airplane mode was **not** exercised for the same
  reason; no claim is made here.

Baseline APK was reinstalled and exercised with the same prompt procedure
before switching back; no app-level regression was observed on either build
during the verified steps.

### Experiment B — generic + all CPU-feature variants, no HTP assets

Variants: `rnllama,rnllama_v8,rnllama_v8_2,rnllama_v8_2_dotprod,
rnllama_v8_2_i8mm,rnllama_v8_2_dotprod_i8mm`. Build:
`builds/hour-loop-v1.9.1-arm64-variant-optimized.apk`. Cold build **32m30s**.

| Metric | Baseline | Experiment A | Experiment B |
| --- | --- | --- | --- |
| APK size | 135.58 MiB | **47.06 MiB** | 113.62 MiB |
| llama.rn libs | 14 / 96.62 MiB | 2 / 13.20 MiB | 12 / 79.67 MiB |
| HTP assets | 4.94 MiB | 0 | 0 |
| Native libs total | 113.96 MiB | 30.54 MiB | 97.01 MiB |
| DEX / JS bundle | 23.60 / 3.20 MiB | unchanged | unchanged |

The six extra CPU-feature variants cost **~66.6 MB** over generic-only while
leaving DEX/JS unchanged. This build was not installed on a device: the phone's
ADB connection dropped while the build ran, and the device could not be driven
without interfering with its owner. Its CPU paths are a strict subset of the
already-tested baseline (the device has no Hexagon/Adreno hint, so the removed
DSP variant was never selected there).

### Interpretation

The generic-only configuration meets the <60 MB target with a large margin,
keeps the mandatory fallback path, and showed no measurable inference
slowdown on the only available device. It is therefore the leading candidate
for the final build. Any larger configuration (Experiments B/C) must justify
its extra bytes with a measured speed benefit, not a theoretical one.
