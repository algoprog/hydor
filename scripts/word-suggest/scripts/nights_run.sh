#!/bin/bash
# The nights experiment, as it was run (GPU 1, one job at a time per command; run from the folder that holds data/, runs/, release/).
# The recipe is the app's (5e-4, warm-up min(50, steps/10), batches of 4,096 tokens, public replay 1:1); L-arms: --lr 5e-5.
#
#   scripts/nights_run.sh train NAME ARM [options]    one arm: P A B B2 C D R (see scripts/nights_sim.py), runs/nights/NAME/
#   scripts/nights_run.sh real  NAME mix|slm|llm      real decoding of the test period's chat with runs/nights/NAME/ckpt.pt
#   scripts/nights_run.sh compare SUFFIX BASE,B,C...  keystrokes saved, paired bootstrap against the first (needs runs/nights/real/<NAME>_<SUFFIX>.jsonl)
#
# train examples:   A: train A A | B: train B B | C: train C C --margin 0.02 | D: train D D | R: train R R
#                   gentler nights: train L A --lr 5e-5 | train LB B --lr 5e-5 | train LC C --lr 5e-5 --margin 0.01 | train LD D --lr 5e-5 --fresh-lr 5e-4
set -e
export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-1} WS_GPU_MEM_GB=${WS_GPU_MEM_GB:-6} TOKENIZERS_PARALLELISM=false
GP=${GP:-.venv-gpu/bin/python}; CPUPY=${CPUPY:-.venv/bin/python}
mkdir -p runs/nights/logs runs/nights/real
cmd=$1; shift
case $cmd in
  train) name=$1; arm=$2; shift 2
    nice -n 19 $GP scripts/nights_sim.py --arm $arm --out runs/nights/$name "$@" > runs/nights/logs/$name.log 2>&1 ;;
  real) name=$1; var=$2
    common="--split test --surface chat --ctx agent+user --limit 0 --words-per-example 12 --device cuda"
    if [ "$var" = mix ]; then nice -n 19 $GP scripts/real_chances.py $common --llm Qwen/Qwen3.5-0.8B-Base --slm runs/nights/$name/ckpt.pt \
        --variant "llm+slm:gate:runs/gate/flores_pre50b_30m_cmix_global.json" --events-out runs/nights/real/${name}_mix.jsonl --out runs/nights/real/${name}_mix
    elif [ "$var" = slm ]; then nice -n 19 $GP scripts/real_chances.py $common --llm none --slm runs/nights/$name/ckpt.pt --variant slm \
        --events-out runs/nights/real/${name}_slm.jsonl --out runs/nights/real/${name}_slm
    else nice -n 19 $GP scripts/real_chances.py $common --llm Qwen/Qwen3.5-0.8B-Base --slm none --variant llm \
        --events-out runs/nights/real/llm.jsonl --out runs/nights/real/llm; fi ;;
  compare) suf=$1; labels=$2; files=""
    for l in ${labels//,/ }; do files="$files runs/nights/real/${l}_${suf}.jsonl"; done
    CUDA_VISIBLE_DEVICES= nice -n 10 $CPUPY scripts/show_filter.py --compare-real $files --labels $labels --out runs/nights/real/cmp_${suf} --precisions 0.3,0.4,0.5 --boot 1000 ;;
  *) echo "train | real | compare"; exit 2 ;;
esac
