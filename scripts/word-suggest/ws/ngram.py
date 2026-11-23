"""Token-level interpolated Kneser-Ney n-gram model (order 4 by default) on SLM ids, with weighted counts.

Training data: sequences (ids, per-position weights) as for the SLM; a position with weight > 0 is a prediction
whose count is its weight (weights are count multipliers).  Highest order uses the weighted counts; lower orders
use continuation counts (the weighted number of distinct left extensions; a type's weight is the largest weight
among its occurrences).  Discount D_n = n1/(n1+2*n2) from the unweighted counts; for fractional weights the
discount is scaled (D * min(1, weighted/raw)) so that a count never goes negative.  Histories shorter than
order-1 are padded with a PAD id (= V_sub).  P(.|h) is a full distribution over the SLM vocabulary
(<bos> <agent> <user> <doc> get probability 0), sums to 1.
"""
from __future__ import annotations

import json
import os
from typing import Optional, Sequence

import numpy as np
import torch

from .vocab import EOS, NEVER_PREDICT, NSPEC, UNK, Vocab

_M1 = np.uint64(0x9E3779B97F4A7C15)
_M2 = np.uint64(0xFF51AFD7ED558CCD)
_M3 = np.uint64(0xC4CEB9FE1A85EC53)


def _mix(h: np.ndarray) -> np.ndarray:
    h = h ^ (h >> np.uint64(33))
    h = h * _M2
    h = h ^ (h >> np.uint64(33))
    h = h * _M3
    return h ^ (h >> np.uint64(33))


def hash_cols(cols: Sequence[np.ndarray], n: Optional[int] = None) -> np.ndarray:
    """64-bit hash of rows given as columns (oldest first); no columns -> zeros of length n."""
    if not len(cols):
        return np.zeros(n or 0, dtype=np.uint64)
    h = np.zeros(len(cols[0]), dtype=np.uint64)
    with np.errstate(over='ignore'):
        for c in cols:
            h = _mix(h * _M1 + (c.astype(np.uint64) + np.uint64(1)))
    return h


def _group(rows: np.ndarray, cw_in: np.ndarray, craw_in: np.ndarray, tw_in: np.ndarray):
    """Collapse identical rows: (unique rows, sum of cw, sum of craw, max of tw)."""
    key = hash_cols([rows[:, j] for j in range(rows.shape[1])])
    o = np.argsort(key, kind='stable')
    ks = key[o]
    start = np.flatnonzero(np.concatenate([[True], ks[1:] != ks[:-1]]))
    rep = o[start]
    return (rows[rep], np.add.reduceat(cw_in[o], start), np.add.reduceat(craw_in[o], start),
            np.maximum.reduceat(tw_in[o], start))


class KNModel:
    def __init__(self, order: int, v_sub: int, levels: list[dict], meta: Optional[dict] = None):
        self.order, self.v_sub, self.levels, self.meta = order, v_sub, levels, meta or {}
        self.pad = v_sub
        allowed = np.ones(v_sub, dtype=bool)
        allowed[list(NEVER_PREDICT)] = False
        self.uniform = allowed.astype(np.float64) / allowed.sum()

    # ---- training -----------------------------------------------------------------------------------------
    @classmethod
    def build(cls, seqs, v_sub: int, order: int = 4, meta: Optional[dict] = None) -> 'KNModel':
        """seqs: iterable of (ids, w) with w[i] the weight of predicting ids[i] from ids[:i]."""
        pad = v_sub
        toks, ws = [], []
        padding = np.full(order - 1, pad, dtype=np.int64)
        for ids, w in seqs:
            toks.append(np.concatenate([padding, np.asarray(ids, dtype=np.int64)]))
            ws.append(np.concatenate([np.zeros(order - 1), np.asarray(w, dtype=np.float64)]))
        tok, w = np.concatenate(toks), np.concatenate(ws)
        idx = np.flatnonzero(w > 0)
        rows = np.stack([tok[idx - (order - 1 - j)] for j in range(order)], axis=1)
        occ = w[idx]
        del tok, w
        tables = {order: _group(rows, occ, np.ones(len(occ)), occ)}
        del rows
        for n in range(order - 1, 0, -1):
            r, cw, craw, tw = tables[n + 1]
            tables[n] = _group(r[:, 1:], tw, np.ones(len(tw)), tw)
        levels = [None] * (order + 1)
        for n in range(1, order + 1):
            r, cw, craw, tw = tables[n]
            n1, n2 = float((craw == 1).sum()), float((craw == 2).sum())
            D = min(0.95, max(0.2, n1 / (n1 + 2 * n2))) if n1 + n2 > 0 else 0.75
            adj = cw - D * np.minimum(1.0, cw / craw)
            ctx = hash_cols([r[:, j] for j in range(n - 1)], len(r))
            o = np.argsort(ctx, kind='stable')
            ctx, cw, adj, words = ctx[o], cw[o], adj[o], r[o, -1]
            start = np.flatnonzero(np.concatenate([[True], ctx[1:] != ctx[:-1]]))
            ctot = np.add.reduceat(cw, start)
            gamma = np.clip(1.0 - np.add.reduceat(adj, start) / ctot, 0.0, 1.0)
            reps = np.diff(np.concatenate([start, [len(ctx)]]))
            levels[n] = {'ctx': ctx[start], 'start': np.concatenate([start, [len(ctx)]]).astype(np.int64),
                         'gamma': gamma, 'words': words.astype(np.int32),
                         'p': (adj / np.repeat(ctot, reps)).astype(np.float32), 'D': D}
        m = dict(meta or {})
        m['discounts'] = [levels[n]['D'] for n in range(1, order + 1)]
        m['n_entries'] = [len(levels[n]['words']) for n in range(1, order + 1)]
        return cls(order, v_sub, levels, m)

    # ---- query --------------------------------------------------------------------------------------------
    def dist(self, hists: np.ndarray) -> np.ndarray:
        """hists [n, order-1] int (PAD = v_sub on the left) -> [n, V_sub] float64 probabilities."""
        n = hists.shape[0]
        out = np.empty((n, self.v_sub), dtype=np.float64)
        keys = {}
        for k in range(self.order):             # context of k tokens = the last k history tokens
            cols = [hists[:, self.order - 1 - k + j] for j in range(k)]
            keys[k + 1] = hash_cols(cols, n)
        for i in range(n):
            P = self.uniform
            for lv in range(1, self.order + 1):
                L = self.levels[lv]
                key = keys[lv][i]
                j = int(np.searchsorted(L['ctx'], key))
                if j < len(L['ctx']) and L['ctx'][j] == key:
                    a, b = L['start'][j], L['start'][j + 1]
                    P = P * L['gamma'][j]
                    P[L['words'][a:b]] += L['p'][a:b]
            out[i] = P
        return out

    # ---- save / load ----------------------------------------------------------------------------------------
    def save(self, path: str, vocab_path: Optional[str] = None) -> None:
        d = os.path.dirname(os.path.abspath(path))
        os.makedirs(d, exist_ok=True)
        meta = dict(self.meta)
        meta.update(order=self.order, v_sub=self.v_sub)
        if vocab_path:
            meta['vocab'] = os.path.relpath(os.path.abspath(vocab_path), d)
            meta['vocab_abs'] = os.path.abspath(vocab_path)
        arrs = {'meta': np.frombuffer(json.dumps(meta).encode(), dtype=np.uint8)}
        for n in range(1, self.order + 1):
            for k in ('ctx', 'start', 'gamma', 'words', 'p'):
                arrs[f'l{n}_{k}'] = self.levels[n][k]
        np.savez(path + '.tmp.npz', **arrs)
        os.replace(path + '.tmp.npz', path)

    @classmethod
    def load(cls, path: str) -> 'KNModel':
        z = np.load(path)
        meta = json.loads(bytes(z['meta']).decode())
        order = meta['order']
        levels: list = [None]
        for n in range(1, order + 1):
            levels.append({k: z[f'l{n}_{k}'] for k in ('ctx', 'start', 'gamma', 'words', 'p')})
        return cls(order, meta['v_sub'], levels, meta)


