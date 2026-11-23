"""LoRA for the small model: low-rank adapters on its linear projections, for personalising a pretrained base.

``apply_lora(model, rank)`` freezes every parameter and wraps the chosen linear layers in ``LoRALinear`` (y = x W^T + s (x A^T) B^T, with
A [r, in] random and B [out, r] zero, so the model is unchanged when training starts, s = alpha / r).  The groups of projections:

  attn   q_proj, k_proj, v_proj, o_proj of the attention layers
  mlp    gate, up, down of every layer's SwiGLU
  conv   in_proj and out_proj of the short-convolution layers (the depthwise kernel itself, 3 x d numbers, stays frozen)

What else is trained in full is chosen apart: ``train_proj`` (``emb_proj``: the d <-> rank factor of the tied factorised embedding, the
last step of the output layer and the first of the input), ``train_embed`` (``embed``: the vocabulary x rank table, the input embedding
and the output layer's big factor, 31.8 M of the release's 48.8 M parameters).  Norms and convolution kernels stay as pretrained.

``export_state_dict(model)`` is the state dict of the model with the adapters merged into the weights (W + s B A) under the plain model's
own keys, so a checkpoint saved from it loads in ``SLM`` and every evaluation script reads it with no change.  ``merge_lora`` does the same
in place.
"""
from __future__ import annotations

import math
from typing import Iterable

import torch
import torch.nn as nn
import torch.nn.functional as F

GROUPS = {
    'attn': ('q_proj', 'k_proj', 'v_proj', 'o_proj'),
    'mlp': ('gate', 'up', 'down'),
    'conv': ('in_proj', 'out_proj'),
}


class LoRALinear(nn.Module):
    """A frozen linear layer plus a low-rank update."""

    def __init__(self, base: nn.Linear, rank: int, alpha: float, dropout: float = 0.0):
        super().__init__()
        self.base = base
        self.rank, self.alpha = rank, alpha
        self.scale = alpha / rank
        self.lora_A = nn.Parameter(torch.empty(rank, base.in_features))
        self.lora_B = nn.Parameter(torch.zeros(base.out_features, rank))
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))        # the usual (PEFT's) initialisation; B = 0
        self.drop = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

    def forward(self, x):
        y = self.base(x)
        # A and B are float32 masters; under autocast the two products run in bf16 like the base layer
        return y + F.linear(F.linear(self.drop(x), self.lora_A), self.lora_B) * self.scale

    def delta(self) -> torch.Tensor:
        return (self.lora_B.float() @ self.lora_A.float()) * self.scale

    def merged_weight(self) -> torch.Tensor:
        return self.base.weight.detach().float() + self.delta().detach()


def _targets(groups: Iterable[str]) -> set:
    names = set()
    for g in groups:
        if g not in GROUPS:
            raise ValueError(f'unknown LoRA target group {g!r} (one of {sorted(GROUPS)})')
        names |= set(GROUPS[g])
    return names


def apply_lora(model, rank: int, alpha: float = None, groups=('attn', 'mlp', 'conv'), train_proj=False, train_embed=False,
               dropout: float = 0.0) -> dict:
    """Freeze `model` and wrap its projections in adapters (in place).  Returns counts of the parameters trained."""
    alpha = float(alpha if alpha is not None else 2 * rank)
    want = _targets(groups)
    for p in model.parameters():
        p.requires_grad_(False)
    n_wrapped = 0
    for block in model.blocks:
        for sub in (block.mixer, block.mlp):
            for name, child in list(sub.named_children()):
                if isinstance(child, nn.Linear) and name in want:
                    setattr(sub, name, LoRALinear(child, rank, alpha, dropout))
                    n_wrapped += 1
    if train_proj and model.emb_proj is not None:
        model.emb_proj.weight.requires_grad_(True)
    if train_embed:
        model.embed.weight.requires_grad_(True)
    model._lora = {'rank': rank, 'alpha': alpha, 'groups': list(groups), 'train_proj': bool(train_proj),
                   'train_embed': bool(train_embed)}
    n_lora = sum(p.numel() for n, p in model.named_parameters() if 'lora_' in n)
    n_train = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return {'lora_layers': n_wrapped, 'lora_params': n_lora, 'trainable_params': n_train,
            'total_params': model.n_params(), **model._lora}


def has_lora(model) -> bool:
    return any(isinstance(m, LoRALinear) for m in model.modules())


def export_state_dict(model) -> dict:
    """The model's CPU state dict with every adapter merged into its weight and the plain model's keys (no `base.` / `lora_*`)."""
    merged = {}
    for name, m in model.named_modules():
        if isinstance(m, LoRALinear):
            merged[name] = m.merged_weight().to(m.base.weight.dtype)
    sd = {}
    for k, v in model.state_dict().items():
        if '.lora_A' in k or '.lora_B' in k or k.endswith(('lora_A', 'lora_B')):
            continue
        if '.base.' in k:
            mod = k.rsplit('.base.', 1)[0]
            sd[k.replace('.base.', '.')] = merged[mod].cpu() if mod in merged and k.endswith('.base.weight') else v.detach().cpu()
        else:
            sd[k] = v.detach().cpu()
    return sd


@torch.no_grad()
def merge_lora(model) -> None:
    """Fold the adapters into the weights and put the plain linear layers back (in place): the model is an ordinary SLM again."""
    for block in model.blocks:
        for sub in (block.mixer, block.mlp):
            for name, child in list(sub.named_children()):
                if isinstance(child, LoRALinear):
                    child.base.weight.copy_(child.merged_weight().to(child.base.weight.dtype))
                    setattr(sub, name, child.base)
    for p in model.parameters():
        p.requires_grad_(True)
    if hasattr(model, '_lora'):
        del model._lora
