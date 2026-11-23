"""The SLM's vocabulary: a projection of the LLM tokenizer's ids (SPEC.md, Tokens and Examples and context).

The SLM vocabulary is the LLM token ids seen at least ``min_count`` times in the SLM's training data, plus the
specials ``<unk> <bos> <eos> <agent> <user> <doc>`` (ids 0..5).  ``llm2slm[V_llm]`` maps any LLM id to its SLM id (or
``<unk>``), ``slm2llm[V_sub]`` maps back (specials map to -1).
"""
from __future__ import annotations

import functools
import json
import os
import re
from typing import Iterable, Optional, Sequence

import numpy as np
import torch

from .types import CHAT_SURFACES

DEFAULT_LLM = 'Qwen/Qwen3.5-0.8B-Base'
SPECIALS = ['<unk>', '<bos>', '<eos>', '<agent>', '<user>', '<doc>']
UNK, BOS, EOS, AGENT, USER, DOC = range(6)
NSPEC = len(SPECIALS)
# specials the model must never predict as a next token (only <unk> and <eos> are outputs)
NEVER_PREDICT = (BOS, AGENT, USER, DOC)
MAX_CTX_TOKENS = 256    # cap on the tokens of one context part (100 words are ~130 tokens in English)


@functools.lru_cache(maxsize=4)
def get_tokenizer(llm_name: str = DEFAULT_LLM):
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(llm_name)
    tok.model_max_length = 10 ** 9      # we never truncate through the tokenizer, and long documents are fine
    return tok


@functools.lru_cache(maxsize=4)
def llm_vocab_size(llm_name: str = DEFAULT_LLM) -> int:
    """Width of the LLM's logits (its embedding table), which can exceed the tokenizer's size."""
    try:
        from transformers import AutoConfig
        cfg = AutoConfig.from_pretrained(llm_name)
        cfg = getattr(cfg, 'text_config', None) or cfg
        return int(cfg.vocab_size)
    except Exception:
        return len(get_tokenizer(llm_name))


def encode_texts(tok, texts: Sequence[str], batch: int = 256) -> list[np.ndarray]:
    """LLM ids (int32 arrays) of each text, tokenized alone, without special tokens."""
    out: list[np.ndarray] = []
    for i in range(0, len(texts), batch):
        enc = tok(list(texts[i:i + batch]), add_special_tokens=False)['input_ids']
        out.extend(np.asarray(e, dtype=np.int32) for e in enc)
    return out