class NgramScorer:
    """Scorer contract of ws/types.py with the interpolated Kneser-Ney model (same output as SLMScorer)."""

    def __init__(self, path: str):
        self.model = KNModel.load(path)
        meta = self.model.meta
        vp = os.path.join(os.path.dirname(os.path.abspath(path)), meta.get('vocab', ''))
        if not os.path.isfile(vp):
            vp = meta['vocab_abs']
        self.vocab = Vocab.load(vp)
        assert self.vocab.v_sub == self.model.v_sub
        self.name = f"ngram{self.model.order}:{os.path.basename(os.path.dirname(os.path.abspath(path)))}"

    def slm_logprobs(self, ex) -> torch.Tensor:
        prefix = self.vocab.slm_prefix_ids(ex)
        tgt = self.vocab.target_slm_ids(ex)
        ids = np.asarray(prefix + tgt, dtype=np.int64)
        h = self.model.order - 1
        padded = np.concatenate([np.full(h, self.model.pad, dtype=np.int64), ids])
        # rows: the position before each target token (index len(prefix)-1 .. end), history = the h ids before it +1
        pos = np.arange(len(prefix), len(ids) + 1)            # index in ids of the token being predicted
        hists = np.stack([padded[pos + j] for j in range(h)], axis=1)   # padded index = ids index + h
        p = self.model.dist(hists)
        return torch.from_numpy(np.log(np.maximum(p, 1e-300))).float().masked_fill(
            torch.from_numpy(p == 0), float('-inf'))

    def logprobs(self, ex, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor:
        return self.vocab.spread(self.slm_logprobs(ex), llm_lp)


def eval_ngram(kn: KNModel, vocab: Vocab, seqs) -> dict:
    """Same numbers as ws.train.eval_seqs for the n-gram: NLL and bits per byte over positions with weight > 0."""
    import math
    log_out = math.log(max(vocab.n_outside, 1))
    h = kn.order - 1
    tot = tot_iv = 0.0
    n = n_iv = 0
    for s in seqs:
        ids = np.asarray(s.ids, dtype=np.int64)
        pos = np.flatnonzero(np.asarray(s.w) > 0)
        if not len(pos):
            continue
        padded = np.concatenate([np.full(h, kn.pad, dtype=np.int64), ids])
        hists = np.stack([padded[pos + j] for j in range(h)], axis=1)
        p = kn.dist(hists)
        gold = ids[pos]
        nll = -np.log(np.maximum(p[np.arange(len(pos)), gold], 1e-300))
        oov = gold == UNK
        tot += float(nll.sum() + oov.sum() * log_out)
        tot_iv += float(nll[~oov].sum())
        n += len(pos)
        n_iv += int((~oov).sum())
    nbytes = sum(s.nbytes for s in seqs)
    return {'dev_nll': tot / max(n, 1), 'dev_bpb': tot / math.log(2) / max(nbytes, 1), 'dev_nll_iv': tot_iv / max(n_iv, 1),
            'dev_oov': 1 - n_iv / max(n, 1), 'dev_tokens': n, 'dev_bytes': nbytes}
