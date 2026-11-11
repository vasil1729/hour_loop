#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/builds}"
STAGE_DIR="${STAGE_DIR:-$ROOT_DIR/.apk-build}"

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

if [[ ! -d "$SDK_DIR/platforms/android-35" ]]; then
  echo "warning: Android platform 35 is missing from $SDK_DIR." >&2
  echo "         Install it with: sdkmanager 'platforms;android-35'" >&2
fi
if [[ ! -d "$SDK_DIR/build-tools/35.0.0" ]]; then
  echo "warning: Android build-tools 35.0.0 is missing from $SDK_DIR." >&2
  echo "         Install it with: sdkmanager 'build-tools;35.0.0'" >&2
fi

echo "Preparing Hour Loop v$VERSION in a temporary native build directory…"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

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

cleanup() {
  if [[ "${KEEP_BUILD_DIR:-0}" == "1" ]]; then
    echo "Native build directory kept at $STAGE_DIR"
  else
    rm -rf "$STAGE_DIR"
  fi
}
trap cleanup EXIT

(
  cd "$STAGE_DIR"
  CI=1 npx expo prebuild --platform android --no-install
  cd android
  ./gradlew :app:assembleRelease --no-daemon --console=plain
)

mkdir -p "$OUTPUT_DIR"
APK_NAME="hour-loop-v${VERSION}.apk"
APK_PATH="$OUTPUT_DIR/$APK_NAME"
cp "$STAGE_DIR/android/app/build/outputs/apk/release/app-release.apk" "$APK_PATH"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$APK_NAME" > "$APK_NAME.sha256")
else
  (cd "$OUTPUT_DIR" && shasum -a 256 "$APK_NAME" > "$APK_NAME.sha256")
fi

echo
echo "APK:     $APK_PATH"
echo "SHA-256: $OUTPUT_DIR/$APK_NAME.sha256"
ls -lh "$APK_PATH"
echo
echo "Nothing was committed or pushed. Install the APK on a device to test it."
