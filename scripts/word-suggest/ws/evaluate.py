"""The metrics of SPEC.md ("Metrics: exact definitions"), from an Example and a [n+1, V] log-prob matrix.

Evaluator.score(ex, lp) returns additive counts for one example; aggregate() sums counts of many examples and derive()
turns counts into the reported metrics (so per-example, per-surface, per-language and overall rows share one code path).

Decisions where SPEC.md leaves room (also in the report):
  * Token byte spans come from the exact bytes of the target's tokens (they must add up to the target's UTF-8 bytes),
    not from character offsets, so tokens that split a multi-byte character are handled exactly.
  * A word is unaligned (skipped, counted) when the first token of its path begins with non-whitespace before it, the
    last token ends with non-whitespace after it, or a token on its path has no bytes. Whitespace inside those tokens
    (a joined leading space or newline, trailing newline) is allowed: the leading part is typed (part of R); a trailing
    part satisfies the end check by itself.
  * Confidence: product of p_s (gold token's probability within the allowed set) over the steps, stopping at the first
    wrong step with the allowed set's arg max probability there. When all steps are right, the end check adds the
    probability that the word ends (mass of tokens starting with whitespace or end-of-text); when it is wrong, the
    arg max's probability.
  * The suggestion walk is evaluated for k = 0 .. min(len(word), max_k) - 1 (max_k = 48, giant words are counted in
    `capped`; keys for the rest of such a word are never saved).
  * Characters are Unicode code points; 'chars' for ksr = every character of word-mode targets (spaces, newlines and
    unaligned words included). The Tab key also types the single space after the word (one space, not followed by
    another whitespace character; a trailing space at the end of the text counts).
  * zh/ja and every language written without spaces (ws/types.py is_nospace: Thai, Lao, Khmer, Burmese, Tibetan, ...): each
    non-space character is a unit; its context is the gold token's characters before it (typed prefix),
    the prediction is the arg max (among tokens that start with that prefix and are longer than it) token's next
    character; reported as char_acc, with no keystroke simulation (a one-character word saves nothing).
  * bpb and nll floor a gold token's log-prob at -30 nats (an SLM alone cannot produce tokens outside its vocabulary);
    `oov_rate` is the share of gold tokens with probability 0.
"""
from __future__ import annotations

import math
from bisect import bisect_right
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np
import torch

from .tokbytes import PrefixIndex, starts_with_whitespace
from .types import Example, is_nospace

CHANCE_FEATURES = ("c", "top", "second", "margin", "ent", "logn", "toplen", "k", "j", "prev", "agree", "lam")
TAUS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95)
CJK_LANGS = ("zh", "ja")
NEG = float("-inf")


@dataclass
class EvalConfig:
    taus: tuple = TAUS
    max_k: int = 48
    acc_ks: tuple = (0, 1, 2, 3)
    floor_lp: float = -30.0
    cjk_langs: tuple = CJK_LANGS
    min_prec: float = 0.5


def _is_ws_bytes(b: bytes) -> bool:
    if not b:
        return True
    try:
        return b.decode("utf-8").strip() == ""
    except UnicodeDecodeError:
        return False


