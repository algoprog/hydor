#!/usr/bin/env python3
"""A personal model's meta.json: per-language token counts of your own typed text, by the release's language guess (the file
describes private writing: it stays with the personal model, never published).

    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/personal_meta.py --release release/hydor-suggest-49m --out release/personal-49m \
        --ckpt runs/slm/pre50b_30m_cmix_w4_replay_b4k/ckpt.pt

Each message is cut into pieces (at line ends and after . ! ? ;), pieces under 8 tokens are joined to the next, and every piece's tokens are
counted for the language the naive-Bayes guess (lid.json / lid.bin) gives it with the engine's rule: a posterior of at least 0.9 over at
least 8 tokens, and only for pieces that are text (letters are at least 80% of their non-space characters: code, paths and URLs
are guessed as arb_Latn or vec_Latn with a high posterior, which would count as someone's languages); the rest is `unassigned`.  Counts are of Qwen3.5 tokens of the typed text
(data/user_msgs.jsonl `text`): "languages" from the train split (what the personal model was trained on), "languages_all_splits" from all.
Prints numbers only, never the messages.
"""
import argparse
import collections
import json
import os
import re
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
from tokenizers import Tokenizer  # noqa: E402

import build_lid as B  # noqa: E402


def load_lid(rel):
    lid = json.load(open(os.path.join(rel, 'lid.json')))
    L, N = len(lid['languages']), lid['top']
    raw = np.fromfile(os.path.join(rel, 'lid.bin'), dtype='<u4', count=L * N).reshape(L, N)
    lp = np.fromfile(os.path.join(rel, 'lid.bin'), dtype='<f2', offset=L * N * 4).reshape(L, N).astype(np.float64)
    W = B.dense(raw.astype(np.int64), lp, np.array(lid['floor']))
    return lid['languages'], np.ascontiguousarray(W.T)


def pieces(tk, text, min_tokens=8):
    """-> [(token ids, letter share of the piece's non-space characters)]"""
    segs = [s for s in re.split(r'(?<=[.!?;])\s+|\n+', text) if s and s.strip()]
    out, cur, curt = [], [], ''
    for s in segs:
        cur += tk.encode(s, add_special_tokens=False).ids
        curt += ' ' + s
        if len(cur) >= min_tokens:
            out.append((cur, curt))
            cur, curt = [], ''
    if cur:
        if out:
            out[-1] = (out[-1][0] + cur, out[-1][1] + curt)
        else:
            out.append((cur, curt))
    res = []
    for ids, t in out:
        ns = [ch for ch in t if not ch.isspace()]
        res.append((ids, sum(ch.isalpha() for ch in ns) / max(1, len(ns))))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--release', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ckpt', required=True)
    a = ap.parse_args()
    tk = Tokenizer.from_file(os.path.join(a.release, 'tokenizer.json'))
    langs, WT = load_lid(a.release)
    by = {'train': collections.Counter(), 'all': collections.Counter()}
    n_msgs = collections.Counter()
    for line in open(os.path.join(ROOT, 'data', 'user_msgs.jsonl')):
        r = json.loads(line)
        text = r.get('text') or ''
        for piece, letters in pieces(tk, text):
            if not piece:
                continue
            sc = WT[piece].sum(0)
            post = B.posterior(sc[None])[0]
            l = langs[int(post.argmax())] if (len(piece) >= 8 and letters >= 0.8 and post.max() >= 0.9) else 'unassigned'
            by['all'][l] += len(piece)
            if r.get('split') == 'train':
                by['train'][l] += len(piece)
        n_msgs['all'] += 1
        n_msgs[r.get('split')] += 1
    m = [json.loads(l) for l in open(os.path.join(os.path.dirname(a.ckpt), 'metrics.jsonl'))]
    fin = [d for d in m if 'final_tokens' in d][-1]
    ck_ms = int(os.path.getmtime(a.ckpt) * 1000)
    un = {k: by[k].pop('unassigned', 0) for k in by}
    meta = {'trained_at': ck_ms, 'tokens': int(fin['final_tokens']), 'languages': dict(by['train'].most_common()),
            'dev_nll': float(fin['best_dev_nll']), 'languages_from': 'train split of data/user_msgs.jsonl (what the model was trained on)',
            'languages_all_splits': dict(by['all'].most_common()),
            'unassigned_tokens': un['train'], 'unassigned_tokens_all_splits': un['all']}
    p = os.path.join(a.out, 'meta.json')
    with open(p, 'w') as f:
        json.dump(meta, f, indent=1)
    os.chmod(p, 0o600)
    print(json.dumps({'messages': dict(n_msgs), 'tokens_train_assigned': sum(by['train'].values()),
                      'trained_at': meta['trained_at'], 'tokens': meta['tokens'], 'dev_nll': meta['dev_nll'],
                      'unassigned_train': un['train'], 'languages_train_top': dict(list(meta['languages'].items())[:8]), 'n_languages_train': len(meta['languages'])}))


if __name__ == '__main__':
    main()
