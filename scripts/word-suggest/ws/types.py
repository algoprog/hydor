"""Shared types for the word-suggestion experiments (see SPEC.md). Every module imports these; do not redefine them."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol

import torch


# Languages written without spaces between words: every character is a unit for the metrics (SPEC: zh/ja, and the like).
# A language code is 'zh', 'ja', 'th', ... or a FLORES / FineWeb-2 code with its script ('tha_Thai', 'cmn_Hani', 'yue_Hant').
NOSPACE_CODES = frozenset({"zh", "ja", "th", "lo", "km", "my", "bo", "dz", "zho", "cmn", "yue", "wuu", "jpn", "tha", "lao",
                          "khm", "mya", "bod", "dzo", "shn"})
NOSPACE_SCRIPTS = frozenset({"Hans", "Hant", "Hani", "Jpan", "Thai", "Laoo", "Khmr", "Mymr", "Tibt"})


CHAT_SURFACES = frozenset({"chat", "messages"})     # surfaces whose context is an agent reply (the chat prefixes)


def is_nospace(lang: str, extra: tuple = ()) -> bool:
    """True if the language has no spaces between words (so its words are single characters in the metrics)."""
    if lang in extra:
        return True
    parts = lang.replace("-", "_").split("_")
    return parts[0].lower() in NOSPACE_CODES or any(p in NOSPACE_SCRIPTS for p in parts[1:])


@dataclass
class Example:
    """One text to be typed and the context the app would give the models there (SPEC.md, Examples and context)."""
    id: str
    surface: str                      # 'chat' | 'doc' | 'plain' | 'flores' | 'messages' (read as chat) | 'email'
    lang: str                         # 'en', 'el', 'zh', ... or 'other'
    agent_ctx: str                    # last A words of the agent's reply ('' if none or not used)
    user_ctx: str                     # earlier typed words, within the typed budget ('' if none or not used)
    doc_ctx: str                      # last D words before the target in a document ('' if none)
    target: str                       # the text the user types (one segment of at most 100 words)
    target_ids: list[int]             # the LLM tokenizer's ids for target alone (add_special_tokens=False)
    offsets: list[tuple[int, int]]    # character offsets of target_ids within target
    ts: int = 0                       # ms since epoch
    split: str = ''                   # 'train' | 'dev' | 'test'
    meta: dict = field(default_factory=dict)


class Scorer(Protocol):
    """A model that scores an Example's target positions.

    logprobs(ex, llm_lp) returns float32 [len(ex.target_ids) + 1, V_llm]: row i is log P(next token) right before
    target token i, and the last row is the position after the target. LLM scorers ignore llm_lp. SLM and n-gram
    scorers return their distribution mapped to the LLM's ids: with llm_lp=None tokens outside their vocabulary get
    -inf ('alone'); with the LLM's rows given, their <unk> mass is spread over those tokens in proportion to the
    LLM's probabilities ('with_llm').

    Constructors (so scripts can build any of them):
      LLMScorer(name: str, dtype: str = 'bfloat16', threads: int = 4, fmt: str = 'plain')   # ws/scorers.py
      SLMScorer(ckpt: str, threads: int = 4)                                                 # ws/slm.py
      NgramScorer(path: str)                                                                 # ws/ngram.py
    """
    name: str

    def logprobs(self, ex: Example, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor: ...
