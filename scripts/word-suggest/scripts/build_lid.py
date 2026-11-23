#!/usr/bin/env python3
"""The release's language guess (lid.json + lid.bin): naive Bayes over Qwen token ids, from the pretraining text.

    # 1. count Qwen ids per FLORES language over the web shards of data/pretrain200b (streamed, never loaded whole)
    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/build_lid.py count --procs 6 --out release/_work/lid_counts.npz
    # 2. choose the smoothing on FLORES-200 *dev*, write lid.json + lid.bin, report accuracy
    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/build_lid.py build --counts release/_work/lid_counts.npz \
        --out release/hydor-suggest-49m --top 20000

Language codes: FLORES-200 (the keys of runs/gate/*_switch.json).  The corpus' configs are FineWeb-2's (data/pretrain200b/manifest.json
lists the FLORES codes each serves); MAP below handles the ones that differ.  Chats are not counted (web text only: FineWeb-2,
FineWeb-Edu for English, and the Wikipedia / MADLAD-400 top-ups in the `_b` shards, whose token counts are statistics, not text).

lid.bin: uint32 little-endian ids [languages x top], then float16 log-probabilities [languages x top] (natural log).
lid.json: {"format": "hydor-suggest-lid/1", "languages": [...], "top": N, "floor": [per language: log-probability of a token outside
its top N]}.  Scoring a context: for each language, the sum over the context's token ids of (table value, or the floor);
posterior = softmax over languages (uniform prior).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
from multiprocessing import Pool

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import numpy as np  # noqa: E402

PRE = os.path.join(ROOT, 'data', 'pretrain200b')
SWITCH = os.path.join(ROOT, 'runs', 'gate', 'flores_pre50b_30m_cmix_switch.json')
V = 248320                      # Qwen3.5's output rows; every id the tokenizer gives is below it
MIN_TOKENS = 100_000            # a language with less text than this has no profile

# corpus config -> FLORES code, where they differ (from the manifest's `flores` lists; FineWeb-2 uses other codes for these)
MAP = {'ekk_Latn': 'est_Latn', 'fas_Arab': 'pes_Arab', 'fil_Latn': 'tgl_Latn', 'gug_Latn': 'grn_Latn', 'kwy_Latn': 'kon_Latn',
       'yue_Hani': 'yue_Hant', 'cmn_Hani': 'zho_Hans', 'twi_Latn': 'twi_Latn'}
# FLORES codes served by a config that also serves another one: the corpus cannot tell them apart, so only the first gets a profile
SHARED_LEFT_OUT = {'zho_Hant': 'cmn_Hani (FineWeb-2 mixes Simplified and Traditional: only zho_Hans gets it)',
                   'aka_Latn': 'twi_Latn (FineWeb-2 has one Akan/Twi config: only twi_Latn gets it)'}


def config_to_flores() -> dict:
    return {cfg: MAP.get(cfg, cfg) for cfg in json.load(open(os.path.join(PRE, 'manifest.json')))['languages']}


def count_task(args):
    flo, shards, chunk = args
    counts = np.zeros(V, dtype=np.int64)
    total = 0
    for p in shards:
        a = np.load(p, mmap_mode='r')
        for i in range(0, len(a), chunk):
            x = np.asarray(a[i:i + chunk])
            counts += np.bincount(x, minlength=V)[:V] if x.max(initial=0) < V else np.bincount(np.minimum(x, V - 1), minlength=V)[:V]
            total += len(x)
    return flo, counts, total, [os.path.basename(p) for p in shards]


def cmd_count(a):
    c2f = config_to_flores()
    by_flo: dict = {}
    for cfg, flo in c2f.items():
        sh = sorted(glob.glob(os.path.join(PRE, f'web_{cfg}.train.tok.npy')) + glob.glob(os.path.join(PRE, f'web_{cfg}_b.train.tok.npy')))
        sh = [os.path.realpath(p) for p in sh]
        if sh:
            by_flo.setdefault(flo, []).extend(sh)
    jobs = sorted(by_flo.items(), key=lambda kv: -sum(os.path.getsize(p) for p in kv[1]))      # biggest first
    t0 = time.time()
    out, tot, shards = {}, {}, {}
    with Pool(a.procs) as pool:
        for k, (flo, counts, total, names) in enumerate(pool.imap_unordered(count_task, [(f, s, 20_000_000) for f, s in jobs])):
            out[flo], tot[flo], shards[flo] = counts, total, names
            print(f'{k + 1}/{len(jobs)} {flo} {total / 1e6:.1f}M tokens ({time.time() - t0:.0f}s)', flush=True)
    langs = sorted(out)
    np.savez(a.out, languages=np.array(langs), counts=np.stack([out[l] for l in langs]), tokens=np.array([tot[l] for l in langs]))
    json.dump({l: shards[l] for l in langs}, open(a.out + '.shards.json', 'w'))
    print('saved', a.out, len(langs), 'languages')


# ---- profile -------------------------------------------------------------------------------------------------------------------
def tables(counts: np.ndarray, k: float, top: int | None):
    """-> (ids [L, top] int64, logp [L, top] float64, floor [L]) with add-k smoothing over the V Qwen ids.

    p(t) = (c(t) + k) / (T + k V).  The floor of a language is the log of the average probability of the ids outside its top N,
    so each language's table + floor is a normalised distribution."""
    L = counts.shape[0]
    tot = counts.sum(1, dtype=np.float64)
    denom = tot + k * V
    if top is None:
        top = V
    ids = np.zeros((L, top), dtype=np.int64)
    lp = np.zeros((L, top))
    floor = np.zeros(L)
    for i in range(L):
        c = counts[i]
        o = np.argpartition(-c, top - 1)[:top] if top < V else np.arange(V)
        o = o[np.argsort(-c[o], kind='stable')]
        p = (c[o] + k) / denom[i]
        ids[i], lp[i] = o, np.log(p)
        tail = max(1.0 - p.sum(), 1e-12)
        floor[i] = np.log(tail / max(V - top, 1))
    return ids, lp, floor