class Evaluator:
    def __init__(self, tb: Sequence[Optional[bytes]], end_ids: Sequence[int] = (), cfg: Optional[EvalConfig] = None,
                 index: Optional[PrefixIndex] = None, keep_details: bool = False, device: str = "cpu",
                 lead_space: bool = False):
        self.tb = tb
        # lead_space: the tokens' bytes are those of ' ' + target (a SentencePiece tokenizer's word mark on the first word,
        # ws/mlm.py LeadSpaceTokenizer); the space is joined to the first token and costs no key
        self.lead = b" " if lead_space else b""
        self.device = torch.device(device)
        self.fast = self.device.type != "cpu"     # on a GPU: the allowed-set statistics of an example are computed in one batch
        self._q: Optional[dict] = None
        self.index = index or PrefixIndex(tb, end_ids)
        self.cfg = cfg or EvalConfig()
        self.keep_details = keep_details
        self.details: list = []
        self.collect = False          # E8: when True, score() also fills self.chances (see _chance_feats)
        self.chances: list = []
        self._extra: Optional[dict] = None
        self._valid_idx = self.index.sorted_ids.sort().values
        self._ends_idx = torch.nonzero(self.index.ends_word).flatten()
        if self.fast:
            self._valid_idx = self._valid_idx.to(self.device)
            self._ends_idx = self._ends_idx.to(self.device)

    # ---- row statistics --------------------------------------------------------------------------------------------
    def _row_stats(self, lp: torch.Tensor):
        """Per row: unconstrained arg max id / log-prob, mass of word-ending tokens, and the same arg max / log-sum-exp
        over the valid (suggestible) tokens, which is the allowed set when nothing is typed."""
        n1 = lp.shape[0]
        dev = lp.device
        fmax, farg = lp.max(-1)
        ends = torch.full((n1,), NEG, device=dev)
        vmax, varg, vlse = torch.empty(n1, device=dev), torch.empty(n1, dtype=torch.long, device=dev), torch.empty(n1, device=dev)
        step = 16 if not self.fast else 64
        for i in range(0, n1, step):
            chunk = lp[i:i + step]
            if len(self._ends_idx):
                ends[i:i + step] = chunk.index_select(1, self._ends_idx).logsumexp(-1)
            v = chunk.index_select(1, self._valid_idx)
            m, a = v.max(-1)
            vmax[i:i + step], varg[i:i + step], vlse[i:i + step] = m, self._valid_idx[a], v.logsumexp(-1)
        fmax, farg, ends, vmax, varg, vlse = (x.cpu() for x in (fmax, farg, ends, vmax, varg, vlse))
        return dict(fmax=fmax.tolist(), farg=farg.tolist(), ends=ends.tolist(), vmax=vmax.tolist(),
                    varg=varg.tolist(), vlse=vlse.tolist())

    def _step(self, lp: torch.Tensor, st: dict, row: int, R: bytes, gold: int):
        """(right, p_gold_in_set, p_argmax_in_set) for one step of constrained greedy decoding."""
        if not R:
            m, lse = st["vmax"][row], st["vlse"][row]
        elif self._q is not None:
            m, lse = self._q[(row, R)]
        else:
            ids = self.index.allowed(R)
            vals = lp[row].index_select(0, ids)
            m, lse = vals.max().item(), vals.logsumexp(0).item()
        g = self._gold[row] if self._q is not None else lp[row, gold].item()
        if g == NEG or lse == NEG:
            return False, 0.0, (math.exp(m - lse) if lse != NEG and m != NEG else 0.0)
        return g >= m, math.exp(g - lse), math.exp(m - lse)

    # ---- one example -----------------------------------------------------------------------------------------------
    def score(self, ex: Example, lp: torch.Tensor, extra: Optional[dict] = None) -> dict:
        """Counts of one example. extra (only read when self.collect is True): {'llm': [n+1, V] log-probs of the LLM
        alone, 'slm': the SLM alone (or None), 'lam': the gate's lambda per row (or None)} for the mix features."""
        cfg = self.cfg
        self._extra = extra
        self.chances = []
        ids = list(ex.target_ids)
        n = len(ids)
        assert lp.shape[0] == n + 1, (lp.shape, n)
        c: dict = {"n_examples": 1, "n_tokens": n}
        target = ex.target
        B = self.lead + target.encode("utf-8")
        c["bytes"] = len(B) - len(self.lead)
        gold_lp = lp[torch.arange(n, device=lp.device), torch.tensor(ids, device=lp.device)].clamp_min(NEG).tolist() if n else []
        self._gold = gold_lp
        self._q = None
        c["oov"] = sum(1 for g in gold_lp if g == NEG)
        fl = cfg.floor_lp
        c["nll_nats"] = sum(-max(g, fl) for g in gold_lp)
        c["bits"] = c["nll_nats"] / math.log(2)

        # token byte spans
        starts, ends, ok = [], [], True
        pos = 0
        for i, t in enumerate(ids):
            b = self.tb[t] if t < len(self.tb) else None
            if b is None:
                o = ex.offsets[i]
                ln = len(target[o[0]:o[1]].encode("utf-8"))
            else:
                ln = len(b)
                if B[pos:pos + ln] != b:
                    ok = False
            starts.append(pos)
            pos += ln
            ends.append(pos)
        ok = ok and pos == len(B)

        st = self._row_stats(lp)
        word_mode = not is_nospace(ex.lang, cfg.cjk_langs)
        self.details = []
        if word_mode:
            self._words(ex, lp, st, B, ids, starts, ends, ok, c)
        else:
            self._chars(ex, lp, st, B, ids, starts, ends, ok, c)
        return c

    # ---- words -----------------------------------------------------------------------------------------------------
    def _words(self, ex, lp, st, B, ids, starts, ends, ok, c):
        cfg, tb, index = self.cfg, self.tb, self.index
        target = ex.target
        # character index -> byte index
        bpos = [len(self.lead)]
        for ch in target:
            bpos.append(bpos[-1] + len(ch.encode("utf-8")))
        import re
        spans = [m.span() for m in re.finditer(r"\S+", target)]
        c["n_words_total"] = len(spans)
        c["chars"] = len(target)
        c["n_words"] = c["unaligned"] = c["capped"] = 0
        for k in cfg.acc_ks:
            c[f"acc_n@{k}"] = c[f"acc_hit@{k}"] = 0
        c["acc0b_n"] = c["acc0b_hit"] = 0
        for t in cfg.taus:
            for key in ("saved", "shown", "cshown", "chances"):
                c[f"{key}@{t}"] = 0
        n = len(ids)
        if self.fast and ok:
            self._precompute(lp, spans, bpos, B, ids, starts, ends)
        prev_right = 0                   # was the previous word right at k = 0 (E8 feature; 0 for the first word)
        for j, (cs, ce) in enumerate(spans):
            ws, we = bpos[cs], bpos[ce]
            word = target[cs:ce]
            L = len(word)
            if not ok:
                c["unaligned"] += 1
                prev_right = 0
                if self.keep_details:
                    self.details.append(dict(word=word, aligned=False))
                continue
            a = bisect_right(starts, ws) - 1
            b = bisect_right(starts, we - 1) - 1
            lead, trail = B[starts[a]:ws], B[we:ends[b]]
            if not (_is_ws_bytes(lead) and _is_ws_bytes(trail)) or any(
                    (ids[s] >= len(tb) or tb[ids[s]] is None) for s in range(a, b + 1)):
                c["unaligned"] += 1
                prev_right = 0
                if self.keep_details:
                    self.details.append(dict(word=word, aligned=False))
                continue
            c["n_words"] += 1
            K = min(L, cfg.max_k)
            if L > K:
                c["capped"] += 1
            correct, conf = [], []
            for k in range(K):
                R = lead + word[:k].encode("utf-8")
                good, cf = True, 1.0
                for s in range(a, b + 1):
                    right, p, argp = self._step(lp, st, s, R, ids[s])
                    if not right:
                        cf *= argp
                        good = False
                        break
                    cf *= p
                    tbs = tb[ids[s]]
                    R = R[len(tbs):] if len(tbs) < len(R) else b""
                if good:
                    if trail:                    # the last token itself carries the whitespace that ends the word
                        pass
                    else:
                        arg = st["farg"][b + 1]
                        if index.ends_word[arg].item():
                            cf *= math.exp(st["ends"][b + 1]) if st["ends"][b + 1] != NEG else 0.0
                        else:
                            good = False
                            cf *= math.exp(st["fmax"][b + 1])
                correct.append(good)
                conf.append(cf)
            if self.keep_details:
                self.details.append(dict(word=word, aligned=True, correct=correct, conf=conf, a=a, b=b, lead=lead))
            for k in cfg.acc_ks:
                if L > k:
                    c[f"acc_n@{k}"] += 1
                    c[f"acc_hit@{k}"] += int(correct[k]) if k < K else 0
            if j > 0:
                c["acc0b_n"] += 1
                c["acc0b_hit"] += int(correct[0])
            bonus = int(we < len(B) and B[we:we + 1] == b" " and (we + 1 >= len(B) or not _is_ws_bytes(B[we + 1:we + 2])))
            if self.collect:
                for k in range(K):
                    f = self._chance_feats(lp, a, lead + word[:k].encode("utf-8"))
                    self.chances.append(dict(t="c", id=ex.id, j=j, k=k, L=L, bonus=bonus, y=int(correct[k]),
                                             c=conf[k], prev=prev_right, **f))
            prev_right = int(correct[0])
            cor, cnf = np.array(correct), np.array(conf)
            for t in cfg.taus:
                shown_mask = cnf >= t - 1e-12
                take = np.nonzero(cor & shown_mask)[0]
                upto = int(take[0]) if len(take) else K - 1
                c[f"chances@{t}"] += upto + 1
                c[f"shown@{t}"] += int(shown_mask[:upto + 1].sum())
                c[f"cshown@{t}"] += int((cor & shown_mask)[:upto + 1].sum())
                if len(take):
                    c[f"saved@{t}"] += (L - upto) + bonus - 1

    def _precompute(self, lp, spans, bpos, B, ids, starts, ends):
        """GPU path: the allowed-set statistics (arg max and log-sum-exp of the row over the set) of every (row, typed bytes)
        step that the walks of this example can need, in one batch. The steps do not depend on which earlier step was right
        (the gold path fixes the bytes still to match), so they are all known beforehand; the walks then read them as floats.
        Keep the alignment test in step with _words."""
        tb, index = self.tb, self.index
        need: dict = {}
        for (cs, ce) in spans:
            ws, we = bpos[cs], bpos[ce]
            word = B[ws:we].decode("utf-8")
            a = bisect_right(starts, ws) - 1
            b = bisect_right(starts, we - 1) - 1
            lead, trail = B[starts[a]:ws], B[we:ends[b]]
            if not (_is_ws_bytes(lead) and _is_ws_bytes(trail)) or any(
                    (ids[s] >= len(tb) or tb[ids[s]] is None) for s in range(a, b + 1)):
                continue
            for k in range(min(len(word), self.cfg.max_k)):
                R = lead + word[:k].encode("utf-8")
                for s in range(a, b + 1):
                    if not R:
                        break
                    need[(s, R)] = None
                    tbs = tb[ids[s]]
                    R = R[len(tbs):] if len(tbs) < len(R) else b""
        self._q = {}
        if not need:
            return
        keys = list(need)
        sets = [index.allowed(R) for _, R in keys]
        lens = [len(x) for x in sets]
        dev = lp.device
        flat = torch.cat(sets).to(dev)
        seg = torch.repeat_interleave(torch.arange(len(keys), device=dev), torch.tensor(lens, device=dev),
                                      output_size=sum(lens))
        rows = torch.tensor([r for r, _ in keys], device=dev)[seg]
        vals = lp[rows, flat]
        nq = len(keys)
        mx = torch.full((nq,), NEG, device=dev).scatter_reduce(0, seg, vals, "amax", include_self=True)
        ok_m = torch.isfinite(mx)
        e = torch.exp((vals - mx[seg]).double())
        e = torch.where(ok_m[seg], e, torch.zeros_like(e))
        sm = torch.zeros(nq, dtype=torch.double, device=dev).index_add_(0, seg, e)
        lse = torch.where(ok_m, mx.double() + torch.log(sm.clamp_min(1e-300)), torch.full_like(sm, NEG)).float()
        for key, m_, l_ in zip(keys, mx.tolist(), lse.tolist()):
            self._q[key] = (m_, l_)

    # ---- E8: the features of a chance ------------------------------------------------------------------------------
    def _chance_feats(self, lp: torch.Tensor, row: int, R: bytes) -> dict:
        """What is known when the user has typed R (the joined whitespace and the first k letters of the word): inside
        the allowed set of the first step (row `row`, the row before the word's first token): the top probability, the
        second, their margin, the entropy (all renormalised over the set), log of the set's size, the top token's
        byte length; with extra rows, whether the LLM-alone and SLM-alone top tokens in the set agree and the gate's
        lambda at that row. Nothing here reads the gold token or the rest of the word: the set, the row and R are
        fixed by the text before the caret. (The confidence c of a chance is the harness's, measured along the gold
        path: for a wrong suggestion it depends on where the gold path diverges; see scripts/show_filter.py.)"""
        ids = (self.index.allowed(R).to(lp.device) if R else self._valid_idx)
        f = dict(top=0.0, second=0.0, margin=0.0, ent=0.0, logn=math.log(max(len(ids), 1)), toplen=0)
        if len(ids):
            vals = lp[row].index_select(0, ids)
            lse = torch.logsumexp(vals, 0)
            if torch.isfinite(lse):
                lpn = vals - lse
                p = lpn.exp()
                tp, ti = torch.topk(p, min(2, len(p)))
                top = float(tp[0])
                sec = float(tp[1]) if len(tp) > 1 else 0.0
                f.update(top=top, second=sec, margin=top - sec,
                         ent=float(-(p * torch.where(p > 0, lpn, torch.zeros_like(lpn))).sum()))
                tb = self.tb[int(ids[ti[0]])]
                f["toplen"] = len(tb) if tb is not None else 0
        ex = self._extra
        if ex:
            def top_in(x):
                v = x[row].index_select(0, ids) if len(ids) else None
                if v is None:
                    return -1
                m, i = v.max(0)
                return int(ids[i]) if m > NEG else -1
            if ex.get("slm") is not None:
                a, b = top_in(ex["llm"]), top_in(ex["slm"])
                f["agree"] = int(a >= 0 and a == b)
            if ex.get("lam") is not None:
                f["lam"] = float(ex["lam"][row])
        return f

    # ---- zh / ja: next-character accuracy ----------------------------------------------------------------------------
    def _chars(self, ex, lp, st, B, ids, starts, ends, ok, c):
        tb, index = self.tb, self.index
        c["char_n"] = c["char_hit"] = 0
        if not ok:
            c["unaligned"] = c["n_chars_unaligned"] = sum(1 for ch in ex.target if not ch.isspace())
            return
        c["unaligned"] = 0
        pos = len(self.lead)
        for ch in ex.target:
            g = ch.encode("utf-8")
            cs, ce = pos, pos + len(g)
            pos = ce
            if ch.isspace():
                continue
            a = bisect_right(starts, cs) - 1
            ta = ids[a]
            if tb[ta] is None:
                c["unaligned"] += 1
                continue
            R = B[starts[a]:cs]
            if not R:
                arg = st["varg"][a]
            else:
                cand = index.starts_with(R)
                cand = cand[index.lens[cand] > len(R)].to(lp.device)
                if len(cand) == 0:
                    c["char_n"] += 1
                    continue
                vals = lp[a].index_select(0, cand)
                arg = int(cand[vals.argmax()])
            pred = tb[arg][len(R):]
            c["char_n"] += 1
            c["char_hit"] += int(pred.startswith(g))


