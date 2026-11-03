#!/usr/bin/env bash
# Builds tmux for the Mac app, with libevent linked in, so it needs nothing beyond macOS itself.
#   scripts/build-tmux.sh <folder to put tmux in>
set -euo pipefail
dest="$1"
TMUX_VERSION=3.8
TMUX_SHA256=e79c699c7e949dccd0a4a125e17b8d1261e311b16979dbc8eb34542f3966d82e
LIBEVENT_VERSION=2.1.13-stable
LIBEVENT_SHA256=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c
export MACOSX_DEPLOYMENT_TARGET=12.0

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
curl -fsSL -o libevent.tar.gz "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_VERSION/libevent-$LIBEVENT_VERSION.tar.gz"
curl -fsSL -o tmux.tar.gz "https://github.com/tmux/tmux/releases/download/$TMUX_VERSION/tmux-$TMUX_VERSION.tar.gz"
echo "$LIBEVENT_SHA256  libevent.tar.gz" | shasum -a 256 -c -
echo "$TMUX_SHA256  tmux.tar.gz" | shasum -a 256 -c -
tar xzf libevent.tar.gz && tar xzf tmux.tar.gz

(cd "libevent-$LIBEVENT_VERSION" &&
  ./configure --prefix="$work/deps" --disable-shared --enable-static --disable-openssl --disable-samples --disable-libevent-regress --disable-debug-mode >/dev/null &&
  make -j"$(sysctl -n hw.ncpu)" >/dev/null && make install >/dev/null)
(cd "tmux-$TMUX_VERSION" &&
  PKG_CONFIG_PATH="$work/deps/lib/pkgconfig" \
    LIBEVENT_CFLAGS="-I$work/deps/include" LIBEVENT_LIBS="$work/deps/lib/libevent_core.a" \
    ./configure --disable-utf8proc >/dev/null &&
  make -j"$(sysctl -n hw.ncpu)" >/dev/null)

mkdir -p "$dest"
cp "tmux-$TMUX_VERSION/tmux" "$dest/tmux"
strip "$dest/tmux" 2>/dev/null || true
# Nothing but macOS's own libraries.
if otool -L "$dest/tmux" | tail -n +2 | grep -v -E '^\s*/usr/lib/|^\s*/System/'; then
  echo "tmux links to libraries macOS does not have" >&2
  exit 1
fi
"$dest/tmux" -V
