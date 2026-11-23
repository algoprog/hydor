"""LLMScorer: a causal LM on the CPU scoring an Example's target positions (ws/types.py Scorer protocol)."""
from __future__ import annotations

import os
import time
from typing import Optional

import torch

from .types import Example

START_FALLBACK = "\n\n"


def build_prefix(ex: Example, fmt: str = "plain") -> str:
    """The text the LLM reads before the target (SPEC.md, Examples and context).

    plain: the non-empty context parts joined by a blank line, then a blank line (nothing but the blank line when there
           is no context).
    roles: 'Assistant: <agent>\\n\\nUser: <user ctx>\\n\\nUser: ' (a part left out when empty); a document context is
           'Document: <doc>\\n\\n' first."""
    if fmt == "plain":
        parts = [p for p in (ex.agent_ctx, ex.user_ctx, ex.doc_ctx) if p]
        return "".join(p + "\n\n" for p in parts) or START_FALLBACK
    if fmt == "roles":
        s = ""
        if ex.doc_ctx:
            s += f"Document: {ex.doc_ctx}\n\n"
        if ex.agent_ctx:
            s += f"Assistant: {ex.agent_ctx}\n\n"
        if ex.user_ctx:
            s += f"User: {ex.user_ctx}\n\n"
        if ex.surface == "chat":
            s += "User: "
        return s or START_FALLBACK
    raise ValueError(f"unknown fmt {fmt!r}")


def llm_vocab_size(name: str) -> int:
    """Rows of the model's output (can exceed the tokenizer's size: padded embedding rows)."""
    from transformers import AutoConfig
    cfg = AutoConfig.from_pretrained(name)
    cfg = getattr(cfg, "text_config", None) or cfg
    return int(cfg.vocab_size)


class LLMScorer:
    """logprobs(ex) -> float32 [n+1, V]: row i = log P(next token) before target token i, last row after the target.

    One forward over prefix ids + target ids (ids concatenated, never re-tokenized) with logits_to_keep = n+1, then a
    float32 log_softmax. Ids the tokenizer does not have (the model's padded rows) get -inf."""

    def __init__(self, name: str, dtype: str = "bfloat16", threads: int = 4, fmt: str = "plain", device: str = "cpu"):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        torch.set_num_threads(threads)
        self.name, self.fmt, self.threads = name, fmt, threads
        self.device = torch.device(device)
        self.dtype = {"bfloat16": torch.bfloat16, "bf16": torch.bfloat16, "float32": torch.float32,
                      "fp32": torch.float32, "float16": torch.float16}[dtype]
        self.tok = AutoTokenizer.from_pretrained(name)
        # AutoModelForCausalLM gives the text model for vision-language checkpoints such as Qwen3.5 (the vision tower
        # is not loaded)
        self.model = AutoModelForCausalLM.from_pretrained(name, dtype=self.dtype).eval().to(self.device)
        for p in self.model.parameters():
            p.requires_grad_(False)
        self.vocab_size = int(self.model.get_output_embeddings().weight.shape[0])
        self._pad_mask: Optional[torch.Tensor] = None
        if self.vocab_size > len(self.tok):
            m = torch.zeros(self.vocab_size, dtype=torch.bool)
            m[len(self.tok):] = True
            self._pad_mask = m.to(self.device)
        self.n_forward_tokens = 0
        self.n_target_tokens = 0
        self.n_examples = 0
        self.seconds = 0.0
        self._prefix_cache: dict[str, list[int]] = {}

    def prefix_ids(self, ex: Example) -> list[int]:
        s = build_prefix(ex, self.fmt)
        ids = self._prefix_cache.get(s)
        if ids is None:
            ids = self.tok(s, add_special_tokens=False)["input_ids"]
            if not ids:
                ids = [self.tok.eos_token_id]
            if len(self._prefix_cache) > 256:
                self._prefix_cache.clear()
            self._prefix_cache[s] = ids
        return ids

    @torch.inference_mode()
    def logprobs(self, ex: Example, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor:
        t0 = time.perf_counter()
        pre = self.prefix_ids(ex)
        ids = torch.tensor([pre + list(ex.target_ids)], dtype=torch.long, device=self.device)
        n = len(ex.target_ids)
        out = self.model(input_ids=ids, logits_to_keep=n + 1, use_cache=False)
        logits = out.logits[0, -(n + 1):].float()
        if self._pad_mask is not None:
            logits[:, self._pad_mask] = float("-inf")
        lp = torch.log_softmax(logits, dim=-1)
        if self.device.type == "cuda":
            torch.cuda.synchronize(self.device)
        self.seconds += time.perf_counter() - t0
        self.n_forward_tokens += ids.shape[1]
        self.n_target_tokens += n
        self.n_examples += 1
        return lp

    def speed(self) -> dict:
        s = max(self.seconds, 1e-9)
        return {"llm_seconds": self.seconds, "llm_examples": self.n_examples,
                "llm_s_per_example": s / max(self.n_examples, 1),
                "llm_tokens_per_s": self.n_forward_tokens / s, "llm_forward_tokens": self.n_forward_tokens,
                "llm_threads": self.threads}