# ---- aggregation --------------------------------------------------------------------------------------------------------

def aggregate(counts: Sequence[dict]) -> dict:
    out: dict = {}
    for c in counts:
        for k, v in c.items():
            out[k] = out.get(k, 0) + v
    return out


def _div(a, b):
    return a / b if b else None


def derive(c: dict, cfg: Optional[EvalConfig] = None) -> dict:
    """Reported metrics from summed counts (keys with no data are left out)."""
    cfg = cfg or EvalConfig()
    m: dict = {"n_examples": c.get("n_examples", 0), "n_tokens": c.get("n_tokens", 0), "bytes": c.get("bytes", 0)}
    for k in ("n_words", "n_words_total", "unaligned", "capped", "char_n"):
        if k in c:
            m[k] = c[k]
    if c.get("n_tokens"):
        m["nll"] = c["nll_nats"] / c["n_tokens"]
        m["oov_rate"] = c["oov"] / c["n_tokens"]
    if c.get("bytes"):
        m["bpb"] = c["bits"] / c["bytes"]
    for k in cfg.acc_ks:
        v = _div(c.get(f"acc_hit@{k}", 0), c.get(f"acc_n@{k}", 0))
        if v is not None:
            m[f"acc@{k}"] = v
    v = _div(c.get("acc0b_hit", 0), c.get("acc0b_n", 0))
    if v is not None:
        m["acc@0_after_first"] = v
    v = _div(c.get("char_hit", 0), c.get("char_n", 0))
    if v is not None:
        m["char_acc"] = v
    if c.get("chars") and "chances@0.0" in c:
        best, best_t = 0.0, -1.0
        for t in cfg.taus:
            ksr = c[f"saved@{t}"] / c["chars"]
            m[f"ksr@{t:g}"] = ksr
            sh = c[f"shown@{t}"]
            if sh:
                m[f"prec@{t:g}"] = c[f"cshown@{t}"] / sh
            if c[f"chances@{t}"]:
                m[f"cov@{t:g}"] = sh / c[f"chances@{t}"]
            if sh and c[f"cshown@{t}"] / sh >= cfg.min_prec and ksr > best:
                best, best_t = ksr, t
        m["ksr_best"], m["tau_best"] = best, best_t
    return m


