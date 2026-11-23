"""The small model of word suggestions: next-token prediction on the small model's ids (the six specials, then Qwen3.5's ids).

Two architectures with one config (the release's is "lfm"):
- "lfm": modelled on LiquidAI LFM3: layers c,c,a,c,a,c,... (c = double-gated short convolution, a = grouped-query
  attention with QK-norm and partial rotary), SwiGLU MLPs, RMSNorm, sandwich norm, tied embeddings, a factorised
  embedding (ids -> rank -> d) shared with the output.
- "tf": a plain pre-norm transformer: every layer is attention.
Both have an incremental forward (a State: the convolutions' last values and the attention layers' keys and values) that
matches the full forward. The parameter names are the research code's, so its checkpoints load.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, fields
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from .vocab import NEVER_PREDICT

@dataclass
class SLMConfig:
    arch: str = 'lfm'            # 'lfm' | 'tf'
    vocab: int = 32000
    d: int = 192
    n_layers: int = 6
    ffn: int = 512
    heads: int = 6
    kv_heads: int = 2
    kernel: int = 3              # short-convolution length (lfm)
    window: int = 0              # sliding window of the sliding attention layers (0 = all attention layers are full)
    sandwich: Optional[bool] = None    # post-norm on each mixer / MLP output; default on for lfm, off for tf
    qk_norm: bool = True
    rotary: Optional[float] = None     # fraction of the head dim rotated; default 0.5 for lfm, 1.0 for tf
    rope_theta: float = 10000.0
    max_len: int = 2048
    norm_eps: float = 1e-5
    emb_rank: int = 0            # > 0: factorised tied embedding, ids -> rank -> d (and the output through the same two factors)

    def __post_init__(self):
        if self.sandwich is None:
            self.sandwich = self.arch == 'lfm'
        if self.rotary is None:
            self.rotary = 0.5 if self.arch == 'lfm' else 1.0
        assert self.d % self.heads == 0 and self.heads % self.kv_heads == 0

    @property
    def head_dim(self) -> int:
        return self.d // self.heads

    @property
    def rot_dim(self) -> int:
        return int(self.head_dim * self.rotary) // 2 * 2

    def layer_types(self) -> list[str]:
        """lfm: c,c,a,c,a,c,... (attention at 2,4,6,...); tf: all attention.  An attention layer is 'a' (full) or
        's' (sliding window) when window > 0: every second attention layer, starting with the first, slides."""
        if self.arch == 'tf':
            kinds = ['a'] * self.n_layers
        else:
            kinds = ['a' if (i >= 2 and i % 2 == 0) else 'c' for i in range(self.n_layers)]
        if self.window > 0:
            k = 0
            for i, c in enumerate(kinds):
                if c == 'a':
                    if k % 2 == 0:
                        kinds[i] = 's'
                    k += 1
        return kinds



class RMSNorm(nn.Module):
    def __init__(self, d: int, eps: float = 1e-5):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(d))
        self.eps = eps

    def forward(self, x):
        dt = x.dtype
        x = x.float()
        x = x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)
        return (x * self.weight.float()).to(dt)


def _rope_tables(rot: int, max_len: int, theta: float):
    inv = 1.0 / (theta ** (torch.arange(0, rot, 2).float() / rot))
    ang = torch.outer(torch.arange(max_len).float(), inv)
    return ang.cos(), ang.sin()          # [max_len, rot/2]


def _apply_rope(x, cos, sin, rot: int):
    """x [B, H, T, hd]; cos/sin [T, rot/2]; rotates the first `rot` dims (half-split layout)."""
    if rot == 0:
        return x
    xr, xp = x[..., :rot], x[..., rot:]
    x1, x2 = xr[..., :rot // 2], xr[..., rot // 2:]
    c, s = cos.to(x.dtype), sin.to(x.dtype)
    xr = torch.cat([x1 * c - x2 * s, x2 * c + x1 * s], dim=-1)
    return torch.cat([xr, xp], dim=-1) if xp.shape[-1] else xr


class Attention(nn.Module):
    def __init__(self, cfg: SLMConfig, window: int):
        super().__init__()
        self.h, self.kv, self.hd, self.window = cfg.heads, cfg.kv_heads, cfg.head_dim, window
        self.rot = cfg.rot_dim
        self.q_proj = nn.Linear(cfg.d, self.h * self.hd, bias=False)
        self.k_proj = nn.Linear(cfg.d, self.kv * self.hd, bias=False)
        self.v_proj = nn.Linear(cfg.d, self.kv * self.hd, bias=False)
        self.o_proj = nn.Linear(self.h * self.hd, cfg.d, bias=False)
        self.q_norm = RMSNorm(self.hd, cfg.norm_eps) if cfg.qk_norm else nn.Identity()
        self.k_norm = RMSNorm(self.hd, cfg.norm_eps) if cfg.qk_norm else nn.Identity()

    def forward(self, x, cos, sin, cache=None, pos: int = 0):
        """x [B,T,d]; cache = (k, v) of the keys before this chunk (each [B, kv, S, hd]) or None; pos = tokens
        before this chunk.  Returns (out, new_cache)."""
        B, T, _ = x.shape
        q = self.q_proj(x).view(B, T, self.h, self.hd).transpose(1, 2)
        k = self.k_proj(x).view(B, T, self.kv, self.hd).transpose(1, 2)
        v = self.v_proj(x).view(B, T, self.kv, self.hd).transpose(1, 2)
        q, k = self.q_norm(q), self.k_norm(k)
        c, s = cos[pos:pos + T], sin[pos:pos + T]
        q, k = _apply_rope(q, c, s, self.rot), _apply_rope(k, c, s, self.rot)
        if cache is not None and cache[0].shape[2] > 0:
            k_all, v_all = torch.cat([cache[0], k], 2), torch.cat([cache[1], v], 2)
        else:
            k_all, v_all = k, v
        S = k_all.shape[2]
        new_cache = None
        if cache is not None:
            keep = (self.window - 1) if self.window > 0 else S
            lo = max(0, S - keep)
            new_cache = (k_all[:, :, lo:], v_all[:, :, lo:])
        rep = self.h // self.kv
        if rep > 1:
            k_all, v_all = k_all.repeat_interleave(rep, 1), v_all.repeat_interleave(rep, 1)
        if T == 1 and (self.window == 0 or S <= self.window):
            o = F.scaled_dot_product_attention(q, k_all, v_all)
        elif self.window == 0 and S == T:
            o = F.scaled_dot_product_attention(q, k_all, v_all, is_causal=True)
        else:
            qpos = torch.arange(S - T, S).unsqueeze(1)           # positions relative to the start of the keys
            kpos = torch.arange(S).unsqueeze(0)
            allow = kpos <= qpos
            if self.window > 0:
                allow &= (qpos - kpos) < self.window
            o = F.scaled_dot_product_attention(q, k_all, v_all, attn_mask=allow)
        o = o.transpose(1, 2).reshape(B, T, self.h * self.hd)
        return self.o_proj(o), new_cache


class ShortConv(nn.Module):
    """LFM's double-gated short convolution: y = C * causal_depthwise_conv(B * x), (B, C, x) = in_proj(h)."""

    def __init__(self, cfg: SLMConfig):
        super().__init__()
        self.d, self.K = cfg.d, cfg.kernel
        self.in_proj = nn.Linear(cfg.d, 3 * cfg.d, bias=False)
        self.conv = nn.Parameter(torch.empty(self.K, cfg.d))
        self.out_proj = nn.Linear(cfg.d, cfg.d, bias=False)
        nn.init.normal_(self.conv, std=1.0 / math.sqrt(self.K))

    def forward(self, x, state=None):
        """x [B,T,d]; state [B, K-1, d] (the last K-1 values of B*x) or None (zeros).  Returns (out, new_state)."""
        B, T, _ = x.shape
        b, c, xx = self.in_proj(x).chunk(3, dim=-1)
        bx = b * xx
        K = self.K
        if K > 1:
            prev = state.to(bx.dtype) if state is not None else bx.new_zeros(B, K - 1, self.d)
            full = torch.cat([prev, bx], dim=1)               # [B, K-1+T, d]
            new_state = full[:, -(K - 1):]
        else:
            full, new_state = bx, None
        w = self.conv.to(bx.dtype)
        y = full[:, 0:T] * w[0]
        for k in range(1, K):
            y = y + full[:, k:k + T] * w[k]
        return self.out_proj(c * y), new_state


