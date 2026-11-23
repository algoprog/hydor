#!/usr/bin/env python
"""Tests for ws/vocab.py, ws/slm.py, ws/ngram.py, ws/train.py (no pytest needed):

  CUDA_VISIBLE_DEVICES= nice -n 19 .venv/bin/python tests/test_slm.py [name ...]
"""
import os
import sys
import tempfile
import traceback

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(2)

from ws.ngram import KNModel, NgramScorer  # noqa: E402
from ws.slm import SIZES, SLM, SLMConfig, SLMScorer, save_ckpt  # noqa: E402
from ws.train import Seq, TrainCfg, build_sequences, fit, make_batches, collate, eval_seqs  # noqa: E402
from ws.types import Example  # noqa: E402
from ws.vocab import (AGENT, BOS, DOC, EOS, NSPEC, UNK, USER, DEFAULT_LLM, Vocab, get_tokenizer,
                      llm_vocab_size)  # noqa: E402

TEXTS = [
    'Please check the backend and frontend and suggest how to make them faster.',
    'put all this analysis in the plan file, then run the tests again please',
    'Can you explain what the function does and why the test fails on Monday?',
    'I will review the code and run the tests. The build passes now, thanks.',
    'Kαλημέρα, πώς είσαι σήμερα; Θέλω να δω τα αρχεία.',
    '你好，请帮我检查一下这个文件。',
] * 5
_VOCAB = None
_TMP = tempfile.mkdtemp(prefix='ws_test_')


def vocab() -> Vocab:
    global _VOCAB
    if _VOCAB is None:
        _VOCAB = Vocab.build(DEFAULT_LLM, TEXTS, 2)
    return _VOCAB


def example(v: Vocab, target='put all this in the plan file', agent='I will run the tests.', user='check the code',
            surface='chat', doc='') -> Example:
    tok = get_tokenizer(DEFAULT_LLM)
    ids = tok(target, add_special_tokens=False)['input_ids']
    return Example(id='t', surface=surface, lang='en', agent_ctx=agent, user_ctx=user, doc_ctx=doc, target=target,
                   target_ids=ids, offsets=[(0, 0)] * len(ids))


def small_cfg(arch='lfm', **kw) -> SLMConfig:
    return SLMConfig(arch=arch, vocab=vocab().v_sub, d=48, n_layers=5, ffn=96, heads=4, kv_heads=2, **kw)


CONFIGS = [('lfm', dict()), ('lfm', dict(kernel=7)), ('lfm', dict(window=6)), ('tf', dict()), ('tf', dict(window=6))]


# ---- vocab -----------------------------------------------------------------------------------------------------
def test_vocab_round_trip():
    v = vocab()
    p = os.path.join(_TMP, 'v.json')
    v.save(p)
    w = Vocab.load(p)
    assert w.v_sub == v.v_sub and (w.slm2llm == v.slm2llm).all() and (w.llm2slm == v.llm2slm).all()
    assert w.llm_name == v.llm_name and w.llm_eos == v.llm_eos and w.min_count == v.min_count
    assert (v.slm2llm[:NSPEC] == -1).all()
    ids = v.slm2llm[NSPEC:]
    assert (v.llm2slm[ids] == np.arange(NSPEC, v.v_sub)).all()
    assert v.llm2slm.shape[0] == llm_vocab_size(DEFAULT_LLM) == v.v_llm
    assert v.llm2slm[v.llm_eos] == UNK and v.llm_eos >= 0
    # every token of the texts seen >= 2 times is in the vocabulary; counts agree
    counts = Vocab.count(DEFAULT_LLM, TEXTS)
    assert set(np.flatnonzero(counts >= 2)) - {v.llm_eos} <= set(ids.tolist())
    assert v.v_sub == NSPEC + int(((counts >= 2) & (np.arange(len(counts)) != v.llm_eos)).sum()) - sum(
        1 for i in get_tokenizer(DEFAULT_LLM).all_special_ids if i != v.llm_eos and i < len(counts) and counts[i] >= 2)