def group_metrics(items: Sequence[tuple[Example, dict]], cfg: Optional[EvalConfig] = None) -> list[dict]:
    """Metric rows for overall, each surface and each language: [{'group': 'all', ...}, {'group': 'surface:chat', ...}]."""
    rows = [dict(group="all", **derive(aggregate([c for _, c in items]), cfg))]
    for key, fn in (("surface", lambda e: e.surface), ("lang", lambda e: e.lang)):
        for val in sorted({fn(e) for e, _ in items}):
            sub = [c for e, c in items if fn(e) == val]
            rows.append(dict(group=f"{key}:{val}", **derive(aggregate(sub), cfg)))
    return rows


# ---- running scorers and variants (used by scripts/eval.py, fit_gate.py, check_greedy.py) -----------------------------------

import json  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from dataclasses import field  # noqa: E402

DEFAULT_LLM = "Qwen/Qwen3.5-0.8B-Base"


def setup_env(threads: int) -> None:
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    torch.set_num_threads(max(1, min(int(threads), 8)))


@dataclass
class Variant:
    spec: str
    parts: list          # scorer names, e.g. ['llm'] or ['llm', 'slm']
    mode: str = ""       # '', 'linear', 'loglinear', 'gate'
    param: str = ""      # lambda, alpha or the gate JSON path
    cache: str = ""      # E9: path of the session-cache fit JSON ('<variant>|cache:<fit.json>'), '' = no cache


