"""Keeping the SLM current (SPEC.md, E5): over the test days, day by day, score that day's user messages with the
current model (SLM alone; NLL and bits per byte on the targets), then update it.

Modes:
- frozen:  never update.
- daily:   after each day, continued training on that day's data (user messages, agent replies, other texts) with
           replay (R x as many tokens from older data).
- message: dynamic evaluation: after each message, one small optimizer step on that message (plus optional replay).
- retrain: after each day, retrain from scratch on everything up to that day (meant for the 5m model: measures cost).

Every day's checkpoint (the model that scored that day; for `message` the model at the start of the day) is saved
as <out>/day_<YYYY-MM-DD>.pt for a later full evaluation.  CPU seconds are process CPU time (all threads).
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import torch

from .slm import SLM, SLMConfig, load_ckpt, save_ckpt
from .train import (Corpus, Metrics, Seq, TrainCfg, build_sequences, day_of, eval_seqs, fit, make_optimizer, seq_tokens,
                    train_step)

DAY_MS = 86400 * 1000


@dataclass
class OnlineCfg:
    mode: str = 'daily'                 # frozen | daily | message | retrain
    w_user: float = 4.0
    w_agent: float = 1.0
    w_doc: float = 1.0
    chunk_tokens: int = 254
    update_agent_tokens: Optional[int] = 150000   # cap on one daily update's new agent tokens (None: all)
    replay: float = 1.0                 # daily: R x new tokens of older data
    lr: float = 3e-4                    # daily update peak lr
    epochs: float = 1.0                 # daily: passes over (new + replay)
    batch_tokens: int = 16384
    msg_lr: float = 1e-4                # message mode: lr of the per-message step
    msg_steps: int = 1
    msg_replay_seqs: int = 0            # message mode: older sequences mixed into each step
    retrain_every: int = 1              # retrain every k-th day
    retrain_cfg: Optional[TrainCfg] = None
    max_days: Optional[int] = None
    bf16: bool = False
    seed: int = 0
    replay_dev: bool = False            # include the dev days in the replay pool


def test_days(corpus: Corpus) -> list[str]:
    return sorted({day_of(u['ts']) for u in corpus.users if u['split'] == 'test'})


def day_range(day: str) -> tuple[int, int]:
    import datetime as dt
    t = int(dt.datetime.strptime(day, '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    return t, t + DAY_MS


def run_online(corpus: Corpus, ckpt: str, out_dir: str, cfg: OnlineCfg, metrics: Optional[Metrics] = None,
               init_vocab_path: Optional[str] = None) -> dict:
    metrics = metrics or Metrics(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    model, vocab, ck = load_ckpt(ckpt)
    vocab_path = os.path.join(out_dir, 'vocab.json')
    vocab.save(vocab_path)
    rng = np.random.RandomState(cfg.seed)
    kw = dict(w_user=cfg.w_user, w_agent=cfg.w_agent, w_doc=cfg.w_doc, chunk_tokens=cfg.chunk_tokens, seed=cfg.seed)
    days = test_days(corpus)
    if cfg.max_days:
        days = days[:cfg.max_days]
    t_test0 = day_range(days[0])[0]
    older = (lambda k, r: r['split'] == 'train' or (cfg.replay_dev and r['split'] == 'dev'))
    pool: list[Seq] = build_sequences(corpus, vocab, older, **kw) if cfg.mode in ('daily', 'message', 'retrain') else []
    base_pool_n = len(pool)
    opt = make_optimizer(model, cfg.msg_lr, 0.0) if cfg.mode == 'message' else None
    index = []
    tot = {'nll_sum': 0.0, 'nll_iv_sum': 0.0, 'n': 0, 'n_iv': 0, 'bytes': 0, 'cpu_s': 0.0, 'wall_s': 0.0, 'tokens': 0,
           'updates': 0}
    for di, day in enumerate(days):
        lo, hi = day_range(day)
        users = [u for u in corpus.users if u['split'] == 'test' and lo <= u['ts'] < hi]
        users.sort(key=lambda u: u['ts'])
        # --- the model that scores today is saved first (for message mode: the model at the start of the day)
        cpath = os.path.join(out_dir, f'day_{day}.pt')
        if cfg.mode == 'frozen':
            if di == 0:
                save_ckpt(cpath, model, vocab_path, {'day': day, 'mode': cfg.mode})
            else:
                src = os.path.join(out_dir, f'day_{days[0]}.pt')
                if os.path.lexists(cpath):
                    os.remove(cpath)
                os.symlink(os.path.basename(src), cpath)
        else:
            save_ckpt(cpath, model, vocab_path, {'day': day, 'mode': cfg.mode})
        index.append({'day': day, 'ckpt': cpath})
        rec = {'day_index': di, 'day_ts': lo, 'n_msgs': len(users)}
        # --- score (and, in message mode, update after each message)
        s = {'nll_sum': 0.0, 'nll_iv_sum': 0.0, 'n': 0, 'n_iv': 0, 'bytes': 0}
        u_cpu = u_wall = 0.0
        u_tok = u_upd = 0
        for u in users:
            ev = build_sequences(corpus, vocab, lambda k, r, u=u: r is u, w_user=1.0, eos=False, kinds=('chat',))
            if not ev:
                continue
            was = model.training
            model.eval()
            d = eval_seqs(model, vocab, ev)
            model.train(was)
            s['nll_sum'] += d['nll_sum']
            s['nll_iv_sum'] += d['nll_iv_sum']
            s['n'] += d['dev_tokens']
            s['n_iv'] += d['n_iv']
            s['bytes'] += d['dev_bytes']
            if cfg.mode == 'message':
                up = build_sequences(corpus, vocab, lambda k, r, u=u: r is u, w_user=cfg.w_user, kinds=('chat',))
                c0, t0 = time.process_time(), time.time()
                model.train()
                batch = list(up)
                if cfg.msg_replay_seqs and pool:
                    batch += [pool[i] for i in rng.randint(0, len(pool), cfg.msg_replay_seqs)]
                for _ in range(cfg.msg_steps):
                    _, nt = train_step(model, opt, batch, cfg.msg_lr, 1.0, cfg.bf16)
                    u_tok += nt
                u_cpu += time.process_time() - c0
                u_wall += time.time() - t0
                u_upd += 1
                pool.extend(up)
        # --- today's data (all test-split records of the day)
        today = lambda k, r: lo <= r['ts'] < hi and r['split'] == 'test'
        if cfg.mode in ('daily', 'retrain'):
            new = build_sequences(corpus, vocab, today, max_agent_tokens=cfg.update_agent_tokens, **kw)
            if cfg.mode == 'daily':
                want = cfg.replay * seq_tokens(new)
                rep, got = [], 0
                for i in rng.permutation(len(pool)):
                    if got >= want:
                        break
                    rep.append(pool[i])
                    got += len(pool[i].ids) - 1
                tc = TrainCfg(lr=cfg.lr, warmup=min(5, max(1, len(new) // 50)), batch_tokens=cfg.batch_tokens,
                              epochs=cfg.epochs, bf16=cfg.bf16, eval_every=0, log_every=10 ** 9, seed=cfg.seed + di)
                c0, t0 = time.process_time(), time.time()
                r = fit(model, new + rep, tc, metrics=Metrics(None, quiet=True))
                u_cpu, u_wall, u_tok, u_upd = time.process_time() - c0, time.time() - t0, r['tokens'], r['steps']
            pool.extend(new)
            if cfg.mode == 'retrain' and (di % cfg.retrain_every == cfg.retrain_every - 1):
                tc = cfg.retrain_cfg or TrainCfg(epochs=1.0, bf16=cfg.bf16, eval_every=0, log_every=10 ** 9)
                tc.seed = cfg.seed + di
                model = SLM(SLMConfig(**ck['config']))
                torch.manual_seed(cfg.seed + di)
                c0, t0 = time.process_time(), time.time()
                r = fit(model, pool, tc, metrics=Metrics(None, quiet=True))
                u_cpu, u_wall, u_tok, u_upd = time.process_time() - c0, time.time() - t0, r['tokens'], r['steps']
        elif cfg.mode == 'message':
            # agent replies and other texts of the day join the replay pool (nothing is trained on them)
            pool.extend(build_sequences(corpus, vocab, today, max_agent_tokens=cfg.update_agent_tokens,
                                        kinds=('agent', 'doc'), **kw))
        n = max(s['n'], 1)
        rec.update({'tokens': s['n'], 'bytes': s['bytes'], 'nll': s['nll_sum'] / n,
                    'bpb': s['nll_sum'] / np.log(2) / max(s['bytes'], 1), 'nll_iv': s['nll_iv_sum'] / max(s['n_iv'], 1),
                    'oov': 1 - s['n_iv'] / n, 'update_cpu_s': u_cpu, 'update_wall_s': u_wall, 'update_tokens': u_tok,
                    'update_steps': u_upd})
        metrics.emit(rec)
        for k in ('nll_sum', 'nll_iv_sum', 'n', 'n_iv', 'bytes'):
            tot[k] += s[k]
        tot['cpu_s'] += u_cpu
        tot['wall_s'] += u_wall
        tot['tokens'] += u_tok
        tot['updates'] += u_upd
    summary = {'days': len(days), 'total_tokens': tot['n'], 'total_nll': tot['nll_sum'] / max(tot['n'], 1),
               'total_bpb': tot['nll_sum'] / np.log(2) / max(tot['bytes'], 1),
               'total_nll_iv': tot['nll_iv_sum'] / max(tot['n_iv'], 1), 'total_update_cpu_s': tot['cpu_s'],
               'total_update_wall_s': tot['wall_s'], 'total_update_tokens': tot['tokens'],
               'update_cpu_s_per_day': tot['cpu_s'] / max(len(days), 1), 'total_updates': tot['updates']}
    metrics.emit(summary)
    import json
    with open(os.path.join(out_dir, 'days.json'), 'w') as f:
        json.dump({'mode': cfg.mode, 'days': index}, f, indent=1)
    return summary
