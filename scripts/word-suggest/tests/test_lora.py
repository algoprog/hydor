#!/usr/bin/env python
"""Tests for ws/lora.py (no pytest, no data or GPU needed):

  CUDA_VISIBLE_DEVICES= nice -n 19 .venv/bin/python tests/test_lora.py [name ...]
"""
import os
import sys
import tempfile
import traceback

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import torch  # noqa: E402

torch.set_num_threads(2)

from ws.lora import LoRALinear, apply_lora, export_state_dict, has_lora, merge_lora  # noqa: E402
from ws.slm import SLM, SLMConfig, load_ckpt, save_ckpt  # noqa: E402
from ws.train import TrainCfg, make_optimizer, train_step, Seq  # noqa: E402
import numpy as np  # noqa: E402


def small(emb_rank=16):
    torch.manual_seed(0)
    return SLM(SLMConfig.for_size('5m', 'lfm', 300, emb_rank=emb_rank))


def batch():
    rng = np.random.RandomState(0)
    out = []
    for _ in range(4):
        ids = np.concatenate([[1, 3], rng.randint(6, 300, 20), [2]]).astype(np.int32)
        w = np.ones(len(ids), dtype=np.float32)
        w[:2] = 0
        out.append(Seq(ids, w, 'chat', 0, 10))
    return out


def test_start_equals_base():
    m = small()
    ids = torch.randint(6, 300, (2, 12))
    ref = m(ids)
    apply_lora(m, 4)
    assert has_lora(m)
    assert torch.allclose(m(ids), ref, atol=1e-6)


def test_only_adapters_train():
    m = small()
    info = apply_lora(m, 4)
    names = {n for n, p in m.named_parameters() if p.requires_grad}
    assert names and all('lora_' in n for n in names), names
    assert info['trainable_params'] == info['lora_params']
    m2 = small()
    info2 = apply_lora(m2, 4, train_proj=True, train_embed=True)
    names2 = {n for n, p in m2.named_parameters() if p.requires_grad}
    assert 'embed.weight' in names2 and 'emb_proj.weight' in names2
    assert info2['trainable_params'] == info2['lora_params'] + m2.embed.weight.numel() + m2.emb_proj.weight.numel()
    m3 = small()
    apply_lora(m3, 4, groups=('attn',))
    assert all('mixer.q_proj' in n or 'mixer.k_proj' in n or 'mixer.v_proj' in n or 'mixer.o_proj' in n
               for n, p in m3.named_parameters() if p.requires_grad)


def test_merge_matches():
    m = small()
    apply_lora(m, 4)
    for mod in m.modules():                       # a trained-looking state: B not zero
        if isinstance(mod, LoRALinear):
            torch.nn.init.normal_(mod.lora_B, std=0.05)
    ids = torch.randint(6, 300, (2, 12))
    ref = m(ids)
    sd = export_state_dict(m)
    plain = small()
    plain.load_state_dict(sd)                      # the plain model's own keys
    assert torch.allclose(plain(ids), ref, atol=1e-4)
    merge_lora(m)
    assert not has_lora(m)
    assert torch.allclose(m(ids), ref, atol=1e-4)


def test_checkpoint_roundtrip():
    m = small()
    apply_lora(m, 4, train_proj=True)
    for mod in m.modules():
        if isinstance(mod, LoRALinear):
            torch.nn.init.normal_(mod.lora_B, std=0.05)
    d = tempfile.mkdtemp(prefix='ws_lora_')
    vp = os.path.join(d, 'vocab.json')
    open(vp, 'w').write('{}')
    ids = torch.randint(6, 300, (2, 12))
    ref = m(ids)
    save_ckpt(os.path.join(d, 'ckpt.pt'), m, vp, {})
    ck = torch.load(os.path.join(d, 'ckpt.pt'), weights_only=False)
    assert not any('lora' in k or '.base.' in k for k in ck['state_dict'])
    plain = SLM(SLMConfig(**ck['config']))
    plain.load_state_dict(ck['state_dict'])
    assert torch.allclose(plain(ids), ref, atol=1e-4)


def test_training_moves_only_trainable():
    m = small()
    apply_lora(m, 4)
    before = {n: p.detach().clone() for n, p in m.named_parameters()}
    cfg = TrainCfg(lr=1e-2)
    opt = make_optimizer(m, cfg.lr, cfg.wd)
    l0, _ = train_step(m, opt, batch(), 1e-2, 1.0, False)
    for _ in range(5):
        l1, _ = train_step(m, opt, batch(), 1e-2, 1.0, False)
    assert l1 < l0
    for n, p in m.named_parameters():
        moved = not torch.equal(p, before[n])
        assert moved == ('lora_' in n), (n, moved)


def main():
    names = sys.argv[1:] or [n for n in globals() if n.startswith('test_')]
    bad = 0
    for n in names:
        try:
            globals()[n]()
            print('ok  ', n)
        except Exception:
            bad += 1
            print('FAIL', n)
            traceback.print_exc()
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
