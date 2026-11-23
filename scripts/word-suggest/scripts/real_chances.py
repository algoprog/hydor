"""E8 fair baseline: the chances of a variant with REAL constrained greedy decoding (the suggestion the app would show).

  nice -n 19 .venv/bin/python scripts/real_chances.py --split dev --surface chat --limit 120 --words-per-example 12 \
      --llm Qwen/Qwen3.5-0.8B-Base --slm runs/slm/lfm30m_w4/ckpt.pt --variant llm+slm:gate:runs/gate/lfm30m_w4.json \
      --threads 2 --events-out runs/e8/dev_real.jsonl --out runs/e8/dev_real

scripts/eval.py's c is measured along the gold path, so a wrong suggestion's c is an upper bound of its true confidence. Here
the suggestion is decoded for real, for a sample of words of each example (after the gold tokens before the word, as the app
would have them): for k = 0 .. min(len(word) - 1, --max-k) typed letters, greedy decoding constrained to the typed bytes
(the allowed sets of SPEC.md), then unconstrained, with the variant's mixed distribution (LLM and SLM through the gate: at
every step the LLM advances with its cache, and the SLM and the gate run on the whole text so far), until the word ends
(the arg max of the next row starts with whitespace or is end-of-text, or the last token carries the whitespace) or
--max-tokens tokens. Recorded in the dump format of scripts/eval.py (--dump-events):
  c      the true confidence: the product of the renormalised step probabilities inside the allowed sets, times the mass of the
         word-ending tokens at the end (as the harness defines c for a right suggestion);
  y      the suggestion's word equals the gold word;
  top, second, margin, ent, logn, toplen, agree, lam   the features of the first step, by the same code as the dump (the first
         step reads the very rows of the teacher-forced pass, so they equal the dump's for the same chances);
  prev   as in the dump (the teacher-forced label of the previous word at k = 0), c_tf and y_tf: the teacher-forced c and label
         of the same chance, ntok: tokens of the suggestion.
--variant slm decodes with the SLM alone (--slm ckpt, no --llm needed: --llm none): its distribution mapped to the LLM's ids, tokens outside
its vocabulary at -inf, a full SLM forward per step; the mix-only features (agree, lam) are then left out, and so they are for
--variant llm. (The tokenizer is the LLM's: --tokenizer, default Qwen/Qwen3.5-0.8B-Base.)
FLORES: --surface flores --lang <codes> --limit <per language> (--split test = devtest); variants llm, slm, llm+slm:gate:<json> (per-language
biases are used with ex.lang) and llm+slm:langswitch:<json> (a language the switch gives to the LLM is decoded with the LLM alone). Languages written
without spaces are skipped (char accuracy only, as in eval.py). --device cuda (with .venv-gpu, CUDA_VISIBLE_DEVICES, WS_GPU_MEM_GB) runs the LLM
with its cache, the SLM, the gate and the allowed-set work on the GPU; --shard k/n decodes every n-th example (cat the shards' events files:
scripts/merge_real.py). The words sampled per example depend on the example's id and --seed only, so every variant and shard sees the same words.
--phrase-words N (default 1: as before, nothing else is decoded or recorded) also decodes up to N words per suggestion, the way
engine.py does for the next word: after a word that ended (and not on end-of-text) the next word is decoded from the tokens the
suggestion has so far, unconstrained, with the first step's whitespace-only tokens left out (step_allowed), and so on. For
a chance whose first word is right and whose confidence is at least --phrase-floor, each following word is decoded while the
words so far are right, the path's confidence (the product of the words' confidences) is at least --phrase-floor and each word
ended: the chance's record then holds "ph", a list with one [y, c_own, c_path, L, bonus] per following word (y: the word is the
gold word that follows; c_own: its own confidence; c_path: the product of the confidences of the words up to it; L, bonus: the
gold word's letters and the single space after it, as the first word's record has them; a following word that the harness left
unaligned counts as wrong, one past the end of the text as well). Nothing is recorded for a chance whose first word is wrong
(a phrase starting wrong saves nothing, whatever follows) or whose confidence is below the floor (no threshold below the floor may
be used on these events). Run it with --words-per-example 0 (every word): scripts/show_filter.py --phrase-compare walks the
whole example, a phrase taken at one word covering the next ones.
An {"t": "e"} line per example: chars = the characters of the sampled words plus the single spaces after them (the keystroke
simulation of scripts/show_filter.py is over these words only; k <= --max-k). Checks reported in <out>/metrics.jsonl: agreement
of y with y_tf, how much c_tf overstates c, and (first --check-words words per example) how far the first step's distribution
rebuilt from the incremental decoding state is from the teacher-forced row.
"""
import argparse
import copy
import dataclasses
import json
import math
import os
import random
import sys
import time
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch  # noqa: E402