class Vocab:
    def __init__(self, llm_name: str, v_llm: int, slm2llm: np.ndarray, min_count: int = 0, llm_eos: int = -1):
        self.llm_name = llm_name
        self.v_llm = int(v_llm)
        self.min_count = int(min_count)
        self.llm_eos = int(llm_eos)
        self.slm2llm = np.asarray(slm2llm, dtype=np.int64)
        assert (self.slm2llm[:NSPEC] == -1).all()
        self.v_sub = len(self.slm2llm)
        self.llm2slm = np.full(self.v_llm, UNK, dtype=np.int64)
        self.llm2slm[self.slm2llm[NSPEC:]] = np.arange(NSPEC, self.v_sub)
        self._tok = None
        self._torch = None
        self._enc_cache: dict[str, np.ndarray] = {}

    # ---- construction -------------------------------------------------------------------------------------
    @staticmethod
    def count_ids(arrays: Iterable[np.ndarray], v_llm: int) -> np.ndarray:
        counts = np.zeros(v_llm, dtype=np.int64)
        for a in arrays:
            if len(a):
                counts += np.bincount(a, minlength=v_llm)[:v_llm]
        return counts

    @staticmethod
    def count(llm_name: str, texts: Iterable[str], v_llm: Optional[int] = None) -> np.ndarray:
        """Counts of each LLM id over texts (each tokenized alone, no special tokens)."""
        v_llm = v_llm or llm_vocab_size(llm_name)
        tok = get_tokenizer(llm_name)
        return Vocab.count_ids(encode_texts(tok, list(texts)), v_llm)

    @classmethod
    def from_counts(cls, llm_name: str, counts: np.ndarray, min_count: int) -> 'Vocab':
        tok = get_tokenizer(llm_name)
        v_llm = len(counts)
        eos = tok.eos_token_id if tok.eos_token_id is not None else -1
        keep = counts >= max(1, min_count)
        for i in tok.all_special_ids:                    # control tokens carry no bytes and are never suggested
            if 0 <= i < v_llm:
                keep[i] = False
        if 0 <= eos < v_llm:
            keep[eos] = False
        ids = np.flatnonzero(keep)
        slm2llm = np.concatenate([np.full(NSPEC, -1, dtype=np.int64), ids.astype(np.int64)])
        return cls(llm_name, v_llm, slm2llm, min_count, eos)

    @classmethod
    def full(cls, llm_name: str, v_llm: Optional[int] = None) -> 'Vocab':
        """Every LLM id is its own SLM id (offset by the specials): nothing is out of vocabulary, <unk> is never a target.  Control
        tokens and the end-of-text id are kept too (their rows are never trained on and carry no probability worth speaking of)."""
        tok = get_tokenizer(llm_name)
        v_llm = v_llm or llm_vocab_size(llm_name)
        eos = tok.eos_token_id if tok.eos_token_id is not None else -1
        return cls(llm_name, v_llm, np.concatenate([np.full(NSPEC, -1, dtype=np.int64), np.arange(v_llm, dtype=np.int64)]), 0, eos)

    @property
    def is_full(self) -> bool:
        return self.v_sub == self.v_llm + NSPEC and bool((self.llm2slm == np.arange(self.v_llm) + NSPEC).all())

    @classmethod
    def build(cls, llm_name: str, texts: Iterable[str], min_count: int) -> 'Vocab':
        return cls.from_counts(llm_name, cls.count(llm_name, texts), min_count)

    # ---- save / load --------------------------------------------------------------------------------------
    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w') as f:
            json.dump({'llm_name': self.llm_name, 'v_llm': self.v_llm, 'min_count': self.min_count,
                       'llm_eos': self.llm_eos, 'specials': SPECIALS,
                       'slm2llm': self.slm2llm[NSPEC:].tolist()}, f)

    @classmethod
    def load(cls, path: str) -> 'Vocab':
        with open(path) as f:
            d = json.load(f)
        assert d['specials'] == SPECIALS
        slm2llm = np.concatenate([np.full(NSPEC, -1, dtype=np.int64), np.asarray(d['slm2llm'], dtype=np.int64)])
        return cls(d['llm_name'], d['v_llm'], slm2llm, d.get('min_count', 0), d.get('llm_eos', -1))

    # ---- helpers ------------------------------------------------------------------------------------------
    @property
    def tok(self):
        if self._tok is None:
            self._tok = get_tokenizer(self.llm_name)
        return self._tok

    @property
    def n_outside(self) -> int:
        """LLM ids a spread <unk> mass is shared over (not in the SLM vocabulary, not the end-of-text token)."""
        return int(self._outside_mask_np().sum())

    def _outside_mask_np(self) -> np.ndarray:
        m = self.llm2slm == UNK
        if 0 <= self.llm_eos < self.v_llm:
            m[self.llm_eos] = False
        return m

    def to_slm(self, llm_ids) -> np.ndarray:
        return self.llm2slm[np.asarray(llm_ids, dtype=np.int64)]

    def encode_slm(self, text: str) -> np.ndarray:
        """SLM ids of a context text (cached: the same agent reply is context for many messages)."""
        if not text:
            return np.zeros(0, dtype=np.int64)
        hit = self._enc_cache.get(text)
        if hit is None:
            hit = self.to_slm(self.tok(text, add_special_tokens=False)['input_ids']) if text else np.zeros(0, np.int64)
            if len(self._enc_cache) > 4096:
                self._enc_cache.clear()
            self._enc_cache[text] = hit
        return hit

    # ---- the SLM's prefix (SPEC: Examples and context) ----------------------------------------------------
    @staticmethod
    def prefix_from_ids(surface: str, agent: Sequence[int] = (), user: Sequence[int] = (), doc: Sequence[int] = (),
                        max_ctx: int = MAX_CTX_TOKENS) -> list[int]:
        """chat: <bos> <agent> a... <user> u... <user>; doc/plain: <bos> <doc> d... <doc>; empty parts left out.

        The closing marker is always present, so with no context a chat prefix is ``<bos> <user>`` and a doc
        prefix ``<bos> <doc>``.  Each part keeps its last ``max_ctx`` tokens.
        """
        ids = [BOS]
        if surface in CHAT_SURFACES:
            if len(agent):
                ids += [AGENT] + [int(t) for t in agent[-max_ctx:]]
            if len(user):
                ids += [USER] + [int(t) for t in user[-max_ctx:]]
            ids.append(USER)
        else:
            ids.append(DOC)
            if len(doc):
                ids += [int(t) for t in doc[-max_ctx:]] + [DOC]
        return ids

    def slm_prefix_ids(self, ex, max_ctx: int = MAX_CTX_TOKENS) -> list[int]:
        return self.prefix_from_ids(ex.surface, self.encode_slm(ex.agent_ctx), self.encode_slm(ex.user_ctx),
                                    self.encode_slm(ex.doc_ctx), max_ctx)

    def target_slm_ids(self, ex) -> list[int]:
        return [int(t) for t in self.to_slm(ex.target_ids)]

    # ---- SLM log-probs -> LLM ids ----------------------------------------------------------------------------
    def _t(self):
        if self._torch is None:
            self._torch = {'valid': torch.from_numpy(self.slm2llm[NSPEC:].copy()),
                           'outside': torch.from_numpy(self._outside_mask_np())}
        return self._torch

    def spread(self, lp_slm_rows: torch.Tensor, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor:
        """SLM log-probs [n, V_sub] (log-softmax with <bos> <agent> <user> <doc> masked out) -> [n, V_llm].

        alone (llm_lp None): -inf for LLM ids outside the vocabulary (the <unk> mass is dropped).
        with_llm: the <unk> mass is spread over the ids outside the vocabulary in proportion to the LLM's
        probabilities (llm_lp [n, V_llm] log-probs), so each row is a full distribution.
        The SLM's <eos> mass goes to the LLM's end-of-text id (the evaluator's "word ends" check uses it).
        """
        t = self._t()
        lp = lp_slm_rows.float()
        n = lp.shape[0]
        if llm_lp is None:
            out = lp.new_full((n, self.v_llm), float('-inf'))
        else:
            ll = llm_lp.float()
            outside = t['outside']
            norm = torch.logsumexp(ll.masked_fill(~outside, float('-inf')), dim=1, keepdim=True)
            out = torch.where(outside, lp[:, UNK:UNK + 1] + ll - norm, ll.new_full((), float('-inf')))
        out[:, t['valid']] = lp[:, NSPEC:]
        if 0 <= self.llm_eos < self.v_llm:
            out[:, self.llm_eos] = lp[:, EOS]
        return out


def load_vocab(spec: str, llm_name: str = DEFAULT_LLM) -> 'Vocab':
    """A vocabulary file, or 'full' for every LLM id (Vocab.full)."""
    return Vocab.full(llm_name) if spec == 'full' else Vocab.load(spec)


def mask_specials(logits: torch.Tensor) -> torch.Tensor:
    """-inf on the specials that are never predicted (in place on a copy is the caller's choice)."""
    logits[..., list(NEVER_PREDICT)] = float('-inf')
    return logits