def parse_variant(spec: str) -> Variant:
    """'llm', 'slm', 'llm+slm:linear:0.3', 'llm+slm2:loglinear:0.5', 'llm+slm:gate:path/to/gate.json' (a per-language bias in the
    JSON is used with ex.lang), 'llm+slm:langswitch:path/to/gate.json' (per language the LLM alone or the gate); any of them
    followed by '|cache:path/to/cache_fit.json' is mixed with the session cache (E9, ws/cache.py)."""
    if "|cache:" in spec:
        base, _, cpath = spec.partition("|cache:")
        if not cpath:
            raise ValueError(f"{spec!r}: |cache: needs the fit JSON")
        v = parse_variant(base)
        v.spec, v.cache = spec, cpath
        return v
    head, _, rest = spec.partition(":")
    mode, _, param = rest.partition(":")
    parts = head.split("+")
    if len(parts) == 2 and parts[0] != "llm":
        raise ValueError(f"a mixture is written llm+<other>: {spec!r}")
    if len(parts) == 2 and mode not in ("linear", "loglinear", "gate", "langswitch"):
        raise ValueError(f"mixture {spec!r} needs :linear:<lam>, :loglinear:<alpha>, :gate:<json> or :langswitch:<json>")
    if len(parts) > 2:
        raise ValueError(spec)
    return Variant(spec, parts, mode, param)


