"""The exact bytes of every token id, and a fast index of "which tokens fit these typed bytes".

Byte-level BPE (Qwen3.5, GPT-2 style): GPT-2's byte-to-character map, inverted. Control tokens (special tokens and `<|...|>`
markers) and ids beyond the tokenizer's vocabulary (the model's padded rows) have no bytes (None): they are never suggested.
"""
from __future__ import annotations

import re
from bisect import bisect_left
from collections import OrderedDict
from typing import Optional, Sequence

import numpy as np


def bytes_to_unicode() -> dict:
    """GPT-2's reversible byte -> printable character map."""
    bs = list(range(ord('!'), ord('~') + 1)) + list(range(0xA1, 0xAC + 1)) + list(range(0xAE, 0xFF + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return {b: chr(c) for b, c in zip(bs, cs)}


_UNI2BYTE = {c: b for b, c in bytes_to_unicode().items()}
_CONTROL = re.compile(r'^<\|.*\|>$')
END_TOKENS = ('<|endoftext|>', '<|im_end|>', '<eos>', '</s>', '<end_of_turn>')
WS_END = (b' ', b'\n', b'\t', b'\r')
_WS_BYTES = b' \t\n\r\x0b\x0c'


def token_bytes(tok, n_vocab: Optional[int] = None) -> list:
    """The bytes of every id 0..n_vocab-1 (default: the tokenizer's size; ids past its vocabulary get None, as control tokens do).
    tok: a tokenizers.Tokenizer."""
    vocab = tok.get_vocab(with_added_tokens=True)               # token string -> id
    size = tok.get_vocab_size(with_added_tokens=True)
    n = n_vocab or size
    added = tok.get_added_tokens_decoder()                       # id -> AddedToken
    by_id = {i: s for s, i in vocab.items()}
    control = {i for i, t in added.items() if t.special or _CONTROL.match(t.content)}
    out: list = [None] * n
    for i in range(min(n, max(by_id) + 1 if by_id else 0)):
        s = by_id.get(i)
        if s is None or i in control:
            continue
        if i in added:                                            # a plain added token: its content is literal text
            out[i] = added[i].content.encode('utf-8')
            continue
        try:
            out[i] = bytes(_UNI2BYTE[c] for c in s)
        except KeyError:
            out[i] = s.encode('utf-8')
    return out


def end_token_ids(tok, n_vocab: Optional[int] = None) -> list:
    """Ids that mean 'the text ends here' (end-of-text, end-of-turn)."""
    ids = {int(i) for i, t in tok.get_added_tokens_decoder().items() if t.content in END_TOKENS}
    return sorted(i for i in ids if n_vocab is None or i < n_vocab)


def starts_with_whitespace(b: Optional[bytes]) -> bool:
    """True if the bytes begin with a whitespace character (ASCII or Unicode)."""
    if not b:
        return False
    if b[0] in _WS_BYTES:
        return True
    if b[0] < 0x80:
        return False
    for n in (2, 3):                                              # the first character of a multi-byte sequence
        try:
            return b[:n].decode('utf-8').isspace()
        except UnicodeDecodeError:
            continue
    return False


class PrefixIndex:
    """Token ids sorted by bytes. allowed(R): the ids whose bytes start with R, plus the ids whose bytes are a proper prefix of R.

    Starting with R is one contiguous range of the sorted list (bisect); proper prefixes are at most len(R) dictionary lookups.
    Results are cached (LRU). ends_word: the tokens that end a word when they come next (their bytes start with whitespace, or
    they are an end-of-text id)."""

    def __init__(self, tb: Sequence, end_ids: Sequence = (), cache_size: int = 20000):
        self.tb = list(tb)
        self.V = len(self.tb)
        pairs = sorted((b, i) for i, b in enumerate(self.tb) if b is not None)
        self.keys = [b for b, _ in pairs]
        self.sorted_ids = np.array([i for _, i in pairs], dtype=np.int64)
        self.by_bytes: dict = {}
        for b, i in pairs:
            self.by_bytes.setdefault(b, []).append(i)
        self.valid = np.zeros(self.V, dtype=bool)
        self.valid[self.sorted_ids] = True
        self.valid_ids = np.flatnonzero(self.valid)               # sorted by id
        self.end_ids = list(end_ids)
        self.end_set = set(self.end_ids)
        ws = np.zeros(self.V, dtype=bool)
        for i, b in enumerate(self.tb):
            if starts_with_whitespace(b):
                ws[i] = True
        for i in self.end_ids:
            if i < self.V:
                ws[i] = True
        self.ends_word = ws
        self.ends_ids = np.flatnonzero(ws)
        self._cache: OrderedDict = OrderedDict()
        self._cache_size = cache_size

    def range_for(self, R: bytes) -> tuple:
        """[lo, hi) in the sorted list of the tokens whose bytes start with R."""
        lo = bisect_left(self.keys, R)
        upper = R.rstrip(b'\xff')
        if not upper:
            return lo, len(self.keys)
        upper = upper[:-1] + bytes([upper[-1] + 1])
        return lo, bisect_left(self.keys, upper)

    def allowed(self, R: bytes) -> np.ndarray:
        """The allowed ids for the bytes still to match (every valid id if R is empty)."""
        if not R:
            return self.valid_ids
        hit = self._cache.get(R)
        if hit is not None:
            self._cache.move_to_end(R)
            return hit
        lo, hi = self.range_for(R)
        ids = self.sorted_ids[lo:hi]
        extra: list = []
        for n in range(1, len(R)):
            extra.extend(self.by_bytes.get(R[:n], ()))
        if extra:
            ids = np.concatenate([ids, np.array(extra, dtype=np.int64)])
        self._cache[R] = ids
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return ids


def word_start_flags(tb: Sequence, target_ids: Sequence) -> list:
    """For each row 0..n of an example's distributions: 1 if the next token starts a word (the first token, a token that begins
    with whitespace, or one right after a token ending in whitespace), and 1 for the row after the end."""
    flags = []
    prev_ws = True
    for t in target_ids:
        b = tb[t]
        flags.append(1 if (prev_ws or starts_with_whitespace(b)) else 0)
        prev_ws = bool(b) and starts_with_whitespace(b[-1:])
    flags.append(1)
    return flags
