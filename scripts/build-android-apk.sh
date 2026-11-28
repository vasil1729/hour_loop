#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/builds}"
STAGE_DIR="${STAGE_DIR:-$ROOT_DIR/.apk-build}"
APK_ARCH="${APK_ARCH:-arm64-v8a}"
# Optional build-experiment knobs (see scripts/edge-eval/APK_SIZE_INVESTIGATION.md):
#   RNLLAMA_VARIANTS  comma-separated llama.rn engine variants to compile
#   HEXAGON_ASSETS    "remove" drops the unused libggml-htp-*.so DSP assets
#   APK_NAME_SUFFIX   suffix for the output filename (keeps baseline artifacts intact)
# Defaults are resolved after ABI selection below: arm64 builds use only the
# generic llama.cpp engine + JNI pair (the mandatory fallback path), which cut
# the APK from 136 MB to 48 MB without a measured inference regression.
RNLLAMA_VARIANTS="${RNLLAMA_VARIANTS-}"
HEXAGON_ASSETS="${HEXAGON_ASSETS-}"
APK_NAME_SUFFIX="${APK_NAME_SUFFIX:-}"
# CLOUD_ONLY=1 builds a 32-bit APK for devices without 64-bit Android. It
# skips llama.rn's native compile and hides the on-device model UI.
CLOUD_ONLY="${CLOUD_ONLY:-0}"
if [[ "$CLOUD_ONLY" == "1" ]]; then
  export EXPO_PUBLIC_CLOUD_ONLY=1
  if [[ -z "$APK_NAME_SUFFIX" ]]; then
    APK_NAME_SUFFIX="-cloudonly"
  fi
fi

die() {
  echo "error: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || die "Node.js is required."
command -v npx >/dev/null 2>&1 || die "npx is required."

# Allow JAVA_HOME to provide java even when it is not on PATH.
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi
command -v java >/dev/null 2>&1 || die \
  "Java 17 is required. Install a JDK (Android Studio bundles one), then set JAVA_HOME."
[[ -d "$ROOT_DIR/node_modules" ]] || die "Dependencies are missing. Run 'npm install' first."

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  for candidate in "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
    if [[ -d "$candidate" ]]; then
      ANDROID_HOME="$candidate"
      break
    fi
  done
fi

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[[ -n "$SDK_DIR" ]] || die \
  "Android SDK not found. Install Android Studio or the Android command-line tools, then set ANDROID_HOME."
[[ -d "$SDK_DIR" ]] || die "Android SDK path does not exist: $SDK_DIR"

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"

VERSION="$(node -p "require('./app.json').expo.version")"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "Invalid expo.version in app.json: $VERSION" ;;
esac

DEFAULT_RNLLAMA_VARIANTS=""
case "$APK_ARCH" in
  arm64 | arm64-v8a)
    APK_ARCH="arm64-v8a"
    ARCH_LABEL="arm64"
    GRADLE_ARCH_ARGS=("-PreactNativeArchitectures=arm64-v8a")
    DEFAULT_RNLLAMA_VARIANTS="rnllama"
    ;;
  armv7 | armeabi-v7a)
    APK_ARCH="armeabi-v7a"
    ARCH_LABEL="armv7"
    GRADLE_ARCH_ARGS=("-PreactNativeArchitectures=armeabi-v7a")
    ;;
  x86_64)
    ARCH_LABEL="x86_64"
    GRADLE_ARCH_ARGS=("-PreactNativeArchitectures=x86_64")
    ;;
  universal | all)
    APK_ARCH="universal"
    ARCH_LABEL="universal"
    GRADLE_ARCH_ARGS=()
    ;;
  *)
    die "Unsupported APK_ARCH '$APK_ARCH'. Use arm64-v8a, armeabi-v7a, x86_64, or universal."
    ;;
esac

RNLLAMA_VARIANTS="${RNLLAMA_VARIANTS:-$DEFAULT_RNLLAMA_VARIANTS}"
if [[ -n "$RNLLAMA_VARIANTS" ]]; then
  GRADLE_ARCH_ARGS+=("-PrnllamaVariants=$RNLLAMA_VARIANTS")
fi

# HTP DSP assets are only useful with the Hexagon/OpenCL engine variant.
# Drop them whenever that variant is not being built; keep them for the
# unrestricted universal/x86_64 builds.
if [[ -z "$HEXAGON_ASSETS" ]]; then
  if [[ -z "$RNLLAMA_VARIANTS" || "$RNLLAMA_VARIANTS" == *hexagon* ]]; then
    HEXAGON_ASSETS="keep"
  else
    HEXAGON_ASSETS="remove"
  fi
