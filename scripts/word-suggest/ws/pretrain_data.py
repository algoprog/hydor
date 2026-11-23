"""The pretraining shards of data/pretrain*/ (data/pretrain.py, data/pretrain200.py) as a list of lazily built SLM sequences.

Used by scripts/pretrain_slm.py (the pretraining) and scripts/train_slm.py (--replay-pretrain: pretraining text mixed into the
personalisation).  Web text: ``<bos> <doc> chunk <eos>``; conversations: ``<bos> <user> turn <agent> turn ...`` (ws/train.py formats).
"""
from __future__ import annotations

import glob
import re
import os

import numpy as np

from .train import Seq
from .vocab import AGENT, BOS, DOC, EOS, USER, Vocab


class Shards:
    """The token shards of data/pretrain/ as a list of lazily built Seqs (index -> Seq)."""

    def __init__(self, pre_dir: str, part: str, vocab: Vocab, sources=None, chunk_tokens=254, chat_max_len=768):
        self.vocab, self.chunk, self.chat_max = vocab, chunk_tokens, chat_max_len
        names = sorted(os.path.basename(p)[:-len(f'.{part}.tok.npy')] for p in glob.glob(os.path.join(pre_dir, f'*.{part}.tok.npy')))
        if sources:
            names = [n for n in names if n in sources]
        if not names:
            raise SystemExit(f'no shards in {pre_dir} (run data/pretrain.py)')
        self.names = names
        self.tok, self.role, self.turn_off = {}, {}, {}
        src, a, b, last, length = [], [], [], [], []
        for si, n in enumerate(names):
            base = os.path.join(pre_dir, f'{n}.{part}')
            self.tok[si] = np.load(base + '.tok.npy', mmap_mode='r')
            off = np.load(base + '.off.npy')
            if n == 'chat':
                self.role[si] = np.load(base + '.role.npy')
                self.turn_off[si] = off
                conv = np.load(base + '.conv.npy')
                t0, t1 = conv[:-1], conv[1:]
                raw = 1 + (off[t1] - off[t0]) + (t1 - t0) + 1
                src.append(np.full(len(t0), si)); a.append(t0); b.append(t1); last.append(np.ones(len(t0), bool))
                length.append(np.minimum(raw, chat_max_len))
            else:
                lens = np.diff(off)
                nch = -(-lens // chunk_tokens)
                doc = np.repeat(np.arange(len(lens)), nch)
                k = np.arange(int(nch.sum())) - np.repeat(np.cumsum(nch) - nch, nch)
                aa = off[doc] + k * chunk_tokens
                bb = np.minimum(aa + chunk_tokens, off[doc + 1])
                ll = bb == off[doc + 1]
                src.append(np.full(len(aa), si)); a.append(aa); b.append(bb); last.append(ll)
                length.append(bb - aa + 2 + ll)
        cat = lambda xs, dt: np.concatenate(xs).astype(dt) if xs else np.zeros(0, dt)
        self.item_src, self.a, self.b = cat(src, np.int16), cat(a, np.int64), cat(b, np.int64)
        self.last, self.lengths = cat(last, bool), cat(length, np.int64)

    def __len__(self):
        return len(self.lengths)

    def tokens(self) -> int:
        return int((self.lengths - 1).sum())

    def by_source(self) -> dict:
        t = np.bincount(self.item_src.astype(np.int64), weights=(self.lengths - 1).astype(np.float64), minlength=len(self.names))
        return {n: int(t[si]) for si, n in enumerate(self.names)}

    def __getitem__(self, i: int) -> Seq:
        si, a, b = int(self.item_src[i]), int(self.a[i]), int(self.b[i])
        l2s = self.vocab.llm2slm
        if self.names[si] == 'chat':
            off, tok, role = self.turn_off[si], self.tok[si], self.role[si]
            parts, w = [np.array([BOS])], [np.zeros(1, np.float32)]
            for t in range(a, b):
                body = l2s[np.asarray(tok[off[t]:off[t + 1]])]
                parts += [np.array([USER if role[t] else AGENT]), body]
                w += [np.zeros(1, np.float32), np.ones(len(body), np.float32)]
            parts.append(np.array([EOS])); w.append(np.ones(1, np.float32))
            ids = np.concatenate(parts).astype(np.int32)[:self.chat_max]
            w = np.concatenate(w)[:self.chat_max]
            return Seq(ids, w, 'chat', 0, 0)
        body = l2s[np.asarray(self.tok[si][a:b])]
        ids = np.concatenate([[BOS, DOC], body, [EOS] if self.last[i] else []]).astype(np.int32)
        w = np.ones(len(ids), dtype=np.float32)
        w[:2] = 0
        return Seq(ids, w, 'doc', 0, 0)


class Replay:
    """Pretraining text for a personalisation run: sample(n_tokens, rng) draws sequences uniformly over the shards' chunks (so the
    languages come in the corpus's own mix) until n_tokens input tokens are reached.  Held-out documents are never in the train
    part, so they are never replayed."""

    def __init__(self, pre_dir: str, vocab: Vocab, sources=None, chunk_tokens=254, chat_max_len=768):
        self.shards = Shards(pre_dir, 'train', vocab, sources, chunk_tokens, chat_max_len)
        self.mean = float(self.shards.lengths.mean()) - 1

    def __len__(self):
        return len(self.shards)

    def sample(self, n_tokens: int, rng) -> list:
        if n_tokens <= 0:
            return []
        k = max(1, int(round(n_tokens / self.mean)))
        idx = rng.randint(0, len(self.shards), size=k)
        # the draw is close to n_tokens; trim or top up so every batch has what was asked for (within one sequence)
        out, tot = [], 0
        for i in idx:
            q = self.shards[int(i)]
            out.append(q)
            tot += len(q.ids) - 1
            if tot >= n_tokens:
                break
        while tot < n_tokens:
            q = self.shards[int(rng.randint(0, len(self.shards)))]
            out.append(q)
            tot += len(q.ids) - 1
        return out


# ---- a language mix ---------------------------------------------------------------------------------------------------------
_SHARD_RE = re.compile(r'^web_(.+?)(?:_f\d+|_b)?$')


def shard_language(name: str):
    """The language config a shard belongs to: web_deu_Latn, web_deu_Latn_f012 and web_deu_Latn_b are 'deu_Latn'; chat is 'chat'; else None."""
    if name == 'chat':
        return 'chat'
    m = _SHARD_RE.match(name)
    return m.group(1) if m else None


def mix_draw(item_src: np.ndarray, lengths: np.ndarray, names: list, mix: dict, tokens: int, seed: int = 0):
    """Which sequences (item indices, with repeats) a run reads when each language has a target of tokens (data/mix_complement.json).

    mix = {"total_tokens": T, "max_repeats": R, "tokens": {language: target}}; the targets are scaled by tokens / T so that they add up
    to `tokens`.  A language's items are all its shards' items (never the held-out documents: the caller passes the train part).  Its
    target is met with whole passes over them first, then a random part (without replacement) until the target is reached (within one
    sequence); a language is never read more than R passes (its target is cut to R x what it has).  The items come out grouped by
    language and, inside it, in item order (so a block shuffle later reads runs of the files); the caller shuffles.

    Returns (draw: int64 item indices, report: {language: {target, realised, available, passes, capped}, '_missing': [...]})."""
    lang_of = np.full(len(names), -1, dtype=np.int32)
    langs = list(mix['tokens'])
    index = {l: i for i, l in enumerate(langs)}
    for si, n in enumerate(names):
        l = shard_language(n)
        if l in index:
            lang_of[si] = index[l]
    li = lang_of[item_src.astype(np.int64)]
    sel = np.flatnonzero(li >= 0)
    order = sel[np.argsort(li[sel], kind='stable')]                # items by language, item order inside a language
    counts = np.bincount(li[sel], minlength=len(langs))
    bounds = np.concatenate([[0], np.cumsum(counts)])
    total = float(mix['total_tokens'])
    scale = tokens / total
    max_rep = float(mix.get('max_repeats', 10))
    ntok = (lengths - 1).astype(np.int64)
    parts, report, missing = [], {}, []
    for k, l in enumerate(langs):
        items = order[bounds[k]:bounds[k + 1]]
        target = float(mix['tokens'][l]) * scale
        if not len(items):
            missing.append(l)
            continue
        avail = int(ntok[items].sum())
        capped = target > max_rep * avail
        target = min(target, max_rep * avail)
        whole = int(target // avail)
        rem = target - whole * avail
        got = whole * avail
        draw = [np.tile(items, whole)] if whole else []
        if rem > 0:
            rng = np.random.RandomState(seed * 1000003 + k + 1)
            perm = rng.permutation(len(items))
            cum = np.cumsum(ntok[items[perm]])
            n = min(int(np.searchsorted(cum, rem, side='left')) + 1, len(items))     # the smallest prefix reaching the remainder
            part = np.sort(items[perm[:n]])
            draw.append(part)
            got += int(ntok[part].sum())
        parts.append(np.concatenate(draw) if draw else items[:0])
        report[l] = dict(target=int(round(target)), realised=int(got), available=avail, passes=round(got / avail, 3), capped=bool(capped))
    report['_missing'] = missing
    return (np.concatenate(parts).astype(np.int64) if parts else np.zeros(0, np.int64)), report
