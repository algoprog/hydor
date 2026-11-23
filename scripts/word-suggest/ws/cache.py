"""E9, a session cache (SPEC.md, Round 2): a token cache of what was already written, mixed on top of any variant.

Cache of an example (LLM token ids; every text is its own sequence, so no pair of tokens crosses a text boundary):
  chat: every earlier agent reply of the session (data/agent_texts.jsonl, ts < the message's ts), the user's earlier
        typed messages of the session (the record's `prev_user`), for a later segment of a long message the message's
        own text before the segment, and the target's own earlier tokens as they are typed;
  doc : the document's earlier paragraphs (data/other_texts.jsonl), the paragraph's own text before the segment, and
        the target's own earlier tokens.
  plain: nothing but the target's own earlier tokens.
Strictly causal: row i of the cache (the prediction before target token i) reads the context and target_ids[:i] only.

P_cache(w | h): interpolated bigram/unigram, Witten-Bell. With c(h, w) the bigram counts, c(h) = sum_w c(h, w), T(h) the
number of distinct followers of h and P_uni(w) = count(w) / N (N = tokens in the cache):
    P(w | h) = (c(h, w) + T(h) * P_uni(w)) / (c(h) + T(h))        (P_uni(w) when h was never followed by anything)
It sums to 1 over the cache's tokens and is 0 outside it. The history of row 0 is a text-start marker (the first tokens
of the earlier texts), later rows use the previous target token.

Mixed with a variant (CacheFit.apply): P = (1 - mu) P_variant + mu P_cache with
    mu = sigmoid(a + b log(1 + N) + c [the previous token is in the cache])      (mu = 0 while the cache is empty);
the previous token counts as in the cache if it occurs there apart from the occurrence just typed.
a, b, c come from scripts/fit_cache.py (dev log-likelihood).
"""
from __future__ import annotations

import json
import re
import unicodedata
from bisect import bisect_left
from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np
import torch

from .textdata import DATA_DIR, read_jsonl, segments

_PARA_RE = re.compile(r"\n\s*\n")           # the paragraph rule of ws/textdata.py


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def paragraphs(text: str) -> list[tuple[int, str]]:
    """(start offset, text) of the non-empty paragraphs of a document, as ws/textdata.py splits it."""
    out, pos = [], 0
    for m in list(_PARA_RE.finditer(text)) + [None]:
        end = m.start() if m else len(text)
        if text[pos:end].strip():
            out.append((pos, text[pos:end]))
        pos = m.end() if m else end
    return out