class MLP(nn.Module):
    def __init__(self, cfg: SLMConfig):
        super().__init__()
        self.gate = nn.Linear(cfg.d, cfg.ffn, bias=False)
        self.up = nn.Linear(cfg.d, cfg.ffn, bias=False)
        self.down = nn.Linear(cfg.ffn, cfg.d, bias=False)

    def forward(self, x):
        return self.down(F.silu(self.gate(x)) * self.up(x))


class Block(nn.Module):
    def __init__(self, cfg: SLMConfig, kind: str):
        super().__init__()
        self.kind = kind
        self.mixer = ShortConv(cfg) if kind == 'c' else Attention(cfg, cfg.window if kind == 's' else 0)
        self.mlp = MLP(cfg)
        self.n1, self.n2 = RMSNorm(cfg.d, cfg.norm_eps), RMSNorm(cfg.d, cfg.norm_eps)
        self.p1 = RMSNorm(cfg.d, cfg.norm_eps) if cfg.sandwich else nn.Identity()
        self.p2 = RMSNorm(cfg.d, cfg.norm_eps) if cfg.sandwich else nn.Identity()

    def forward(self, x, cos, sin, st=None, pos: int = 0):
        h = self.n1(x)
        if self.kind == 'c':
            m, st = self.mixer(h, st)
        else:
            m, st = self.mixer(h, cos, sin, st, pos)
        x = x + self.p1(m)
        x = x + self.p2(self.mlp(self.n2(x)))
        return x, st


