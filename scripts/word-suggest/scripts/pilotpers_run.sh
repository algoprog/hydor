#!/bin/bash
# Pilot-pretrained vs released model, each personalised with the app's recipe on the train split, as it was run (run from the folder that holds
# data/, runs/, release/; GPU 1 or 3 only, the cap and nice as everywhere).
#
#   scripts/pilotpers_run.sh export                    app-format folders runs/pilotpers/app_{pilot,control} from the research checkpoints
#   scripts/pilotpers_run.sh texts                     the texts file (private/train.jsonl: the owner's writing, delete it when done)
#   scripts/pilotpers_run.sh train NAME INIT           personalise INIT (a folder) into runs/pilotpers/pers_NAME, and its research ckpt.pt
#   scripts/pilotpers_run.sh real GPU NAME mix|slm     real decoding of the chat test with runs/pilotpers/pers_NAME/ckpt.pt
#   scripts/pilotpers_run.sh compare OUT BASELINE.jsonl A.jsonl ...   keystrokes saved at 0.3/0.4/0.5 with paired intervals against the first
set -e
export TOKENIZERS_PARALLELISM=false PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True CUDA_DEVICE_ORDER=PCI_BUS_ID
GP=.venv-gpu/bin/python; CPUPY=.venv/bin/python; O=runs/pilotpers
cmd=$1; shift
case $cmd in
  export) mkdir -p $O
    CUDA_VISIBLE_DEVICES= nice -n 19 $CPUPY scripts/export_release.py --ckpt runs/typed/u_pilot/last.pt --out $O/app_pilot --verify
    CUDA_VISIBLE_DEVICES= nice -n 19 $CPUPY scripts/export_release.py --ckpt runs/typed/u_control/last.pt --out $O/app_control --verify ;;
  texts) mkdir -m 700 -p private; $CPUPY scripts/pilotpers.py texts --texts private/train.jsonl ;;
  train) name=$1; init=$2; mkdir -p $O/logs
    CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-3} WS_GPU_MEM_GB=${WS_GPU_MEM_GB:-6} nice -n 19 $GP scripts/pilotpers.py train --texts private/train.jsonl \
      --init $init --out $O/pers_$name > $O/logs/train_$name.log 2> $O/logs/train_$name.err
    CUDA_VISIBLE_DEVICES= $CPUPY scripts/pilotpers.py ckpt --app $O/pers_$name ;;
  real) gpu=$1; name=$2; var=$3; mkdir -p $O/real
    export CUDA_VISIBLE_DEVICES=$gpu WS_GPU_MEM_GB=${WS_GPU_MEM_GB:-6}
    common="--split test --surface chat --ctx agent+user --limit 0 --words-per-example 12 --device cuda"
    if [ "$var" = mix ]; then nice -n 19 $GP scripts/real_chances.py $common --llm Qwen/Qwen3.5-0.8B-Base --slm $O/pers_$name/ckpt.pt \
        --variant "llm+slm:gate:runs/gate/flores_pre50b_30m_cmix_global.json" --events-out $O/real/${name}_mix.jsonl --out $O/real/${name}_mix
    else nice -n 19 $GP scripts/real_chances.py $common --llm none --slm $O/pers_$name/ckpt.pt --variant slm \
        --events-out $O/real/${name}_slm.jsonl --out $O/real/${name}_slm; fi ;;
  compare) out=$1; shift; labels=""; for f in "$@"; do b=$(basename $f .jsonl); labels="$labels,$b"; done
    CUDA_VISIBLE_DEVICES= nice -n 10 $CPUPY scripts/show_filter.py --compare-real "$@" --labels ${labels#,} --out $O/real/cmp_$out --precisions 0.3,0.4,0.5 --boot 1000 ;;
  *) echo "export | texts | train | real | compare"; exit 2 ;;
esac