class CacheState:
    """Counts of a set of token sequences (ids < V), growing one token at a time (the target's own tokens)."""

    def __init__(self, V: int, seqs: Sequence[np.ndarray]):
        self.V, self.bos = V, V
        parts = []
        for s in seqs:
            if len(s):
                parts.append(np.concatenate((np.array([V], dtype=np.int64), np.asarray(s, dtype=np.int64))))
        if parts:
            cat = np.concatenate(parts)
            tok = cat[cat != V]
            self.uni = np.bincount(tok, minlength=V).astype(np.float64)
            self.N = int(len(tok))
            h, w = cat[:-1], cat[1:]
            m = w != V
            self.bk, self.bc = np.unique(h[m] * (V + 1) + w[m], return_counts=True)
        else:
            self.uni = np.zeros(V, dtype=np.float64)
            self.N = 0
            self.bk, self.bc = np.zeros(0, dtype=np.int64), np.zeros(0, dtype=np.int64)
        self.dyn: dict[int, dict[int, int]] = {}

    def add(self, h: int, w: int) -> None:
        """The target's token w came after history h (h = self.bos at the start)."""
        self.uni[w] += 1
        self.N += 1
        d = self.dyn.setdefault(h, {})
        d[w] = d.get(w, 0) + 1

    def followers(self, h: int) -> tuple[np.ndarray, np.ndarray]:
        lo = int(np.searchsorted(self.bk, h * (self.V + 1)))
        hi = int(np.searchsorted(self.bk, (h + 1) * (self.V + 1)))
        ws, cs = self.bk[lo:hi] - h * (self.V + 1), self.bc[lo:hi].astype(np.float64)
        d = self.dyn.get(h)
        if d:
            m = dict(zip(ws.tolist(), cs.tolist()))
            for w, n in d.items():
                m[w] = m.get(w, 0.0) + n
            ws, cs = np.fromiter(m.keys(), np.int64, len(m)), np.fromiter(m.values(), np.float64, len(m))
        return ws, cs

    def seen(self, h: int, own: int = 0) -> int:
        """1 if the previous token h is in the cache apart from its own latest occurrence (own = 1 when h is the target's
        token just typed, which is already counted); at the start of a text (h = bos): 1 if the cache holds a text."""
        if self.N == 0:
            return 0
        return 1 if h == self.bos else int(self.uni[h] - own > 0)

    def prob(self, h: int, w: int) -> float:
        if self.N == 0:
            return 0.0
        ws, cs = self.followers(h)
        c, T = float(cs.sum()), len(ws)
        pu = self.uni[w] / self.N
        if c <= 0:
            return float(pu)
        k = float(cs[ws == w].sum()) if T else 0.0
        return float((k + T * pu) / (c + T))

    def row(self, h: int) -> np.ndarray:
        """P(. | h) over all V ids (float64, sums to 1; needs N > 0)."""
        ws, cs = self.followers(h)
        p = self.uni / self.N
        c, T = float(cs.sum()), len(ws)
        if c > 0:
            p *= T / (c + T)
            p[ws] += cs / (c + T)
        return p


class ExampleCache:
    """The cache of one example, walked row by row: N, seen, the gold token's log-prob and (optionally) the dense rows."""

    def __init__(self, V: int, ctx: Sequence[np.ndarray], target_ids: Sequence[int]):
        self.V, self.ctx, self.ids = V, list(ctx), list(target_ids)
        self._done: Optional[dict] = None

    def _walk(self, dense: bool) -> dict:
        if self._done is not None and (self._done["lp"] is not None or not dense):
            return self._done
        st = CacheState(self.V, self.ctx)
        n = len(self.ids)
        N, seen = np.zeros(n + 1), np.zeros(n + 1)
        gold = np.full(n, -np.inf)
        lp = torch.full((n + 1, self.V), float("-inf")) if dense else None
        h = st.bos
        for i in range(n + 1):
            N[i], seen[i] = st.N, st.seen(h, int(i > 0))
            if st.N > 0:
                if i < n:
                    with np.errstate(divide="ignore"):
                        gold[i] = np.log(st.prob(h, self.ids[i]))
                if dense:
                    with np.errstate(divide="ignore"):
                        lp[i] = torch.from_numpy(np.log(st.row(h))).float()
            if i < n:
                st.add(h, self.ids[i])
                h = self.ids[i]
        self._done = dict(N=N, seen=seen, gold=gold, lp=lp)
        return self._done

    @property
    def N(self) -> np.ndarray:
        """Cache tokens before each row (n + 1 values)."""
        return self._walk(False)["N"]

    @property
    def seen(self) -> np.ndarray:
        """1 where the previous token is in the cache (n + 1 values)."""
        return self._walk(False)["seen"]

    def gold_logprobs(self) -> np.ndarray:
        """log P_cache(gold token) per target position (-inf outside the cache or while it is empty)."""
        return self._walk(False)["gold"]

    def logprobs(self) -> torch.Tensor:
        """[n + 1, V] log P_cache (-inf outside the cache; a whole row of -inf while the cache is empty)."""
        return self._walk(True)["lp"]


