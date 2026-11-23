"""A masked-language-model encoder (ModernBERT: jhu-clsp/mmBERT-small / -base) as a next-token scorer.

  --llm mlm:jhu-clsp/mmBERT-small          exact: row i is a full bidirectional forward over
                                              [CLS] + context + target[:i] + [MASK] (+ [SEP])
  --llm mlm-causal:jhu-clsp/mmBERT-small   cached-prefix: every position attends only to positions at or before it (a causal
                                              mask in every layer; the local layers keep their window); the [MASK] after the prefix
                                              attends to the prefix and itself. This is what an app gets by keeping each token's
                                              states from when it was typed and computing only the new token and the mask.

Row i of logprobs(ex) is the log-softmax at the [MASK] placed right after the prefix (context + target tokens < i); the last
row is the position after the whole target. [CLS] and [SEP] are the tokenizer's cls (<bos>) and sep (<eos>) tokens; `ending`
chooses [MASK][SEP] (exact variant only) or [MASK] with nothing after it. The tokenizer is the model's own (SentencePiece, byte
fallback: ws/tokbytes.py, made byte-faithful by LeadSpaceTokenizer), and the Example's target_ids must come from it (scripts/eval.py uses the --llm model's tokenizer).

Causal variant, one forward per example: the real tokens [CLS] + context + target (positions 0..T-1) followed by n+1 [MASK] tokens
whose rotary position is that of the token they predict; a real token attends to the real tokens at or before it (and, in
local layers, within the model's window), mask i attends to the real tokens before its position (same window) and itself, never
to another mask. Because real tokens never see a mask, their states are those of an incremental run: `Incremental` below computes
the same thing token by token with saved key/value states (tests/test_mlm.py checks that they agree), and is what the CPU latency
benchmark (scripts/bench_mlm.py) times.
"""
from __future__ import annotations

import time
from typing import Optional

import torch

from .scorers import build_prefix
from .types import Example

KINDS = ("mlm", "mlm-causal")


def parse_llm_spec(spec: str) -> tuple[str, str]:
    """'mlm:jhu-clsp/mmBERT-small' -> ('mlm', 'jhu-clsp/mmBERT-small'); a plain model name -> ('lm', name)."""
    for k in KINDS:
        if spec.startswith(k + ":"):
            return k, spec[len(k) + 1:]
    return "lm", spec


class LeadSpaceTokenizer:
    """mmBERT's SentencePiece tokenizer made byte-faithful for the harness. Natively it puts a word-start mark ▁ on every
    piece it splits, also after a newline ('a\n\nb' -> ▁a \n\n ▁b), so token bytes would not add up to the text. Here the
    pre-tokenizer adds no mark, and every text is encoded as ' ' + text: the first word gets its ▁ (as natively) and the
    tokens' bytes are those of the text with one leading space (Evaluator(lead_space=True) expects that: the space is joined
    to the first token and costs no key). Offsets are shifted back to the text."""
    lead_space = True

    def __init__(self, name: str):
        from tokenizers.pre_tokenizers import Metaspace
        from transformers import AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(name)
        self.tok.backend_tokenizer.pre_tokenizer = Metaspace(replacement="\u2581", prepend_scheme="never")

    def __getattr__(self, name):
        if name == "tok":
            raise AttributeError(name)
        return getattr(self.tok, name)

    def __len__(self):
        return len(self.tok)

    def __call__(self, text, add_special_tokens: bool = False, return_offsets_mapping: bool = False, **kw):
        if isinstance(text, (list, tuple)):
            encs = [self(t, add_special_tokens, return_offsets_mapping) for t in text]
            return {k: [e[k] for e in encs] for k in encs[0]} if encs else {"input_ids": []}
        enc = self.tok(" " + text, add_special_tokens=False, return_offsets_mapping=return_offsets_mapping)
        out = {"input_ids": list(enc["input_ids"])}
        if return_offsets_mapping:
            out["offset_mapping"] = [(max(a - 1, 0), max(b - 1, 0)) for a, b in enc["offset_mapping"]]
        return out


def load_tokenizer(name: str):
    return LeadSpaceTokenizer(name)


