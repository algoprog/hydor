#!/usr/bin/env bash
# Puts what goes inside the desktop app in desktop/build/, for the system and processor this runs on (run it on the kind
# of computer it is for, or on a GitHub runner of that kind; scripts/dist.sh then packs it):
#   build/server  the server and the web app, built, with their production packages (native ones for this system)
#   build/node    Node.js, which runs the server and the agents' npm installs
#   build/bin     the `hydor` command's launcher (bin/hydor, and bin/hydor.cmd on Windows; the apps put it on your PATH:
#                 desktop/cli-link.cjs) and tmux, for the terminals (built from source: macOS has none, and Linux
#                 systems differ); on Windows, where the server runs terminals itself, hydor-computer.exe instead:
#                 computer use's helper, built from server/computer/windows-helper.cs with the C# compiler Windows has
#   build/BUILD   this build's name: its version, commit and when it was made (the app copies its server once per build)
# The repository must be built first: npm ci && npm run build, at its top. On Windows, run it with Git's bash.
# Settings (environment): NODE_VERSION (default below; the same major version as the one running this script)
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/.." && pwd)"
out="$here/build"
os="$(node -p process.platform)"          # darwin, linux or win32
arch="$(node -p process.arch)"            # arm64 or x64
NODE_VERSION="${NODE_VERSION:-22.23.4}"
case "$os" in
  darwin | linux) ;;
  # Git's own tools (tar, find, unzip) before Windows' programs of the same names.
  win32) export PATH="/usr/bin:$PATH" ;;
  *) echo "This stages the desktop app on macOS, Windows or Linux." >&2; exit 1 ;;