class SessionCache:
    """Builds the ExampleCache of an Example from data/*.jsonl, tokenizing with the LLM's tokenizer."""

    def __init__(self, tok, data_dir: Optional[str] = None):
        self.tok, self.data_dir = tok, data_dir or DATA_DIR
        self._agent: Optional[dict] = None
        self._agent_tok: dict = {}
        self._user: Optional[dict] = None
        self._docs: Optional[dict] = None
        self._memo: dict = {}
        self._last: Optional[tuple] = None
        self.warned = 0

    # ---- tokens ------------------------------------------------------------------------------------------------------
    def tokens(self, text: str) -> np.ndarray:
        a = self._memo.get(text)
        if a is None:
            a = np.asarray(self.tok(text, add_special_tokens=False)["input_ids"], dtype=np.int64)
            if len(self._memo) > 50000:
                self._memo.clear()
            self._memo[text] = a
        return a

    def _agent_session(self, session: str):
        if self._agent is None:
            by: dict = {}
            for r in read_jsonl(f"{self.data_dir}/agent_texts.jsonl"):
                by.setdefault(r["session"], []).append((int(r.get("ts") or 0), r.get("text") or ""))
            self._agent = by
        hit = self._agent_tok.get(session)
        if hit is None:
            items = sorted(self._agent.get(session, ()), key=lambda x: x[0])
            texts = [_nfc(t) for _, t in items]
            ids = self.tok(texts, add_special_tokens=False)["input_ids"] if texts else []
            hit = ([t for t, _ in items], [np.asarray(x, dtype=np.int64) for x in ids])
            self._agent_tok[session] = hit
        return hit

    # ---- context of an example ---------------------------------------------------------------------------------------
    def context(self, ex) -> list[np.ndarray]:
        if ex.surface == "chat":
            return self._chat_context(ex)
        if ex.surface == "doc":
            return self._doc_context(ex)
        return []

    def _chat_context(self, ex) -> list[np.ndarray]:
        seqs: list[np.ndarray] = []
        sess = (ex.meta or {}).get("session")
        if sess:
            ts, ids = self._agent_session(sess)
            seqs.extend(ids[:bisect_left(ts, ex.ts)])           # strictly earlier replies
        if self._user is None:
            self._user = {r["id"]: (r.get("text") or "", r.get("prev_user") or [])
                          for r in read_jsonl(f"{self.data_dir}/user_msgs.jsonl")}
        base = ex.id.split("#")[0]
        rec = self._user.get(base)
        if rec is not None:
            text, prev_user = rec
            seqs.extend(self.tokens(_nfc(u)) for u in prev_user if u)
            seg = int((ex.meta or {}).get("seg") or 0)
            if seg > 0:                                           # the earlier segments of this message
                text = _nfc(text.strip())
                sp = segments(text, ex.lang)
                if seg < len(sp):
                    head = text[:sp[seg][0]]
                    if head.strip():
                        seqs.append(self.tokens(head))
        return seqs

    def _doc_context(self, ex) -> list[np.ndarray]:
        if self._docs is None:
            self._docs = {r["id"]: r.get("text") or "" for r in read_jsonl(f"{self.data_dir}/other_texts.jsonl")}
        meta = ex.meta or {}
        rid = ex.id.split("#")[0].rsplit(":", 1)[0]
        text = self._docs.get(rid)
        if text is None:
            return []
        paras = paragraphs(_nfc(text))
        pi, si = int(meta.get("para") or 0), int(meta.get("seg") or 0)
        if pi >= len(paras):
            return []
        ptxt = paras[pi][1]
        sp = segments(ptxt, ex.lang)
        if si >= len(sp) or ptxt[sp[si][0]:sp[si][1]] != ex.target:
            self.warned += 1                                     # cannot place the target: no own-paragraph text
            head = ""
        else:
            head = ptxt[:sp[si][0]]
        seqs = [self.tokens(p) for _, p in paras[:pi]]
        if head.strip():
            seqs.append(self.tokens(head))
        return seqs

    def for_example(self, ex, V: int) -> ExampleCache:
        key = (ex.id, ex.surface, V, len(ex.target_ids))
        if self._last is not None and self._last[0] == key:
            return self._last[1]
        ec = ExampleCache(V, self.context(ex), ex.target_ids)
        self._last = (key, ec)
        return ec


