"""The small model's configuration (no torch: the suggestion worker reads it too)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Optional


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


# ---- configuration of a release -----------------------------------------------------------------------------------------
def config_from_dict(d: dict) -> SLMConfig:
    """An SLMConfig from a release's config.json "slm" part (fields it does not know are ignored)."""
    known = {f.name for f in fields(SLMConfig)}
    return SLMConfig(**{k: v for k, v in d.items() if k in known})


def config_to_dict(cfg: SLMConfig) -> dict:
    return asdict(cfg)