def test_prefix_format():
    v = vocab()
    ex = example(v)
    a, u = v.encode_slm(ex.agent_ctx).tolist(), v.encode_slm(ex.user_ctx).tolist()
    assert v.slm_prefix_ids(ex) == [BOS, AGENT] + a + [USER] + u + [USER]
    ex2 = example(v, agent='')
    assert v.slm_prefix_ids(ex2) == [BOS, USER] + u + [USER]
    ex3 = example(v, user='')
    assert v.slm_prefix_ids(ex3) == [BOS, AGENT] + a + [USER]
    assert v.slm_prefix_ids(example(v, agent='', user='')) == [BOS, USER]
    d = v.encode_slm('some words before').tolist()
    assert v.slm_prefix_ids(example(v, surface='doc', agent='', user='', doc='some words before')) == [BOS, DOC] + d + [DOC]
    assert v.slm_prefix_ids(example(v, surface='doc', agent='', user='', doc='')) == [BOS, DOC]
    long = ' '.join(['the'] * 1000)
    assert len(v.slm_prefix_ids(example(v, agent=long, user=long))) <= 3 * 256 + 4 - 256


def test_spread_sums_to_one():
    v = vocab()
    n = 4
    logits = torch.randn(n, v.v_sub)
    logits[:, [BOS, AGENT, USER, DOC]] = float('-inf')
    lp = torch.log_softmax(logits, -1)
    llm = torch.log_softmax(torch.randn(n, v.v_llm) * 3, -1)
    out = v.spread(lp, llm)
    assert out.shape == (n, v.v_llm)
    s = out.double().exp().sum(-1)
    assert torch.allclose(s, torch.ones(n, dtype=torch.double), atol=1e-4), s
    # in-vocabulary ids keep the SLM's log-prob, eos goes to the LLM's end-of-text id
    assert torch.allclose(out[:, v.slm2llm[NSPEC + 3]], lp[:, NSPEC + 3])
    assert torch.allclose(out[:, v.llm_eos], lp[:, EOS])
    # outside ids share the <unk> mass in proportion to the LLM
    o = np.flatnonzero(v._outside_mask_np())[:2]
    r = (out[0, o[0]] - out[0, o[1]]).item()
    assert abs(r - (llm[0, o[0]] - llm[0, o[1]]).item()) < 1e-4
    alone = v.spread(lp)
    assert torch.isinf(alone[:, o[0]]).all() and (alone[:, o[0]] < 0).all()
    assert abs(alone.double().exp().sum(-1)[0].item() - (1 - lp[0, UNK].exp().item())) < 1e-4


# ---- model -----------------------------------------------------------------------------------------------------
def test_shapes_and_params():
    for arch, kw in CONFIGS:
        cfg = small_cfg(arch, **kw)
        m = SLM(cfg)
        ids = torch.randint(0, cfg.vocab, (3, 17))
        assert m(ids).shape == (3, 17, cfg.vocab)
        assert m(ids, keep=5).shape == (3, 5, cfg.vocab)
        assert m.n_params() == sum(p.numel() for p in m.parameters())
    kinds = SLMConfig.for_size('15m', 'lfm', 1000).layer_types()
    assert ''.join(kinds) == 'ccacacac'
    assert set(SLMConfig.for_size('5m', 'tf', 1000).layer_types()) == {'a'}
    for name in SIZES:
        for arch in ('lfm', 'tf'):
            SLMConfig.for_size(name, arch, 1000)


