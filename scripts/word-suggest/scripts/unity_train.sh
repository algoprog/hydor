#!/usr/bin/env bash
# E7g: pretrain (or continue) an SLM on the 50B corpus, one superpod-a100 node (8 A100s), resumable.
#   NAME=pre50b_30m SIZE=30m INIT=$WS/runs/warm/pre200b_30m/ckpt.pt TOKENS=55000000000 LR=1e-3 MICRO=65536 ACCUM=1 bash scripts/unity_train.sh
# Output: $WS/runs/$NAME (ckpt.pt = best held-out nll, last.pt, resume.pt, step_N.pt, metrics.jsonl).  A checkpoint every CKPT_MIN (30)
# minutes; the same command after a preemption or the time limit goes on from resume.pt (INIT is then ignored).
set -eu
WS=${WS:?set WS to the workspace on the cluster (its code/ holds this folder, data/ and runs/ go beside it)}
cd ${CODE:-$WS/code}        # CODE: another checkout of this folder (a branch's), default $WS/code
: "${NAME:?}" "${SIZE:?}" "${TOKENS:?}" "${LR:?}"
OUT=$WS/runs/$NAME
mkdir -p "$OUT"
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True OMP_NUM_THREADS=4 HF_HUB_OFFLINE=1
INIT_ARG=""; [ -n "${INIT:-}" ] && INIT_ARG="--init $INIT"
MIX_ARG=""; [ -n "${MIX:-}" ] && MIX_ARG="--mix $MIX"      # MIX=$WS/code/data/mix_complement.json: tokens per language (scripts/pretrain_slm.py --mix)
CMD=(torchrun --standalone --nproc_per_node ${NGPU:-8} scripts/pretrain_slm.py --device cuda --out "$OUT" \
  --pretrain "${DATA:-$WS/data/pretrain50b}" --vocab full --emb-rank 128 --size "$SIZE" $INIT_ARG $MIX_ARG --tokens "$TOKENS" \
  --bf16 --compile --compile-head --micro-tokens "${MICRO:-65536}" --accum "${ACCUM:-1}" --lr "$LR" --warmup "${WARMUP:-300}" \
  --min-lr-frac "${MIN_LR_FRAC:-0.1}" --eval-every "${EVAL_EVERY:-1000}" --ckpt-minutes "${CKPT_MIN:-30}" --keep 2 --auto-resume \
  --mem-gb 76 --workers ${WORKERS:-6} --block-shuffle ${BLOCK:-16} --pdev-total 4000 ${EXTRA:-})
[ -n "${DRYRUN:-}" ] && { echo "${CMD[@]}"; exit 0; }
exec "${CMD[@]}"
