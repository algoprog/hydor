# Fits embedding quantizers on the calibration vectors and measures retrieval quality on the cached
# benchmark vectors: float32 queries against quantized documents (what the app does). CPU only, in chunks,
# so it stays under ~3 GB. Usage: python -I quant.py OUT_DIR [sets...]
import json, os, sys
import numpy as np
import torch

OUT = sys.argv[1]
torch.set_num_threads(8)
SETS = sys.argv[2:] or ['scifact', 'nfcorpus', 'arguana', 'scidocs', 'fiqa', 'miracl-fr', 'miracl-de', 'miracl-es', 'miracl-ar', 'quora']
torch.manual_seed(0)
cal_all = torch.tensor(np.load(f'{OUT}/calibration.fp16.npz')['docs'])
perm = torch.randperm(len(cal_all))
cal, held = cal_all[perm[: int(0.9 * len(perm))]], cal_all[perm[int(0.9 * len(perm)) :]]
D = cal.shape[1]
CH = 16384


def uniform(lo, hi, K):
    return lo[:, None] + (hi - lo)[:, None] * torch.arange(K)[None, :] / (K - 1)


def codes_of(X, L):
    T = ((L[:, 1:] + L[:, :-1]) / 2).contiguous()
    out = torch.empty(X.shape, dtype=torch.uint8)
    for a in range(0, len(X), CH):
        out[a : a + CH] = torch.searchsorted(T, X[a : a + CH].T.contiguous()).T.to(torch.uint8)
    return out


def dequant(C, L):
    return L[torch.arange(L.shape[0])[None, :], C.long()]


def lloyd_max(X, K, iters=40):
    L = torch.quantile(X, (torch.arange(K) + 0.5) / K, dim=0).T.contiguous()
    for _ in range(iters):
        C = codes_of(X, L).long().T
        S = torch.zeros(D, K).scatter_add_(1, C, X.T)
        N = torch.zeros(D, K).scatter_add_(1, C, torch.ones_like(X.T))
        L = torch.where(N > 0, S / N.clamp(min=1), L)
        L, _ = torch.sort(L, dim=1)
    return L


def mse(X, L):
    return float(((dequant(codes_of(X, L), L) - X) ** 2).sum(1).mean())


def fit(X, kind, K):
    if kind == 'minmax':
        return uniform(X.min(0).values, X.max(0).values, K)
    if kind.startswith('p'):
        a = float(kind[1:])
        return uniform(torch.quantile(X, a, dim=0), torch.quantile(X, 1 - a, dim=0), K)
    if kind == 'lloydmax':
        return lloyd_max(X, K)
    raise ValueError(kind)


choices = ['minmax', 'p0.001', 'p0.005', 'p0.01', 'p0.02']
errs = {c: mse(held, fit(cal, c, 16)) for c in choices}
errs['lloydmax'] = mse(held, fit(cal, 'lloydmax', 16))
best_uniform = min(choices, key=errs.get)
print('held-out reconstruction error, int4:', {k: round(v, 5) for k, v in errs.items()}, flush=True)
LM = fit(cal, 'lloydmax', 16)
LEVELS = {
    'int8 (calibrated min-max)': (fit(cal, 'minmax', 256), False),
    f'int4 uniform ({best_uniform})': (fit(cal, best_uniform, 16), False),
    'int4 Lloyd-Max': (LM, False),
    'int4 Lloyd-Max, renormalized': (LM, True),
}
np.save(f'{OUT}/int4-lloydmax-levels.npy', LM.numpy())


def topk(Q, docs, N, exclude, k=100):
    """docs(a, b) gives float32 documents a..b; the best k per query over all of them."""
    out = []
    for qa in range(0, len(Q), 2048):
        Qb = Q[qa : qa + 2048]
        bs = torch.full((len(Qb), k), -1e9)
        bi = torch.zeros((len(Qb), k), dtype=torch.long)
        for a in range(0, N, CH):
            s = Qb @ docs(a, min(N, a + CH)).T
            for r, c in exclude:
                if qa <= r < qa + len(Qb) and a <= c < a + CH:
                    s[r - qa, c - a] = -1e9
            ts, ti = torch.topk(s, min(k, s.shape[1]), dim=1)
            ms, mi = torch.topk(torch.cat([bs, ts], 1), k, dim=1)
            bi = torch.gather(torch.cat([bi, ti + a], 1), 1, mi)
            bs = ms
        out.append(bi)
    return torch.cat(out).numpy()


def metrics(top, doc_ids, query_ids, qrels):
    nd, rc = [], []
    for qi, row in enumerate(top):
        rel = qrels[query_ids[qi]]
        got = [doc_ids[j] for j in row]
        dcg = sum(rel.get(d, 0) / np.log2(i + 2) for i, d in enumerate(got[:10]))
        idcg = sum(g / np.log2(i + 2) for i, g in enumerate(sorted(rel.values(), reverse=True)[:10]))
        nd.append(dcg / idcg if idcg else 0.0)
        rc.append(len(set(got) & set(rel)) / len(rel))
    return np.array(nd), np.array(rc)


