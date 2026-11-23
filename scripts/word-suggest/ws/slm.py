"""Small language models for next-token prediction on the SLM vocabulary, and their Scorer.

Two architectures with one config:
- "lfm": modelled on LiquidAI LFM3: layers c,c,a,c,a,c,... (c = double-gated short convolution, a = grouped-query
  attention with QK-norm and partial rotary), SwiGLU MLPs, RMSNorm, sandwich norm, tied embeddings.
- "tf": a plain pre-norm transformer: every layer is attention (QK-norm on, full rotary, no sandwich norm).
Both have an incremental ``step()`` (conv state + KV cache) that matches the full forward.
"""
from __future__ import annotations

import math
import os
from dataclasses import asdict, dataclass
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from .vocab import NEVER_PREDICT, Vocab

SIZES = {   # name: (d, n_layers, ffn, heads, kv_heads)
    '5m': (192, 6, 512, 6, 2),
    '15m': (256, 8, 768, 8, 2),
    '30m': (384, 10, 1024, 6, 2),
    '60m': (512, 12, 1408, 8, 2),
    '100m': (640, 12, 1792, 10, 2),
}


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

    @classmethod
    def for_size(cls, size: str, arch: str, vocab: int, **kw) -> 'SLMConfig':
        d, n, ffn, h, kv = SIZES[size]
        return cls(arch=arch, vocab=vocab, d=d, n_layers=n, ffn=ffn, heads=h, kv_heads=kv, **kw)


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


def _ce_chunk(hc, tc, wc, proj_w, emb_w, mask):
    """Weighted CE of one chunk of positions through the factorised head: [n, d] -> [n, rank] -> [n, V] (never kept: the caller
    recomputes it in the backward pass); `mask` [V] marks the ids never predicted.  A pure function of tensors, so it can be compiled."""
    logits = (hc @ proj_w @ emb_w.t()).float().masked_fill(mask, float('-inf'))
    return (F.cross_entropy(logits, tc, reduction='none') * wc).sum()


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

            if self.emb_proj is not None and getattr(self, 'compile_head', False):
                if getattr(self, '_ce_fn', None) is None:
                    import torch._inductor.config as _ic
                    _ic.comprehensive_padding = False         # padded strides of the [n, V] logits break the checkpoint's recompute check
                    self._ce_fn = torch.compile(_ce_chunk, dynamic=True)       # one fused softmax kernel instead of five passes
                if getattr(self, '_never', None) is None or self._never.device != h.device:
                    self._never = torch.zeros(self.cfg.vocab, dtype=torch.bool, device=h.device)
                    self._never[list(NEVER_PREDICT)] = True
                fn, ew, pw, nv = self._ce_fn, self.embed.weight, self.emb_proj.weight, self._never
                part = lambda hc, tc, wc: fn(hc, tc, wc, pw, ew, nv)
            else:
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


# ---- checkpoints -----------------------------------------------------------------------------------------
def save_ckpt(path: str, model: SLM, vocab_path: str, extra: Optional[dict] = None) -> None:
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    vp = os.path.abspath(vocab_path)
    sd = {k: v.detach().cpu() for k, v in model.state_dict().items()}      # always a plain CPU state dict
    torch.save({'config': asdict(model.cfg), 'state_dict': sd, 'vocab': os.path.relpath(vp, d),
                'vocab_abs': vp, 'extra': extra or {}}, path + '.tmp')
    os.replace(path + '.tmp', path)


def resolve_vocab_path(ckpt_path: str, ck: dict) -> str:
    p = os.path.join(os.path.dirname(os.path.abspath(ckpt_path)), ck.get('vocab', ''))
    return p if os.path.isfile(p) else ck['vocab_abs']


def load_ckpt(path: str):
    """-> (model, vocab, ckpt dict)."""
    ck = torch.load(path, map_location='cpu', weights_only=False)
    model = SLM(SLMConfig(**ck['config']))
    model.load_state_dict(ck['state_dict'])
    return model, Vocab.load(resolve_vocab_path(path, ck)), ck


# ---- the Scorer ----------------------------------------------------------------------------------------------
class SLMScorer:
    """Scorer contract of ws/types.py: logprobs(ex, llm_lp=None) -> float32 [len(target_ids)+1, V_llm]."""

    def __init__(self, ckpt: str, threads: int = 4):
        torch.set_num_threads(min(int(threads), 8))
        self.model, self.vocab, self.ckpt = load_ckpt(ckpt)
        self.model.eval()
        self.name = f"slm:{os.path.basename(os.path.dirname(os.path.abspath(ckpt)))}"

    @torch.no_grad()
    def slm_logprobs(self, ex) -> torch.Tensor:
        """[len(target_ids)+1, V_sub] log-probs (specials other than <unk>/<eos> masked)."""
        prefix = self.vocab.slm_prefix_ids(ex)
        tgt = self.vocab.target_slm_ids(ex)
        ids = torch.tensor([prefix + tgt], dtype=torch.long)
        logits = self.model(ids, keep=len(tgt) + 1)[0].float()
        logits[:, list(NEVER_PREDICT)] = float('-inf')
        return torch.log_softmax(logits, dim=-1)

    def logprobs(self, ex, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor:
        return self.vocab.spread(self.slm_logprobs(ex), llm_lp)
