#!/usr/bin/env python
"""CPU latency of one incremental step of an SLM over the LLM's full vocabulary (factorised embedding), and with the output
restricted at run time to the tokens one language uses (a deployment option: z @ E[ids].T instead of z @ E.T).

  CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/bench_full_vocab.py --sizes 15m,30m,100m --threads 1 [--ckpt x.pt]
Prints one JSON line per (size, mode): ms per step (body + head + log-softmax), the head's share, parameter MB (fp32), and the
resident memory of the process.  Random weights are fine for timing (the cost does not depend on them); --ckpt times a real one.
"""
import argparse
import json
import os
import sys
import time

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import torch  # noqa: E402

from ws.slm import SLM, SLMConfig, load_ckpt  # noqa: E402
from ws.vocab import DEFAULT_LLM, NSPEC, Vocab  # noqa: E402


def rss_mb():
    with open('/proc/self/status') as f:
        for l in f:
            if l.startswith('VmRSS'):
                return int(l.split()[1]) / 1024
    return 0.0


def timeit(fn, n=200, warm=20):
    for _ in range(warm):
        fn()
    t = time.perf_counter()
    for _ in range(n):
        fn()
    return (time.perf_counter() - t) / n * 1000


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--sizes', default='15m,30m,100m')
    p.add_argument('--threads', type=int, default=1)
    p.add_argument('--rank', type=int, default=128)
    p.add_argument('--restrict', type=int, default=30000, help='ids one language uses')
    p.add_argument('--prefill', type=int, default=64, help='tokens already in the state (the context)')
    p.add_argument('--ckpt', default=None)
    a = p.parse_args()
    torch.set_num_threads(a.threads)
    torch.manual_seed(0)
    v = Vocab.full(DEFAULT_LLM)
    for size in a.sizes.split(','):
        if a.ckpt:
            m, v, _ = load_ckpt(a.ckpt)
            size = os.path.basename(os.path.dirname(a.ckpt))
        else:
            m = SLM(SLMConfig.for_size(size, 'lfm', v.v_sub, emb_rank=a.rank))
        m.eval()
        ids = torch.randperm(v.v_sub - NSPEC)[:a.restrict] + NSPEC
        ids = ids.sort().values
        ctx = torch.randint(NSPEC, v.v_sub, (1, a.prefill))
        with torch.inference_mode():
            for mode, out in (('full', None), (f'restricted_{a.restrict}', m.output_subset(ids))):
                _, st = m(ctx, m.init_state(1))
                tok = torch.randint(NSPEC, v.v_sub, (1, 1))

                def step():
                    nonlocal st
                    h, st2 = m.body(tok, st)
                    lg = m.head(h[:, -1], w_sub=out).float()
                    torch.log_softmax(lg, -1)
                    # the state must not grow without bound: drop the new token's key (a fixed context length)
                    st = type(st)(st.layers, st.pos)
                ms = timeit(step)
                _, st = m(ctx, m.init_state(1))
                body_ms = timeit(lambda: m.body(tok, st))
                print(json.dumps({'size': size, 'mode': mode, 'threads': a.threads, 'ms_per_step': round(ms, 3), 'body_ms': round(body_ms, 3),
                                  'head_ms': round(ms - body_ms, 3), 'params_m': round(m.n_params() / 1e6, 2),
                                  'params_mb_fp32': round(m.n_params() * 4 / 2 ** 20, 1), 'rss_mb': round(rss_mb(), 1),
                                  'vocab': v.v_sub, 'emb_rank': m.cfg.emb_rank, 'context_tokens': a.prefill}), flush=True)


if __name__ == '__main__':
    main()