from ws import mix  # noqa: E402
from ws.evaluate import DEFAULT_LLM, EvalConfig, Evaluator, Scorers, parse_variant, setup_env  # noqa: E402
from ws.textdata import add_data_args, load_examples  # noqa: E402

WS_END = (b" ", b"\n", b"\t", b"\r")
NEG = float("-inf")


@torch.inference_mode()
def advance(model, ids, cache):
    """Feed ids (a list) after the cache; returns (last-position logits float32 [V], cache)."""
    dev = next(model.parameters()).device
    out = model(input_ids=torch.tensor([ids], device=dev), past_key_values=cache, use_cache=True, logits_to_keep=1)
    return out.logits[0, -1].float(), out.past_key_values


class Node:
    """The state after the gold tokens before a word and `path` (the tokens decoded so far): lp = log P(next token) of the
    variant, cache = the LLM's state. pre: first-step results of the word's typed prefixes, computed in one batch."""

    def __init__(self, path, lp, cache):
        self.path, self.lp, self.cache = path, lp, cache
        self.children: dict = {}
        self.pre: dict = {}


@torch.no_grad()
def slm_last_row(scorer, pex):
    """log-probs [1, V_sub] of the SLM after the whole text of pex (what scorer.slm_logprobs(pex)[-1:] gives, without the
    logits of the earlier rows). Without autograd: the SLM's weights require grad, and a row kept in a decoding tree's node
    would otherwise hold the whole forward's activations (the 88M ran out of 12 GB on long examples; the values are the same)."""
    from ws.vocab import NEVER_PREDICT
    v = scorer.vocab
    ids = torch.tensor([v.slm_prefix_ids(pex) + v.target_slm_ids(pex)], dtype=torch.long)
    logits = scorer.model(ids, keep=1)[0].float()
    logits[:, list(NEVER_PREDICT)] = NEG
    return torch.log_softmax(logits, dim=-1)


class Stepper:
    """Next-token distribution of the variant after any token sequence of an example (LLM with a cache, SLM and gate from
    scratch). plan (set per example): 'llm' (the LLM alone: variant llm, or a language the switch gives to the LLM), 'slm'
    (the SLM alone) or 'mix' (the gate or a fixed lambda)."""

    def __init__(self, sc, v, gates, tb):
        self.sc, self.v, self.gates, self.tb = sc, v, gates, tb
        self.llm = sc.llm
        self.alone = v.parts[0] != "llm"                      # the SLM alone: no LLM state at all
        self.slm = sc.others[v.parts[-1]] if (len(v.parts) == 2 or self.alone) else None
        self.gate = None
        if self.slm is not None and not self.alone:
            if v.mode in ("gate", "langswitch"):
                self.gate = gates.get(v.param) or gates.setdefault(v.param, mix.Gate.load(v.param))
            elif v.mode != "linear":
                raise SystemExit(f"real decoding supports llm, slm, llm+slm:gate, :langswitch and :linear, not {v.spec!r}")
        self.plan = "slm" if self.alone else ("llm" if self.slm is None else "mix")
        self.steps = 0
        self.seconds_llm = self.seconds_slm = 0.0

    def set_example(self, ex) -> str:
        if self.alone:
            self.plan = "slm"
        elif self.slm is None or (self.v.mode == "langswitch" and self.gate.choice(ex.lang) == "llm"):
            self.plan = "llm"
        else:
            self.plan = "mix"
        return self.plan

    def llm_lp(self, logits):
        lg = logits.clone()
        if self.llm._pad_mask is not None:
            lg[self.llm._pad_mask] = NEG
        return torch.log_softmax(lg, -1)

    def mixed(self, ex, tids, llm_lp):
        """log P of the variant after the target tokens `tids` given the LLM's row (1-D)."""
        if self.plan == "llm":
            return llm_lp
        t0 = time.perf_counter()
        pex = dataclasses.replace(ex, target_ids=list(tids), offsets=[(0, 0)] * len(tids))
        s = slm_last_row(self.slm, pex)
        if self.plan == "slm":
            out = self.slm.vocab.spread(s, None)[0]
            self.seconds_slm += time.perf_counter() - t0
            return out
        plus = self.slm.vocab.spread(s, llm_lp[None])
        a = llm_lp[None]
        if self.gate is not None:
            from ws.tokbytes import word_start_flags
            feats = mix.gate_features(a, plus, s[:, 0].exp(), [word_start_flags(self.tb, tids)[-1]])
            feats[:, 5] = math.log1p(len(tids))                 # position in the target: the row's index
            lam = self.gate.lam(feats, ex.lang if self.v.mode == "gate" else None)
        else:
            lam = torch.full((1,), float(self.v.param), device=a.device)
        out = mix.linear(a, plus, lam)[0]
        self.seconds_slm += time.perf_counter() - t0
        return out

    def child(self, ex, gold_before, node, t):
        c = node.children.get(t)
        if c is None:
            path = node.path + (t,)
            if self.plan == "slm":
                self.steps += 1
                c = node.children[t] = Node(path, self.mixed(ex, list(gold_before) + list(path), None), None)
                return c
            t0 = time.perf_counter()
            logits, cache = advance(self.llm.model, [t], copy.deepcopy(node.cache))
            self.seconds_llm += time.perf_counter() - t0
            self.steps += 1
            c = node.children[t] = Node(path, self.mixed(ex, list(gold_before) + list(path), self.llm_lp(logits)), cache)
        return c


