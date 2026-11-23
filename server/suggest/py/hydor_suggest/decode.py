"""Constrained greedy decoding of the word being typed, and its confidence.

Greedy inside the allowed set of the typed bytes R (the ids whose bytes start with R, or are a prefix of it), then unconstrained,
until the word ends (the next arg max begins with whitespace or is end-of-text, or the token carries the whitespace) or the token
limit. The confidence is the product of the renormalised step probabilities inside the allowed sets, times the mass of the
word-ending tokens at the end. It is the research's decoder (scripts/real_chances.py) on one path.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np

from .tokbytes import WS_END, PrefixIndex

MAX_TOKENS = 8


class Cancelled(Exception):
    """Raised between decoding steps when the request was cancelled."""


@dataclass
class Decoded:
    produced: bytes          # the bytes decoded, the typed bytes R first
    conf: float              # the chance the word is right
    ended: bool              # the word ended (rather than the token limit or a dead end)
    path: tuple              # the tokens decoded, those a following word would be decoded after
    tokens: int
    eot: bool = False        # the word ended because end-of-text was the likeliest next token


def decode(row_fn: Callable, index: PrefixIndex, R: bytes, path: tuple = (), max_tokens: int = MAX_TOKENS,
           cancelled: Optional[Callable] = None) -> Decoded:
    """Decode a word. row_fn(path) is the probability vector over the ids after the target and the tokens of `path` (float32 numpy;
    all zeros where the distribution has no mass, such as outside the language model's top ids). R: the bytes typed (whitespace
    before the word included; empty to decode a whole next word)."""
    tb = index.tb
    produced, conf = b'', 1.0
    path = tuple(path)
    n0 = len(path)
    for step in range(max_tokens):
        if cancelled is not None and cancelled():
            raise Cancelled()
        allowed = index.allowed(R)
        if not len(allowed):
            return Decoded(produced, 0.0, False, path, len(path) - n0)
        want_end = (not R) and bool(produced)               # a word is under way: does it end here?
        row = row_fn(path)
        vals = row[allowed]
        total = float(vals.sum(dtype=np.float64))
        if want_end:
            arg = int(row.argmax())
            if index.ends_word[arg]:
                ends = float(row[index.ends_ids].sum(dtype=np.float64))
                return Decoded(produced, conf * ends, True, path, len(path) - n0, arg in index.end_set)
        if not total > 0.0:
            return Decoded(produced, 0.0, False, path, len(path) - n0)
        i = int(vals.argmax())
        tok = int(allowed[i])
        conf *= float(vals[i]) / total
        b = tb[tok]
        produced += b
        R = R[len(b):] if len(b) < len(R) else b''
        if not R and b[-1:] in WS_END:                      # the token carries the whitespace that ends the word
            return Decoded(produced, conf, True, path + (tok,), len(path) + 1 - n0)
        if step == max_tokens - 1:                          # the token limit: the next row would not be read
            return Decoded(produced, conf, False, path, len(path) - n0)
        path = path + (tok,)
    return Decoded(produced, conf, False, path, len(path) - n0)


def text_after(produced: bytes, R: bytes) -> str:
    """What was decoded past the typed bytes, as text, without the whitespace that ended it."""
    return produced[len(R):].decode('utf-8', errors='ignore').rstrip()


def next_word_text(produced: bytes) -> str:
    """A following word with its leading whitespace (a single space when the decoded token did not carry one)."""
    s = produced.decode('utf-8', errors='ignore').rstrip()
    if not s:
        return ''
    return s if s[0].isspace() else ' ' + s
