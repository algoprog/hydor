"""The language guess: naive Bayes over Qwen token ids.

lid.json: {"format": "hydor-suggest-lid/1", "languages": [FLORES codes], "top": N, "floor": [one log-probability per language]}.
lid.bin: uint32 ids [languages x N] (Qwen ids, little-endian) followed by float16 log-probabilities [languages x N]: per language
the N tokens it uses most. A token a language does not list scores its floor. The score of a language is the sum over the
context's tokens; the prior is uniform; the posterior is the softmax of the scores.
"""
from __future__ import annotations

import json
import os
import unicodedata
from typing import Optional, Sequence

import numpy as np

FORMAT = 'hydor-suggest-lid/1'
MIN_TOKENS = 8
MIN_POSTERIOR = 0.9
MIN_LETTER_SHARE = 0.8


def mostly_letters(text: str, share: float = MIN_LETTER_SHARE) -> bool:
    """Whether letters are at least `share` of the non-space characters of the text: a language is only guessed on text, not on code,
    paths or URLs (which were guessed as some language with a posterior over 0.9). Letters are Unicode categories L* and M*: the vowel
    signs of Indic scripts are marks, and Hindi or Bengali text would fall to 64-69% with L* alone."""
    n = k = 0
    for ch in text:
        if ch.isspace():
            continue
        n += 1
        c = unicodedata.category(ch)
        if c[0] == 'L' or c[0] == 'M':
            k += 1
    return n > 0 and k >= share * n


class Lid:
    def __init__(self, languages: Sequence, ids: np.ndarray, logp: np.ndarray, floor: Sequence):
        self.languages = list(languages)
        L = len(self.languages)
        self.floor = np.asarray(floor, dtype=np.float64)
        if ids.shape[0] != L or logp.shape != ids.shape or len(self.floor) != L:
            raise ValueError('the language guess files do not fit')
        # every (token, language, log-probability - floor) sorted by token: the scores of a context are then the floor times its
        # length plus, for each token it has, the languages' gains
        lang = np.repeat(np.arange(L, dtype=np.int32), ids.shape[1])
        tok = ids.reshape(-1).astype(np.int64)
        gain = logp.reshape(-1).astype(np.float64) - self.floor[lang]
        order = np.argsort(tok, kind='stable')
        self._tok, self._lang, self._gain = tok[order], lang[order], gain[order]
        self._uniq, self._start = np.unique(self._tok, return_index=True)
        self._end = np.append(self._start[1:], len(self._tok))

    @staticmethod
    def load(folder: str) -> Optional['Lid']:
        jp, bp = os.path.join(folder, 'lid.json'), os.path.join(folder, 'lid.bin')
        if not (os.path.isfile(jp) and os.path.isfile(bp)):
            return None
        with open(jp, encoding='utf-8') as f:
            meta = json.load(f)
        if meta.get('format') != FORMAT:
            raise ValueError(f"unknown language guess format {meta.get('format')!r}")
        L, N = len(meta['languages']), int(meta['top'])
        with open(bp, 'rb') as f:
            raw = f.read()
        if len(raw) != L * N * 6:
            raise ValueError('lid.bin does not fit lid.json')
        ids = np.frombuffer(raw, dtype='<u4', count=L * N).reshape(L, N)
        logp = np.frombuffer(raw, dtype='<f2', count=L * N, offset=L * N * 4).reshape(L, N)
        return Lid(meta['languages'], ids, logp, meta['floor'])

    def scores(self, qwen_ids) -> np.ndarray:
        ids = np.asarray(qwen_ids, dtype=np.int64)
        s = self.floor * len(ids)
        if not len(ids):
            return s
        u, c = np.unique(ids, return_counts=True)
        pos = np.searchsorted(self._uniq, u)
        hit = (pos < len(self._uniq)) & (self._uniq[np.minimum(pos, len(self._uniq) - 1)] == u)
        for p, cnt in zip(pos[hit], c[hit]):
            a, b = self._start[p], self._end[p]
            np.add.at(s, self._lang[a:b], cnt * self._gain[a:b])
        return s

    def guess(self, qwen_ids, min_tokens: int = MIN_TOKENS, min_posterior: float = MIN_POSTERIOR) -> tuple:
        """(language or None, posterior of the best, tokens counted). None when there are fewer than min_tokens or the best
        language's posterior is below min_posterior. `qwen_ids` are Qwen ids; ids below zero (the specials of the small model's
        ids shifted back) are ignored."""
        ids = np.asarray(qwen_ids, dtype=np.int64)
        ids = ids[ids >= 0]
        n = len(ids)
        if n < min_tokens or not self.languages:
            return None, 0.0, n
        s = self.scores(ids)
        s = s - s.max()
        p = np.exp(s)
        p /= p.sum()
        i = int(p.argmax())
        return (self.languages[i] if p[i] >= min_posterior else None), float(p[i]), n