fi

if [[ ! -d "$SDK_DIR/platforms/android-35" ]]; then
  echo "warning: Android platform 35 is missing from $SDK_DIR." >&2
  echo "         Install it with: sdkmanager 'platforms;android-35'" >&2
fi
if [[ ! -d "$SDK_DIR/build-tools/35.0.0" ]]; then
  echo "warning: Android build-tools 35.0.0 is missing from $SDK_DIR." >&2
  echo "         Install it with: sdkmanager 'build-tools;35.0.0'" >&2
fi

if [[ "${CLEAN_BUILD_DIR:-0}" == "1" ]]; then
  echo "Removing the reusable native build directory…"
  rm -rf "$STAGE_DIR"
fi

# Keep the native project and Gradle outputs between runs so rebuilds are
# incremental. Everything except `android` and `node_modules` is refreshed from
# the working tree on each invocation.
mkdir -p "$STAGE_DIR"
find "$STAGE_DIR" -mindepth 1 -maxdepth 1 ! -name android ! -name node_modules \
  -exec rm -rf {} +
rm -f "$STAGE_DIR/node_modules"

tar -cf - \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./android' \
  --exclude='./ios' \
  --exclude='./builds' \
  --exclude='./.apk-build' \
  --exclude='./dist' \
  --exclude='./.expo' \
  . | tar -xf - -C "$STAGE_DIR"

ln -s "$ROOT_DIR/node_modules" "$STAGE_DIR/node_modules"

echo "Building Hour Loop v$VERSION for $APK_ARCH…"
(
  cd "$STAGE_DIR"
  CI=1 npx expo prebuild --platform android --no-install

  if [[ "$HEXAGON_ASSETS" == "remove" ]]; then
    # The sync task is disabled by the init script below; drop stale copies
    # left by previous staged builds as well.
    rm -rf "$STAGE_DIR/android/app/src/main/assets/ggml-hexagon"
  fi

  cd android
  GRADLE_ARGS=(--build-cache --parallel --console=plain)
  if [[ ${#GRADLE_ARCH_ARGS[@]} -gt 0 ]]; then
    GRADLE_ARGS+=("${GRADLE_ARCH_ARGS[@]}")
  fi
  if [[ "$HEXAGON_ASSETS" == "remove" ]]; then
    GRADLE_ARGS+=("-I" "$ROOT_DIR/scripts/android-no-hexagon.gradle")
  fi
  if [[ "$CLOUD_ONLY" == "1" ]]; then
    GRADLE_ARGS+=("-I" "$ROOT_DIR/scripts/android-cloud-only.gradle")
  fi
  if [[ "${CI:-}" == "1" || "${CI:-}" == "true" ]]; then
    GRADLE_ARGS+=(--no-daemon)
  else
    GRADLE_ARGS+=(--daemon)
  fi
  GRADLE_ARGS+=(:app:assembleRelease)
  ./gradlew "${GRADLE_ARGS[@]}"
)

mkdir -p "$OUTPUT_DIR"
APK_NAME="hour-loop-v${VERSION}-${ARCH_LABEL}${APK_NAME_SUFFIX}.apk"
APK_PATH="$OUTPUT_DIR/$APK_NAME"
STAGE_APK="$STAGE_DIR/android/app/build/outputs/apk/release/app-release.apk"

# Local Expo modules can silently disappear from a stale staging copy. The
# on-device model download depends on this module for SHA-256 verification.
if ! unzip -p "$STAGE_APK" 'classes*.dex' | grep -a 'HourLoopHash' >/dev/null; then
  die "The build is missing the HourLoopHash native module."
fi

cp "$STAGE_APK" "$APK_PATH"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$APK_NAME" > "$APK_NAME.sha256")
else
  (cd "$OUTPUT_DIR" && shasum -a 256 "$APK_NAME" > "$APK_NAME.sha256")
fi

if [[ "${CLEAN_BUILD_DIR:-0}" == "1" ]]; then
  rm -rf "$STAGE_DIR"
else
  echo "Reusable native build directory: $STAGE_DIR"
fi

echo
echo "APK:     $APK_PATH"
echo "SHA-256: $OUTPUT_DIR/$APK_NAME.sha256"
ls -lh "$APK_PATH"
echo
echo "Nothing was committed or pushed. Install the APK on a device to test it."
