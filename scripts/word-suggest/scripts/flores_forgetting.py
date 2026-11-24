"""Forgetting in FLORES-200: per-language teacher-forced NLL and acc@1 of several SLM checkpoints, against the first (the base), with paired bootstrap
intervals over the sentences.

  .venv/bin/python scripts/flores_forgetting.py base=runs/lora/flores/base ft=runs/lora/flores/ft_today lora=runs/lora/flores/r32o \
      [--boot 1000] [--variant slm] [--md out.md]

Each argument is label=<scripts/eval.py --split dev --surface flores --llm none --variants slm --out dir>. The first is the reference. Per language: the NLL
in nats per token (pooled over its sentences) and acc@1 (the share of right suggestions with one letter typed; for languages written without
spaces eval.py reports char_acc instead, and that is used). Then the mean over languages of each, and for every run after the first the mean
difference from the first (negative NLL = better; positive acc = better) with a 95% paired bootstrap interval (sentences resampled within each
language, the same sentences for every run), the number of languages that got worse by more than 0.01 nats, and the worst language.
acc@1 over a sentence is weighted by its words (the words longer than one letter are not in scores.jsonl: an approximation of the pooled figure
in metrics.jsonl, which the tables print).
"""
import argparse
import json
import os
import sys

import numpy as np


def load(path, variant):
    per = {}
    with open(os.path.join(path, 'scores.jsonl')) as f:
        for l in f:
            r = json.loads(l)
            if r.get('variant') != variant:
                continue
            acc = r.get('acc@1')
            if acc is None:
                acc = r.get('char_acc')
            per.setdefault(r['lang'], {})[r['id']] = (r['n_tokens'], r['nll'] * r['n_tokens'], acc, max(r.get('n_words', 0), 1) if r.get('acc@1') is not None else max(r.get('char_n', 1), 1))
    pooled = {}
    with open(os.path.join(path, 'metrics.jsonl')) as f:
        for l in f:
            r = json.loads(l)
            if r.get('variant') == variant:
                for k, v in r.items():
                    if k.startswith('lang.') and (k.endswith('.nll') or k.endswith('.acc@1') or k.endswith('.char_acc')):
                        lang, m = k[5:].rsplit('.', 1)
                        pooled.setdefault(lang, {})[m] = v
    return per, pooled


def score(arr, idx):
    """(nll per token, acc) of the sentences idx; arr columns: tokens, nll sum, acc, weight."""
    a = arr[idx]
    nll = a[:, 1].sum() / a[:, 0].sum()
    ok = ~np.isnan(a[:, 2])
    acc = (a[ok, 2] * a[ok, 3]).sum() / a[ok, 3].sum() if ok.any() else float('nan')
    return nll, acc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('runs', nargs='+')
    ap.add_argument('--boot', type=int, default=1000)
    ap.add_argument('--variant', default='slm')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--md', default=None)
    ap.add_argument('--tol', type=float, default=0.01, help='a language counts as worse when its NLL is higher by more than this (nats)')
    a = ap.parse_args()
    labels, data = [], []
    for spec in a.runs:
        lab, _, path = spec.partition('=')
        labels.append(lab)
        data.append(load(path, a.variant))
    langs = sorted(set.intersection(*[set(d[0]) for d in data]))
    ids = {l: sorted(set.intersection(*[set(d[0][l]) for d in data])) for l in langs}
    arrs = [{l: np.array([[*d[0][l][i][:2], np.nan if d[0][l][i][2] is None else d[0][l][i][2], d[0][l][i][3]] for i in ids[l]], dtype=float) for l in langs} for d in data]
    rng = np.random.RandomState(a.seed)
    n_run = len(labels)
    full = np.array([[score(arrs[r][l], np.arange(len(ids[l]))) for l in langs] for r in range(n_run)])      # [run, lang, (nll, acc)]
    boots = np.zeros((a.boot, n_run, len(langs), 2))
    for b in range(a.boot):
        for li, l in enumerate(langs):
            idx = rng.randint(0, len(ids[l]), len(ids[l]))
            for r in range(n_run):
                boots[b, r, li] = score(arrs[r][l], idx)
    out = []
    out.append(f'{len(langs)} languages, {sum(len(v) for v in ids.values())} sentences, paired bootstrap {a.boot}\n')
    out.append('| language | ' + ' | '.join(f'{x} NLL | {x} acc@1' for x in labels) + ' |')
    out.append('|---|' + '---|' * (2 * n_run))
    for li, l in enumerate(langs):
        out.append(f'| {l} | ' + ' | '.join(f'{full[r, li, 0]:.3f} | {100 * full[r, li, 1]:.1f}' for r in range(n_run)) + ' |')
    mean = full.mean(1)
    bm = boots.mean(2)
    out.append('| **mean over languages** | ' + ' | '.join(f'{mean[r, 0]:.3f} | {100 * mean[r, 1]:.1f}' for r in range(n_run)) + ' |')
    out.append('\nAgainst ' + labels[0] + ':\n')
    out.append(f'| run | mean NLL change (nats) [95% interval] | mean acc@1 change (points) [95% interval] | languages worse by more than {a.tol:.2f} nats | worst language (NLL change) |')
    out.append('|---|---|---|---|---|')
    for r in range(1, n_run):
        dn = bm[:, r, 0] - bm[:, 0, 0]
        da = bm[:, r, 1] - bm[:, 0, 1]
        lang_d = full[r, :, 0] - full[0, :, 0]
        w = int((lang_d > a.tol).sum())
        worst = int(np.argmax(lang_d))
        out.append(f'| {labels[r]} | {mean[r, 0] - mean[0, 0]:+.4f} [{np.percentile(dn, 2.5):+.4f}, {np.percentile(dn, 97.5):+.4f}] | '
                   f'{100 * (mean[r, 1] - mean[0, 1]):+.2f} [{100 * np.percentile(da, 2.5):+.2f}, {100 * np.percentile(da, 97.5):+.2f}] | {w} of {len(langs)} | '
                   f'{langs[worst]} ({lang_d[worst]:+.3f}) |')
    text = '\n'.join(out)
    print(text)
    if a.md:
        open(a.md, 'w').write(text + '\n')


if __name__ == '__main__':
    main()
