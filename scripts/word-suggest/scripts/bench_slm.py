#!/usr/bin/env python
"""E6: SLM cost. Training tokens/s at 1/2/4/8 threads (fp32 and bf16 autocast), inference latency at 1/2/4 threads
(260-token prefill; one incremental step with a 260-token context; fp32, bf16 weights, int8 dynamic), and memory
(parameters fp32 / int8 with torch dynamic quantization, int8 forward still works, state size).
Writes bench/slm_bench.json and bench/slm_bench.md.

  nice -n 19 .venv/bin/python scripts/bench_slm.py [--sizes 5m 15m] [--archs lfm tf] [--vocab-size 24412]
"""
import argparse
import io
import json
import os
import statistics
import sys
import time
import warnings

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
warnings.filterwarnings('ignore')

import numpy as np  # noqa: E402
import torch  # noqa: E402

from ws.slm import SIZES, SLM, SLMConfig  # noqa: E402
from ws.train import Seq, make_optimizer, train_step  # noqa: E402


def synth_batch(vocab, n_seq, L, frac=0.5, seed=0):
    rng = np.random.RandomState(seed)
    out = []
    for _ in range(n_seq):
        ids = rng.randint(6, vocab, L).astype(np.int32)
        w = (rng.rand(L) < frac).astype(np.float32)
        out.append(Seq(ids, w, 'agent', 0, 0))
    return out


def train_speed(cfg, threads, bf16, n_seq, L, steps):
    torch.set_num_threads(threads)
    torch.manual_seed(0)
    m = SLM(cfg)
    m.train()
    opt = make_optimizer(m, 1e-3, 0.1)
    batch = synth_batch(cfg.vocab, n_seq, L)
    train_step(m, opt, batch, 1e-3, 1.0, bf16)            # warm-up
    t0 = time.perf_counter()
    n = 0
    for _ in range(steps):
        n += train_step(m, opt, batch, 1e-3, 1.0, bf16)[1]
    return n / (time.perf_counter() - t0)


def timeit(f, reps, warm=2):
    for _ in range(warm):
        f()
    ts = []
    for _ in range(reps):
        t = time.perf_counter()
        f()
        ts.append(time.perf_counter() - t)
    return statistics.median(ts) * 1000


def latency(model, vocab, threads, ctx=260, reps=7, steps=30):
    """(prefill ms for ctx tokens, ms for one incremental step with ctx tokens already in the state)."""
    torch.set_num_threads(threads)
    ids = torch.randint(6, vocab, (1, ctx))
    with torch.no_grad():
        pre = timeit(lambda: model(ids, model.init_state(1), keep=1), reps)
        _, st = model(ids, model.init_state(1))
        tok = torch.randint(6, vocab, (1,))
        # the state grows by one token per step: time a few steps in a row on a copy, report the median step
        ts = []
        for _ in range(steps):
            t = time.perf_counter()
            _, st = model.step(tok, st)
            ts.append(time.perf_counter() - t)
        step = statistics.median(ts[3:]) * 1000
    return pre, step


def nbytes(sd):
    b = io.BytesIO()
    torch.save(sd, b)
    return b.tell()


def quantize(m):
    from torch.ao.quantization import float_qparams_weight_only_qconfig, quantize_dynamic
    q = quantize_dynamic(m, {torch.nn.Linear}, dtype=torch.qint8)
    qe = quantize_dynamic(q, {torch.nn.Embedding: float_qparams_weight_only_qconfig}, dtype=torch.quint8)
    return q, qe


