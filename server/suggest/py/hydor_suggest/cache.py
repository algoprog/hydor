"""The session cache: a token cache of what was already written in a chat, mixed on top of the plan's distribution.

The cache holds the counts of the session's earlier texts (every earlier agent reply, the person's earlier messages; each text is its
own sequence, so no pair of tokens crosses a text boundary) and of the target's own earlier tokens as they are typed. Tokens are
Qwen ids.

P_cache(w | h): an interpolated bigram/unigram model, Witten-Bell. With c(h, w) the bigram counts, c(h) = sum_w c(h, w), T(h) the
number of distinct followers of h and P_uni(w) = count(w) / N (N = tokens in the cache):
    P(w | h) = (c(h, w) + T(h) * P_uni(w)) / (c(h) + T(h))        (P_uni(w) when h was never followed by anything)
It sums to 1 over the cache's tokens and is 0 outside it. The history of a text's first token is a text-start marker.

Mixed with the plan's distribution: P = (1 - mu) P_plan + mu P_cache, mu = sigmoid(a + b log(1 + N) + c [the previous token is in the
cache]) (mu = 0 while the cache is empty); the previous token counts as in the cache if it occurs there apart from the occurrence just
typed. a, b, c were fitted by the research on development chat messages, per plan.
"""
from __future__ import annotations

import math
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np


@dataclass
class CacheFit:
    a: float
    b: float
    c: float

    def mu(self, N: float, seen: int) -> float:
        if N <= 0:
            return 0.0
        z = self.a + self.b * math.log1p(N) + self.c * seen
        return 1.0 / (1.0 + math.exp(-z))


# the research's fits (E9, chat, development messages) for the variant each plan decodes: the mix of both models, Qwen3.5 alone;
# the small model alone has none of its own and takes the mix's
DEFAULT_FITS = {
    'mix': CacheFit(-6.767442628857174, 0.1627437939917934, 1.153333431395821),
    'llm': CacheFit(-7.622039160450995, 0.36632966933677874, 1.1195938076787828),
}
DEFAULT_FITS['slm'] = DEFAULT_FITS['mix']


class CacheBase:
    """Counts of a set of token sequences (ids < V), never changed after it is built."""

    def __init__(self, V: int, seqs: Sequence):
        self.V = V
        self.bos = V
        parts = []
        for s in seqs:
            if len(s):
                parts.append(np.concatenate((np.array([V], dtype=np.int64), np.asarray(s, dtype=np.int64))))
        if parts:
            cat = np.concatenate(parts)
            tok = cat[cat != V]
            self.uids, cnt = np.unique(tok, return_counts=True)
            self.ucnt = cnt.astype(np.float64)
            self.N = int(len(tok))
            h, w = cat[:-1], cat[1:]
            m = w != V
            self.bk, self.bc = np.unique(h[m] * (V + 1) + w[m], return_counts=True)
        else:
            self.uids, self.ucnt, self.N = np.zeros(0, np.int64), np.zeros(0, np.float64), 0
            self.bk, self.bc = np.zeros(0, np.int64), np.zeros(0, np.int64)