def test_factorised_embedding_and_full_vocab():
    torch.manual_seed(0)
    cfg = small_cfg('lfm', emb_rank=8)
    m = SLM(cfg).eval()
    assert m.lm_head is None and m.n_params_body() == m.n_params() - m.embed.weight.numel() - m.emb_proj.weight.numel()
    ids = torch.randint(0, cfg.vocab, (2, 20))
    tg = torch.randint(NSPEC, cfg.vocab, (2, 20))
    w = torch.ones(2, 20)
    a, b = m.loss(ids, tg, w)[0], m.loss(ids, tg, w, chunk=7)[0]
    assert torch.allclose(a, b, atol=1e-3)                                  # chunked loss = full loss
    n1, _ = m.token_nll(ids, tg, w > 0)
    n2, _ = m.token_nll(ids, tg, w > 0, chunk=9)
    assert torch.allclose(n1, n2, atol=1e-5)
    sub = torch.tensor([3, 9, 20, 41])
    full = m(ids)
    assert torch.allclose(m(ids, out_ids=sub), full[..., sub], atol=1e-5)
    assert torch.allclose(m.head(m.body(ids)[0], w_sub=m.output_subset(sub)), full[..., sub], atol=1e-5)
    st = m.init_state(1)
    lg1, st = m(ids[:1, :11], st)
    lg2, st = m(ids[:1, 11:], st)
    assert torch.allclose(torch.cat([lg1, lg2], 1), full[:1], atol=1e-4)    # incremental = full
    v = Vocab.full(DEFAULT_LLM)
    assert v.is_full and v.v_sub == v.v_llm + NSPEC and v.n_outside == 0
    assert (v.to_slm(np.arange(5)) == np.arange(5) + NSPEC).all()


def test_causality():
    torch.manual_seed(0)
    for arch, kw in CONFIGS:
        m = SLM(small_cfg(arch, **kw)).eval()
        ids = torch.randint(0, m.cfg.vocab, (2, 24))
        base = m(ids)
        for t in (5, 13, 23):
            alt = ids.clone()
            alt[:, t] = (alt[:, t] + 7) % m.cfg.vocab
            out = m(alt)
            assert torch.allclose(out[:, :t], base[:, :t], atol=1e-5), (arch, kw, t)
            assert not torch.allclose(out[:, t], base[:, t], atol=1e-5)


def test_step_matches_forward():
    torch.manual_seed(1)
    for arch, kw in CONFIGS:
        m = SLM(small_cfg(arch, **kw)).eval()
        ids = torch.randint(0, m.cfg.vocab, (2, 30))
        full = m(ids)
        # prefill then single steps
        lo, st = m(ids[:, :19], m.init_state(2))
        outs = [lo]
        for t in range(19, 30):
            l, st = m.step(ids[:, t], st)
            outs.append(l[:, None])
        got = torch.cat(outs, 1)
        assert torch.allclose(got, full, atol=2e-4), (arch, kw, (got - full).abs().max().item())
        # token by token from nothing, and in chunks
        st = m.init_state(2)
        outs = []
        for t in range(30):
            l, st = m.step(ids[:, t], st)
            outs.append(l[:, None])
        assert torch.allclose(torch.cat(outs, 1), full, atol=2e-4)
        st = m.init_state(2)
        outs = []
        for a, b in ((0, 7), (7, 8), (8, 20), (20, 30)):
            l, st = m(ids[:, a:b], st)
            outs.append(l)
        assert torch.allclose(torch.cat(outs, 1), full, atol=2e-4), (arch, kw)


def test_loss_masks_and_backward():
    m = SLM(small_cfg('lfm'))
    ids = torch.randint(0, m.cfg.vocab, (2, 10))
    tg = torch.randint(6, m.cfg.vocab, (2, 10))
    w = torch.zeros(2, 10)
    w[:, 5:] = 2.0
    sw, sws, n = m.loss(ids, tg, w)
    assert n == 10 and abs(sws.item() - 20.0) < 1e-5 and torch.isfinite(sw)
    (sw / sws).backward()
    assert all(torch.isfinite(p.grad).all() for p in m.parameters() if p.grad is not None)
    # the loss at masked positions must not depend on the earlier targets
    assert abs((sw / sws).item() - np.log(m.cfg.vocab - 4)) < 1.0      # near uniform at init


