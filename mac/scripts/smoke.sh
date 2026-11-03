#!/usr/bin/env bash
# Checks a packed Mac app: its Node.js runs its server, which answers, with its native modules and tmux working.
#   scripts/smoke.sh "dist/mac-arm64/Naget Agent.app"
set -euo pipefail
app="$1"
res="$app/Contents/Resources"
codesign --verify --deep --strict "$app"
"$res/bin/tmux" -V
data="$(mktemp -d)"
port=$((20000 + RANDOM % 20000))
cleanup() { [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null; "$res/bin/tmux" -S "$data/tmux.sock" kill-server 2>/dev/null || true; rm -rf "$data"; }
trap cleanup EXIT
DATA_DIR="$data" PORT="$port" NODE_ENV=production NAGET_AGENT_ROOT="$res/server" PATH="$res/node/bin:$res/bin:$PATH" \
  "$res/node/bin/node" "$res/server/dist/server/index.js" > "$data/server.log" 2>&1 &
pid=$!
for _ in $(seq 60); do
  curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && break
  kill -0 "$pid" 2>/dev/null || { cat "$data/server.log"; echo "The server stopped." >&2; exit 1; }
  sleep 1
done
curl -fsS "http://127.0.0.1:$port/api/health" && echo
curl -fsS "http://127.0.0.1:$port/" | grep -q '<div id="root"' || { echo "The web app is not served." >&2; exit 1; }
grep -q 'listening on' "$data/server.log"
echo "The app's server starts."