class CacheState:
    """A base plus what was added since (the target's tokens); fork() makes a copy that can grow on its own."""

    def __init__(self, base: CacheBase):
        self.base = base
        self.bos = base.bos
        self.N = base.N
        self.dyn_uni: dict = {}
        self.dyn_bi: dict = {}
        self._own: set = set()          # the histories whose follower dict this state owns (copy on write)
        self._merged: Optional[tuple] = None

    def fork(self) -> 'CacheState':
        c = CacheState(self.base)
        c.N = self.N
        c.dyn_uni = dict(self.dyn_uni)
        c.dyn_bi = dict(self.dyn_bi)             # the inner dicts are shared until written (_own is empty)
        return c

    def add(self, h: int, w: int) -> None:
        """The token w came after history h (h = bos at the start of a text)."""
        self.N += 1
        self.dyn_uni[w] = self.dyn_uni.get(w, 0) + 1
        d = self.dyn_bi.get(h)
        if d is None or h not in self._own:
            d = dict(d) if d else {}
            self.dyn_bi[h] = d
            self._own.add(h)
        d[w] = d.get(w, 0) + 1
        self._merged = None

    def add_sequence(self, seq: Sequence) -> None:
        h = self.bos
        for w in seq:
            self.add(h, int(w))
            h = int(w)

    def _uni(self) -> tuple:
        if not self.dyn_uni:
            return self.base.uids, self.base.ucnt
        if self._merged is None:
            d_ids = np.fromiter(self.dyn_uni.keys(), np.int64, len(self.dyn_uni))
            d_c = np.fromiter(self.dyn_uni.values(), np.float64, len(self.dyn_uni))
            ids = np.concatenate([self.base.uids, d_ids])
            c = np.concatenate([self.base.ucnt, d_c])
            u, inv = np.unique(ids, return_inverse=True)
            self._merged = (u, np.bincount(inv, weights=c, minlength=len(u)))
        return self._merged

    def count(self, w: int) -> float:
        ids, cnt = self._uni()
        i = int(np.searchsorted(ids, w))
        return float(cnt[i]) if i < len(ids) and ids[i] == w else 0.0

    def followers(self, h: int) -> tuple:
        b = self.base
        lo = int(np.searchsorted(b.bk, h * (b.V + 1)))
        hi = int(np.searchsorted(b.bk, (h + 1) * (b.V + 1)))
        ws, cs = b.bk[lo:hi] - h * (b.V + 1), b.bc[lo:hi].astype(np.float64)
        d = self.dyn_bi.get(h)
        if d:
            m = dict(zip(ws.tolist(), cs.tolist()))
            for w, n in d.items():
                m[w] = m.get(w, 0.0) + n
            ws, cs = np.fromiter(m.keys(), np.int64, len(m)), np.fromiter(m.values(), np.float64, len(m))
        return ws, cs

    def seen(self, h: int, own: int = 0) -> int:
        """1 if the previous token h is in the cache apart from its own latest occurrence (own = 1 when h is the target's token just
        typed, which is already counted); at the start of a text (h = bos): 1 if the cache holds anything."""
        if self.N == 0:
            return 0
        return 1 if h == self.bos else int(self.count(h) - own > 0)

    def row(self, h: int) -> tuple:
        """(ids, probabilities) of P(. | h) over the cache's tokens (they sum to 1; needs N > 0)."""
        ws, cs = self.followers(h)
        ids, cnt = self._uni()
        p = cnt / cnt.sum()
        c, T = float(cs.sum()), len(ws)
        if c > 0:
            p = p * (T / (c + T))
            p[np.searchsorted(ids, ws)] += cs / (c + T)
        return ids, p

    def prob(self, h: int, w: int) -> float:
        if self.N == 0:
            return 0.0
        ids, p = self.row(h)
        i = int(np.searchsorted(ids, w))
        return float(p[i]) if i < len(ids) and ids[i] == w else 0.0

    def mix(self, p: np.ndarray, history: Optional[int], typed: bool, fit: CacheFit) -> np.ndarray:
        """P = (1 - mu) p + mu P_cache for the row after a history (None: the start of the target). typed: the history token is the
        target's own (it is counted in the cache already)."""
        h = self.bos if history is None else int(history)
        mu = fit.mu(self.N, self.seen(h, 1 if typed else 0))
        if mu <= 0.0:
            return p
        ids, pc = self.row(h)
        out = (1.0 - mu) * p
        out[ids] += (mu * pc).astype(out.dtype)
        return out


class SessionCaches:
    """The caches of the last `size` sessions: the earlier texts the client sent, tokenized once."""

    def __init__(self, V: int, size: int = 20):
        self.V, self.size = V, size
        self._items: OrderedDict = OrderedDict()

    def set(self, session: str, token_seqs: Sequence) -> None:
        self._items[session] = {'base': CacheBase(self.V, token_seqs), 'extra_key': None, 'extra': None}
        self._items.move_to_end(session)
        while len(self._items) > self.size:
            self._items.popitem(last=False)

    def state(self, session: Optional[str], extras: Sequence = (), extra_key=None) -> CacheState:
        """A fresh state for a request: the session's base (empty if unknown) plus the extra sequences (the agent's last reply, the
        person's previous message), which are kept between requests while `extra_key` stays the same."""
        item = self._items.get(session) if session else None
        if item is None:
            st = CacheState(CacheBase(self.V, ()))
            for s in extras:
                st.add_sequence(s)
            return st
        self._items.move_to_end(session)
        if item['extra_key'] != extra_key or item['extra'] is None:
            st = CacheState(item['base'])
            for s in extras:
                st.add_sequence(s)
            item['extra_key'], item['extra'] = extra_key, st
        return item['extra'].fork()