class Decoder:
    """Constrained greedy decoding on the device of the rows. Per step one batch of kernels and one device-to-host copy: the
    arg max and log-sum-exp inside the allowed set (and, once a word is under way, the unconstrained arg max and the mass of the
    word-ending tokens). The first steps of all typed prefixes of a word (k = 0 .. K-1 read the same row) are one batch
    (prefetch)."""

    def __init__(self, ev, tb, max_tokens, elem_budget=16_000_000):
        self.ev, self.tb, self.max_tokens = ev, tb, max_tokens
        self.index = ev.index
        self.dev = ev._valid_idx.device
        self.valid = ev._valid_idx
        self.valid_cpu = ev._valid_idx.cpu()
        self.ends = ev._ends_idx
        self.ends_word = ev.index.ends_word
        self._cache: "OrderedDict[bytes, tuple]" = OrderedDict()
        self._elems, self._budget = 0, elem_budget
        self.end_set = set(ev.index.end_ids)
        self.cont = None            # after a word that ended: (node, token or None, ended on end-of-text); where a next word goes on
        ws_only = torch.tensor([bool(b) and not b.strip(b" \t\n\r\x0b\x0c") for b in tb], dtype=torch.bool)
        keep = ~ws_only[self.valid_cpu]
        self.first_next = (self.valid_cpu[keep], self.valid[keep.to(self.dev)])     # step_allowed(b"", False) of the app

    def allowed(self, R: bytes):
        """(ids on the CPU, ids on the device) of the allowed set for the bytes still to match (all valid tokens if empty)."""
        if not R:
            return self.valid_cpu, self.valid
        hit = self._cache.get(R)
        if hit is not None:
            self._cache.move_to_end(R)
            return hit
        cpu = self.index.allowed(R)
        dev = cpu if self.dev.type == "cpu" else cpu.to(self.dev)
        self._cache[R] = (cpu, dev)
        self._elems += len(cpu)
        while self._elems > self._budget and len(self._cache) > 1:
            _, (old, _) = self._cache.popitem(last=False)
            self._elems -= len(old)
        return cpu, dev

    def prefetch(self, root, Rs):
        """Step-one results (token, max, log-sum-exp inside the allowed set) of each typed prefix R, one batch."""
        sets = [self.allowed(R) for R in Rs]
        keep = [i for i, (c, _) in enumerate(sets) if len(c)]
        if not keep:
            return
        dev = self.dev
        flat = torch.cat([sets[i][1] for i in keep])
        lens = [len(sets[i][0]) for i in keep]
        nq = len(keep)
        seg = torch.repeat_interleave(torch.arange(nq, device=dev), torch.tensor(lens, device=dev), output_size=sum(lens))
        vals = root.lp.index_select(0, flat)
        mx = torch.full((nq,), NEG, device=dev).scatter_reduce(0, seg, vals, "amax", include_self=True)
        fin = torch.isfinite(mx)
        e = torch.where(fin[seg], torch.exp((vals - mx[seg]).double()), torch.zeros((), dtype=torch.double, device=dev))
        sm = torch.zeros(nq, dtype=torch.double, device=dev).index_add_(0, seg, e)
        lse = torch.where(fin, mx.double() + torch.log(sm.clamp_min(1e-300)), torch.full_like(sm, NEG)).float()
        pos = torch.arange(len(vals), device=dev)
        big = torch.full((nq,), len(vals), device=dev, dtype=torch.long)
        first = big.scatter_reduce(0, seg, torch.where(vals == mx[seg], pos, len(vals)), "amin", include_self=True)
        tok = flat[first.clamp(max=len(vals) - 1)]
        for q, m_, l_, t_ in zip(keep, mx.tolist(), lse.tolist(), tok.tolist()):
            root.pre[Rs[q]] = (t_, m_, l_)

    def stat(self, row, R, want_end):
        """(token, max, lse, unconstrained arg max id, ends lse) inside the allowed set of R (arg max / ends None unless want_end)."""
        return self.stat_set(row, *self.allowed(R), want_end)

    def stat_set(self, row, cpu, dev, want_end):
        """stat() for a given allowed set (ids on the CPU, ids on the device)."""
        vals = row.index_select(0, dev)
        m, i = vals.max(0)
        parts = [m, vals.logsumexp(0), i.to(vals.dtype)]
        if want_end:
            parts += [row.argmax().to(vals.dtype), row.index_select(0, self.ends).logsumexp(0) if len(self.ends)
                      else torch.full((), NEG, device=row.device)]
        res = torch.stack(parts).tolist()
        tok = int(cpu[int(res[2])])
        return (tok, res[0], res[1]) + ((int(res[3]), res[4]) if want_end else (None, None))

    def decode(self, st, ex, gold_before, root, R):
        """Constrained greedy decoding from root with the typed bytes R. Returns (produced bytes, confidence, ended, tokens)."""
        tb = self.tb
        produced, conf, node = b"", 1.0, root
        self.cont = None
        for step in range(self.max_tokens):
            cpu, _ = self.allowed(R)
            if not len(cpu):
                return produced, 0.0, False, len(node.path)
            want_end = (not R) and bool(produced)               # a word is under way: does it end here?
            pre = root.pre.get(R) if (node is root and not want_end) else None
            if pre is not None:
                tok, m, lse = pre
                arg = ends_lse = None
            else:
                tok, m, lse, arg, ends_lse = self.stat(node.lp, R, want_end)
            if want_end and bool(self.ends_word[arg]):
                self.cont = (node, None, arg in self.end_set)
                return produced, conf * math.exp(ends_lse), True, len(node.path)
            if lse == NEG:
                return produced, 0.0, False, len(node.path)
            conf *= math.exp(m - lse)
            b = tb[tok]
            produced += b
            R = R[len(b):] if len(b) < len(R) else b""
            if not R and b[-1:] in WS_END:                         # the token carries the whitespace that ends the word
                self.cont = (node, tok, False)
                return produced, conf, True, len(node.path) + 1
            if step == self.max_tokens - 1:                        # the token limit: the next row would not be read
                break
            node = st.child(ex, gold_before, node, tok)
        return produced, conf, False, self.max_tokens

    def decode_next(self, st, ex, gold_before, node):
        """The next whole word after `node` (engine.py: decode(row_fn, index, b"", path)): greedy over the valid tokens, the
        whitespace-only ones left out of the first step. Returns (produced bytes, confidence, ended); self.cont as in decode()."""
        tb = self.tb
        produced, conf = b"", 1.0
        self.cont = None
        for step in range(self.max_tokens):
            started = bool(produced.strip())
            cpu, dev = self.allowed(b"") if started else self.first_next
            if not len(cpu):
                return produced, 0.0, False
            tok, m, lse, arg, ends_lse = self.stat_set(node.lp, cpu, dev, started)
            if started and bool(self.ends_word[arg]):
                self.cont = (node, None, arg in self.end_set)
                return produced, conf * math.exp(ends_lse), True
            if lse == NEG:
                return produced, 0.0, False
            conf *= math.exp(m - lse)
            b = tb[tok]
            produced += b
            if b[-1:] in WS_END and produced.strip():
                self.cont = (node, tok, False)
                return produced, conf, True
            if step == self.max_tokens - 1:
                break
            node = st.child(ex, gold_before, node, tok)
        return produced, conf, False

    def phrase(self, st, ex, gold_before, conf, gold_next, n_words, floor):
        """The words after a first word that ended (self.cont) and had confidence conf: [[y, c_own, c_path, L, bonus], ...] for
        up to n_words - 1 words (see the module docstring). gold_next: [(word bytes, L, bonus) or None] for the words after."""
        out, cum = [], conf
        node, tok, eot = self.cont
        if eot:
            return out
        for i in range(n_words - 1):
            if tok is not None:
                node = st.child(ex, gold_before, node, tok)
            produced, c_own, ended = self.decode_next(st, ex, gold_before, node)
            g = gold_next[i] if i < len(gold_next) else None
            y = int(g is not None and produced.strip() == g[0])
            cum *= c_own
            out.append([y, c_own, cum, g[1] if g else 0, g[2] if g else 0])
            if not (y and ended and cum >= floor) or self.cont is None or self.cont[2]:
                break
            node, tok, _ = self.cont
        return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_args(ap)
    ap.set_defaults(limit=120)
    ap.add_argument("--fmt", default="plain", choices=["plain", "roles"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--dtype", default="bfloat16")
    ap.add_argument("--tokenizer", default=None, help="the LLM tokenizer (default: --llm, or Qwen/Qwen3.5-0.8B-Base)")
    ap.add_argument("--slm", default="none")
    ap.add_argument("--variant", default="llm")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--words-per-example", type=int, default=12, help="words sampled per example (0 = all)")
    ap.add_argument("--max-k", type=int, default=6, help="letters typed: k = 0 .. min(len - 1, max-k)")
    ap.add_argument("--max-tokens", type=int, default=8)
    ap.add_argument("--phrase-words", type=int, default=1, help="decode up to this many words per suggestion (1: the first word only, as before)")
    ap.add_argument("--phrase-floor", type=float, default=0.05, help="with --phrase-words: no word is decoded after a path of confidence below this")
    ap.add_argument("--check-words", type=int, default=2, help="words per example whose first step is rebuilt from the state")
    ap.add_argument("--device", default="cpu", help="cpu | cuda | cuda:N (cuda: .venv-gpu; WS_GPU_MEM_GB caps the memory)")
    ap.add_argument("--shard", default=None, help="k/n: this process decodes examples k, k+n, ... (k from 0); cat the events files")
    ap.add_argument("--events-out", required=True)
    ap.add_argument("--resume", action="store_true", help="keep the examples already in --events-out and decode the rest "
                    "(appended; an example's lines are written together once it is decoded). <out>'s checks then cover only "
                    "the rest; the events, which scripts/merge_real.py and show_filter.py read, cover all")
    ap.add_argument("--out", default=None, help="metrics.jsonl goes here")
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
    tok_name = a.tokenizer or (a.llm if a.llm.lower() != "none" else DEFAULT_LLM)
    tok = AutoTokenizer.from_pretrained(tok_name)
    V = llm_vocab_size(tok_name)
    tb = token_bytes(tok, V)
    ev = Evaluator(tb, end_token_ids(tok, V), EvalConfig(), keep_details=True, device=str(device))
    v = parse_variant(a.variant)
    if v.cache:
        raise SystemExit("--variant without |cache:")
    if v.parts[0] != "llm" and a.llm.lower() != "none":
        print("# --variant slm: the LLM is not needed, not loading it", file=sys.stderr)
        a.llm = "none"
    sc = Scorers(a.llm, a.slm, "none", a.dtype, a.threads, a.fmt, data_dir=a.data, tok=tok, device=str(device))
    sc.check([v])
    exs = load_examples(tok, a.split, a.surface, a.ctx, a.limit, a.seed, a.lang, a.data, a.min_words)
    if not exs:
        raise SystemExit("no examples")
    total = len(exs)
    exs = exs[shard_k::shard_n]
    if not exs:
        raise SystemExit("no examples in this shard")
    st = Stepper(sc, v, {}, tb)
    dec = Decoder(ev, tb, a.max_tokens)
    from ws.types import is_nospace
    os.makedirs(os.path.dirname(os.path.abspath(a.events_out)), exist_ok=True)
    done = set()
    if a.resume and os.path.exists(a.events_out):
        with open(a.events_out, "rb") as f:
            data = f.read()
        if data and not data.endswith(b"\n"):
            raise SystemExit(f"{a.events_out} ends inside a line: not resuming")
        for line in data.decode("utf-8").splitlines():
            r = json.loads(line)
            if r["t"] == "e":
                done.add(r["id"])
        print(f"# resuming: {len(done)} examples already in {a.events_out}", file=sys.stderr, flush=True)
    ef = open(a.events_out, "a" if a.resume else "w")
    agree = {k: [0, 0, 0, 0] for k in range(a.max_k + 1)}     # n, same label, tf right & real wrong, tf wrong & real right
    feat_diff = dict(n=0, top1_same=0, max_dtop=0.0, sum_dtop=0.0)
    feat_check = dict(n=0, max_abs=0.0)
    ratio_wrong, ratio_right = [], []
    n_chances = n_words = skipped = 0
    t0 = time.time()
    for ei, ex in enumerate(exs):
        if ex.id in done:
            continue
        if is_nospace(ex.lang, ev.cfg.cjk_langs):          # no-space scripts keep char accuracy (eval.py): no suggestions to decode
            skipped += 1
            continue
        plan = st.set_example(ex)
        rows = sc.rows(ex, [v], alone=True)
        lp, lam = sc.mixed_lam(v, rows, tb, ex, {})
        extra = (dict(llm=rows["llm"], slm=rows.get("alone:" + v.parts[1]), lam=lam) if len(v.parts) == 2 else None)
        ev.collect = True
        ev.score(ex, lp, extra)
        tf = {(r["j"], r["k"]): r for r in ev.chances}
        words = [(j, w) for j, w in enumerate(ev.details) if w["aligned"]]
        if a.words_per_example and len(words) > a.words_per_example:
            words = sorted(random.Random(f"{a.seed}:{ex.id}").sample(words, a.words_per_example), key=lambda x: x[1]["a"])
        gold = list(ex.target_ids)
        logits, cache = (None, None) if plan == "slm" else advance(sc.llm.model, sc.llm.prefix_ids(ex), None)
        pos = 0
        recs, chars = [], 0

        def gold_next(j):
            """The gold words after word j (bytes, letters, the single space after): None where the harness left the word unaligned."""
            out = []
            for i in range(j + 1, min(j + a.phrase_words, len(ev.details))):
                d = ev.details[i]
                out.append((d["word"].encode("utf-8"), tf[(i, 0)]["L"], tf[(i, 0)]["bonus"]) if d["aligned"] else None)
            return out
        for wi, (j, w) in enumerate(words):
            if w["a"] > pos and plan != "slm":
                logits, cache = advance(sc.llm.model, gold[pos:w["a"]], cache)
            pos = w["a"]
            wb = w["word"].encode("utf-8")
            K = min(len(w["correct"]), a.max_k + 1)
            first = tf[(j, 0)]
            chars += first["L"] + first["bonus"]
            root = Node((), lp[w["a"]], cache)             # the first step: the very row of the teacher-forced pass
            if wi < a.check_words:
                r0 = st.mixed(ex, gold[:w["a"]], None if plan == "slm" else st.llm_lp(logits))      # the same row rebuilt from the decoding state
                p0, q0 = lp[w["a"]].exp(), r0.exp()
                feat_diff["n"] += 1
                feat_diff["top1_same"] += int(int(lp[w["a"]].argmax()) == int(r0.argmax()))
                d = float((p0.max() - q0[int(p0.argmax())]).abs())
                feat_diff["max_dtop"] = max(feat_diff["max_dtop"], d)
                feat_diff["sum_dtop"] += d
            dec.prefetch(root, [w["lead"] + w["word"][:k].encode("utf-8") for k in range(K)])
            for k in range(K):
                R = w["lead"] + w["word"][:k].encode("utf-8")
                produced, conf, ended, ntok = dec.decode(st, ex, gold[:w["a"]], root, R)
                y = int(produced.strip() == wb)
                f = ev._chance_feats(lp, w["a"], R)
                t = tf[(j, k)]
                for key, val in f.items():                 # the features equal the teacher-forced dump's
                    if key in t:
                        feat_check["max_abs"] = max(feat_check["max_abs"], abs(float(val) - float(t[key])))
                feat_check["n"] += 1
                rec = dict(t="c", id=ex.id, j=j, k=k, L=t["L"], bonus=t["bonus"], y=y, c=conf, prev=t["prev"], **f,
                           c_tf=t["c"], y_tf=t["y"], ntok=ntok, ended=int(ended))
                if a.phrase_words > 1 and y and ended and conf >= a.phrase_floor and dec.cont is not None:
                    rec["ph"] = dec.phrase(st, ex, gold[:w["a"]], conf, gold_next(j), a.phrase_words, a.phrase_floor)
                recs.append(rec)
                s = agree[k]
                s[0] += 1
                s[1] += int(y == t["y"])
                s[2] += int(t["y"] == 1 and y == 0)
                s[3] += int(t["y"] == 0 and y == 1)
                if conf > 0:
                    (ratio_wrong if not y else ratio_right).append(t["c"] / conf)
                n_chances += 1
            n_words += 1
        ef.write(json.dumps(dict(t="e", id=ex.id, surface=ex.surface, lang=ex.lang, chars=chars)) + "\n")
        for r in recs:
            ef.write(json.dumps(r) + "\n")
        ef.flush()
        if (ei + 1) % 10 == 0 or ei + 1 == len(exs):
            print(f"# {ei + 1}/{len(exs)}  {time.time() - t0:.0f}s  words {n_words}  chances {n_chances}  decoding steps {st.steps}",
                  file=sys.stderr, flush=True)
    ef.close()

    def q(x, p):
        x = sorted(x)
        return x[int(p * (len(x) - 1))] if x else None

    def geo(x):
        x = [r for r in x if r > 0]
        return math.exp(sum(math.log(r) for r in x) / len(x)) if x else None

    tot = [sum(s[i] for s in agree.values()) for i in range(4)]
    lines = [dict(real_chances=a.variant, split=a.split, device=str(device), shard=a.shard, total_examples=total,
                  examples=len(exs), resumed_examples_kept=len(done), skipped_no_space_scripts=skipped, words=n_words,
                  chances=n_chances,
                  agreement_y=tot[1] / max(tot[0], 1), teacher_right_decode_wrong=tot[2], teacher_wrong_decode_right=tot[3],
                  agreement_by_k={k: s[1] / max(s[0], 1) for k, s in agree.items()},
                  ratio_ctf_over_ctrue_wrong=dict(n=len(ratio_wrong), mean=sum(ratio_wrong) / max(len(ratio_wrong), 1),
                                                  geo_mean=geo(ratio_wrong),
                                                  median=q(ratio_wrong, 0.5), p90=q(ratio_wrong, 0.9)),
                  ratio_ctf_over_ctrue_right=dict(n=len(ratio_right), mean=sum(ratio_right) / max(len(ratio_right), 1),
                                                  median=q(ratio_right, 0.5)),
                  features_vs_teacher_forced_max_abs_diff=feat_check["max_abs"],
                  first_step_rebuilt_from_state=dict(n=feat_diff["n"], top1_same=feat_diff["top1_same"] / max(feat_diff["n"], 1),
                                                     mean_abs_dtop=feat_diff["sum_dtop"] / max(feat_diff["n"], 1),
                                                     max_abs_dtop=feat_diff["max_dtop"]),
                  llm_steps=st.steps, seconds_llm_steps=st.seconds_llm, seconds_slm_steps=st.seconds_slm,
                  seconds=time.time() - t0, seconds_per_example=(time.time() - t0) / max(len(exs) - skipped, 1), dtype=a.dtype,
                  gpu_peak_gb=(torch.cuda.max_memory_allocated(device) / 2 ** 30 if device.type == "cuda" else None))]
    for l in lines:
        print(json.dumps(l), flush=True)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        with open(os.path.join(a.out, "metrics.jsonl"), "w") as f:
            for l in lines:
                f.write(json.dumps(l) + "\n")


if __name__ == "__main__":
    main()
