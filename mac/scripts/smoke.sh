#!/usr/bin/env bash
# Checks a packed Mac app: its Node.js runs its server, which answers, with its native modules and tmux working.
#   scripts/smoke.sh "dist/mac-arm64/Hydor.app"
set -euo pipefail
codesign --verify --deep --strict "$1"
# A copy away from the repository, so the server can only use what is inside the app (Node.js looks for
# packages in every folder above it, and the repository's own node_modules would do).
data="$(mktemp -d)"
ditto "$1" "$data/Hydor.app"
app="$data/Hydor.app"
res="$app/Contents/Resources"
"$res/bin/tmux" -V
test -d "$res/server/node_modules/fastify" || { echo "The server's packages are not in the app." >&2; exit 1; }
port=$((20000 + RANDOM % 20000))
cleanup() { [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null; "$res/bin/tmux" -S "$data/data/tmux.sock" kill-server 2>/dev/null || true; rm -rf "$data"; }
trap cleanup EXIT
mkdir -p "$data/data"
cd "$data"
DATA_DIR="$data/data" PORT="$port" NODE_ENV=production HYDOR_ROOT="$res/server" PATH="$res/node/bin:$res/bin:$PATH" \
  "$res/node/bin/node" "$res/server/dist/server/index.js" > "$data/server.log" 2>&1 &
pid=$!
for _ in $(seq 60); do
  curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && break
  kill -0 "$pid" 2>/dev/null || { cat "$data/server.log"; echo "The server stopped." >&2; exit 1; }
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/api/health" && echo
page="$(curl -fsS "http://127.0.0.1:$port/")"
case "$page" in *'<div id="root"'*) ;; *) echo "The web app is not served." >&2; exit 1 ;; esac
grep -q 'listening on' "$data/server.log"
echo "The app's server starts."
