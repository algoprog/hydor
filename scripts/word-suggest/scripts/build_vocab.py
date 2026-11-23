#!/usr/bin/env python
"""The multilingual SLM vocabulary (E7): every LLM token seen >= min_count times in the local train split (as Vocab.build
does) plus the most frequent tokens of the pretraining corpus (data/pretrain/), as many as the least covered language needs
for `--coverage` of its tokens to be inside the vocabulary, at most `--max-size` ids (specials included).

  nice -n 19 .venv/bin/python scripts/build_vocab.py --out runs/vocab_multi.json [--coverage 0.985] [--max-size 48000]

Greedy: while some language is below the target, add the most frequent not-yet-included token of the language that is
furthest below it (a token also helps the other languages it occurs in).  Then pad to a multiple of 64 with the most
frequent tokens of the whole corpus (a friendlier matrix size).  Prints one JSON object per line and writes
<out>.report.json next to the vocabulary: V, per-language coverage (on the pretraining train and dev text), and the
out-of-vocabulary rate of the local dev targets, for this vocabulary and for the local-only one.
"""
import argparse
import json
import os
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402

from ws.train import Corpus  # noqa: E402
from ws.vocab import DEFAULT_LLM, NSPEC, UNK, Vocab, llm_vocab_size  # noqa: E402

LANGS = {'web_en': 'en', 'web_el': 'el', 'web_de': 'de', 'web_zh': 'zh', 'web_es': 'es', 'web_fr': 'fr'}