def dense(ids, lp, floor) -> np.ndarray:
    """[L, V] float32 table (what the engine looks up): floor everywhere, the stored values at the top ids."""
    L = ids.shape[0]
    W = np.repeat(floor[:, None].astype(np.float32), V, axis=1)
    for i in range(L):
        W[i, ids[i]] = lp[i].astype(np.float16).astype(np.float32)        # as stored: float16
    return W


# ---- evaluation on FLORES-200 dev ------------------------------------------------------------------------------------------------
def load_dev(languages, cache: str):
    if os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        return list(z['ids']), z['lang'], z['seq']
    from tokenizers import Tokenizer
    tk = Tokenizer.from_file(os.path.join(ROOT, 'release', 'hydor-suggest-49m', 'tokenizer.json'))
    ids, lang, seq = [], [], []
    for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'flores', '*.jsonl'))):
        flo = os.path.basename(p)[:-6]
        rows = [json.loads(l) for l in open(p)]
        rows = [r for r in rows if r.get('split') == 'dev']                 # DEV ONLY
        enc = tk.encode_batch([r['text'] for r in rows], add_special_tokens=False)
        for r, e in zip(rows, enc):
            ids.append(np.array(e.ids, dtype=np.int32))
            lang.append(flo)
            seq.append(r['idx'])
    o = np.empty(len(ids), dtype=object)
    for i, x in enumerate(ids):
        o[i] = x
    np.savez(cache, ids=o, lang=np.array(lang), seq=np.array(seq))
    return ids, np.array(lang), np.array(seq)


def scores_at(W: np.ndarray, ids: list, cuts=(8, 16, 32, None)):
    """Per sentence and cut: log-score of every language over the first `cut` ids (all for None).  -> {cut: [n, L] float32} and the
    mask of sentences having at least `cut` tokens."""
    L = W.shape[0]
    out = {c: np.zeros((len(ids), L), dtype=np.float32) for c in cuts}
    have = {c: np.zeros(len(ids), dtype=bool) for c in cuts}
    WT = np.ascontiguousarray(W.T)                      # [V, L]: one row gather per token
    for i, x in enumerate(ids):
        for c in cuts:
            y = x if c is None else x[:c]
            have[c][i] = (c is None) or len(x) >= c
            if len(y):
                out[c][i] = WT[y].sum(0)
    return out, have


def posterior(s: np.ndarray) -> np.ndarray:
    z = s - s.max(1, keepdims=True)
    e = np.exp(z.astype(np.float64))
    return e / e.sum(1, keepdims=True)


def evaluate(W, languages, ids, lang, cuts=(8, 16, 32, None), detail=False):
    lidx = {l: i for i, l in enumerate(languages)}
    y = np.array([lidx.get(l, -1) for l in lang])
    sc, have = scores_at(W, ids, cuts)
    res = {}
    for c in cuts:
        m = have[c] & (y >= 0)
        post = posterior(sc[c][m])
        pred, conf = post.argmax(1), post.max(1)
        ok = pred == y[m]
        hi = conf >= 0.9
        res['whole' if c is None else f'first{c}'] = {
            'n': int(m.sum()), 'acc': float(ok.mean()), 'share_ge_0.9': float(hi.mean()),
            'acc_ge_0.9': float(ok[hi].mean()) if hi.any() else float('nan'),
            'acc_ge_0.99': float(ok[conf >= 0.99].mean()) if (conf >= 0.99).any() else float('nan'),
            'share_ge_0.99': float((conf >= 0.99).mean())}
        if detail:
            res['_' + ('whole' if c is None else f'first{c}')] = dict(pred=pred, y=y[m], conf=conf, idx=np.flatnonzero(m))
    return res


