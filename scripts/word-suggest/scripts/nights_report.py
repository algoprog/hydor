#!/usr/bin/env python
"""Tables from the logs of scripts/nights_sim.py (counts and losses only): metric by night, and the end results.

  python scripts/nights_report.py runs/nights --arms P,A,B,B2,C,D,R curves
  python scripts/nights_report.py runs/nights --arms A,B,C,D,R final
"""
import argparse
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'))
from ws.nights import FLORES_LANGS, LOW_RESOURCE  # noqa: E402


def read(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def acc1(c):
    """acc@1 for a language (char accuracy for the languages without spaces)."""
    if c.get('acc_n@1'):
        return c['acc_hit@1'] / c['acc_n@1']
    if c.get('char_n'):
        return c['char_hit'] / c['char_n']
    return float('nan')


def flores_summary(fl):
    a = {lg: acc1(c) for lg, c in fl.items()}
    nll = {lg: c['nll_nats'] / c['n_tokens'] for lg, c in fl.items() if c.get('n_tokens')}
    oth = [a[l] for l in FLORES_LANGS if l != 'eng_Latn']
    low = [a[l] for l in LOW_RESOURCE]
    return {'en': a['eng_Latn'], 'others': float(np.mean(oth)), 'low': float(np.mean(low)), 'all': float(np.mean(list(a.values()))),
            'nll_en': nll['eng_Latn'], 'nll_all': float(np.mean(list(nll.values())))}, a


def curves(root, arms, every):
    logs = {a: read(os.path.join(root, a, 'log.jsonl')) for a in arms}
    # evals by night
    print('\n## Along the nights (evals every few nights). pub = macro loss (nats/token) on held-out public text, 16 languages + chats')
    print('FLORES = acc@1 (char accuracy for zh, ja) teacher forced on FLORES-200 dev; en, mean of the 22 others, mean of 10 low-resource, loss of all')
    pos_all = sorted({r['night'] for a in arms for r in logs[a] if r['t'] == 'eval'})
    hdr = f"{'night':>5} {'day':>5} " + ' | '.join(f'{a:^43}' for a in arms)
    print(hdr)
    print(f"{'':>11} " + ' | '.join(f"{'pub':>6} {'FL en':>6} {'oth':>6} {'low':>6} {'early':>6} {'dev':>6}" for _ in arms))
    pub_at = {a: {} for a in arms}
    for a in arms:
        for r in logs[a]:
            if r['t'] == 'night':
                pub_at[a][r['pos']] = r['pub']['macro']
            if r['t'] == 'start':
                pub_at[a][-1] = r['pub']['macro']
    for p in pos_all:
        row = f'{p + 1:>5} '
        day = None
        cells = []
        for a in arms:
            ev = next((r for r in logs[a] if r['t'] == 'eval' and r['night'] == p), None)
            if ev is None:
                cells.append(' ' * 43)
                continue
            day = ev['day']
            s, _ = flores_summary(ev['flores'])
            early = ev['early']['nll_nats'] / ev['early']['n_tokens']
            dev = ev.get('devfix')
            devs = f"{dev['nll_nats'] / dev['n_tokens']:.3f}" if dev else '   -  '
            cells.append(f"{pub_at[a].get(p, float('nan')):6.3f} {s['en']:6.3f} {s['others']:6.3f} {s['low']:6.3f} {early:6.3f} {devs:>6}")
        print(row + f'{day:>5} ' + ' | '.join(cells))
    # prequential: the next day's messages, in blocks of `every` nights
    print(f'\n## The next days\' messages (teacher forced, the model of the night before): NLL per token / acc@1, blocks of {every} nights')
    blocks = {}
    for a in arms:
        for r in logs[a]:
            if r['t'] == 'night' and r.get('pq'):
                b = r['pos'] // every
                c = blocks.setdefault((a, b), {})
                for k, v in r['pq'].items():
                    c[k] = c.get(k, 0) + v
    nb = max(b for _, b in blocks) + 1
    print(f"{'block':>5} " + ' | '.join(f'{a:^15}' for a in arms))
    for b in range(nb):
        cells = []
        for a in arms:
            c = blocks.get((a, b))
            cells.append(f"{c['nll_nats'] / c['n_tokens']:6.3f} {c['acc_hit@1'] / c['acc_n@1']:6.3f} " if c else ' ' * 15)
        print(f'{b * every + 1:>5} ' + ' | '.join(cells))


def boot_diff(per_a, per_b, key_num, key_den, n=2000, seed=0):
    """Paired bootstrap over messages (ids) of ratio(sum num / sum den) of b minus a."""
    ids = sorted(set(per_a) & set(per_b))
    na = np.array([per_a[i][key_num] for i in ids], float)
    da = np.array([per_a[i][key_den] for i in ids], float)
    nb = np.array([per_b[i][key_num] for i in ids], float)
    db = np.array([per_b[i][key_den] for i in ids], float)
    rng = np.random.RandomState(seed)
    w = rng.multinomial(len(ids), np.ones(len(ids)) / len(ids), size=n).astype(float)
    d = (w @ nb) / (w @ db) - (w @ na) / (w @ da)
    pt = nb.sum() / db.sum() - na.sum() / da.sum()
    return pt, np.percentile(d, 2.5), np.percentile(d, 97.5)


def final(root, arms, base):
    print('\n## End of the dev period: FLORES-200 dev, acc@1 per language (n sentences per language as logged)')
    logs = {a: [r for r in read(os.path.join(root, a, 'log.jsonl')) if r['t'] == 'final'][-1] for a in arms}
    print(f"{'lang':<9} " + ' '.join(f'{a:>6}' for a in arms))
    for lg in FLORES_LANGS:
        print(f'{lg:<9} ' + ' '.join(f"{acc1(logs[a]['flores'][lg]):6.3f}" for a in arms))
    for name in ('en', 'others', 'low', 'all', 'nll_all'):
        print(f"{'<' + name + '>':<9} " + ' '.join(f"{flores_summary(logs[a]['flores'])[0][name]:6.3f}" for a in arms))
    print('\n## Test period messages, teacher forced (NLL per token, acc@1) with paired 95% interval of the difference to', base)
    per = {a: {r['id']: r for r in json.load(open(os.path.join(root, a, 'test_per_example.json')))} for a in arms}
    for a in arms:
        t = logs[a]['test']
        line = f"{a:>4}: nll {t['nll_nats'] / t['n_tokens']:.4f}  acc@1 {t['acc_hit@1'] / t['acc_n@1']:.4f}  early-msgs nll {logs[a]['early']['nll_nats'] / logs[a]['early']['n_tokens']:.4f}  pub {logs[a]['pub']['macro']:.4f}"
        if a != base:
            d1 = boot_diff(per[base], per[a], 'nll_nats', 'n_tokens')
            d2 = boot_diff(per[base], per[a], 'acc_hit@1', 'acc_n@1')
            line += f"   dNLL {d1[0]:+.4f} [{d1[1]:+.4f}, {d1[2]:+.4f}]  dacc {d2[0]:+.4f} [{d2[1]:+.4f}, {d2[2]:+.4f}]"
        print(line)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--arms', required=True)
    ap.add_argument('--every', type=int, default=10)
    ap.add_argument('--base', default='A')
    ap.add_argument('what', choices=['curves', 'final'])
    a = ap.parse_args()
    arms = a.arms.split(',')
    (curves(a.root, arms, a.every) if a.what == 'curves' else final(a.root, arms, a.base))
