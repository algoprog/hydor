#!/usr/bin/env bash
# E7g: 8-GPU throughput of the 30m and 100m bodies (full vocabulary, factorised embedding) on one superpod-a100 node.
# Each run: torch.compile + compiled head, 90 s of training after 30 warm-up steps, on a small sample (data/bench_sample).
set -u
WS=${WS:?set WS to the workspace on the cluster (its code/ holds this folder, data/ and runs/ go beside it)}
cd $WS/code
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True OMP_NUM_THREADS=4
nvidia-smi -L | head -8
run() {   # size micro accum lr
  rm -rf $WS/runs/bench_$1_$2
  torchrun --standalone --nproc_per_node ${NGPU:-8} scripts/pretrain_slm.py --device cuda --out $WS/runs/bench_$1_$2 \
    --pretrain ${BENCH_DATA:-$WS/data/bench_sample} --vocab full --emb-rank 128 --size $1 --tokens 20000000000 \
    --max-seconds 90 --skip-steps 30 --bf16 --compile --compile-head --micro-tokens $2 --accum $3 --lr $4 \
    --eval-every 0 --ckpt-every 0 --log-every 10 --no-local-dev --pdev-chunks 2 --pdev-total 200 --mem-gb 78 --workers 4 \
    > $WS/runs/bench_$1_$2.log 2>&1
  python - <<PY
import json,re
rows=[json.loads(l) for l in open("$WS/runs/bench_$1_$2.log") if l.startswith('{"step"') and '"tokens_per_s"' in l]
tps=[r["tokens_per_s"] for r in rows[-5:]]
mem=max([r.get("mem_gb",0) for r in rows] or [0])
print(json.dumps({"bench":"$1","micro_tokens":$2,"accum":$3,"gpus":${NGPU:-8},"tokens_per_s":round(sum(tps)/max(len(tps),1)),"peak_mem_gb":round(mem,2),"oom":"OutOfMemory" in open("$WS/runs/bench_$1_$2.log").read()}),flush=True)
PY
}
run 30m 32768 2 1.5e-3
run 30m 65536 1 1.5e-3
run 100m 32768 2 8e-4
run 100m 65536 1 8e-4
