#!/usr/bin/env python3
"""Export a research SLM checkpoint as a Hydor release folder's model files (model.safetensors + config.json).

    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/export_release.py \
        --ckpt runs/slm/pre50b_30m_cmix/ckpt.pt --out release/hydor-suggest-49m [--verify]

model.safetensors holds the research model's state_dict (float32, the research names; tied/shared tensors do not occur with
emb_rank > 0).  config.json is the contract of docs/plans/word-suggestions.md ("The model release"): every SLMConfig field of the
checkpoint, the specials, the Qwen3.5 output rows, max_ctx_tokens, the LLM's repos.  The research vocabulary (ws/vocab.py) of these
models is the full one: SLM id = Qwen id + 6 (checked against the checkpoint's vocab.json); the one extra fact the engine needs is
the Qwen id that the SLM's <eos> stands for (``llm_eos``, 248044 = <|endoftext|>).

--verify reloads the written files into a fresh research SLM and compares log-probs with the checkpoint's on sequences.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from safetensors.torch import load_file, save_file  # noqa: E402

from ws.slm import SLM, SLMConfig, load_ckpt, resolve_vocab_path  # noqa: E402
from ws.vocab import MAX_CTX_TOKENS, NSPEC, SPECIALS, Vocab  # noqa: E402

LLM = {'repo': 'Qwen/Qwen3.5-0.8B-Base', 'gguf_repo': 'ggml-org/Qwen3.5-0.8B-Base-GGUF'}
SLM_FIELDS = ['arch', 'vocab', 'd', 'n_layers', 'ffn', 'heads', 'kv_heads', 'kernel', 'window', 'sandwich', 'qk_norm', 'rotary',
              'rope_theta', 'max_len', 'norm_eps', 'emb_rank']


def build_config(ck: dict, vocab: Vocab) -> dict:
    cfg = SLMConfig(**ck['config'])                      # fills defaults (sandwich, rotary) exactly as the research code
    assert vocab.is_full, 'the release format is for the full-vocabulary models (SLM id = Qwen id + 6)'
    assert cfg.vocab == vocab.v_sub == vocab.v_llm + NSPEC, (cfg.vocab, vocab.v_sub, vocab.v_llm)
    slm = {k: getattr(cfg, k) for k in SLM_FIELDS}
    return {'format': 'hydor-suggest/1', 'slm': slm, 'specials': list(SPECIALS), 'llm_vocab': int(vocab.v_llm),
            'llm_eos': int(vocab.llm_eos), 'max_ctx_tokens': MAX_CTX_TOKENS, 'llm': dict(LLM)}


def export(ckpt: str, out: str) -> dict:
    os.makedirs(out, exist_ok=True)
    ck = torch.load(ckpt, map_location='cpu', weights_only=False)
    vocab = Vocab.load(resolve_vocab_path(ckpt, ck))
    config = build_config(ck, vocab)
    sd = {k: v.detach().cpu().to(torch.float32).contiguous().clone() for k, v in ck['state_dict'].items()}
    n = sum(v.numel() for v in sd.values())
    save_file(sd, os.path.join(out, 'model.safetensors'), metadata={'format': 'pt', 'hydor-suggest': '1'})
    with open(os.path.join(out, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)
        f.write('\n')
    return {'params': n, 'tensors': len(sd), 'config': config, 'extra': ck.get('extra', {})}


@torch.no_grad()
def verify(ckpt: str, out: str, n_seq: int = 6, seed: int = 0) -> dict:
    """Round trip: the exported files into a fresh SLM; log-probs on random and real-looking sequences against the checkpoint's."""
    ref, vocab, ck = load_ckpt(ckpt)
    ref.eval()
    with open(os.path.join(out, 'config.json')) as f:
        config = json.load(f)
    assert config['format'] == 'hydor-suggest/1'
    new = SLM(SLMConfig(**config['slm']))
    sd = load_file(os.path.join(out, 'model.safetensors'))
    missing = new.load_state_dict(sd, strict=True)          # raises on any name or shape mismatch
    new.eval()
    same = all(torch.equal(ref.state_dict()[k], new.state_dict()[k]) for k in ref.state_dict())
    rng = np.random.RandomState(seed)
    V = config['slm']['vocab']
    seqs = []
    for L in (7, 31, 64, 150, 256, 300)[:n_seq]:
        body = rng.randint(NSPEC, V, size=L - 3)
        seqs.append([1, 5] + body.tolist() + [2])           # <bos> <doc> ... <eos>
    try:                                                   # plus real text, tokenised as Hydor will
        from tokenizers import Tokenizer
        tk = Tokenizer.from_file(os.path.join(out, 'tokenizer.json'))
        for text in ['Hello, how are you doing today? I wanted to ask about the meeting.',
                     'Γεια σου, τι κάνεις; Θα ήθελα να ρωτήσω για τη συνάντηση αύριο.',
                     'Das ist ein kurzer deutscher Satz über das Wetter in Berlin.']:
            ids = [i + NSPEC for i in tk.encode(text, add_special_tokens=False).ids]
            seqs.append([1, 5] + ids)
    except Exception as e:                                 # the tokenizer may not be there yet
        print('  (no real-text sequences:', repr(e)[:80], ')')
    worst = 0.0
    for ids in seqs:
        x = torch.tensor([ids])
        a = torch.log_softmax(ref(x).float(), -1)
        b = torch.log_softmax(new(x).float(), -1)
        worst = max(worst, float((a - b).abs().max()))
    return {'tensors_identical': bool(same), 'sequences': len(seqs), 'max_abs_logprob_diff': worst, 'n_params': ref.n_params()}


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for blk in iter(lambda: f.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--verify', action='store_true')
    a = ap.parse_args()
    torch.set_num_threads(min(a.threads, 8))
    info = export(a.ckpt, a.out)
    print(json.dumps({'params': info['params'], 'tensors': info['tensors'], 'config': info['config']}))
    if a.verify:
        print(json.dumps(verify(a.ckpt, a.out)))


if __name__ == '__main__':
    main()
