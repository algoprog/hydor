#!/usr/bin/env bash
# E7g: build the ~50B-token corpus on Unity (a CPU job: 32 CPUs, 16 workers of 2 tokenizer threads).
# Several jobs may run this at once: tasks are claimed through $OUT/claims.  RESET_CLAIMS=1 after a killed job frees its tasks.
set -eu
WS=${WS:?set WS to the workspace on the cluster (its code/ holds this folder, data/ and runs/ go beside it)}
OUT=$WS/data/pretrain50b
cd $WS/code
export HF_HOME=$WS/hf PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=true CUDA_VISIBLE_DEVICES=""
mkdir -p "$OUT"
# the tokenizer and the model config into $HF_HOME (the GPU jobs then run offline)
python -c "from ws.vocab import DEFAULT_LLM, Vocab; v = Vocab.full(DEFAULT_LLM); print('vocab', v.v_sub)"
if [ ! -f "$OUT/plan.json" ]; then
  if mkdir "$OUT/plan.lock" 2>/dev/null; then
    python data/pretrain50b.py plan --out "$OUT" --total ${TOTAL:-50e9}
  else
    while [ ! -f "$OUT/plan.json" ]; do sleep 10; done
  fi
fi
RESET=""; { [ -n "${RESET_CLAIMS:-}" ] || [ "${SLURM_RESTART_COUNT:-0}" -gt 0 ]; } && RESET="--reset-claims"   # a requeued (preempted) job frees what it had claimed
python data/pretrain50b.py run --out "$OUT" --workers ${WORKERS:-16} --rayon ${RAYON:-2} --deadline-min ${DEADLINE_MIN:-660} $RESET
python data/pretrain50b.py merge --out "$OUT"
