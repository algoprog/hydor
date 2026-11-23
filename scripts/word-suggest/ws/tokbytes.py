"""Exact bytes of every token id, and a fast index of "which tokens are compatible with these typed bytes".

Byte-level BPE (Qwen, LFM, GPT-2 style): invert GPT-2's bytes_to_unicode. SentencePiece (Gemma, Llama style): `▁` is a
space and `<0xNN>` is one byte. Control tokens (special tokens, and `<|...|>` markers) and ids beyond the tokenizer's
vocabulary (the model's padded rows) have no bytes (None): they are never suggested.
"""
from __future__ import annotations

import json
import re
from bisect import bisect_left
from collections import OrderedDict
from typing import Optional, Sequence

import torch


def bytes_to_unicode() -> dict[int, str]:
    """GPT-2's reversible byte -> printable character map."""
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(0xA1, 0xAC + 1)) + list(range(0xAE, 0xFF + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return {b: chr(c) for b, c in zip(bs, cs)}


_UNI2BYTE = {c: b for b, c in bytes_to_unicode().items()}
_SP_BYTE = re.compile(r"^<0x([0-9A-Fa-f]{2})>$")
_CONTROL = re.compile(r"^<\|.*\|>$")


def _backend(tok):
    return getattr(tok, "backend_tokenizer", None) or getattr(tok, "_tokenizer", None)


def tokenizer_kind(tok) -> str:
    """'bytelevel' or 'sentencepiece' (from the tokenizer's decoder)."""
    be = _backend(tok)
    if be is not None:
        dec = json.loads(be.to_str()).get("decoder") or {}
        s = json.dumps(dec)
        if "ByteLevel" in s:
            return "bytelevel"
        if "ByteFallback" in s or "▁" in s or "Metaspace" in s:
            return "sentencepiece"
    if hasattr(tok, "sp_model"):
        return "sentencepiece"
    return "bytelevel"


def token_bytes(tok, n_vocab: Optional[int] = None) -> list[Optional[bytes]]:
    """bytes of every id 0..n_vocab-1 (n_vocab defaults to the tokenizer's size); None for control tokens."""
    kind = tokenizer_kind(tok)
    size = len(tok)
    n = n_vocab or size
    added = getattr(tok, "added_tokens_decoder", {}) or {}
    special_ids = set(getattr(tok, "all_special_ids", []) or [])
    for i, t in added.items():
        if getattr(t, "special", False) or _CONTROL.match(t.content):
            special_ids.add(i)
    out: list[Optional[bytes]] = [None] * n
    strs = tok.convert_ids_to_tokens(list(range(min(n, size))))
    for i, s in enumerate(strs):
        if s is None or i in special_ids:
            continue
        if i in added:                       # a plain added token: its content is literal text
            out[i] = added[i].content.encode("utf-8")
        elif kind == "bytelevel":
            try:
                out[i] = bytes(_UNI2BYTE[c] for c in s)
            except KeyError:
                out[i] = s.encode("utf-8")
        else:
            m = _SP_BYTE.match(s)
            out[i] = bytes([int(m.group(1), 16)]) if m else s.replace("▁", " ").encode("utf-8")
    return out


def end_token_ids(tok, n_vocab: Optional[int] = None) -> list[int]:
    """Ids that mean 'the text ends here' (end-of-text, end-of-turn)."""
    ids = set()
    if tok.eos_token_id is not None:
        ids.add(int(tok.eos_token_id))
    for i, t in (getattr(tok, "added_tokens_decoder", {}) or {}).items():
        if t.content in ("<|endoftext|>", "<|im_end|>", "<eos>", "</s>", "<end_of_turn>"):
            ids.add(int(i))
    return sorted(i for i in ids if n_vocab is None or i < n_vocab)


_WS_BYTES = b" \t\n\r\x0b\x0c"


def starts_with_whitespace(b: Optional[bytes]) -> bool:
    """True if the bytes begin with a whitespace character (ASCII or Unicode)."""
    if not b:
        return False
    if b[0] in _WS_BYTES:
        return True
    if b[0] < 0x80:
        return False
    for n in (2, 3):                          # first character of a multi-byte sequence
        try:
            return b[:n].decode("utf-8").isspace()
        except UnicodeDecodeError:
            continue
    return False


class PrefixIndex:
    """Token ids sorted by bytes. allowed(R): ids whose bytes start with R, plus ids whose bytes are a proper prefix of R.

    Starting with R is one contiguous range of the sorted list (found with bisect); proper prefixes are at most
    len(R) dictionary lookups. Results are cached (LRU)."""

    def __init__(self, tb: Sequence[Optional[bytes]], end_ids: Sequence[int] = (), cache_size: int = 20000):
        self.tb = list(tb)
        self.V = len(self.tb)
        pairs = sorted((b, i) for i, b in enumerate(self.tb) if b is not None)
        self.keys = [b for b, _ in pairs]
        self.sorted_ids = torch.tensor([i for _, i in pairs], dtype=torch.long)
        self.by_bytes: dict[bytes, list[int]] = {}
        for b, i in pairs:
            self.by_bytes.setdefault(b, []).append(i)
        self.valid = torch.zeros(self.V, dtype=torch.bool)
        self.valid[self.sorted_ids] = True
        self.lens = torch.tensor([len(b) if b is not None else 0 for b in self.tb], dtype=torch.long)
        self.end_ids = list(end_ids)
        # tokens that end a word when they come next: bytes start with whitespace, or end of text
        ws = torch.zeros(self.V, dtype=torch.bool)
        for i, b in enumerate(self.tb):
            if starts_with_whitespace(b):
                ws[i] = True
        for i in self.end_ids:
            if i < self.V:
                ws[i] = True
        self.ends_word = ws
        self._cache: "OrderedDict[bytes, torch.Tensor]" = OrderedDict()
        self._cache_size = cache_size

    def range_for(self, R: bytes) -> tuple[int, int]:
        """[lo, hi) in the sorted list of the tokens whose bytes start with R."""
        lo = bisect_left(self.keys, R)
        upper = R.rstrip(b"\xff")
        if not upper:
            return lo, len(self.keys)
        upper = upper[:-1] + bytes([upper[-1] + 1])
        return lo, bisect_left(self.keys, upper)

    def allowed(self, R: bytes) -> torch.Tensor:
        """LongTensor of the allowed ids for the remaining bytes R (all valid ids if R is empty)."""
        hit = self._cache.get(R)
        if hit is not None:
            self._cache.move_to_end(R)
            return hit
        lo, hi = self.range_for(R)
        ids = self.sorted_ids[lo:hi]
        extra: list[int] = []
        for n in range(1, len(R)):
            extra.extend(self.by_bytes.get(R[:n], ()))
        if extra:
            ids = torch.cat([ids, torch.tensor(extra, dtype=torch.long)])
        self._cache[R] = ids
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return ids

    def starts_with(self, R: bytes) -> torch.Tensor:
        lo, hi = self.range_for(R)
        return self.sorted_ids[lo:hi]


def word_start_flags(tb: Sequence[Optional[bytes]], target_ids: Sequence[int]) -> list[int]:
    """For each row 0..n of an example's log-prob matrix: 1 if the next token starts a word (the first token, a token
    that begins with whitespace, or one right after a token ending in whitespace), and 1 for the row after the end."""
    flags = []
    prev_ws = True
    for t in target_ids:
        b = tb[t]
        flags.append(1 if (prev_ws or starts_with_whitespace(b)) else 0)
        prev_ws = bool(b) and starts_with_whitespace(b[-1:])
    flags.append(1)
    return flags