esac
# The `hydor` command inside the app: a launcher that runs the app's own Node.js on the app's own cli.js, so the command
# needs no Node.js of the user's and follows the app wherever it is.
write_launcher() {
  cat > "$1" <<'LAUNCHER'
#!/bin/sh
# The `hydor` command of the Hydor app: runs the app's own Node.js on the app's own command (server/dist/server/cli.js).
# The hydor on your PATH is a link to this file, so it finds where it is through the links first.
self="$0"
while [ -h "$self" ]; do
  dir="$(cd -P "$(dirname "$self")" && pwd -P)"
  link="$(readlink "$self")"
  case "$link" in /*) self="$link" ;; *) self="$dir/$link" ;; esac
done
res="$(cd -P "$(dirname "$self")/.." && pwd -P)"
# Inside the Mac app, `hydor` opens the app rather than starting a server of its own.
case "$res" in *.app/Contents/Resources) HYDOR_APP_BUNDLE="${res%/Contents/Resources}"; export HYDOR_APP_BUNDLE ;; esac
exec "$res/node/bin/node" "$res/server/dist/server/cli.js" "$@"
LAUNCHER
  chmod 755 "$1"
}
# The same on Windows: bin/hydor.cmd runs the app's own node.exe on the app's own cli.js, wherever the app's folder is (%~dp0 is
# the folder of this file). Its lines end in CR LF, as cmd.exe reads them best.
write_cmd_launcher() {
  printf '%s\r\n' \
    '@echo off' \
    'rem The hydor command of the Hydor app: runs the app'"'"'s own Node.js on the app'"'"'s own command (server\dist\server\cli.js).' \
    '"%~dp0..\node\node.exe" "%~dp0..\server\dist\server\cli.js" %*' \
    'exit /b %ERRORLEVEL%' > "$1"
}
# A path as Node.js reads it (Git's bash on Windows writes /d/a/…).
native() { if [ "$os" = win32 ]; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
[ -f "$root/dist/server/index.js" ] && [ -f "$root/dist/web/index.html" ] || { echo "Build the app first: npm ci && npm run build" >&2; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" = "${NODE_VERSION%%.*}" ] ||
  { echo "Run this with Node.js ${NODE_VERSION%%.*}, the version the app ships (native modules are built for it)." >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out/server" "$out/node"

echo "== The server"
cd "$root"
# What the server reads from its own folder as it runs (APP_ROOT in server/config.ts).
# (tar rather than rsync: macOS 15 ships openrsync, which lacks some of rsync's options.)
tar -cf - \
  package.json package-lock.json CHANGELOG.md LICENSE NOTICE \
  dist/server dist/web \
  server/find/shipped-vectors.json server/memory/embed_worker.py server/images/picture_worker.py server/documents/pdf/fonts \
  server/computer/x11-helper.py server/computer/windows-helper.cs \
  web/src/i18n docs/guide catalog skills plugins |
  tar -xf - -C "$out/server"
(cd "$out/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
# Prebuilt binaries for other systems are dead weight (and Apple's notary checks every binary).
plat="$os-$arch"
find "$out/server/node_modules" -maxdepth 6 -type d -path '*/prebuilds/*' ! -name "$plat" ! -name 'darwin-x64+arm64' ! -name prebuilds -prune -exec rm -rf {} + 2>/dev/null || true
find "$out/server/node_modules/better-sqlite3/prebuilds" -maxdepth 1 -type f -name '*.node' ! -name "$plat.node" -delete 2>/dev/null || true
find "$out/server/node_modules/zeromq/build" -mindepth 1 -maxdepth 1 -type d ! -name "$os" -exec rm -rf {} + 2>/dev/null || true
find "$out/server/node_modules/zeromq/build/$os" -mindepth 1 -maxdepth 1 -type d ! -name "$arch" -exec rm -rf {} + 2>/dev/null || true
# node-pty starts shells through this helper on a Mac; packages sometimes lose its executable bit.
find "$out/server/node_modules/node-pty" -name spawn-helper -exec chmod +x {} + 2>/dev/null || true
# The native modules load.
for m in better-sqlite3 node-pty zeromq; do node -e "require('$(native "$out/server/node_modules/$m")')"; done

echo "== Node.js $NODE_VERSION"
tmp="$(mktemp -d)"
case "$os" in
  darwin) dist="node-v$NODE_VERSION-darwin-$arch"; tarball="$dist.tar.gz" ;;
  linux) dist="node-v$NODE_VERSION-linux-$arch"; tarball="$dist.tar.gz" ;;
  win32) dist="node-v$NODE_VERSION-win-$arch"; tarball="$dist.zip" ;;
esac
curl -fsSL -o "$tmp/$tarball" "https://nodejs.org/dist/v$NODE_VERSION/$tarball"
curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
if command -v shasum >/dev/null; then sum="shasum -a 256 -c -"; else sum="sha256sum -c -"; fi
(cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | $sum)
if [ "$os" = win32 ]; then
  # node.exe, npm and npx at the top, as Windows' Node.js has them. (Windows' own tar reads .zip; Git's unzip may
  # not be there.)
  if command -v unzip >/dev/null; then (cd "$tmp" && unzip -q "$tarball"); else (cd "$tmp" && "$(cygpath -u "$WINDIR")/System32/tar.exe" -xf "$tarball"); fi
  cp -R "$tmp/$dist/." "$out/node/"
  rm -f "$out/node/"*.md "$out/node/install_tools.bat"
  "$out/node/node.exe" -e 'console.log("node", process.version, process.arch)'
else
  tar -xzf "$tmp/$tarball" --strip-components 1 -C "$out/node"
  rm -rf "$out/node/include" "$out/node/share" "$out/node/"*.md
  "$out/node/bin/node" -e 'console.log("node", process.version, process.arch)'
fi
rm -rf "$tmp"

if [ "$os" != win32 ]; then
  echo "== tmux"
  mkdir -p "$out/bin"
  "$here/scripts/build-tmux.sh" "$out/bin"
  echo "== The hydor command"
  write_launcher "$out/bin/hydor"
  sh -n "$out/bin/hydor"
else
  mkdir -p "$out/bin"
  echo "== The hydor command"
  write_cmd_launcher "$out/bin/hydor.cmd"
  echo "== Computer use's helper"
  framework="$(cygpath -u "$WINDIR")/Microsoft.NET/Framework64/v4.0.30319"
  [ -f "$framework/csc.exe" ] || framework="$(cygpath -u "$WINDIR")/Microsoft.NET/Framework/v4.0.30319"
  "$framework/csc.exe" -nologo -optimize+ -target:exe -out:"$(cygpath -w "$out/bin/hydor-computer.exe")" \
    -reference:System.Drawing.dll "$(cygpath -w "$root/server/computer/windows-helper.cs")"
  # It starts, and answers where the pointer and the main display are.
  answer="$(printf '{"id":1,"ops":[{"op":"info"}]}\n' | "$out/bin/hydor-computer.exe")"
  echo "$answer"
  case "$answer" in *'"ok":true'*) ;; *) echo "The helper did not answer." >&2; exit 1 ;; esac
fi

version="$(node -p "require('$(native "$root/package.json")').version")"
commit="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '%s %s %s\n' "$version" "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$out/BUILD"
cat "$out/BUILD"
du -sh "$out"/*
