#!/usr/bin/env bash
# Installs Agent Console for your user and runs it as a service that starts at boot (a systemd user
# unit: no root needed).
#
#   In a copy of the repository:  ./install.sh
#   From anywhere:                curl -fsSL https://raw.githubusercontent.com/Naget-Inc/agent-console/main/install.sh | bash
#
# Settings (environment): AGENT_CONSOLE_DIR  where to clone (default ~/agent-console)
#                         AGENT_CONSOLE_REPO the git URL to clone from (default: this project on GitHub)
#                         PORT               the port (default 8790)
#                         NO_SERVICE=1       build only; start it yourself with npm start
set -euo pipefail

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\nError: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Linux ] || die "This installer is for Linux. On macOS or Windows, use Docker (see the README)."

command -v node >/dev/null || die "Node.js 22.12 or newer is needed: https://nodejs.org/en/download"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' ||
  die "Node.js $(node -v) is too old: 22.12 or newer is needed."
missing=""
for c in git tmux make g++ python3; do command -v "$c" >/dev/null || missing="$missing $c"; done
if [ -n "$missing" ]; then
  if command -v apt-get >/dev/null; then hint="sudo apt-get install -y git tmux build-essential python3"
  elif command -v dnf >/dev/null; then hint="sudo dnf install -y git tmux gcc-c++ make python3"
  elif command -v pacman >/dev/null; then hint="sudo pacman -S --needed git tmux base-devel python"
  else hint="Install them with your package manager."; fi
  die "Missing:$missing. $hint"
fi

# This copy when the script runs from one; otherwise a clone (updated when it is there already).
dir=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  grep -q '"name": "agent-console"' "$here/package.json" 2>/dev/null && dir="$here"
fi
if [ -z "$dir" ]; then
  dir="${AGENT_CONSOLE_DIR:-$HOME/agent-console}"
  if [ -d "$dir/.git" ]; then
    say "Updating $dir"
    git -C "$dir" pull --ff-only
  else
    say "Cloning into $dir"
    git clone --depth 1 "${AGENT_CONSOLE_REPO:-https://github.com/Naget-Inc/agent-console.git}" "$dir"
  fi
fi
cd "$dir"

say "Installing dependencies"
npm ci --no-audit --no-fund
say "Building"
npm run build

command -v claude >/dev/null || printf '\nNote: Claude Code is not installed (npm install -g @anthropic-ai/claude-code). Codex comes with the app.\n'

if [ "${NO_SERVICE:-}" = 1 ]; then
  say "Built. Start it with: npm start   (in $dir)"
  exit 0
fi
command -v systemctl >/dev/null || die "No systemd here. Start it with 'npm start' in $dir, or use Docker."
if [ -n "${PORT:-}" ]; then
  env_file="$HOME/.config/agent-console.env"
  mkdir -p "$(dirname "$env_file")"
  touch "$env_file"
  grep -q '^PORT=' "$env_file" && sed -i "s/^PORT=.*/PORT=$PORT/" "$env_file" || echo "PORT=$PORT" >> "$env_file"
fi
say "Starting the service"
node dist/server/cli.js service install