class State:
    """Incremental state: tokens seen, per layer the conv state or the (k, v) cache."""

    def __init__(self, layers, pos: int = 0):
        self.layers, self.pos = layers, pos


class SLM(nn.Module):
    def __init__(self, cfg: SLMConfig):
        super().__init__()
        self.cfg = cfg
        self.embed = nn.Embedding(cfg.vocab, cfg.emb_rank or cfg.d)
        self.emb_proj = nn.Linear(cfg.emb_rank, cfg.d, bias=False) if cfg.emb_rank else None    # rank -> d (tied output: d -> rank)
        self.blocks = nn.ModuleList([Block(cfg, k) for k in cfg.layer_types()])
        self.norm = RMSNorm(cfg.d, cfg.norm_eps)
        self.lm_head = None if cfg.emb_rank else nn.Linear(cfg.d, cfg.vocab, bias=False)
        if self.lm_head is not None:
            self.lm_head.weight = self.embed.weight        # tied
        cos, sin = _rope_tables(max(cfg.rot_dim, 2), cfg.max_len, cfg.rope_theta)
        self.register_buffer('cos', cos, persistent=False)
        self.register_buffer('sin', sin, persistent=False)
        self._init()

    def _init(self):
        scale = 1.0 / math.sqrt(2 * self.cfg.n_layers)
        for n, p in self.named_parameters():
            if p.ndim >= 2 and 'conv' not in n:
                nn.init.normal_(p, std=0.02 * (scale if n.endswith(('o_proj.weight', 'down.weight', 'out_proj.weight')) else 1.0))
        if self.cfg.emb_rank:          # E (std .09) times U (std .02) gives the usual 0.02 embeddings; the same factors give logits of std ~.5
            nn.init.normal_(self.embed.weight, std=0.09)

    # ---- parameter counts ---------------------------------------------------------------------------------
    def n_params(self) -> int:
        return sum(p.numel() for p in self.parameters())            # tied weights counted once

    def n_params_body(self) -> int:
        return self.n_params() - self.embed.weight.numel() - (self.emb_proj.weight.numel() if self.emb_proj is not None else 0)

    # ---- forward ------------------------------------------------------------------------------------------
    def init_state(self, batch: int = 1) -> State:
        layers = []
        for b in self.blocks:
            if b.kind == 'c':
                layers.append(torch.zeros(batch, self.cfg.kernel - 1, self.cfg.d) if self.cfg.kernel > 1 else None)
            else:
                z = torch.zeros(batch, self.cfg.kv_heads, 0, self.cfg.head_dim)
                layers.append((z, z.clone()))
        return State(layers, 0)

    def body(self, ids, state: Optional[State] = None):
        """ids [B, T] -> final-normed hidden [B, T, d] (and the new State when a state is given)."""
        T = ids.shape[1]
        pos = state.pos if state is not None else 0
        assert pos + T <= self.cfg.max_len, 'sequence longer than max_len'
        x = self.embed(ids)
        if self.emb_proj is not None:
            x = self.emb_proj(x)
        new = []
        for i, b in enumerate(self.blocks):
            x, st = b(x, self.cos, self.sin, state.layers[i] if state is not None else None, pos)
            new.append(st)
        x = self.norm(x)
        return x, (State(new, pos + T) if state is not None else None)

    def output_subset(self, ids):
        """The output table of only these ids (cut once, then pass it as head(..., w_sub=)): a run-time restriction of a large vocabulary
        to the tokens one language uses.  [len(ids), rank] (factorised) or [len(ids), d]."""
        return (self.embed.weight if self.lm_head is None else self.lm_head.weight)[ids].detach().clone()

    def head(self, h, out_ids=None, w_sub=None):
        """Hidden [..., d] -> logits [..., V] (or [..., len(out_ids)]: only those output ids, a deployment option that skips the
        rest of a large vocabulary)."""
        if self.emb_proj is not None:
            z = h @ self.emb_proj.weight                      # [..., rank]
            w = w_sub if w_sub is not None else (self.embed.weight if out_ids is None else self.embed.weight[out_ids])
            return z @ w.t()
        if w_sub is not None:
            return h @ w_sub.t()
        if out_ids is None:
            return self.lm_head(h)
        return h @ self.lm_head.weight[out_ids].t()

    def forward(self, ids, state: Optional[State] = None, keep: Optional[int] = None, out_ids=None):
        """Logits [B, T, V] (the last `keep` positions only if given; only the columns `out_ids` if given); with a state also
        returns the new state."""
        h, st = self.body(ids, state)
        if keep is not None:
            h = h[:, -keep:]
        logits = self.head(h, out_ids)
        return (logits, st) if state is not None else logits

    @torch.no_grad()
    def step(self, tok, state: State):
        """One incremental token: tok [B] or [B,1] -> (logits [B, V], state)."""
        logits, st = self.forward(tok.view(-1, 1), state)
        return logits[:, 0], st

    def _masked_logits(self, h, mask):
        logits = self.head(h[mask]).float()
        logits[:, list(NEVER_PREDICT)] = float('-inf')
        return logits

    def loss(self, ids, targets, weights, chunk: int = 0):
        """Weighted CE over positions with weight > 0 (the lm head runs only there).  Returns (sum w*ce, sum w,
        n positions).  <bos> <agent> <user> <doc> are masked out of the softmax.  chunk > 0: the lm head and the
        cross-entropy run `chunk` positions at a time, each recomputed in the backward pass (the logits of a large
        batch never exist all at once)."""
        h, _ = self.body(ids)
        m = weights > 0
        w = weights[m].float()
        if not chunk and self.cfg.vocab > 65536:
            chunk = 384                       # a large vocabulary: never all the logits at once
        if chunk and int(m.sum()) > chunk:
            from torch.utils.checkpoint import checkpoint
            hm, tm = h[m], targets[m]

            def part(hc, tc, wc):
                logits = self.head(hc).float()
                logits[:, list(NEVER_PREDICT)] = float('-inf')
                return (F.cross_entropy(logits, tc, reduction='none') * wc).sum()
            tot = hm.new_zeros((), dtype=torch.float32)
            for i in range(0, hm.shape[0], chunk):
                tot = tot + checkpoint(part, hm[i:i + chunk], tm[i:i + chunk], w[i:i + chunk], use_reentrant=False)
            return tot, w.sum(), int(m.sum())
        ce = F.cross_entropy(self._masked_logits(h, m), targets[m], reduction='none')
        return (ce * w).sum(), w.sum(), int(m.sum())

    @torch.no_grad()
    def token_nll(self, ids, targets, mask, chunk: int = 0):
        """NLL (nats) at the masked positions (row-major order) and their gold ids.  chunk > 0: the head runs `chunk` positions at a
        time (a large vocabulary never has all its logits at once); default: one chunk for a vocabulary up to 64k, else 512."""
        h, _ = self.body(ids)
        hm, tm = h[mask], targets[mask]
        chunk = chunk or (hm.shape[0] if self.cfg.vocab <= 65536 else 512)
        out = []
        for i in range(0, hm.shape[0], max(chunk, 1)):
            lg = self.head(hm[i:i + chunk]).float()
            lg[:, list(NEVER_PREDICT)] = float('-inf')
            out.append(F.cross_entropy(lg, tm[i:i + chunk], reduction='none'))
        return (torch.cat(out) if out else hm.new_zeros(0, dtype=torch.float32)), tm


