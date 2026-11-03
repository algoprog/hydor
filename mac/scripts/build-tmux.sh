#!/usr/bin/env bash
# Builds tmux for the Mac app with its libraries linked in (libevent, and the two tmux asks for on macOS:
# jemalloc, as macOS's calloc does not always clear memory, and utf8proc, for the width of emoji and other
# complex characters), so it needs nothing beyond macOS itself.
#   scripts/build-tmux.sh <folder to put tmux in>
set -euo pipefail
dest="$(mkdir -p "$1" && cd "$1" && pwd)"
TMUX_VERSION=3.8
TMUX_SHA256=e79c699c7e949dccd0a4a125e17b8d1261e311b16979dbc8eb34542f3966d82e
LIBEVENT_VERSION=2.1.13-stable
LIBEVENT_SHA256=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c
JEMALLOC_VERSION=5.4.0
JEMALLOC_SHA256=200776fac271093e7c2f21edd6d62657ecd2be578d9328633f2a86bfa6ef4f1d
UTF8PROC_VERSION=2.12.0
UTF8PROC_SHA256=a393fbef160835fb315bc3e91ba8d86f7a73a7cec9e6198b6c60b848b498bfeb
export MACOSX_DEPLOYMENT_TARGET=12.0
jobs="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
sum() { if command -v shasum >/dev/null; then shasum -a 256 -c -; else sha256sum -c -; fi; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
deps="$work/deps"
mkdir -p "$deps/include" "$deps/lib"
get() { curl -fsSL -o "$1" "$2" && echo "$3  $1" | sum; }
get libevent.tar.gz "https://github.com/libevent/libevent/releases/download/release-$LIBEVENT_VERSION/libevent-$LIBEVENT_VERSION.tar.gz" "$LIBEVENT_SHA256"
get jemalloc.tar.bz2 "https://github.com/jemalloc/jemalloc/releases/download/$JEMALLOC_VERSION/jemalloc-$JEMALLOC_VERSION.tar.bz2" "$JEMALLOC_SHA256"
get utf8proc.tar.gz "https://github.com/JuliaStrings/utf8proc/releases/download/v$UTF8PROC_VERSION/utf8proc-$UTF8PROC_VERSION.tar.gz" "$UTF8PROC_SHA256"
get tmux.tar.gz "https://github.com/tmux/tmux/releases/download/$TMUX_VERSION/tmux-$TMUX_VERSION.tar.gz" "$TMUX_SHA256"
for f in libevent.tar.gz jemalloc.tar.bz2 utf8proc.tar.gz tmux.tar.gz; do tar xf "$f"; done

echo "libevent"
(cd "libevent-$LIBEVENT_VERSION" &&
  ./configure --prefix="$deps" --disable-shared --enable-static --disable-openssl --disable-samples --disable-libevent-regress --disable-debug-mode >/dev/null &&
  make -j"$jobs" >/dev/null && make install >/dev/null)
echo "jemalloc"
(cd "jemalloc-$JEMALLOC_VERSION" &&
  ./configure --prefix="$deps" --disable-cxx --disable-doc >/dev/null &&
  make -j"$jobs" build_lib_static >/dev/null && make install_include install_lib_static >/dev/null)
echo "utf8proc"
(cd "utf8proc-$UTF8PROC_VERSION" && make -j"$jobs" libutf8proc.a >/dev/null && cp libutf8proc.a "$deps/lib/" && cp utf8proc.h "$deps/include/")

echo "tmux"
# The whole of jemalloc goes in: on macOS it takes over malloc by registering itself as it loads, which a
# static link would otherwise leave out.
if [ "$(uname -s)" = Darwin ]; then force_load="-Wl,-force_load,$deps/lib/libjemalloc.a"; else force_load="$deps/lib/libjemalloc.a -lpthread"; fi
(cd "tmux-$TMUX_VERSION" &&
  LIBEVENT_CORE_CFLAGS="-I$deps/include" LIBEVENT_CORE_LIBS="$deps/lib/libevent_core.a" \
    LIBEVENT_CFLAGS="-I$deps/include" LIBEVENT_LIBS="$deps/lib/libevent_core.a" \
    JEMALLOC_CFLAGS="-I$deps/include" JEMALLOC_LIBS="$force_load" \
    LIBUTF8PROC_CFLAGS="-I$deps/include" LIBUTF8PROC_LIBS="$deps/lib/libutf8proc.a" \
    ./configure --enable-jemalloc --enable-utf8proc > configure.log ||
    { tail -30 configure.log; exit 1; }
  grep -E 'checking for (jemalloc|libutf8proc|libevent)' configure.log || true
  make -j"$jobs" >/dev/null)

cp "tmux-$TMUX_VERSION/tmux" "$dest/tmux"
strip "$dest/tmux" 2>/dev/null || true
# Nothing but the system's own libraries.
if command -v otool >/dev/null; then
  if otool -L "$dest/tmux" | tail -n +2 | grep -v -E '^\s*/usr/lib/|^\s*/System/'; then
    echo "tmux links to libraries macOS does not have" >&2
    exit 1
  fi
fi
"$dest/tmux" -V
# jemalloc and utf8proc are in it.
for lib in jemalloc utf8proc; do grep -a -q "using $lib" "$dest/tmux" || { echo "$lib is not in tmux" >&2; exit 1; }; done
