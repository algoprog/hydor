"""Evaluate scorers and mixtures on word suggestions (SPEC.md, Metrics).

  nice -n 19 .venv/bin/python scripts/eval.py --split test --surface chat --ctx agent+user --fmt plain \
      --llm Qwen/Qwen3.5-0.8B-Base --slm ckpt1,ckpt2 --ngram path|none \
      --variants llm,slm,ngram,llm+slm:linear:0.3,llm+slm:loglinear:0.5,llm+slm:gate:gate.json,llm+ngram:linear:0.3 \
      --limit 300 --seed 0 --threads 4 --out runs/eval/<name>

E8 (a learned show filter): `--dump-events <variant> --events-out <file>` also writes, for that one variant (one of
--variants), a line per example ({"t": "e", id, surface, lang, chars}) and one per chance (word j, letters typed k):
{"t": "c", id, j, k, L (the word's characters), bonus (1 if a single space follows), y (the suggestion is right), c
(confidence) and the features top, second, margin, ent, logn, toplen, prev, and for mixes agree, lam}. scripts/show_filter.py
reads them.

GPU: `--device cuda` (run with .venv-gpu and CUDA_VISIBLE_DEVICES=<gpu>, WS_GPU_MEM_GB=6 caps the process's GPU memory): the LLM
(bf16), the SLM, the mixing and the allowed-set statistics of the metrics run on the GPU. `--shard k/n` (k = 0 .. n-1) evaluates
every n-th example (indices k, k+n, ...); each shard writes its own --out, and scripts/merge_eval.py merges them into the
metrics.jsonl and scores.jsonl of an unsharded run (every shard also writes counts.jsonl, the per-example counts the merge adds up).

Writes <out>/metrics.jsonl (one line per variant: every metric overall, and per surface / language as
'surface.chat.acc@0', 'lang.el.bpb', ...) and <out>/scores.jsonl (one line per variant and example), and prints the
metrics lines. The first --slm checkpoint is the scorer 'slm', the next 'slm2'...; likewise 'ngram'.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws.evaluate import (DEFAULT_LLM, EvalConfig, Evaluator, Scorers, derive, flatten_rows, group_metrics,  # noqa: E402
                         parse_variant, setup_env)
from ws.textdata import add_data_args, load_examples  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap, plain_split=True)
    ap.add_argument("--fmt", default="plain", choices=["plain", "roles"])
    ap.add_argument("--llm", default=DEFAULT_LLM, help="HF name, or none")
    ap.add_argument("--dtype", default="bfloat16")
    ap.add_argument("--tokenizer", default=None, help="the LLM tokenizer (default: --llm, or Qwen3.5-0.8B-Base)")
    ap.add_argument("--slm", default="none")
    ap.add_argument("--ngram", default="none")
    ap.add_argument("--variants", default="llm")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--max-k", type=int, default=48)
    ap.add_argument("--out", default=None)
    ap.add_argument("--device", default="cpu", help="cpu | cuda | cuda:N (cuda: .venv-gpu; WS_GPU_MEM_GB caps the memory)")
    ap.add_argument("--mlm-ending", default="sep", choices=["sep", "none"],
                    help="--llm mlm:<name>: the input ends with [MASK][SEP] (sep) or with [MASK] alone (none)")
    ap.add_argument("--shard", default=None, help="k/n: this process evaluates examples k, k+n, k+2n, ... (k from 0)")
    ap.add_argument("--dump-events", default=None, help="E8: the variant (as in --variants) whose chances are written")
    ap.add_argument("--events-out", default=None, help="E8: the JSONL file of events (with --dump-events)")
    a = ap.parse_args(argv)
    setup_env(a.threads)
    from ws.gpu import setup_device
    device = setup_device(a.device)
    shard_k, shard_n = 0, 1
    if a.shard:
        try:
            shard_k, shard_n = (int(x) for x in a.shard.split("/"))
        except ValueError:
            raise SystemExit("--shard is k/n, e.g. 0/4")
        if not 0 <= shard_k < shard_n:
            raise SystemExit("--shard k/n needs 0 <= k < n")

    from transformers import AutoTokenizer
    from ws.scorers import llm_vocab_size
    from ws.tokbytes import end_token_ids, token_bytes
    from ws.mlm import load_tokenizer, parse_llm_spec
    tok_name = a.tokenizer or (parse_llm_spec(a.llm)[1] if a.llm.lower() != "none" else DEFAULT_LLM)
    tok = (AutoTokenizer.from_pretrained(tok_name) if parse_llm_spec(a.llm)[0] == "lm" or a.tokenizer
           else load_tokenizer(tok_name))
    V = llm_vocab_size(tok_name)
    tb = token_bytes(tok, V)
    ev = Evaluator(tb, end_token_ids(tok, V), EvalConfig(max_k=a.max_k), device=str(device),
                   lead_space=getattr(tok, "lead_space", False))

    variants = [parse_variant(s) for s in a.variants.split(",") if s]
    if bool(a.dump_events) != bool(a.events_out):
        raise SystemExit("--dump-events and --events-out go together")
    if a.dump_events and a.dump_events not in [v.spec for v in variants]:
        raise SystemExit(f"--dump-events {a.dump_events!r} is not one of --variants")
    sc = Scorers(a.llm, a.slm, a.ngram, a.dtype, a.threads, a.fmt, data_dir=a.data, tok=tok, device=str(device), mlm_ending=a.mlm_ending)
    sc.check(variants)
    exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words, plain_split=a.plain_split)
    if not exs:
        raise SystemExit("no examples (is data/ there? see --split/--surface)")
    total = len(exs)
    gidx = list(range(total))[shard_k::shard_n]       # the examples' places in the unsharded run
    exs = exs[shard_k::shard_n]
    if not exs:
        raise SystemExit("no examples in this shard")
    print(f"# shard {shard_k}/{shard_n}: " if a.shard else "# ", end="", file=sys.stderr)
    print(f"{len(exs)} examples, variants: {[v.spec for v in variants]}", file=sys.stderr)

    results = {v.spec: [] for v in variants}
    out = a.out
    sf = None
    if out:
        os.makedirs(out, exist_ok=True)
        sf = open(os.path.join(out, "scores.jsonl"), "w")
        cf = open(os.path.join(out, "counts.jsonl"), "w")
    gates: dict = {}
    cf = cf if out else None
    ef = None
    if a.events_out:
        os.makedirs(os.path.dirname(os.path.abspath(a.events_out)), exist_ok=True)
        ef = open(a.events_out, "w")
    t0 = time.time()
    t_eval = 0.0
    for n, ex in enumerate(exs):
        rows = sc.rows(ex, variants, alone=bool(ef))
        for v in variants:
            lp, lam = sc.mixed_lam(v, rows, tb, ex, gates)
            t1 = time.time()
            dump = ef is not None and v.spec == a.dump_events
            ev.collect = dump
            extra = None
            if dump and "llm" in rows:
                o = v.parts[1] if len(v.parts) == 2 else None
                extra = dict(llm=rows["llm"], slm=rows.get("alone:" + o) if o else None, lam=lam)
            c = ev.score(ex, lp, extra)
            if dump:
                if "chars" in c:
                    ef.write(json.dumps(dict(t="e", id=ex.id, surface=ex.surface, lang=ex.lang, chars=c["chars"])) + "\n")
                for rec in ev.chances:
                    ef.write(json.dumps(rec) + "\n")
            t_eval += time.time() - t1
            results[v.spec].append((ex, c))
            if cf:
                cf.write(json.dumps(dict(idx=gidx[n], id=ex.id, variant=v.spec, surface=ex.surface, lang=ex.lang, counts=c)) + "\n")
            if sf:
                sf.write(json.dumps(dict(id=ex.id, variant=v.spec, surface=ex.surface, lang=ex.lang,
                                         **{k: x for k, x in derive(c, ev.cfg).items()})) + "\n")
        del rows
        if (n + 1) % 10 == 0:
            print(f"# {n + 1}/{len(exs)}  {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
    if sf:
        sf.close()
        cf.close()
        with open(os.path.join(out, "shard.json"), "w") as f:
            json.dump(dict(shard=shard_k, of=shard_n, total_examples=total, examples=len(exs), indices=gidx,
                           variants=[v.spec for v in variants], device=str(device)), f)
    if ef:
        ef.close()

    speed = sc.speed()
    if device.type == "cuda":
        speed["gpu_peak_gb"] = torch.cuda.max_memory_allocated(device) / 2 ** 30
    lines = []
    for v in variants:
        m = flatten_rows(group_metrics(results[v.spec], ev.cfg))
        line = dict(variant=v.spec, split=a.split, ctx=a.ctx, fmt=a.fmt, llm=a.llm, seed=a.seed, **m,
                    wall_seconds=time.time() - t0, metric_seconds=t_eval, device=str(device), **speed)
        lines.append(line)
        print(json.dumps(line), flush=True)
    if out:
        with open(os.path.join(out, "metrics.jsonl"), "w") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")


if __name__ == "__main__":
    main()
