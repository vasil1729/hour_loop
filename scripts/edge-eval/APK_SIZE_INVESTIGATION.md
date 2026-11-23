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