def cmd_build(a):
    z = np.load(a.counts)
    languages, counts, tokens = [str(x) for x in z['languages']], z['counts'], z['tokens']
    keep = [i for i, t in enumerate(tokens) if t >= MIN_TOKENS]
    left_out = {languages[i]: f'{int(tokens[i])} web tokens (< {MIN_TOKENS})' for i in range(len(languages)) if i not in keep}
    languages, counts, tokens = [languages[i] for i in keep], counts[keep], tokens[keep]
    print(len(languages), 'languages; left out for lack of text:', left_out)
    cache = os.path.join(os.path.dirname(a.counts), 'flores_dev_ids.npz')
    ids, lang, seq = load_dev(languages, cache)
    print('FLORES dev sentences:', len(ids), 'in', len(set(lang)), 'languages')
    best = None
    grid = []
    for k in [float(x) for x in a.k_grid.split(',')]:
        ti, tl, tf = tables(counts, k, a.top)
        W = dense(ti, tl, tf)
        r = evaluate(W, languages, ids, lang)
        grid.append({'k': k, 'whole': r['whole']['acc'], 'first8': r['first8']['acc'], 'first16': r['first16']['acc'],
                     'first32': r['first32']['acc'], 'whole_acc_ge_0.9': r['whole']['acc_ge_0.9'], 'whole_share_ge_0.9': r['whole']['share_ge_0.9'],
                     'first8_acc_ge_0.9': r['first8']['acc_ge_0.9'], 'first8_share_ge_0.9': r['first8']['share_ge_0.9']})
        print(json.dumps(grid[-1]), flush=True)
        score = r['whole']['acc'] + r['first8']['acc']
        if best is None or score > best[0]:
            best = (score, k, ti, tl, tf, W, r)
    _, k, ti, tl, tf, W, r = best
    print('chosen k =', k)
    # write
    L, N = ti.shape
    with open(os.path.join(a.out, 'lid.bin'), 'wb') as f:
        f.write(ti.astype('<u4').tobytes())
        f.write(tl.astype('<f2').tobytes())
    json.dump({'format': 'hydor-suggest-lid/1', 'languages': languages, 'top': int(N), 'floor': [round(float(x), 5) for x in tf]},
              open(os.path.join(a.out, 'lid.json'), 'w'))
    # report, from the written files (reload) so the numbers are the release's
    lid = json.load(open(os.path.join(a.out, 'lid.json')))
    raw = np.fromfile(os.path.join(a.out, 'lid.bin'), dtype='<u4', count=L * N).reshape(L, N)
    lp = np.fromfile(os.path.join(a.out, 'lid.bin'), dtype='<f2', offset=L * N * 4).reshape(L, N).astype(np.float64)
    W2 = dense(raw.astype(np.int64), lp, np.array(lid['floor']))
    r = evaluate(W2, lid['languages'], ids, lang, detail=True)
    rep = {k_: v for k_, v in r.items() if not k_.startswith('_')}
    # confusions on whole sentences
    d = r['_whole']
    conf_pairs = {}
    for p_, t_ in zip(d['pred'], d['y']):
        if p_ != t_:
            key = (lid['languages'][t_], lid['languages'][p_])
            conf_pairs[key] = conf_pairs.get(key, 0) + 1
    top_conf = sorted(conf_pairs.items(), key=lambda kv: -kv[1])[:40]
    per_lang = {}
    for t_ in np.unique(d['y']):
        m = d['y'] == t_
        per_lang[lid['languages'][t_]] = float((d['pred'][m] == t_).mean())
    # sentences of languages without a profile: what they are guessed as
    no_prof = {}
    lset = set(lid['languages'])
    sc_all, _ = scores_at(W2, [x for x, l in zip(ids, lang) if l not in lset], cuts=(None,))
    extra_lang = [l for l in lang if l not in lset]
    if extra_lang:
        pr = posterior(sc_all[None]).argmax(1)
        for l, p_ in zip(extra_lang, pr):
            no_prof.setdefault(l, {}).setdefault(lid['languages'][p_], 0)
            no_prof[l][lid['languages'][p_]] += 1
    worst = sorted(per_lang.items(), key=lambda kv: kv[1])[:25]
    summary = dict(k=k, top=N, languages=len(lid['languages']), results=rep, grid=grid, top_confusions=[[t, p, n] for (t, p), n in top_conf],
                   worst_languages_whole=worst, mean_per_language_whole=float(np.mean(list(per_lang.values()))),
                   no_profile_guessed_as={l: sorted(v.items(), key=lambda kv: -kv[1])[:3] for l, v in no_prof.items()},
                   left_out_no_text=left_out, shared_left_out=SHARED_LEFT_OUT,
                   bytes=os.path.getsize(os.path.join(a.out, 'lid.bin')))
    json.dump(summary, open(os.path.join(os.path.dirname(a.counts), 'lid_report.json'), 'w'), indent=1)
    print(json.dumps({k_: v for k_, v in summary.items() if k_ not in ('grid',)}, indent=1)[:6000])


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('count')
    c.add_argument('--procs', type=int, default=6)
    c.add_argument('--out', required=True)
    b = sub.add_parser('build')
    b.add_argument('--counts', required=True)
    b.add_argument('--out', required=True)
    b.add_argument('--top', type=int, default=20000)
    b.add_argument('--k-grid', default='0.003,0.01,0.03,0.1,0.3')
    a = ap.parse_args()
    {'count': cmd_count, 'build': cmd_build}[a.cmd](a)


if __name__ == '__main__':
    main()
