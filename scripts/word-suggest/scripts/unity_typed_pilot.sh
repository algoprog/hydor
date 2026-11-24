#!/usr/bin/env bash
# The typed-text pilot and its control on Unity: one A100 each, 1 billion tokens from the released model's checkpoint, the same settings.
# Run from the workspace login node (ssh unity); the code is a copy of this folder in $WS/code-typed, the typed corpus in $WS/data/typed.
#   [QOS=short] bash scripts/unity_typed_pilot.sh pilot|control      (QOS=short: 4 h at most, starts sooner, one such job at a time)
set -eu
WS=${WS:?set WS to the workspace on the cluster (its code/ holds this folder, data/ and runs/ go beside it)}
RUN=${1:?pilot or control}
if [ "$RUN" = pilot ]; then DATA=$WS/data/typed/corpus; MIX=$WS/data/typed/mix_pilot.json; else DATA=$WS/data/pretrain50b; MIX=$WS/code-typed/data/mix_complement.json; fi
LOG=$WS/hydor-runs/typed_$RUN.log
sbatch --parsable ${ACCOUNT:+-A "$ACCOUNT"} -p "${PART:-superpod-a100}" -N 1 --requeue --gres=gpu:1 -c 16 --mem=120G -t 04:00:00 ${QOS:+--qos=$QOS} \
  --job-name=typed_$RUN --output="$LOG" --open-mode=append --export=ALL \
  --wrap "export PATH=$WS/venv/bin:\$PATH HF_HOME=$WS/hf HF_HUB_OFFLINE=1; cd $WS/code-typed && WS=$WS CODE=$WS/code-typed NAME=typed_$RUN SIZE=30m INIT=$WS/runs/pre50b_30m_cmix/ckpt.pt DATA=$DATA MIX=$MIX NGPU=1 TOKENS=1000000000 LR=3e-4 WARMUP=100 MIN_LR_FRAC=0.1 MICRO=65536 ACCUM=4 WORKERS=6 EVAL_EVERY=500 EXTRA='--no-local-dev --loss-chunk 1024' bash scripts/unity_train.sh"
