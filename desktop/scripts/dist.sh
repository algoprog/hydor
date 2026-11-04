#!/usr/bin/env bash
# Packs the desktop app from what scripts/stage.sh put in build/, for the system and processor this runs on:
#   macOS    dist/Hydor-<version>-<arch>-mac.zip (what the app's updater downloads) and .dmg (what people download)
#   Windows  dist/Hydor-<version>-<arch>-win.exe (the installer, which the updater runs too)
#   Linux    dist/Hydor-<version>-<arch>.AppImage and .deb (electron-builder names Linux processors its own way:
#            x86_64 and arm64 for the AppImage, amd64 and arm64 for the .deb)
# The version is the repository's (package.json).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
[ -f build/server/dist/server/index.js ] || { echo "Run scripts/stage.sh first." >&2; exit 1; }
version="$(node -p "require('../package.json').version")"
arch="$(node -p process.arch)"
case "$(node -p process.platform)" in
  darwin) target=--mac ;;
  win32) target=--win ;;
  linux) target=--linux ;;
  *) echo "This packs the desktop app on macOS, Windows or Linux." >&2; exit 1 ;;
esac
npm pkg set version="$version"
trap 'npm pkg set version=0.0.0' EXIT
npx electron-builder "$target" "--$arch" --config electron-builder.cjs
ls -la dist/*.zip dist/*.dmg dist/*.exe dist/*.AppImage dist/*.deb 2>/dev/null || true
