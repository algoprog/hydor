#!/usr/bin/env bash
# Packs the Mac app from what scripts/stage.sh put in build/: dist/Naget-Agent-<version>-<arch>-mac.zip (what the
# app's updater downloads) and .dmg (what people download). The version is the repository's (package.json).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
[ -f build/server/dist/server/index.js ] || { echo "Run scripts/stage.sh first." >&2; exit 1; }
version="$(node -p "require('../package.json').version")"
arch="$(node -p process.arch)"
npm pkg set version="$version"
trap 'npm pkg set version=0.0.0' EXIT
npx electron-builder --mac "--$arch" --config electron-builder.cjs
ls -la dist/*.zip dist/*.dmg