def load_tokens(pre_dir: str, name: str, part: str) -> np.ndarray:
    p = os.path.join(pre_dir, f'{name}.{part}.tok.npy')
    return np.load(p) if os.path.exists(p) else np.zeros(0, np.int32)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', default='data')
    ap.add_argument('--pretrain', default='data/pretrain')
    ap.add_argument('--llm', default=DEFAULT_LLM)
    ap.add_argument('--out', default='runs/vocab_multi.json')
    ap.add_argument('--min-count', type=int, default=3)
    ap.add_argument('--coverage', type=float, default=0.985)
    ap.add_argument('--max-size', type=int, default=48000)
    ap.add_argument('--round', type=int, default=64)
    ap.add_argument('--step', type=int, default=32, help='tokens added per greedy move')
    a = ap.parse_args(argv)

    v_llm = llm_vocab_size(a.llm)
    corpus = Corpus.load(a.data, a.llm)
    local = corpus.count_ids(lambda k, r: r['split'] == 'train', None, 0)
    base = Vocab.from_counts(a.llm, local, a.min_count)
    inv = np.zeros(v_llm, dtype=bool)
    inv[base.slm2llm[NSPEC:]] = True
    # what Vocab.from_counts leaves out (control tokens, end of text) is never added
    probe = Vocab.from_counts(a.llm, np.full(v_llm, 10 ** 6, dtype=np.int64), 1)
    allowed = np.zeros(v_llm, dtype=bool)
    allowed[probe.slm2llm[NSPEC:]] = True
    print(json.dumps({'local_train_tokens_ge_min_count': int(inv.sum()), 'min_count': a.min_count}), flush=True)

    counts, dev_counts = {}, {}
    for name, lang in LANGS.items():
        t = load_tokens(a.pretrain, name, 'train')
        if not len(t):
            raise SystemExit(f'no pretraining tokens for {name} in {a.pretrain} (run data/pretrain.py)')
        counts[lang] = np.bincount(t, minlength=v_llm)[:v_llm].astype(np.int64)
        d = load_tokens(a.pretrain, name, 'dev')
        dev_counts[lang] = np.bincount(d, minlength=v_llm)[:v_llm].astype(np.int64)
    chat_counts = np.bincount(load_tokens(a.pretrain, 'chat', 'train'), minlength=v_llm)[:v_llm].astype(np.int64)
    tot = {l: int(c.sum()) for l, c in counts.items()}
    cand = {l: np.argsort(-np.where(allowed, c, -1), kind='stable') for l, c in counts.items()}
    ptr = {l: 0 for l in counts}
    inside = {l: int(counts[l][inv].sum()) for l in counts}
    cov = lambda l: inside[l] / tot[l]

    def add(ids):
        ids = np.asarray(ids, dtype=np.int64)
        ids = ids[~inv[ids]]
        inv[ids] = True
        for l in counts:
            inside[l] += int(counts[l][ids].sum())

    def size():
        return NSPEC + int(inv.sum())

    capped = False
    while min(cov(l) for l in counts) < a.coverage:
        if size() >= a.max_size:
            capped = True
            break
        l = min(counts, key=cov)
        c = cand[l]
        picked = []
        while len(picked) < a.step and ptr[l] < len(c):
            t = c[ptr[l]]
            ptr[l] += 1
            if not inv[t] and counts[l][t] > 0:
                picked.append(t)
        if not picked:
            break
        add(picked[:max(1, min(len(picked), a.max_size - size()))])
    v_min = size()
    # pad to a multiple of `round` with the most frequent tokens of the whole corpus, never past max-size
    allc = sum(c / tot[l] for l, c in counts.items()) + chat_counts / max(chat_counts.sum(), 1)
    order = np.argsort(-np.where(allowed & ~inv, allc, -1), kind='stable')
    target = min(a.max_size, -(-v_min // a.round) * a.round)
    add([t for t in order[:max(0, target - size()) * 2] if allowed[t] and not inv[t]][:target - size()])

    ids = np.flatnonzero(inv)
    eos = base.llm_eos
    vocab = Vocab(a.llm, v_llm, np.concatenate([np.full(NSPEC, -1, dtype=np.int64), ids.astype(np.int64)]), a.min_count, eos)
    vocab.save(a.out)

    def coverage_of(vb: Vocab, c: np.ndarray) -> float:
        m = vb.llm2slm != UNK
        return float(c[m].sum() / max(c.sum(), 1))

    def oov_dev(vb: Vocab) -> dict:
        tot_t = oov = 0
        for u in corpus.users:
            if u['split'] != 'dev':
                continue
            for s in u['segs']:
                t = vb.llm2slm[s[2]]
                tot_t += len(t)
                oov += int((t == UNK).sum())
        return {'oov_rate': oov / max(tot_t, 1), 'tokens': tot_t}

    def oov_multi(vb: Vocab) -> dict:
        from ws.vocab import get_tokenizer
        tk, out = get_tokenizer(a.llm), {}
        d = os.path.join(a.data, 'multi')
        for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if fn.endswith('.jsonl'):
                texts = [json.loads(l)['text'] for l in open(os.path.join(d, fn)) if l.strip()]
                n = o = 0
                for e in tk(texts, add_special_tokens=False)['input_ids']:
                    t = vb.llm2slm[np.asarray(e, dtype=np.int64)]
                    n += len(t); o += int((t == UNK).sum())
                out[fn[:-6]] = o / max(n, 1)
        return out

    rep = {'v': vocab.v_sub, 'v_before_rounding': v_min, 'capped_at_max_size': capped, 'coverage_target': a.coverage,
           'local_ids': int(base.v_sub - NSPEC), 'pretrain_ids_added': int(vocab.v_sub - base.v_sub),
           'coverage_train': {l: coverage_of(vocab, counts[l]) for l in counts},
           'coverage_dev': {l: coverage_of(vocab, dev_counts[l]) for l in counts if dev_counts[l].sum()},
           'coverage_chat': coverage_of(vocab, chat_counts),
           'coverage_train_local_only_vocab': {l: coverage_of(base, counts[l]) for l in counts},
           'oov_wikipedia_paragraphs': oov_multi(vocab), 'oov_wikipedia_paragraphs_local_only_vocab': oov_multi(base),
           'local_dev_targets': oov_dev(vocab), 'local_dev_targets_local_only_vocab': oov_dev(base)}
    for k, v in rep.items():
        print(json.dumps({k: v}), flush=True)
    with open(os.path.splitext(a.out)[0] + '.report.json', 'w') as f:
        json.dump(rep, f, indent=1)


if __name__ == '__main__':
    main()
