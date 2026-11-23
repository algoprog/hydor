"""Mixing the language model's and the small model's distributions: the gate's features, the gate, the language switch.

Distributions are probability vectors (float32 numpy) over Qwen ids. The gate's lambda is the weight of the LANGUAGE MODEL:
P = lambda * P_llm + (1 - lambda) * P_slm (the research's convention: the weight of the entropy of the language model is
negative, so a language model that is unsure gives the small model more).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

LOGIT_LIMIT = 30.0
FEATURES = ['llm_entropy', 'llm_maxp', 'slm_entropy', 'slm_maxp', 'slm_unk', 'log1p_pos', 'word_start']


def entropy_maxp(p: np.ndarray) -> tuple:
    """Entropy (nats) and the largest probability of a probability vector."""
    nz = p[p > 0].astype(np.float64)
    return float(-(nz * np.log(nz)).sum()), float(p.max())


def gate_features(p_llm: np.ndarray, p_slm: np.ndarray, unk: float, position: int, word_start: int = 1) -> np.ndarray:
    """The seven features of one decoding step: entropy and largest probability of each model, the small model's P(<unk>),
    log(1 + the number of target tokens before this step), the word-start flag (the research's real decoding always passes 1)."""
    le, lm = entropy_maxp(p_llm)
    se, sm = entropy_maxp(p_slm)
    return np.array([le, lm, se, sm, unk, math.log1p(position), float(word_start)], dtype=np.float64)


@dataclass
class Gate:
    """lambda = sigmoid(w . standardize(f) + b); P = lambda P_llm + (1 - lambda) P_slm."""
    w: list
    b: float
    mu: list = field(default_factory=lambda: [0.0] * len(FEATURES))
    sd: list = field(default_factory=lambda: [1.0] * len(FEATURES))
    features: list = field(default_factory=lambda: list(FEATURES))
    meta: dict = field(default_factory=dict)

    def lam(self, feats) -> float:
        f = np.asarray(feats, dtype=np.float64)
        z = (f - np.asarray(self.mu)) / np.asarray(self.sd)
        logit = float(z @ np.asarray(self.w) + self.b)
        logit = 0.0 if logit != logit else min(max(logit, -LOGIT_LIMIT), LOGIT_LIMIT)            # a feature with a tiny sd (slm_unk) can give a huge z
        return 1.0 / (1.0 + math.exp(-logit))

    @staticmethod
    def from_dict(d: dict) -> 'Gate':
        feats = d.get('features', list(FEATURES))
        if list(feats) != FEATURES:
            raise ValueError('the gate reads other features than this engine computes')
        n = len(d['w'])
        return Gate(w=list(d['w']), b=float(d['b']), mu=list(d.get('mu', [0.0] * n)), sd=list(d.get('sd', [1.0] * n)),
                    features=list(feats), meta=dict(d.get('meta') or {}))

    @staticmethod
    def load(path: str) -> 'Gate':
        with open(path, encoding='utf-8') as f:
            return Gate.from_dict(json.load(f))


def linear(p_llm: np.ndarray, p_slm: np.ndarray, lam: float) -> np.ndarray:
    """lam * P_llm + (1 - lam) * P_slm (lam kept within 1e-6 .. 1 - 1e-6, as the research's)."""
    lam = min(max(lam, 1e-6), 1 - 1e-6)
    return (lam * p_llm + (1.0 - lam) * p_slm).astype(np.float32)


@dataclass
class Switch:
    """Per language: 'llm' (the language model alone) or 'mix'; a language not listed gets `default`."""
    choices: dict = field(default_factory=dict)
    default: str = 'mix'

    def choice(self, lang: Optional[str]) -> str:
        return self.choices.get(lang, self.default) if lang else self.default

    @staticmethod
    def from_dict(d: dict) -> 'Switch':
        """The research's format ({"switch": {lang: choice}, "switch_default": choice}, as its gates carry it) or {"languages"
        or "switch": {...}, "default": choice}."""
        ch = d.get('switch') or d.get('languages') or {}
        default = d.get('switch_default') or d.get('default') or 'mix'
        return Switch({str(k): str(v) for k, v in ch.items()}, str(default))

    @staticmethod
    def load(path: str) -> 'Switch':
        with open(path, encoding='utf-8') as f:
            return Switch.from_dict(json.load(f))
