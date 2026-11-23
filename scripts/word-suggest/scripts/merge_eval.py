"""Merge the outputs of `scripts/eval.py --shard k/n` runs into the metrics.jsonl and scores.jsonl of one unsharded run.

  .venv/bin/python scripts/merge_eval.py runs/eval/x/shard0 runs/eval/x/shard1 runs/eval/x/shard2 --out runs/eval/x

Every shard directory holds scores.jsonl, counts.jsonl (the per-example counts of each variant) and shard.json (which examples).
The counts are added up in the examples' original order, so every metric equals the unsharded run's (bit for bit: the sums run in
the same order); scores.jsonl is the shards' lines in the original example order. Timing fields: wall_seconds is the longest
shard's, metric_seconds and the LLM seconds are summed (compute time), llm_s_per_example and llm_tokens_per_s are recomputed
from the sums. Needs no GPU and no model.
"""
import argparse
import json
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ws.evaluate import EvalConfig, flatten_rows, group_metrics  # noqa: E402

SUM_KEYS = ("metric_seconds", "llm_seconds", "llm_examples", "llm_forward_tokens")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shards", nargs="+", help="the shard output directories (every shard of the run)")
    ap.add_argument("--out", required=True, help="directory for the merged metrics.jsonl and scores.jsonl")
    ap.add_argument("--max-k", type=int, default=48)
    a = ap.parse_args(argv)

    info = []
    for d in a.shards:
        with open(os.path.join(d, "shard.json")) as f:
            info.append((d, json.load(f)))
    n = info[0][1]["of"]
    if sorted(i["shard"] for _, i in info) != list(range(n)) or any(i["of"] != n for _, i in info):
        raise SystemExit(f"need all {n} shards 0..{n - 1}, got {sorted((i['shard'], i['of']) for _, i in info)}")
    total = info[0][1]["total_examples"]
    variants = info[0][1]["variants"]
    for d, i in info:
        if i["variants"] != variants or i["total_examples"] != total:
            raise SystemExit(f"{d}: not the same variants / examples as {info[0][0]}")
    nv = len(variants)

    # per-example counts, in the original order
    counts = {v: {} for v in variants}
    scores: dict = {}
    mlines: dict = {v: [] for v in variants}
    for d, i in info:
        with open(os.path.join(d, "counts.jsonl")) as f:
            for line in f:
                r = json.loads(line)
                counts[r["variant"]][r["idx"]] = (SimpleNamespace(surface=r["surface"], lang=r["lang"]), r["counts"])
        with open(os.path.join(d, "scores.jsonl")) as f:
            lines = f.read().splitlines()
        if len(lines) != nv * len(i["indices"]):
            raise SystemExit(f"{d}: {len(lines)} score lines for {len(i['indices'])} examples x {nv} variants")
        for p, gi in enumerate(i["indices"]):
            scores[gi] = lines[p * nv:(p + 1) * nv]
        with open(os.path.join(d, "metrics.jsonl")) as f:
            for line in f:
                r = json.loads(line)
                mlines[r["variant"]].append(r)
    missing = [g for g in range(total) if g not in scores]
    if missing:
        raise SystemExit(f"{len(missing)} examples missing, first: {missing[:5]}")

    os.makedirs(a.out, exist_ok=True)
    cfg = EvalConfig(max_k=a.max_k)
    with open(os.path.join(a.out, "scores.jsonl"), "w") as f:
        for g in range(total):
            f.write("\n".join(scores[g]) + "\n")
    out_lines = []
    for v in variants:
        items = [counts[v][g] for g in range(total)]
        m = flatten_rows(group_metrics(items, cfg))
        ms = mlines[v]
        first = ms[0]
        head = {k: first[k] for k in ("variant", "split", "ctx", "fmt", "llm", "seed") if k in first}
        line = dict(head, **m, wall_seconds=max(r["wall_seconds"] for r in ms))
        for k in SUM_KEYS:
            if k in first:
                line[k] = sum(r.get(k, 0) for r in ms)
        if "llm_seconds" in line and line.get("llm_examples"):
            line["llm_s_per_example"] = line["llm_seconds"] / line["llm_examples"]
        if line.get("llm_seconds") and "llm_forward_tokens" in line:
            line["llm_tokens_per_s"] = line["llm_forward_tokens"] / max(line["llm_seconds"], 1e-9)
        for k in ("llm_threads", "device"):
            if k in first:
                line[k] = first[k]
        line.update(shards=n, merged_from=[d for d, _ in info])
        out_lines.append(line)
        print(json.dumps(line), flush=True)
    with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
        for l in out_lines:
            f.write(json.dumps(l) + "\n")


if __name__ == "__main__":
    main()
