#!/usr/bin/env bash
# Puts what goes inside the Mac app in mac/build/, for this Mac's processor (run it on the Mac it is for, or on
# a GitHub runner of that kind; scripts/dist.sh then packs it):
#   build/server  the server and the web app, built, with their production packages (native ones for this Mac)
#   build/node    Node.js, which runs the server and the agents' npm installs
#   build/bin     tmux, for the terminals (built from source: macOS has none)
# The repository must be built first: npm ci && npm run build, at its top.
# Settings (environment): NODE_VERSION (default below; the same major version as the one running this script)
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/.." && pwd)"
out="$here/build"
arch="$(node -p process.arch)"            # arm64 or x64
NODE_VERSION="${NODE_VERSION:-22.23.4}"
[ "$(uname -s)" = Darwin ] || { echo "Run this on a Mac (it builds for the Mac it runs on)." >&2; exit 1; }
[ -f "$root/dist/server/index.js" ] && [ -f "$root/dist/web/index.html" ] || { echo "Build the app first: npm ci && npm run build" >&2; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" = "${NODE_VERSION%%.*}" ] ||
  { echo "Run this with Node.js ${NODE_VERSION%%.*}, the version the app ships (native modules are built for it)." >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out/server" "$out/node" "$out/bin"

echo "== The server"
cd "$root"
# What the server reads from its own folder as it runs (APP_ROOT in server/config.ts).
# (tar rather than rsync: macOS 15 ships openrsync, which lacks some of rsync's options.)
tar -cf - \
  package.json package-lock.json CHANGELOG.md LICENSE \
  dist/server dist/web \
  server/find/shipped-vectors.json server/memory/embed_worker.py \
  web/src/i18n docs/guide catalog skills plugins |
  tar -xf - -C "$out/server"
(cd "$out/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
# Prebuilt binaries for other systems are dead weight (and Apple's notary checks every binary).
find "$out/server/node_modules" -type d -path '*/prebuilds/*' -maxdepth 6 ! -name "darwin-$arch" ! -name 'darwin-x64+arm64' ! -name prebuilds -prune -exec rm -rf {} + 2>/dev/null || true
# node-pty starts shells through this helper; packages sometimes lose its executable bit.
find "$out/server/node_modules/node-pty" -name spawn-helper -exec chmod +x {} + 2>/dev/null || true
node -e "require('$out/server/node_modules/better-sqlite3')" # the native modules load
node -e "require('$out/server/node_modules/node-pty')"

echo "== Node.js $NODE_VERSION"
tmp="$(mktemp -d)"
tarball="node-v$NODE_VERSION-darwin-$arch.tar.gz"
curl -fsSL -o "$tmp/$tarball" "https://nodejs.org/dist/v$NODE_VERSION/$tarball"
curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
(cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | shasum -a 256 -c -)
tar -xzf "$tmp/$tarball" --strip-components 1 -C "$out/node"
rm -rf "$out/node/include" "$out/node/share" "$out/node/"*.md
rm -rf "$tmp"
"$out/node/bin/node" -e 'console.log("node", process.version, process.arch)'

echo "== tmux"
"$here/scripts/build-tmux.sh" "$out/bin"

du -sh "$out"/*
