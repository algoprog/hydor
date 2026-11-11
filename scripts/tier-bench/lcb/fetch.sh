#!/usr/bin/env bash
# Gets what the LiveCodeBench tasks are made from, into a cache folder (default ~/.cache/hydor-bench/lcb, or the one
# named by LCB_CACHE): the problems of release v6 (test6.jsonl) and LiveCodeBench's own code at a pinned commit.
# Running it again changes nothing that is already there and right.
set -euo pipefail

CACHE="${LCB_CACHE:-$HOME/.cache/hydor-bench/lcb}"
COMMIT=28fef95ea8c9f7a547c8329f2cd3d32b92c1fa24
SHA256=bb4c364f71921c4495a6ad15abe1a927350b720009f4933e2e71f8af0f6fd1f5
URL=https://huggingface.co/datasets/livecodebench/code_generation_lite/resolve/main/test6.jsonl

mkdir -p "$CACHE"

if [ ! -f "$CACHE/test6.jsonl" ]; then
  curl -fL --retry 3 -o "$CACHE/test6.jsonl.part" "$URL"
  mv "$CACHE/test6.jsonl.part" "$CACHE/test6.jsonl"
fi
echo "$SHA256  $CACHE/test6.jsonl" | sha256sum -c --quiet - || {
  echo "test6.jsonl is not the file this was made with (the dataset may have changed): $CACHE/test6.jsonl" >&2
  exit 1
}

if [ ! -d "$CACHE/LiveCodeBench/.git" ]; then
  git clone --quiet https://github.com/LiveCodeBench/LiveCodeBench "$CACHE/LiveCodeBench"
fi
git -C "$CACHE/LiveCodeBench" checkout --quiet "$COMMIT"
echo "LiveCodeBench at $(git -C "$CACHE/LiveCodeBench" rev-parse HEAD), problems in $CACHE/test6.jsonl"
