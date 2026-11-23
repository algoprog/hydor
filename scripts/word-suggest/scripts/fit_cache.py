"""E9: fit the session cache's mixing weight mu = sigmoid(a + b log(1 + cache tokens) + c [previous token in the cache])
on dev positions, for one variant, by log-likelihood (ws/cache.py).

  nice -n 19 .venv/bin/python scripts/fit_cache.py --split dev --surface chat --variant llm --llm Qwen/Qwen3.5-0.8B-Base \
      --limit 300 --threads 2 --out runs/cache/chat_llm.json
  nice -n 19 .venv/bin/python scripts/fit_cache.py --split dev --surface chat --llm Qwen/Qwen3.5-0.8B-Base \
      --slm runs/slm/lfm30m_w4/ckpt.pt --variant llm+slm:gate:runs/gate/lfm30m_w4.json --out runs/cache/chat_gate.json

For every target position of the dev examples: the log-probability the variant gives the gold token, the cache's (Witten-Bell
bigram/unigram of the session's earlier text, the target's own earlier tokens included), the cache's size and whether the previous
token is in it. Fits a, b, c by LBFGS, saves JSON, and prints the dev log-likelihood (nats per token) of the variant alone, with the
cache (fitted on all positions: optimistic) and with the cache fitted on the even examples and scored on the odd ones (and the
reverse), which is the honest comparison. Use the JSON as `<variant>|cache:<fit.json>` in scripts/eval.py.
"""
import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws.cache import SessionCache, fit_mu, mixed_loglik  # noqa: E402
from ws.evaluate import DEFAULT_LLM, Scorers, parse_variant, setup_env  # noqa: E402
from ws.textdata import add_data_args, load_examples  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap)
    ap.set_defaults(split="dev")
    ap.add_argument("--fmt", default="plain", choices=["plain", "roles"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--dtype", default="bfloat16")
    ap.add_argument("--slm", default="none")
    ap.add_argument("--ngram", default="none")
    ap.add_argument("--variant", default="llm", help="the variant the cache is mixed on, without |cache:")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--l2", type=float, default=1e-4)
    ap.add_argument("--out", required=True, help="cache fit JSON to write")
    a = ap.parse_args(argv)
    setup_env(a.threads)
    if "|cache:" in a.variant:
        raise SystemExit("--variant is the variant without the cache")

    from transformers import AutoTokenizer
    from ws.scorers import llm_vocab_size
    from ws.tokbytes import token_bytes
    tok = AutoTokenizer.from_pretrained(a.llm)
    tb = token_bytes(tok, llm_vocab_size(a.llm))
    sc = Scorers(a.llm, a.slm, a.ngram, a.dtype, a.threads, a.fmt, data_dir=a.data, tok=tok)
    v = parse_variant(a.variant)
    sc.check([v])
    exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words)
    if not exs:
        raise SystemExit("no examples")
    cache = SessionCache(tok, a.data)

    LV, LC, NN, SEEN, EX = [], [], [], [], []
    t0 = time.time()
    t_cache = 0.0
    for i, ex in enumerate(exs):
        n = len(ex.target_ids)
        r = sc.rows(ex, [v])
        lp = sc.mixed(v, r, tb, ex, {})
        gold = torch.tensor(ex.target_ids)
        LV.append(lp[torch.arange(n), gold].double())
        t1 = time.time()
        ec = cache.for_example(ex, lp.shape[1])
        LC.append(torch.from_numpy(ec.gold_logprobs()))
        NN.append(torch.from_numpy(ec.N[:n]))
        SEEN.append(torch.from_numpy(ec.seen[:n]))
        t_cache += time.time() - t1
        EX.append(torch.full((n,), i))
        if (i + 1) % 20 == 0:
            print(f"# {i + 1}/{len(exs)} {time.time() - t0:.0f}s (cache {t_cache:.1f}s)", file=sys.stderr, flush=True)
    LV, LC, NN, SEEN, EX = torch.cat(LV), torch.cat(LC), torch.cat(NN), torch.cat(SEEN), torch.cat(EX)
    P = len(LV)
    on = NN > 0
    LVc = LV.clamp_min(-60.0)

    def ll(fit, m):
        return float(mixed_loglik(fit, LV[m], LC[m], NN[m], SEEN[m]).sum())

    allm = torch.ones(P, dtype=torch.bool)
    fit = fit_mu(LV[on], LC[on], NN[on], SEEN[on], a.l2)
    fit.meta = dict(variant=a.variant, llm=a.llm, split=a.split, surface=a.surface, ctx=a.ctx, fmt=a.fmt, positions=P,
                    positions_with_cache=int(on.sum()), examples=len(exs), l2=a.l2, data=a.data)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    fit.save(a.out)
    base = float(LVc.sum())
    even = EX % 2 == 0
    held = 0.0
    for fit_m, test_m in ((even, ~even), (~even, even)):
        f2 = fit_mu(LV[on & fit_m], LC[on & fit_m], NN[on & fit_m], SEEN[on & fit_m], a.l2)
        held += ll(f2, test_m)
    mu = fit.mu(NN[on], SEEN[on])
    in_cache = float((LC[on] > -1e3).double().mean())
    row = dict(summary="session cache fit", variant=a.variant, surface=a.surface, split=a.split, examples=len(exs),
               positions=P, with_cache=int(on.sum()), gold_in_cache=in_cache, mean_mu=float(mu.mean()),
               ll_variant=base / P, ll_with_cache_fit_on_all=ll(fit, allm) / P, ll_with_cache_held_out=held / P,
               a=round(fit.a, 4), b=round(fit.b, 4), c=round(fit.c, 4), saved=a.out, cache_seconds=t_cache,
               seconds=time.time() - t0)
    print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main()