class Scorers:
    """The scorers of a run by name: 'llm', 'slm' (and 'slm2'...), 'ngram' (and 'ngram2'...). rows() computes each
    needed row set once per example."""
    device = torch.device("cpu")

    def __init__(self, llm: str, slm: str, ngram: str, dtype: str, threads: int, fmt: str,
                 data_dir: Optional[str] = None, tok=None, device: str = "cpu", mlm_ending: str = "sep"):
        self.llm = None
        self.others: dict = {}
        self.data_dir, self.tok = data_dir, tok       # for the session cache (E9)
        self.device = torch.device(device)
        if llm and llm.lower() != "none":
            from .scorers import LLMScorer
            from .mlm import MLMScorer, parse_llm_spec
            kind, mname = parse_llm_spec(llm)
            if kind == "lm":
                self.llm = LLMScorer(llm, dtype=dtype, threads=threads, fmt=fmt, device=device)
            else:                                   # a masked-LM encoder: --llm mlm:<name> | mlm-causal:<name>
                self.llm = MLMScorer(mname, dtype=dtype, threads=threads, fmt=fmt, device=device,
                                     causal=(kind == "mlm-causal"), ending=mlm_ending)
        for kind, arg in (("slm", slm), ("ngram", ngram)):
            if not arg or arg.lower() == "none":
                continue
            for i, path in enumerate(arg.split(",")):
                name = kind if i == 0 else f"{kind}{i + 1}"
                if self.device.type != "cpu" and (kind != "slm" or path.startswith("day:")):
                    raise SystemExit("--device cuda runs --slm checkpoints only (not --ngram or --slm day:...): use --device cpu")
                if kind == "slm" and path.startswith("day:"):
                    from .dayroute import DayRoutedSLMScorer   # E5: each example scored by its day's checkpoint
                    self.others[name] = DayRoutedSLMScorer(path[4:], threads=threads)
                elif kind == "slm":
                    from .slm import SLMScorer          # written by another agent: imported only when asked for
                    self.others[name] = SLMScorer(path, threads=threads)
                    if self.device.type != "cpu":
                        from .gpu import to_device
                        to_device(self.others[name], self.device)
                else:
                    from .ngram import NgramScorer
                    self.others[name] = NgramScorer(path)

    def _dev(self, x):
        """A scorer's output on the harness's device (a scorer that runs on the CPU, e.g. the n-gram, is moved)."""
        return x.to(self.device) if torch.is_tensor(x) and x.device != self.device else x

    def check(self, variants: Sequence[Variant]) -> None:
        for v in variants:
            for p in v.parts:
                if p == "llm" and self.llm is None:
                    raise SystemExit(f"variant {v.spec!r} needs --llm")
                if p != "llm" and p not in self.others:
                    raise SystemExit(f"variant {v.spec!r}: no scorer {p!r} (give --slm / --ngram)")

    def rows(self, ex: Example, variants: Sequence[Variant], alone: bool = False) -> dict:
        """{'llm': lp, 'slm': lp (alone), 'slm+': lp (with the LLM), 'unk:slm': unk mass or None}.
        alone=True (E8 event dump): also 'alone:slm' = the SLM alone for every SLM that is mixed."""
        need_alone = {v.parts[0] for v in variants if len(v.parts) == 1}
        need_with = {v.parts[1] for v in variants if len(v.parts) == 2}
        need_llm = "llm" in need_alone or bool(need_with)
        r: dict = {}
        if need_llm:
            r["llm"] = self.llm.logprobs(ex)
        for name in need_alone - {"llm"}:
            r[name] = self._dev(self.others[name].logprobs(ex, None))
        for name in need_with:
            sc = self.others[name]
            if hasattr(sc, "slm_logprobs") and hasattr(getattr(sc, "vocab", None), "spread"):
                s = sc.slm_logprobs(ex)                  # SLMScorer / NgramScorer: keep the <unk> mass (id 0) for the gate
                s = self._dev(s)
                r["unk:" + name] = s[:, 0].exp()
                r[name + "+"] = sc.vocab.spread(s, r["llm"])
                if alone:
                    r["alone:" + name] = sc.vocab.spread(s, None)
            else:
                r[name + "+"] = self._dev(sc.logprobs(ex, r["llm"]))
                if alone:
                    r["alone:" + name] = self._dev(sc.logprobs(ex, None))
                unk = getattr(sc, "last_unk", None)      # optional: a scorer may expose P(<unk>) per row
                r["unk:" + name] = self._dev(unk() if callable(unk) else unk)
        return r

    def _base_mixed(self, v: Variant, r: dict, tb, ex: Example, gates: dict):
        """(log-probs of the variant without the cache, the mixing weight of the LLM per row or None)."""
        from . import mix
        from .tokbytes import word_start_flags
        if len(v.parts) == 1:
            return r[v.parts[0]], None
        o = v.parts[1]
        a, b = r["llm"], r[o + "+"]
        if v.mode == "linear":
            return mix.linear(a, b, float(v.param)), torch.full((a.shape[0],), float(v.param), device=a.device)
        if v.mode == "loglinear":
            return mix.loglinear(a, b, float(v.param)), None
        g = gates.get(v.param)
        if g is None:
            g = gates[v.param] = mix.Gate.load(v.param)
        if v.mode == "langswitch" and g.choice(ex.lang) == "llm":
            return a, torch.ones(a.shape[0], device=a.device)               # this language: the LLM alone (its own rows, exactly)
        # gate: the per-language bias of the JSON, if it has one, for ex.lang; langswitch: the shared gate
        lam = g.lam(mix.gate_features(a, b, r.get("unk:" + o), word_start_flags(tb, ex.target_ids)),
                    ex.lang if v.mode == "gate" else None)
        return mix.linear(a, b, lam), lam

    def mixed(self, v: Variant, r: dict, tb, ex: Example, gates: dict) -> torch.Tensor:
        return self.mixed_lam(v, r, tb, ex, gates)[0]

    def mixed_lam(self, v: Variant, r: dict, tb, ex: Example, gates: dict):
        """(log-probs of the variant, the LLM's mixing weight per row or None): lambda of a gate or a linear mix."""
        lp, lam = self._base_mixed(v, r, tb, ex, gates)
        if v.cache:
            lp = self._cache_mix(v, lp, ex)
        return lp, lam

    def _cache_mix(self, v: Variant, lp: torch.Tensor, ex: Example) -> torch.Tensor:
        from .cache import CacheFit, SessionCache
        src = getattr(self, "_cache_src", None)
        if src is None:
            tok = getattr(self, "tok", None) or self.llm.tok
            src = self._cache_src = SessionCache(tok, getattr(self, "data_dir", None))
            self._cache_fits = {}
        fit = self._cache_fits.get(v.cache)
        if fit is None:
            fit = self._cache_fits[v.cache] = CacheFit.load(v.cache)
        return fit.apply(lp, src.for_example(ex, lp.shape[1]))

    def speed(self) -> dict:
        return self.llm.speed() if self.llm is not None else {}


def flatten_rows(rows: list[dict]) -> dict:
    """One flat dict of numbers from group_metrics() rows: overall unprefixed, others 'surface.chat.acc@0'."""
    out: dict = {}
    for r in rows:
        g = r["group"]
        for k, v in r.items():
            if k == "group":
                continue
            out[k if g == "all" else f"{g.replace(':', '.')}.{k}"] = v
    return out
