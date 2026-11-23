#!/usr/bin/env bash
# Print the size metrics of an Hour Loop APK for build-experiment comparison.
# Usage: scripts/android/apk-metrics.sh builds/hour-loop-v1.9.1-arm64.apk
set -euo pipefail

APK="${1:?usage: apk-metrics.sh <apk-path>}"
[[ -f "$APK" ]] || { echo "error: no such APK: $APK" >&2; exit 1; }

command -v unzip >/dev/null 2>&1 || { echo "error: unzip is required" >&2; exit 1; }

python3 - "$APK" <<'PY'
import os, sys, zipfile

path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    entries = z.infolist()
    native = [i for i in entries if i.filename.startswith('lib/')]
    llama = [i for i in native if 'rnllama' in i.filename]
    htp = [i for i in entries if '/ggml-hexagon/' in i.filename]
    dex = [i for i in entries if i.filename.endswith('.dex')]
    bundle = [i for i in entries if i.filename == 'assets/index.android.bundle']
    abis = sorted({i.filename.split('/')[1] for i in native if len(i.filename.split('/')) > 1})

    mb = lambda n: f'{n / 1048576:.2f}'
    print(f'APK:                  {path}')
    print(f'APK file size:        {mb(os.path.getsize(path))} MiB ({os.path.getsize(path)} bytes)')
    print(f'ABIs:                 {", ".join(abis) or "none"}')
    print(f'Native libraries:     {len(native)} files, {mb(sum(i.file_size for i in native))} MiB')
    print(f'  llama.rn:           {len(llama)} files, {mb(sum(i.file_size for i in llama))} MiB')
    for i in sorted(llama, key=lambda x: -x.file_size):
        print(f'    {mb(i.file_size):>7} MiB  {i.filename.split("/")[-1]}')
    print(f'  Hexagon HTP assets: {len(htp)} files, {mb(sum(i.file_size for i in htp))} MiB')
    print(f'DEX:                  {len(dex)} files, {mb(sum(i.file_size for i in dex))} MiB')
    print(f'JS bundle:            {mb(sum(i.file_size for i in bundle))} MiB')
PY
