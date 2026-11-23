"""CPU latency of one next-token prediction: mmBERT (exact encoding, and cached-prefix/causal) and our SLM.

  nice -n 19 .venv/bin/python scripts/bench_mlm.py --threads 1,4 --ctx 100,250 \
      --mlm jhu-clsp/mmBERT-small,jhu-clsp/mmBERT-base --slm runs/slm/pre200b_30m/ckpt.pt --out runs/eval/mlm_latency.jsonl

Per model, thread count and context length (tokens already typed), milliseconds, median of --reps runs (batch 1, CPU only):
  mmBERT exact      one full forward over [CLS] + context + [MASK] [SEP] and the head at the mask (what one keystroke costs
                    when nothing is cached: the whole left context is re-encoded)
  mmBERT cached     prefill = encode the context once with the causal mask (keeping the states); step = the new token and the
                    [MASK] after it in one pass against the cached states, plus the head and the arg max over the vocabulary;
                    query = the [MASK] alone (the first suggestion after the prefill)
  SLM               prefill = the context through the model with a state; step = one incremental token (state kept) + arg max
float32 weights unless --dtype bfloat16. The machine is shared: timings are noisy.
"""
import argparse
import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import torch  # noqa: E402


def timeit(f, reps, warm=2):
    for _ in range(warm):
        f()
    ts = []
    for _ in range(reps):
        t0 = time.perf_counter()
        f()
        ts.append(time.perf_counter() - t0)
    return statistics.median(ts) * 1000


def bench_mlm(name, ctxs, reps, dtype):
    from ws.mlm import Incremental, MLMScorer
    sc = MLMScorer(name, dtype=dtype, threads=torch.get_num_threads(), device="cpu")
    g = torch.Generator().manual_seed(0)
    out = {}
    for C in ctxs:
        ids = [sc.cls] + torch.randint(1000, 50000, (C - 1,), generator=g).tolist()
        seq = torch.tensor([ids + [sc.mask, sc.sep]])

        @torch.inference_mode()
        def exact():
            h = sc.model.model(input_ids=seq).last_hidden_state[0, C]
            return sc._head(h[None]).argmax()

        inc = Incremental(sc.model, sc.window)

        def prefill():
            fresh = Incremental(sc.model, sc.window)
            fresh.extend(ids)
            return fresh

        inc.extend(ids)
        nxt = iter(torch.randint(1000, 50000, (10000,), generator=g).tolist())

        def step():
            h = inc.step(next(nxt), sc.mask)               # the cache grows by one token per call
            return inc.logprobs(h).argmax()

        base = Incremental(sc.model, sc.window)
        base.extend(ids)

        def query():
            return base.logprobs(base.query(sc.mask)).argmax()
        out[C] = dict(exact_ms=timeit(exact, reps), cached_prefill_ms=timeit(prefill, max(3, reps // 3)),
                      cached_step_ms=timeit(step, reps), cached_query_ms=timeit(query, reps))
    return out


def bench_slm(ckpt, ctxs, reps):
    from ws.slm import load_ckpt
    model, vocab, _ = load_ckpt(ckpt)
    model.eval()
    V = int(model.cfg.vocab)
    g = torch.Generator().manual_seed(0)
    out = {}
    with torch.inference_mode():
        for C in ctxs:
            ids = torch.randint(10, min(V, 20000), (1, C), generator=g)
            _, st = model(ids, model.init_state(1))
            nxt = iter(torch.randint(10, min(V, 20000), (10000,), generator=g).tolist())

            def step():
                nonlocal st
                lg, st = model.step(torch.tensor([next(nxt)]), st)
                return lg.argmax()

            out[C] = dict(prefill_ms=timeit(lambda: model(ids, model.init_state(1), keep=1), max(3, reps // 2)),
                          step_ms=timeit(step, reps))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--threads", default="1,4")
    ap.add_argument("--ctx", default="100,250")
    ap.add_argument("--mlm", default="jhu-clsp/mmBERT-small,jhu-clsp/mmBERT-base")
    ap.add_argument("--slm", default=None)
    ap.add_argument("--dtype", default="float32")
    ap.add_argument("--reps", type=int, default=15)
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    ctxs = [int(x) for x in a.ctx.split(",")]
    rows = []
    for th in [int(x) for x in a.threads.split(",")]:
        torch.set_num_threads(th)
        for name in [x for x in a.mlm.split(",") if x]:
            for C, r in bench_mlm(name, ctxs, a.reps, a.dtype).items():
                rows.append(dict(model=name, threads=th, ctx=C, dtype=a.dtype, **r))
                print(json.dumps(rows[-1]), flush=True)
        if a.slm:
            for C, r in bench_slm(a.slm, ctxs, a.reps).items():
                rows.append(dict(model=a.slm, threads=th, ctx=C, dtype="float32", **r))
                print(json.dumps(rows[-1]), flush=True)
    if a.out:
        with open(a.out, "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