class MLMScorer:
    def __init__(self, name: str, dtype: str = "bfloat16", threads: int = 4, fmt: str = "plain", device: str = "cpu",
                 causal: bool = False, ending: str = "sep", max_batch_tokens: int = 32768):
        from transformers import AutoModelForMaskedLM
        torch.set_num_threads(threads)
        self.name, self.fmt, self.threads, self.causal, self.ending = name, fmt, threads, causal, ending
        self.max_batch_tokens = max_batch_tokens
        self.device = torch.device(device)
        self.dtype = {"bfloat16": torch.bfloat16, "bf16": torch.bfloat16, "float32": torch.float32,
                      "fp32": torch.float32, "float16": torch.float16}[dtype]
        self.tok = load_tokenizer(name)
        self.model = AutoModelForMaskedLM.from_pretrained(name, dtype=self.dtype, attn_implementation="sdpa").eval().to(self.device)
        for p in self.model.parameters():
            p.requires_grad_(False)
        self.cls, self.sep, self.mask = self.tok.cls_token_id, self.tok.sep_token_id, self.tok.mask_token_id
        self.window = int(self.model.config.sliding_window)
        self.vocab_size = int(self.model.get_output_embeddings().weight.shape[0])
        self._pad_mask: Optional[torch.Tensor] = None
        if self.vocab_size > len(self.tok):
            m = torch.zeros(self.vocab_size, dtype=torch.bool)
            m[len(self.tok):] = True
            self._pad_mask = m.to(self.device)
        self.n_forward_tokens = self.n_target_tokens = self.n_examples = 0
        self.seconds = 0.0
        self._prefix_cache: dict = {}

    def prefix_ids(self, ex: Example) -> list[int]:
        s = build_prefix(ex, self.fmt)
        ids = self._prefix_cache.get(s)
        if ids is None:
            ids = self.tok(s, add_special_tokens=False)["input_ids"]
            if len(self._prefix_cache) > 256:
                self._prefix_cache.clear()
            self._prefix_cache[s] = ids
        return ids

    # ---- logits at the mask positions ------------------------------------------------------------------------------------
    def _head(self, h: torch.Tensor) -> torch.Tensor:
        """[m, d] hidden states at mask positions -> [m, V] float32 log-probs."""
        m = self.model
        logits = m.decoder(m.head(h)).float()
        if self._pad_mask is not None:
            logits[:, self._pad_mask] = float("-inf")
        return torch.log_softmax(logits, dim=-1)

    @torch.inference_mode()
    def logprobs(self, ex: Example, llm_lp: Optional[torch.Tensor] = None) -> torch.Tensor:
        t0 = time.perf_counter()
        pre = [self.cls] + self.prefix_ids(ex)
        tgt = list(ex.target_ids)
        n = len(tgt)
        out = self._causal(pre, tgt) if self.causal else self._exact(pre, tgt)
        if self.device.type == "cuda":
            torch.cuda.synchronize(self.device)
        self.seconds += time.perf_counter() - t0
        self.n_target_tokens += n
        self.n_examples += 1
        return out

    def _exact(self, pre: list[int], tgt: list[int]) -> torch.Tensor:
        n, P = len(tgt), len(pre)
        tail = [self.sep] if self.ending == "sep" else []
        seqs = [pre + tgt[:i] + [self.mask] + tail for i in range(n + 1)]
        pos = [P + i for i in range(n + 1)]
        Lmax = len(seqs[-1])
        step = max(1, self.max_batch_tokens // Lmax)
        rows = []
        for a in range(0, n + 1, step):
            chunk = seqs[a:a + step]
            ids = torch.zeros(len(chunk), Lmax, dtype=torch.long)
            am = torch.zeros(len(chunk), Lmax, dtype=torch.long)
            for r, s in enumerate(chunk):
                ids[r, :len(s)] = torch.tensor(s)
                am[r, :len(s)] = 1
            ids, am = ids.to(self.device), am.to(self.device)
            h = self.model.model(input_ids=ids, attention_mask=am).last_hidden_state
            sel = h[torch.arange(len(chunk), device=self.device), torch.tensor(pos[a:a + step], device=self.device)]
            rows.append(self._head(sel))
            self.n_forward_tokens += sum(len(s) for s in chunk)
        return torch.cat(rows)

    def masks(self, T: int, n_masks: int, P: int):
        """The boolean attention masks (full, sliding) [1, 1, L, L] of the causal variant: T real tokens, then n_masks masks
        whose positions are P, P+1, ... (P = the position of the first token predicted)."""
        dev = self.device
        L = T + n_masks
        pos = torch.cat([torch.arange(T), P + torch.arange(n_masks)]).to(dev)
        qp, kp = pos[:, None], pos[None, :]
        is_real = torch.arange(L, device=dev) < T
        real_q, real_k = is_real[:, None], is_real[None, :]
        eye = torch.eye(L, dtype=torch.bool, device=dev)
        # a real token: real tokens at or before it; a mask: real tokens strictly before its position, and itself
        full = (real_q & real_k & (kp <= qp)) | (~real_q & real_k & (kp < qp)) | (~real_q & eye)
        slide = full & ((qp - kp) <= self.window)
        return full[None, None], slide[None, None], pos[None]

    def _causal(self, pre: list[int], tgt: list[int]) -> torch.Tensor:
        n, P = len(tgt), len(pre)
        real = pre + tgt
        ids = torch.tensor([real + [self.mask] * (n + 1)], device=self.device)
        full, slide, pos = self.masks(len(real), n + 1, P)
        h = self.model.model(input_ids=ids, attention_mask={"full_attention": full, "sliding_attention": slide},
                             position_ids=pos).last_hidden_state
        self.n_forward_tokens += ids.shape[1]
        return self._head(h[0, len(real):])

    def speed(self) -> dict:
        s = max(self.seconds, 1e-9)
        return {"llm_seconds": self.seconds, "llm_examples": self.n_examples,
                "llm_s_per_example": s / max(self.n_examples, 1), "llm_tokens_per_s": self.n_forward_tokens / s,
                "llm_forward_tokens": self.n_forward_tokens, "llm_threads": self.threads}


class Incremental:
    """The causal variant computed the way an app would: key/value states of the typed tokens are kept, and a new token (or the
    [MASK] that asks for the next one) is computed alone against them. Written out by hand from the model's own modules
    (the same weights, rotary embedding, norms and MLPs), one new token at a time or several together.

      inc = Incremental(model, window)       # model: a ModernBertForMaskedLM
      inc.extend([cls, t1, t2])              # typed tokens: states are kept
      h = inc.query(mask_id)                 # [d] hidden state of a [MASK] after them (not kept)
      lp = log_softmax(head(h))
      inc.step(t3, mask_id)                  # keep t3, then query a mask after it: one pass over the two new tokens
    """

    def __init__(self, mlm: "torch.nn.Module", window: int):
        self.m, self.window = mlm, int(window)
        self.cfg = mlm.config
        self.L = len(mlm.model.layers)
        self.K = [None] * self.L          # [heads, T, hd] rotated keys
        self.V = [None] * self.L
        self.T = 0                         # tokens kept = the next position

    def _run(self, ids: list[int], keep: list[bool], positions: list[int]) -> torch.Tensor:
        """New tokens `ids` at `positions`; those with keep=True are stored. New token j attends to the stored states, to the new
        kept tokens before it and to itself. Returns the last hidden states [m, d] (after the final norm)."""
        from transformers.models.modernbert.modeling_modernbert import apply_rotary_pos_emb
        base = self.m.model
        dev = next(base.parameters()).device
        m = len(ids)
        x = base.embeddings(input_ids=torch.tensor([ids], device=dev))          # [1, m, d]
        pos = torch.tensor([positions], device=dev)
        kept = torch.tensor(keep, device=dev)
        newpos = pos[0]
        cos_sin = {t: base.rotary_emb(x, pos, t) for t in set(self.cfg.layer_types)}
        for li, layer in enumerate(base.layers):
            a = layer.attn
            hdn = layer.attn_norm(x)
            qkv = a.Wqkv(hdn).view(1, m, 3, -1, a.head_dim)
            q, k, v = (t.transpose(1, 2) for t in qkv.unbind(dim=-3))          # [1, heads, m, hd]
            cos, sin = cos_sin[layer.attention_type]
            q, k = apply_rotary_pos_emb(q, k, cos, sin, unsqueeze_dim=1)
            kc = k[0] if self.K[li] is None else torch.cat([self.K[li], k[0]], 1)        # keys: stored, then the new ones
            vc = v[0] if self.V[li] is None else torch.cat([self.V[li], v[0]], 1)
            old = self.T
            kpos = torch.cat([torch.arange(old, device=dev), newpos])                   # their positions
            qpos = newpos[:, None]
            allow = torch.zeros(m, old + m, dtype=torch.bool, device=dev)
            allow[:, :old] = True
            j = torch.arange(m, device=dev)
            allow[:, old:] = (j[None, :] < j[:, None]) & kept[None, :] | torch.eye(m, dtype=torch.bool, device=dev)
            allow &= kpos[None, :] <= qpos                                                # nothing from the future
            if layer.attention_type == "sliding_attention":
                allow &= (qpos - kpos[None, :]) <= self.window
            att = torch.matmul(q[0], kc.transpose(1, 2)) * a.head_dim ** -0.5            # [heads, m, old+m]
            att = att.masked_fill(~allow[None], float("-inf")).softmax(-1, dtype=torch.float32).to(q.dtype)
            o = torch.matmul(att, vc).transpose(0, 1).reshape(1, m, -1)
            x = x + a.Wo(o)
            x = x + layer.mlp(layer.mlp_norm(x))
            if keep and any(keep):
                sel = torch.nonzero(kept).flatten()
                self.K[li] = kc[:, torch.cat([torch.arange(old, device=dev), old + sel])]
                self.V[li] = vc[:, torch.cat([torch.arange(old, device=dev), old + sel])]
        self.T += int(sum(keep))
        return base.final_norm(x)[0]

    @torch.inference_mode()
    def extend(self, ids: list[int]) -> torch.Tensor:
        """Type these tokens (their states are kept); returns their hidden states."""
        return self._run(list(ids), [True] * len(ids), list(range(self.T, self.T + len(ids))))

    @torch.inference_mode()
    def query(self, mask_id: int) -> torch.Tensor:
        """The hidden state of a [MASK] at the next position, attending to everything kept (not stored)."""
        return self._run([mask_id], [False], [self.T])[0]

    @torch.inference_mode()
    def step(self, token: int, mask_id: int) -> torch.Tensor:
        """Keep `token`, then the [MASK] after it, in one pass over the two new tokens."""
        return self._run([token, mask_id], [True, False], [self.T, self.T + 1])[1]

    def logprobs(self, h: torch.Tensor) -> torch.Tensor:
        m = self.m
        return torch.log_softmax(m.decoder(m.head(h)).float(), -1)