def state_bytes(m, ctx=260):
    c = m.cfg
    kv = sum(2 * c.kv_heads * (min(ctx, c.window - 1) if (k == 's' and c.window) else ctx) * c.head_dim * 4
             for k in c.layer_types() if k != 'c')
    conv = sum((c.kernel - 1) * c.d * 4 for k in c.layer_types() if k == 'c')
    return kv + conv


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--sizes', nargs='*', default=list(SIZES))
    p.add_argument('--archs', nargs='*', default=['lfm', 'tf'])
    p.add_argument('--vocab-size', type=int, default=24412)
    p.add_argument('--train-threads', nargs='*', type=int, default=[1, 2, 4, 8])
    p.add_argument('--infer-threads', nargs='*', type=int, default=[1, 2, 4])
    p.add_argument('--train-tokens', type=int, default=8192, help='tokens per timed training step')
    p.add_argument('--seq-len', type=int, default=256)
    p.add_argument('--steps', type=int, default=2)
    p.add_argument('--kernel', type=int, default=3)
    p.add_argument('--out', default='bench')
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    res = {'vocab': a.vocab_size, 'cpu': 'AMD Threadripper PRO 9955WX (Zen 5, AVX512_BF16), shared machine',
           'torch': torch.__version__, 'rows': []}
    for arch in a.archs:
        for size in a.sizes:
            cfg = SLMConfig.for_size(size, arch, a.vocab_size, kernel=a.kernel)
            m = SLM(cfg).eval()
            row = {'arch': arch, 'size': size, 'params': m.n_params(), 'params_body': m.n_params_body(),
                   'kernel': a.kernel, 'train': {}, 'infer': {}}
            # --- memory
            q, qe = quantize(m)
            row['mem'] = {'fp32_mb': m.n_params() * 4 / 1e6, 'fp32_file_mb': nbytes(m.state_dict()) / 1e6,
                          'int8_linear_file_mb': nbytes(q.state_dict()) / 1e6,
                          'int8_all_file_mb': nbytes(qe.state_dict()) / 1e6,
                          'state_260_kb': state_bytes(m) / 1e3}
            with torch.no_grad():
                ids = torch.randint(6, a.vocab_size, (1, 40))
                ref = torch.log_softmax(m(ids)[0, -1], -1)
                out = torch.log_softmax(qe(ids)[0, -1], -1)
                row['mem']['int8_forward_ok'] = bool(torch.isfinite(out).all())
                row['mem']['int8_top1_same'] = bool(out.argmax() == ref.argmax())
                row['mem']['int8_max_abs_logprob_diff'] = float((out - ref).abs().max())
            # --- training speed
            n_seq = max(1, a.train_tokens // a.seq_len)
            for th in a.train_threads:
                for bf in (False, True):
                    tps = train_speed(cfg, th, bf, n_seq, a.seq_len, a.steps)
                    row['train'][f"{th}t_{'bf16' if bf else 'fp32'}"] = tps
                    print(arch, size, 'train', th, 'bf16' if bf else 'fp32', f'{tps:.0f} tok/s', flush=True)
            # --- inference latency
            variants = {'fp32': m, 'bf16': SLM(cfg).eval().to(torch.bfloat16), 'int8': qe}
            variants['bf16'].load_state_dict({k: v.to(torch.bfloat16) for k, v in m.state_dict().items()})
            for th in a.infer_threads:
                for name, mod in variants.items():
                    try:
                        pre, step = latency(mod, a.vocab_size, th)
                    except Exception as e:  # noqa: BLE001
                        pre, step = float('nan'), float('nan')
                        print('latency failed', name, e, file=sys.stderr)
                    row['infer'][f'{th}t_{name}'] = {'prefill260_ms': pre, 'step_ms': step}
                    print(arch, size, 'infer', th, name, f'prefill {pre:.1f} ms, step {step:.2f} ms', flush=True)
            res['rows'].append(row)
            with open(os.path.join(a.out, 'slm_bench.json'), 'w') as f:
                json.dump(res, f, indent=1)
    write_md(res, os.path.join(a.out, 'slm_bench.md'), a)


def write_md(res, path, a):
    L = [f"# SLM cost benchmark (E6)", '',
         f"{res['cpu']}; torch {res['torch']}; vocabulary {res['vocab']} (SLM ids); all CPU, `nice -n 19`, so timings are "
         f"noisy: the machine is shared. Training steps: {a.train_tokens} tokens ({a.train_tokens // a.seq_len} x "
         f"{a.seq_len}), half the positions carry a loss, median of {a.steps} timed steps after one warm-up.", '',
         '## Parameters and memory', '',
         '| arch | size | params | non-embedding | fp32 MB | int8 (Linear) MB | int8 (all) MB | state @260 tokens kB | int8 forward |',
         '|---|---|---|---|---|---|---|---|---|']
    for r in res['rows']:
        m = r['mem']
        L.append(f"| {r['arch']} | {r['size']} | {r['params']:,} | {r['params_body']:,} | {m['fp32_file_mb']:.1f} | "
                 f"{m['int8_linear_file_mb']:.1f} | {m['int8_all_file_mb']:.1f} | {m['state_260_kb']:.0f} | "
                 f"{'ok' if m['int8_forward_ok'] else 'FAILED'} (max |dlogp| {m['int8_max_abs_logprob_diff']:.2f}, "
                 f"top-1 {'same' if m['int8_top1_same'] else 'differs'}) |")
    ths = a.train_threads
    L += ['', '## Training tokens/s (input tokens per second)', '',
          '| arch | size | ' + ' | '.join(f'{t}t fp32 | {t}t bf16' for t in ths) + ' |',
          '|---|---|' + '---|' * (2 * len(ths))]
    for r in res['rows']:
        L.append(f"| {r['arch']} | {r['size']} | " + ' | '.join(
            f"{r['train'][f'{t}t_fp32']:.0f} | {r['train'][f'{t}t_bf16']:.0f}" for t in ths) + ' |')
    L += ['', '## Inference latency (ms): 260-token prefill / one incremental step (260-token state), batch 1', '']
    its = a.infer_threads
    names = ['fp32', 'bf16', 'int8']
    L += ['| arch | size | ' + ' | '.join(f'{t}t {n}' for t in its for n in names) + ' |', '|---|---|' + '---|' * (len(its) * 3)]
    for r in res['rows']:
        L.append(f"| {r['arch']} | {r['size']} | " + ' | '.join(
            f"{r['infer'][f'{t}t_{n}']['prefill260_ms']:.0f} / {r['infer'][f'{t}t_{n}']['step_ms']:.1f}"
            for t in its for n in names) + ' |')
    with open(path, 'w') as f:
        f.write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