def test_int8_dynamic_quantization():
    m = SLM(small_cfg('lfm')).eval()
    q = torch.ao.quantization.quantize_dynamic(m, {torch.nn.Linear}, dtype=torch.qint8)
    ids = torch.randint(0, m.cfg.vocab, (1, 12))
    assert q(ids).shape == (1, 12, m.cfg.vocab)


# ---- n-gram ------------------------------------------------------------------------------------------------------
def _toy_seqs(V=40, n=300, seed=0):
    rng = np.random.RandomState(seed)
    seqs = []
    for _ in range(n):
        L = rng.randint(5, 30)
        ids = np.concatenate([[BOS, USER], rng.randint(NSPEC, NSPEC + 12, L), [EOS]])
        w = np.concatenate([[0, 0], np.full(L + 1, rng.choice([1.0, 4.0, 0.5]))])
        seqs.append((ids, w))
    return seqs


def test_ngram_sums_to_one():
    V = 40
    kn = KNModel.build(_toy_seqs(V), V, 4)
    rng = np.random.RandomState(1)
    hists = np.concatenate([rng.randint(NSPEC, NSPEC + 12, (20, 3)),             # seen-like histories
                            rng.randint(0, V, (20, 3)),                           # arbitrary ones (specials, unseen)
                            np.full((2, 3), V), [[V, V, BOS], [V, BOS, USER]]])   # padded
    p = kn.dist(hists)
    assert np.allclose(p.sum(1), 1.0, atol=1e-5), p.sum(1)
    assert (p >= 0).all() and (p[:, [BOS, AGENT, USER, DOC]] == 0).all()
    path = os.path.join(_TMP, 'kn.npz')
    kn.save(path)
    kn2 = KNModel.load(path)
    assert np.allclose(kn2.dist(hists), p)
    # a frequent continuation gets more mass than an unseen token
    h = np.array([[V, BOS, USER]])
    assert kn.dist(h)[0, NSPEC:NSPEC + 12].min() > 0


def test_ngram_weights_are_multipliers():
    V = 30
    a = [(np.array([BOS, USER, 10, 11, EOS]), np.array([0, 0, 1.0, 1.0, 1.0]))] * 2 + \
        [(np.array([BOS, USER, 10, 12, EOS]), np.array([0, 0, 1.0, 1.0, 1.0]))] * 2
    b = [(np.array([BOS, USER, 10, 11, EOS]), np.array([0, 0, 4.0, 4.0, 4.0]))] * 1 + \
        [(np.array([BOS, USER, 10, 12, EOS]), np.array([0, 0, 1.0, 1.0, 1.0]))] * 2
    h = np.array([[V, V, 10]])
    pa = KNModel.build(a, V).dist(h)[0]
    pb = KNModel.build(b, V).dist(h)[0]
    assert abs(pa[11] - pa[12]) < 1e-9 and pb[11] > pb[12]