def boot(diff, n=2000):
    rng = np.random.default_rng(0)
    m = diff[rng.integers(0, len(diff), (n, len(diff)))].mean(1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


path_r = f'{OUT}/quant-results.json'
results = json.load(open(path_r)) if os.path.exists(path_r) else {}
for name in SETS:
    path = f'{OUT}/{name}.fp16.npz'
    if not os.path.exists(path):
        print(f'{name}: not embedded, skipped', flush=True)
        continue
    z = np.load(path)
    doc_ids, query_ids = z['doc_ids'].tolist(), z['query_ids'].tolist()
    qrels = json.load(open(f'{OUT}/{name}.qrels.json'))
    Dm, Q = torch.from_numpy(z['docs']), torch.from_numpy(z['queries'])
    del z
    N = len(Dm)
    pos = {d: j for j, d in enumerate(doc_ids)}
    exclude = [(qi, pos[q]) for qi, q in enumerate(query_ids) if q in pos]
    base_top = topk(Q, lambda a, b: Dm[a:b], N, exclude)
    base_nd, base_rc = metrics(base_top, doc_ids, query_ids, qrels)
    row = {'float32': {'ndcg10': base_nd.mean(), 'recall100': base_rc.mean()}}
    variants = dict(LEVELS)
    variants['int4 Lloyd-Max, fit on this corpus'] = (fit(Dm[torch.randperm(N)[:40000]], 'lloydmax', 16), False)
    for label, (L, renorm) in variants.items():
        C = codes_of(Dm, L)
        f = (lambda a, b, C=C, L=L: torch.nn.functional.normalize(dequant(C[a:b], L), dim=-1)) if renorm else (lambda a, b, C=C, L=L: dequant(C[a:b], L))
        top = topk(Q, f, N, exclude)
        nd, rc = metrics(top, doc_ids, query_ids, qrels)
        overlap = float(np.mean([len(set(x[:10]) & set(y[:10])) / 10 for x, y in zip(top, base_top)]))
        row[label] = {'ndcg10': nd.mean(), 'recall100': rc.mean(), 'd_ndcg10': nd.mean() - base_nd.mean(), 'ci95': boot(nd - base_nd), 'overlap10': overlap}
        del C
    nd, rc = metrics(topk(Q, lambda a, b: torch.sign(Dm[a:b]), N, exclude), doc_ids, query_ids, qrels)
    row['binary (reference)'] = {'ndcg10': nd.mean(), 'recall100': rc.mean(), 'd_ndcg10': nd.mean() - base_nd.mean(), 'ci95': boot(nd - base_nd), 'overlap10': None}
    for tag, label in [('cpu', 'CPU worker (float32, table fp16)'), ('fp32', 'model in fp32 (reference)')]:
        p = f'{OUT}/{name}.{tag}.npz'
        if os.path.exists(p):
            zz = np.load(p)
            D2, Q2 = torch.from_numpy(zz['docs']), torch.from_numpy(zz['queries'])
            nd, rc = metrics(topk(Q2, lambda a, b: D2[a:b], len(D2), exclude), doc_ids, query_ids, qrels)
            cos = (D2 * Dm[: len(D2)]).sum(1)
            row[label] = {'ndcg10': nd.mean(), 'recall100': rc.mean(), 'd_ndcg10': nd.mean() - base_nd.mean(), 'ci95': boot(nd - base_nd), 'overlap10': None, 'cos_mean': float(cos.mean()), 'cos_min': float(cos.min())}
    results[name] = row
    json.dump(results, open(path_r, 'w'), indent=1, default=float)
    print(f'{name}: docs {N}, queries {len(query_ids)}', flush=True)
    for label, m in row.items():
        extra = f"  Δ {100 * m['d_ndcg10']:+.2f} [{100 * m['ci95'][0]:+.2f}, {100 * m['ci95'][1]:+.2f}]" if 'd_ndcg10' in m else ''
        ov = f"  top-10 overlap {m['overlap10']:.3f}" if m.get('overlap10') is not None else ''
        cs = f"  cos vs GPU fp16 mean {m['cos_mean']:.5f} min {m['cos_min']:.5f}" if 'cos_mean' in m else ''
        print(f"  {label:38s} nDCG@10 {100 * m['ndcg10']:6.2f}  R@100 {100 * m['recall100']:6.2f}{extra}{ov}{cs}", flush=True)
    del Dm, Q

labels = sorted({k for r in results.values() for k in r if k != 'float32'})
print('\nmean over sets, nDCG@10 change vs float32 (points):', flush=True)
for label in labels:
    ds = [100 * r[label]['d_ndcg10'] for r in results.values() if label in r]
    rs = [100 * (r[label]['recall100'] - r['float32']['recall100']) for r in results.values() if label in r]
    print(f'  {label:38s} mean {np.mean(ds):+.2f}  worst {min(ds):+.2f}  R@100 mean {np.mean(rs):+.2f}  ({len(ds)} sets)', flush=True)
