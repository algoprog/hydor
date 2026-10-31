# Words (SQLite FTS5 with the app's tokenizer and query, BM25) against meaning (the int4 vectors the app keeps),
# and the two fused by reciprocal rank at several weights for the words. CPU only.
# Usage: python -I hybrid.py OUT_DIR WORK_DIR [sets...]
import json, os, re, sqlite3, sys, time
import numpy as np
import torch

OUT, WORK = sys.argv[1], sys.argv[2]
SETS = sys.argv[3:] or ['scifact', 'nfcorpus', 'arguana', 'scidocs', 'fiqa', 'miracl-fr', 'miracl-de', 'miracl-es', 'miracl-ar', 'quora']
torch.set_num_threads(8)
STOP = set('a an and are as at be but by can do does for from has have how i in is it its me my not of on or our so that the their them then there these they this to was we what when where which who why will with you your'.split())
WORD = re.compile(r'[\w][\w.-]*', re.UNICODE)


def words(text):
    out = []
    for w in WORD.findall(text.lower()):
        w = re.sub(r'[._-]+$', '', w)
        if len(w) > 1 and w not in STOP and w not in out and not w.startswith('_'):
            out.append(w)
    return out


def any_words(text):
    ws = words(text)[:32]
    if not ws:
        return None
    return ' OR '.join(f'("{w}" OR "{w[: max(5, len(w) - 2)]}"*)' if len(w) > 5 else f'"{w}"' for w in ws)


L = torch.tensor(np.load(f'{OUT}/int4-lloydmax-levels.npy'))
T = ((L[:, 1:] + L[:, :-1]) / 2).contiguous()


def int4(X):
    out = []
    for a in range(0, len(X), 16384):
        C = torch.searchsorted(T, X[a : a + 16384].T.contiguous()).T
        out.append(torch.nn.functional.normalize(L[torch.arange(768)[None, :], C], dim=-1))
    return torch.cat(out)


def ndcg(got, rel):
    dcg = sum(rel.get(d, 0) / np.log2(i + 2) for i, d in enumerate(got[:10]))
    idcg = sum(g / np.log2(i + 2) for i, g in enumerate(sorted(rel.values(), reverse=True)[:10]))
    return dcg / idcg if idcg else 0.0


results = {}
for name in SETS:
    z = np.load(f'{OUT}/{name}.fp16.npz')
    doc_ids, query_ids = z['doc_ids'].tolist(), z['query_ids'].tolist()
    qrels = json.load(open(f'{OUT}/{name}.qrels.json'))
    texts = json.load(open(f'{WORK}/{name}.texts.json'))
    # Quora has 10,000 queries: a fixed sample of 2,000 is plenty here.
    pick = list(range(len(query_ids)))
    if len(pick) > 2000:
        pick = sorted(np.random.default_rng(0).choice(len(pick), 2000, replace=False).tolist())
    dbf = f'{WORK}/{name}.fts.db'
    if not os.path.exists(dbf):
        con = sqlite3.connect(dbf)
        con.execute("create virtual table f using fts5(text, tokenize = 'unicode61 remove_diacritics 2')")
        con.executemany('insert into f(rowid, text) values (?, ?)', ((i + 1, t) for i, t in enumerate(texts['docs'])))
        con.commit()
        con.close()
    con = sqlite3.connect(dbf)
    D = int4(torch.from_numpy(z['docs']))
    Q = torch.from_numpy(z['queries'])[pick]
    vec_top = []
    for a in range(0, len(Q), 512):
        s = Q[a : a + 512] @ D.T
        vec_top += torch.topk(s, 100, dim=1).indices.tolist()
    t0 = time.time()
    word_top = []
    for qi in pick:
        fq = any_words(texts['queries'][qi])
        rows = con.execute('select rowid from f where f match ? order by bm25(f) limit 100', (fq,)).fetchall() if fq else []
        word_top.append([r[0] - 1 for r in rows])
    con.close()
    row = {}
    variants = [('meaning only', 0, 1, 100), ('words only', 1, 0, 100), ('fused, words x1', 1, 1, 100), ('fused, words x0.25', 0.25, 1, 100), ('fused, words x0.1', 0.1, 1, 100), ('fused, top 10 words x0.5', 0.5, 1, 10), ('fused, top 3 words x0.5', 0.5, 1, 3)]
    for label, w_words, w_vec, top in variants:
        scores = []
        for k, qi in enumerate(pick):
            qid = query_ids[qi]
            f = {}
            for r, d in enumerate(word_top[k][:top]):
                f[d] = f.get(d, 0) + w_words / (61 + r)
            for r, d in enumerate(vec_top[k]):
                f[d] = f.get(d, 0) + w_vec / (61 + r)
            ranked = [doc_ids[d] for d, _ in sorted(f.items(), key=lambda x: -x[1]) if doc_ids[d] != qid]
            scores.append(ndcg(ranked, qrels[qid]))
        row[label] = float(np.mean(scores)) * 100
    results[name] = row
    print(f'{name:10s} ' + '  '.join(f'{k} {v:5.2f}' for k, v in row.items()) + f'   (words {time.time() - t0:.0f}s, {len(pick)} queries)', flush=True)
json.dump(results, open(f'{OUT}/hybrid-results.json', 'w'), indent=1)
labels = list(next(iter(results.values())))
print('mean: ' + '  '.join(f'{k} {np.mean([r[k] for r in results.values()]):5.2f}' for k in labels), flush=True)