# ---- configuration, weights, inference -----------------------------------------------------------------------------
def config_from_dict(d: dict) -> SLMConfig:
    """An SLMConfig from a release's config.json "slm" part (fields it does not know are ignored)."""
    known = {f.name for f in fields(SLMConfig)}
    return SLMConfig(**{k: v for k, v in d.items() if k in known})


def config_to_dict(cfg: SLMConfig) -> dict:
    return asdict(cfg)


def build_model(cfg: SLMConfig, state_dict: Optional[dict] = None, freeze: bool = True) -> SLM:
    """A model in eval mode with these weights (float32 tensors by the research names). freeze: no gradients are kept (inference)."""
    model = SLM(cfg)
    if state_dict is not None:
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        missing = [k for k in missing if k not in ('lm_head.weight',)]      # tied to embed.weight when there is no factorised embedding
        if missing or unexpected:
            raise ValueError(f'the weights do not fit the config: missing {missing[:3]}, unexpected {unexpected[:3]}')
    model.eval()
    if freeze:
        for p in model.parameters():
            p.requires_grad_(False)
    return model


@torch.no_grad()
def last_logits(model: SLM, ids, state: Optional[State] = None):
    """Feed ids (a list of ints) after `state` (a fresh one if None). Returns (logits float32 [V] of the last position with the
    specials that are never predicted at -inf, the new State). Never records autograd: the weights may require grad (training
    code shares the class) and a row kept by the caller would otherwise hold the whole forward's activations."""
    if state is None:
        state = model.init_state(1)
    t = torch.tensor([list(ids)], dtype=torch.long)
    logits, st = model.forward(t, state, keep=1)
    row = logits[0, -1].float()
    row[list(NEVER_PREDICT)] = float('-inf')
    return row, st


def state_for_save(model: SLM) -> dict:
    """The weights to write to safetensors: float32 CPU tensors by the research names (a tied output table is the embedding itself)."""
    out = {}
    for k, v in model.state_dict().items():
        if k == 'lm_head.weight' and model.lm_head is not None and model.lm_head.weight is model.embed.weight:
            continue
        out[k] = v.detach().cpu().float().contiguous()
    return out
