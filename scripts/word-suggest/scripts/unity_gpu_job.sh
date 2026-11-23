#!/usr/bin/env bash
# E7g: submit a one-node job on Unity (default: 8 GPUs on superpod-a100) and follow it, so that it shows in Hydor's Experiments.
# ACCOUNT is the Slurm account to charge (sbatch -A), when the cluster wants one.
# NGPU=0 PART=cpu makes it a CPU job; QOS=short (4 h at most) starts sooner when the queue is long.
# Hydor's own sbatch lines cannot set --nodes, which Unity demands for more than one GPU; this launcher (a 1-CPU job that waits)
# does the sbatch itself, prints the job's log as its own (the metrics lines in it are read as the run's), cancels the job when
# the launcher is stopped, and ends with the job's state as its exit code.
#   JOB_SCRIPT=scripts/unity_train.sh JOB_NAME=pre50b_30m TIME=2-00:00:00 NAME=pre50b_30m SIZE=30m ... bash scripts/unity_gpu_job.sh
set -u
WS=${WS:?set WS to the workspace on the cluster (its code/ holds this folder, data/ and runs/ go beside it)}
: "${JOB_SCRIPT:?}" "${JOB_NAME:?}"
cd $WS/code
LOG=$WS/hydor-runs/$JOB_NAME.log
touch "$LOG"
START=$(wc -c < "$LOG")
GRES=""; [ "${NGPU:-8}" -gt 0 ] && GRES="--gres=gpu:${NGPU:-8}"
SUB=$(sbatch --parsable ${ACCOUNT:+-A "$ACCOUNT"} -p "${PART:-superpod-a100}" -N 1 --requeue $GRES -c "${CPUS:-48}" --mem="${MEM:-400G}" -t "${TIME:-00:30:00}" \
      ${QOS:+--qos=$QOS} --job-name="$JOB_NAME" --output="$LOG" --open-mode=append --export=ALL --wrap "cd $WS/code && bash $JOB_SCRIPT") || exit 2
JOB=${SUB%%;*}
echo "launcher: Slurm job $JOB, log $LOG"
trap 'scancel "$JOB" 2>/dev/null; exit 143' TERM INT
tail -c +$((START + 1)) -F "$LOG" 2>/dev/null &
TAIL=$!
while [ -n "$(squeue -h -j "$JOB" 2>/dev/null)" ]; do sleep 20; done
sleep 5; kill $TAIL 2>/dev/null
STATE=$(sacct -j "$JOB" -n -P -o State 2>/dev/null | head -1 | cut -d' ' -f1)
echo "launcher: job $JOB ended: ${STATE:-unknown}"
[ "$STATE" = COMPLETED ]
