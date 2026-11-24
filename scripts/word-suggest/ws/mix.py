"""Mixing an LLM and an SLM (or n-gram) distribution over the LLM's vocabulary. Inputs are log-prob tensors [n+1, V]."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Optional

import torch

from .langs import ISO_TO_FLORES

FEATURES = ["llm_entropy", "llm_maxp", "slm_entropy", "slm_maxp", "slm_unk", "log1p_pos", "word_start"]


def linear(llm_lp: torch.Tensor, slm_lp: torch.Tensor, lam) -> torch.Tensor:
    """log(lam*P_llm + (1-lam)*P_slm). lam: a number or a tensor broadcastable to [n+1, 1]."""
    if isinstance(lam, (int, float)):
        if lam >= 1:
            return llm_lp
        if lam <= 0:
            return slm_lp
        return torch.logaddexp(llm_lp + math.log(lam), slm_lp + math.log1p(-lam))
    lam = lam.reshape(-1, 1).clamp(1e-6, 1 - 1e-6)
    return torch.logaddexp(llm_lp + lam.log(), slm_lp + torch.log1p(-lam))


def loglinear(llm_lp: torch.Tensor, slm_lp: torch.Tensor, alpha: float) -> torch.Tensor:
    """softmax(alpha*log P_llm + (1-alpha)*log P_slm), per row. A token the SLM rules out (-inf) stays ruled out."""
    if alpha >= 1:
        return llm_lp
    if alpha <= 0:
        return torch.log_softmax(slm_lp, -1)
    return torch.log_softmax(alpha * llm_lp + (1 - alpha) * slm_lp, -1)


def entropy_maxp(lp: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """Per-row entropy (nats) and max probability of a [n+1, V] log-prob matrix."""
    p = lp.exp()
    ent = -(p * torch.where(torch.isfinite(lp), lp, torch.zeros_like(lp))).sum(-1)
    return ent, p.max(-1).values


def gate_features(llm_lp: torch.Tensor, slm_lp: torch.Tensor, unk: Optional[torch.Tensor],
                  word_start: list[int] | torch.Tensor) -> torch.Tensor:
    """[n+1, 7]: entropy and max prob of each, P_slm(<unk>), log(1 + position in target), word-start flag."""
    n1 = llm_lp.shape[0]
    le, lm = entropy_maxp(llm_lp)
    se, sm = entropy_maxp(slm_lp)
    dev = llm_lp.device
    u = unk.float().reshape(-1).to(dev) if unk is not None else torch.zeros(n1, device=dev)
    pos = torch.log1p(torch.arange(n1, dtype=torch.float32, device=dev))
    ws = torch.as_tensor(word_start, dtype=torch.float32, device=dev)
    return torch.stack([le, lm, se, sm, u, pos, ws], dim=-1)


@dataclass
class Gate:
    """lambda per position = sigmoid(w . standardize(f) + b + lang_bias[lang]); P = lambda P_llm + (1 - lambda) P_slm.

    lang_bias (optional, `fit_gate.py --per-lang`): one bias per language code, added to the logit; a language that is not
    in it (never seen when fitting) gets 0, i.e. the shared gate. switch (optional, `fit_gate.py --lang-switch`): per
    language 'llm' (the LLM alone) or 'mix' (this gate without biases), used by the variant `llm+slm:langswitch:<json>`;
    a language not in it gets switch_default. A JSON without either is the old gate and loads and behaves as before."""
    w: list[float]
    b: float
    mu: list[float] = field(default_factory=lambda: [0.0] * len(FEATURES))
    sd: list[float] = field(default_factory=lambda: [1.0] * len(FEATURES))
    features: list[str] = field(default_factory=lambda: list(FEATURES))
    meta: dict = field(default_factory=dict)
    lang_bias: dict = field(default_factory=dict)
    switch: dict = field(default_factory=dict)
    switch_default: str = "mix"

    def lam(self, feats: torch.Tensor, lang: Optional[str] = None) -> torch.Tensor:
        """lambda per row; lang: the language code of the example (None: the shared gate, no bias)."""
        dev = feats.device
        z = (feats - torch.tensor(self.mu, device=dev)) / torch.tensor(self.sd, device=dev)
        bias = self.lang_bias.get(lang, 0.0) if (lang is not None and self.lang_bias) else 0.0
        return torch.sigmoid(z @ torch.tensor(self.w, device=dev) + self.b + bias)

    def choice(self, lang: Optional[str]) -> str:
        """'llm' or 'mix' for the language switch."""
        if lang in self.switch or lang is None:
            return self.switch.get(lang, self.switch_default)
        return self.switch.get(ISO_TO_FLORES.get(lang), self.switch_default)         # 'en' as eng_Latn

    def save(self, path: str) -> None:
        d = dict(features=self.features, w=self.w, b=self.b, mu=self.mu, sd=self.sd, meta=self.meta)
        if self.lang_bias:
            d["lang_bias"] = self.lang_bias
        if self.switch:
            d["switch"], d["switch_default"] = self.switch, self.switch_default
        with open(path, "w") as f:
            json.dump(d, f, indent=1)

    @staticmethod
    def load(path: str) -> "Gate":
        with open(path) as f:
            d = json.load(f)
        return Gate(w=d["w"], b=d["b"], mu=d.get("mu", [0.0] * len(d["w"])), sd=d.get("sd", [1.0] * len(d["w"])),
                    features=d.get("features", list(FEATURES)), meta=d.get("meta", {}),
                    lang_bias={k: float(v) for k, v in (d.get("lang_bias") or {}).items()},
                    switch=dict(d.get("switch") or {}), switch_default=d.get("switch_default", "mix"))


def gate(llm_lp: torch.Tensor, slm_lp: torch.Tensor, g: Gate, unk: Optional[torch.Tensor],
         word_start: list[int] | torch.Tensor, lang: Optional[str] = None) -> torch.Tensor:
    return linear(llm_lp, slm_lp, g.lam(gate_features(llm_lp, slm_lp, unk, word_start), lang))


def fit_gate(feats: torch.Tensor, lp_llm: torch.Tensor, lp_slm: torch.Tensor, l2: float = 1e-3,
             max_iter: int = 200, langs: Optional[list] = None, lang_l2: float = 10.0) -> Gate:
    """Fit w, b by LBFGS to maximise mean log(lam P_llm(gold) + (1-lam) P_slm(gold)) (minus a small L2 on w).
    feats [N, 7] raw features; lp_llm, lp_slm [N] log-probs of the gold tokens.

    langs (optional): the language code of each of the N positions. Then a bias per language is fitted jointly with w and b
    (lam = sigmoid(z.w + b + bias[lang])), with the penalty (lang_l2 / N) * sum(bias^2) added to the loss: a Gaussian prior
    pulling every bias to 0, whose strength lang_l2 is in 'positions' (a language needs evidence of about lang_l2 positions
    before its bias moves much; 0 = unregularised). A language with no bias (unseen) behaves as the shared gate."""
    feats = feats.double()
    mu, sd = feats.mean(0), feats.std(0).clamp_min(1e-6)
    z = (feats - mu) / sd
    a, c = lp_llm.double(), lp_slm.double().clamp_min(-60.0)
    w = torch.zeros(z.shape[1], dtype=torch.double, requires_grad=True)
    b = torch.zeros((), dtype=torch.double, requires_grad=True)
    codes: list = []
    lang_idx = None
    if langs is not None:
        codes = sorted(set(langs))
        pos = {l: i for i, l in enumerate(codes)}
        lang_idx = torch.tensor([pos[l] for l in langs], dtype=torch.long)
    bias = torch.zeros(len(codes), dtype=torch.double, requires_grad=True)
    params = [w, b] + ([bias] if codes else [])
    opt = torch.optim.LBFGS(params, lr=1.0, max_iter=max_iter, line_search_fn="strong_wolfe")
    N = len(z)

    def closure():
        opt.zero_grad()
        logit = z @ w + b
        if lang_idx is not None:
            logit = logit + bias[lang_idx]
        lam = torch.sigmoid(logit)
        ll = torch.logaddexp(a + torch.log(lam.clamp_min(1e-9)), c + torch.log1p(-lam.clamp_max(1 - 1e-9))).mean()
        loss = -ll + l2 * (w ** 2).sum()
        if codes:
            loss = loss + (lang_l2 / N) * (bias ** 2).sum()
        loss.backward()
        return loss

    opt.step(closure)
    return Gate(w=w.detach().tolist(), b=float(b.detach()), mu=mu.tolist(), sd=sd.tolist(),
                lang_bias={l: float(x) for l, x in zip(codes, bias.detach())})


def gate_loglik(g: Gate, feats: torch.Tensor, lp_llm: torch.Tensor, lp_slm: torch.Tensor) -> float:
    lam = g.lam(feats.float()).double()
    a, c = lp_llm.double(), lp_slm.double().clamp_min(-60.0)
    return float(torch.logaddexp(a + lam.log(), c + torch.log1p(-lam)).mean())
