#!/usr/bin/env bash
# Runs the memory evaluation from the repository root: copy of the database, collection, vectors, replay, tables.
# Reads a copy of the app's database (made here, with sqlite3's backup) and the agents' transcripts it points to; writes
# only under MEMORY_EVAL_OUT (default /tmp/memory-eval) and dist/dev. Needs a Python with ONNX Runtime, tokenizers and
# NumPy for the embedding model (HYDOR_EMBED_PYTHON; the app's own one, once search by meaning is on, will do).
# The hand-judging (judge.js, then writing judged.json and ident-judged.json) is separate: see README.md.
set -euo pipefail

OUT=${MEMORY_EVAL_OUT:-/tmp/memory-eval}
export MEMORY_EVAL_OUT=$OUT
export MEMORY_EVAL_DB=${MEMORY_EVAL_DB:-$OUT/copy.db}
export CUDA_VISIBLE_DEVICES=
# A scratch data folder: the app's own code is imported here, and must not touch the real one.
export DATA_DIR=$OUT/data
export HYDOR_EMBED_PYTHON=${HYDOR_EMBED_PYTHON:-$HOME/.web-agent/memory/venv/bin/python}
export HYDOR_EMBED_THREADS=${HYDOR_EMBED_THREADS:-8}
export OUTDIR=dist/dev

mkdir -p "$OUT" dist/dev
if [[ ! -f $MEMORY_EVAL_DB ]]; then
  sqlite3 "${HYDOR_DB:-$HOME/.web-agent/web-agent.db}" ".backup $MEMORY_EVAL_DB"
fi

nice -n 19 node scripts/build-server.mjs scripts/memory-eval/collect.ts scripts/memory-eval/embed-all.ts scripts/memory-eval/replay.ts scripts/memory-eval/judge.ts scripts/memory-eval/report.ts
for step in collect embed-all replay report; do
  echo "== $step"
  nice -n 19 node "dist/dev/$step.js"
done