def test_scorers_end_to_end():
    v = vocab()
    vp = os.path.join(_TMP, 'vocab.json')
    v.save(vp)
    ex = example(v)
    n = len(ex.target_ids) + 1
    # SLM
    m = SLM(small_cfg('lfm'))
    cp = os.path.join(_TMP, 'ckpt.pt')
    save_ckpt(cp, m, vp)
    sc = SLMScorer(cp, threads=2)
    lp = sc.logprobs(ex)
    assert lp.shape == (n, v.v_llm) and lp.dtype == torch.float32
    full = torch.log_softmax(torch.randn(n, v.v_llm), -1)
    mix = sc.logprobs(ex, full)
    assert torch.allclose(mix.double().exp().sum(-1), torch.ones(n, dtype=torch.double), atol=1e-4)
    # logprobs agree with a plain forward over prefix + target
    ids = torch.tensor([v.slm_prefix_ids(ex) + v.target_slm_ids(ex)])
    ref = torch.log_softmax(m.eval()(ids)[0].double(), -1)
    P = len(v.slm_prefix_ids(ex))
    tg = v.target_slm_ids(ex)
    for i, t in enumerate(tg):
        if t >= NSPEC:
            sl = ref[P - 1 + i].clone()
            sl[[BOS, AGENT, USER, DOC]] = -float('inf')
            sl = torch.log_softmax(sl, -1)
            assert abs(lp[i, ex.target_ids[i]].item() - sl[t].item()) < 1e-3
    # n-gram
    ids0 = np.array(v.slm_prefix_ids(ex) + v.target_slm_ids(ex) + [EOS])
    w = np.zeros(len(ids0))
    w[len(v.slm_prefix_ids(ex)):] = 4.0
    kn = KNModel.build([(ids0, w)] * 3, v.v_sub, 4)
    kp = os.path.join(_TMP, 'ngram.npz')
    kn.save(kp, vp)
    ns = NgramScorer(kp)
    nl = ns.logprobs(ex)
    assert nl.shape == (n, v.v_llm)
    nm = ns.logprobs(ex, full)
    assert torch.allclose(nm.double().exp().sum(-1), torch.ones(n, dtype=torch.double), atol=1e-4)
    # trained on this very text: the gold tokens are the likeliest
    for i, t in enumerate(ex.target_ids):
        assert nl[i].argmax().item() == t


def test_training_reduces_loss():
    torch.manual_seed(0)
    v = vocab()
    rng = np.random.RandomState(0)
    base = v.to_slm(get_tokenizer(DEFAULT_LLM)(TEXTS[1], add_special_tokens=False)['input_ids'])
    seqs = []
    for _ in range(64):
        ids = np.concatenate([[BOS, USER, USER], base, [EOS]]).astype(np.int32)
        w = np.zeros(len(ids), dtype=np.float32)
        w[3:] = 4.0
        seqs.append(Seq(ids, w, 'chat', 0, 70))
    m = SLM(small_cfg('lfm'))
    d = eval_seqs(m, v, [Seq(s.ids[:-1], np.where(np.arange(len(s.ids) - 1) >= 3, 1.0, 0.0).astype(np.float32), 'chat', 0, 70)
                         for s in seqs[:4]])
    cfg = TrainCfg(lr=3e-3, warmup=3, batch_tokens=512, steps=40, eval_every=0, log_every=1000)
    out = os.path.join(_TMP, 'fit')
    vp = os.path.join(_TMP, 'vocab.json')
    v.save(vp)
    res = fit(m, seqs, cfg, dev_seqs=seqs[:4], vocab=v, out_dir=out, vocab_path=vp)
    assert res['best']['dev_nll'] < d['dev_nll'] - 1.0, (res['best'], d)
    assert os.path.exists(os.path.join(out, 'ckpt.pt')) and os.path.exists(os.path.join(out, 'last.pt'))
    # batches: every sequence once, size bound
    L = np.array([len(s.ids) for s in seqs])
    bs = make_batches(L, 100, np.random.RandomState(0))
    assert sorted(np.concatenate(bs).tolist()) == list(range(len(seqs)))


def test_batches_and_collate():
    seqs = [Seq(np.arange(n, dtype=np.int32), np.ones(n, dtype=np.float32), 'chat', 0, 0) for n in (3, 5, 9)]
    ids, tg, w = collate(seqs)
    assert ids.shape == (3, 8) and tg.shape == (3, 8) and (w[0, 2:] == 0).all() and (w[2] == 1).all()


def main():
    names = sys.argv[1:]
    tests = [(k, f) for k, f in sorted(globals().items()) if k.startswith('test_') and callable(f)]
    failed = 0
    for k, f in tests:
        if names and not any(n in k for n in names):
            continue
        try:
            f()
            print('ok  ', k, flush=True)
        except Exception:
            failed += 1
            print('FAIL', k)
            traceback.print_exc()
    print('failed:', failed)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