@dataclass
class CacheFit:
    """mu = sigmoid(a + b log(1 + N) + c seen); P = (1 - mu) P_variant + mu P_cache (mu = 0 while N = 0)."""
    a: float
    b: float
    c: float
    meta: dict = field(default_factory=dict)

    def mu(self, N, seen) -> torch.Tensor:
        N = torch.as_tensor(np.asarray(N), dtype=torch.float32)
        seen = torch.as_tensor(np.asarray(seen), dtype=torch.float32)
        m = torch.sigmoid(self.a + self.b * torch.log1p(N) + self.c * seen)
        return torch.where(N > 0, m, torch.zeros_like(m))

    def apply(self, lp: torch.Tensor, ec: ExampleCache) -> torch.Tensor:
        """log((1 - mu) P_variant + mu P_cache), per row; rows with an empty cache are the variant's own."""
        mu = self.mu(ec.N, ec.seen).to(lp.device)
        on = mu > 0
        if not bool(on.any()):
            return lp
        lc = ec.logprobs().to(lp.device)
        mixed = torch.logaddexp(lp + torch.log1p(-mu).unsqueeze(1), lc + torch.log(mu.clamp_min(1e-30)).unsqueeze(1))
        return torch.where(on.unsqueeze(1), mixed, lp)

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(dict(a=self.a, b=self.b, c=self.c, meta=self.meta), f, indent=1)

    @staticmethod
    def load(path: str) -> "CacheFit":
        with open(path) as f:
            d = json.load(f)
        return CacheFit(a=d["a"], b=d["b"], c=d["c"], meta=d.get("meta", {}))


def fit_mu(lv: torch.Tensor, lc: torch.Tensor, N: torch.Tensor, seen: torch.Tensor, l2: float = 1e-4,
           max_iter: int = 200) -> CacheFit:
    """Fit a, b, c by LBFGS to maximise the mean log((1 - mu) P_variant(gold) + mu P_cache(gold)) over the positions with
    a non-empty cache. lv, lc: log-probs of the gold tokens under the variant and the cache (lc may be -inf)."""
    lv = lv.double().clamp_min(-60.0)
    lc = lc.double().clamp_min(-1e4)
    x1, x2 = torch.log1p(N.double()), seen.double()
    w = torch.tensor([-2.0, 0.0, 0.0], dtype=torch.double, requires_grad=True)
    opt = torch.optim.LBFGS([w], lr=1.0, max_iter=max_iter, line_search_fn="strong_wolfe")

    def closure():
        opt.zero_grad()
        z = w[0] + w[1] * x1 + w[2] * x2
        ll = torch.logaddexp(lv + torch.nn.functional.logsigmoid(-z), lc + torch.nn.functional.logsigmoid(z)).mean()
        loss = -ll + l2 * (w[1:] ** 2).sum()
        loss.backward()
        return loss

    opt.step(closure)
    a, b, c = (float(x) for x in w.detach())
    return CacheFit(a, b, c)


def mixed_loglik(fit: CacheFit, lv: torch.Tensor, lc: torch.Tensor, N: torch.Tensor, seen: torch.Tensor) -> torch.Tensor:
    """log((1 - mu) P_variant + mu P_cache) of the gold tokens, per position (the variant's own where N = 0)."""
    lv = lv.double().clamp_min(-60.0)
    mu = fit.mu(N, seen).double()
    on = mu > 0
    mixed = torch.logaddexp(lv + torch.log1p(-mu.clamp_max(1 - 1e-12)), lc.double().clamp_min(-1e4) + torch.log(mu.clamp_min(1e-30)))
    return torch.where(on, mixed, lv)
