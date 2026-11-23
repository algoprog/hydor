"""The small model's ids, the contexts it and the language model read, and the text cut-up of a request.

The small model's ids are six specials, then every Qwen3.5 id shifted by six (a "full" vocabulary: nothing is out of
vocabulary). Both models read the same Qwen3.5 token ids; only the small model's input is shifted and framed by the
specials.
"""
from __future__ import annotations

import unicodedata
from typing import Sequence

import numpy as np

SPECIALS = ['<unk>', '<bos>', '<eos>', '<agent>', '<user>', '<doc>']
UNK, BOS, EOS, AGENT, USER, DOC = range(6)
NSPEC = len(SPECIALS)
# the specials the model never predicts as a next token (only <unk> and <eos> are outputs)
NEVER_PREDICT = (BOS, AGENT, USER, DOC)
# the cap on the tokens of one context part (100 words are about 130 tokens in English)
MAX_CTX_TOKENS = 256
START_FALLBACK = '\n\n'


def nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s)


def to_slm(llm_ids) -> np.ndarray:
    """Qwen ids -> the small model's ids."""
    return np.asarray(llm_ids, dtype=np.int64) + NSPEC


def to_llm(slm_ids) -> np.ndarray:
    """The small model's ids -> Qwen ids (the specials, which have none, come out negative)."""
    return np.asarray(slm_ids, dtype=np.int64) - NSPEC


def prefix_from_ids(surface: str, agent: Sequence[int] = (), user: Sequence[int] = (), doc: Sequence[int] = (),
                    max_ctx: int = MAX_CTX_TOKENS) -> list:
    """The small model's ids before the target (all given in the small model's ids).

    chat: <bos> <agent> a... <user> u... <user>; anything else: <bos> <doc> d... <doc>; empty parts are left out. The closing
    marker is always there, so with no context a chat prefix is `<bos> <user>` and a text prefix `<bos> <doc>`. Each part
    keeps its last `max_ctx` tokens."""
    ids = [BOS]
    if surface == 'chat':
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


def build_prefix(agent_ctx: str = '', user_ctx: str = '', doc_ctx: str = '') -> str:
    """The text the language model reads before the target: the non-empty context parts, each followed by a blank line (only the
    blank line when there is no context)."""
    return ''.join(p + '\n\n' for p in (agent_ctx, user_ctx, doc_ctx) if p) or START_FALLBACK


# ---- words and the cut of a typed text -------------------------------------------------------------------------------
def word_starts(text: str) -> list:
    """Start offsets of the words of a text: maximal runs of non-whitespace."""
    out, prev = [], True
    for i, ch in enumerate(text):
        ws = ch.isspace()
        if prev and not ws:
            out.append(i)
        prev = ws
    return out


def last_words(text: str, n: int) -> str:
    """The text from the n-th word from the end to the end of the last word ('' if n <= 0 or there is none)."""
    if n <= 0:
        return ''
    starts = word_starts(text)
    if not starts:
        return ''
    end = len(text.rstrip())
    return text[starts[max(0, len(starts) - n)]:end]


def split_typed(text: str) -> tuple:
    """(context, R): R is the word being typed with the whitespace before it (at a word boundary right after whitespace,
    that whitespace), context is everything before it."""
    i = len(text)
    while i > 0 and not text[i - 1].isspace():
        i -= 1
    j = i
    while j > 0 and text[j - 1].isspace():
        j -= 1
    return text[:j], text[j:]


def segments(text: str, size: int = 100) -> list:
    """Character ranges (first word's start to the last word's end) of chunks of at most `size` words."""
    starts = word_starts(text)
    ends = []
    n = len(text)
    # the end of each word: the next whitespace after its start
    for s in starts:
        e = s
        while e < n and not text[e].isspace():
            e += 1
        ends.append(e)
    return [(starts[i], ends[min(i + size, len(starts)) - 1]) for i in range(0, len(starts), size)]


def spread(lp_row, llm_eos: int = -1):
    """The small model's log-softmax row [V_slm] (float32 NumPy; the specials it never predicts are at -inf) -> (a probability
    vector over Qwen ids, float32 numpy; the probability of <unk>). Its <eos> mass goes to Qwen's end-of-text id (the decoder's
    "the word ends" check reads it)."""
    p = np.exp(lp_row)
    unk = float(p[UNK])
    out = p[NSPEC:].copy()
    if 0 <= llm_eos < len(out):
        out[llm_eos] = float(p[EOS])
    return out, unk
