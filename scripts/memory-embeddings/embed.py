# Embeds the calibration texts and the benchmark sets with lightonai/mDenseOn and caches the vectors.
# Usage: python -I embed.py OUT_DIR DATA_DIR [fp16|fp32] [names...]   (a GPU makes it minutes rather than hours)
import json, os, sys, time
import numpy as np
import torch
from datasets import load_dataset
from huggingface_hub import hf_hub_download
import pyarrow.parquet as pq
from transformers import AutoModel, AutoTokenizer

OUT, DATA = sys.argv[1], sys.argv[2]
PREC = sys.argv[3] if len(sys.argv) > 3 else 'fp16'
ONLY = set(sys.argv[4:])
MODEL = 'lightonai/mDenseOn'
DEV = 'cuda' if torch.cuda.is_available() else 'cpu'
MAX_LEN = 512
TOKENS_PER_BATCH = 65536

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModel.from_pretrained(MODEL, dtype=torch.float16 if PREC == 'fp16' else torch.float32).to(DEV).eval()


def encode(texts, prompt):
    texts = [prompt + t for t in texts]
    lens = np.array([len(x) for x in tok(texts, add_special_tokens=True, truncation=True, max_length=MAX_LEN)['input_ids']])
    order = np.argsort(-lens, kind='stable')
    out = np.zeros((len(texts), model.config.hidden_size), dtype=np.float32)
    i = 0
    while i < len(order):
        n = max(1, min(1024, TOKENS_PER_BATCH // int(lens[order[i]])))
        idx = order[i : i + n]
        enc = tok([texts[j] for j in idx], padding=True, truncation=True, max_length=MAX_LEN, return_tensors='pt').to(DEV)
        with torch.inference_mode():
            h = model(**enc).last_hidden_state[:, 0].float()
        out[idx] = torch.nn.functional.normalize(h, dim=-1).cpu().numpy()
        i += n
    return out


def save(name, **arrays):
    np.savez(os.path.join(OUT, f'{name}.{PREC}.npz'), **arrays)


def calibration():
    rng = np.random.default_rng(0)
    texts, langs = [], []
    for lang in ['en', 'fr', 'de', 'it', 'es', 'pt', 'sv', 'no', 'ar']:
        repo = f'lightonai/embeddings-fine-tuning-filtered-{lang}'
        for part in ['documents', 'queries']:
            f = hf_hub_download(repo, f'{part}/squadv2_{lang}-00000-of-00001.parquet', repo_type='dataset', cache_dir=DATA)
            t = pq.read_table(f)
            col = max((c for c in t.column_names if t.schema.field(c).type == 'string'), key=lambda c: sum(len(x or '') for x in t.column(c).to_pylist()[:200]))
            vals = list(dict.fromkeys(x for x in t.column(col).to_pylist() if x and x.strip()))
            pick = rng.choice(len(vals), size=min(2000, len(vals)), replace=False)
            texts += [vals[k] for k in pick]
            langs += [f'{lang}:{part}'] * len(pick)
    t0 = time.time()
    emb = encode(texts, 'document: ')
    print(f'calibration: {len(texts)} texts in {time.time() - t0:.1f}s', flush=True)
    save('calibration', docs=emb, langs=np.array(langs))
    json.dump(texts[:50], open(os.path.join(OUT, 'calibration-sample.json'), 'w'), ensure_ascii=False, indent=1)


def col(d, *names):
    for n in names:
        if n in d.column_names:
            return n
    raise KeyError(f'none of {names} in {d.column_names}')


def bench(name, repo, corpus_cfg, corpus_split, queries_cfg, queries_split, qrels_cfg, qrels_split):
    c = load_dataset(repo, corpus_cfg, split=corpus_split, cache_dir=DATA)
    q = load_dataset(repo, queries_cfg, split=queries_split, cache_dir=DATA)
    r = load_dataset(repo, qrels_cfg, split=qrels_split, cache_dir=DATA)
    cid, qid = col(c, '_id', 'id'), col(q, '_id', 'id')
    rq, rc, rs = col(r, 'query-id', 'query_id'), col(r, 'corpus-id', 'corpus_id'), col(r, 'score', 'relevance')
    qrels = {}
    for a, b, s in zip(r[rq], r[rc], r[rs]):
        if int(s) > 0:
            qrels.setdefault(str(a), {})[str(b)] = int(s)
    titles = c['title'] if 'title' in c.column_names else [''] * len(c)
    docs = [f'{(t or "").strip()} {(x or "").strip()}'.strip() for t, x in zip(titles, c['text'])]
    qtext = {str(i): t for i, t in zip(q[qid], q['text'])}
    qids = [k for k in qrels if k in qtext]
    t0 = time.time()
    de = encode(docs, 'document: ')
    t1 = time.time()
    qe = encode([qtext[k] for k in qids], 'query: ')
    print(f'{name}: {len(docs)} docs in {t1 - t0:.1f}s ({len(docs) / (t1 - t0):.0f}/s), {len(qids)} queries', flush=True)
    save(name, docs=de, queries=qe, doc_ids=np.array([str(x) for x in c[cid]]), query_ids=np.array(qids))
    json.dump(qrels, open(os.path.join(OUT, f'{name}.qrels.json'), 'w'))


BEIR = {
    'scifact': ('mteb/scifact', 'test'),
    'nfcorpus': ('mteb/nfcorpus', 'test'),
    'arguana': ('mteb/arguana', 'test'),
    'scidocs': ('mteb/scidocs', 'test'),
    'fiqa': ('mteb/fiqa', 'test'),
    'quora': ('mteb/quora', 'test'),
}
MIRACL = ['fr', 'de', 'es', 'ar']

if __name__ == '__main__':
    want = lambda n: not ONLY or n in ONLY
    if want('parity'):
        from sentence_transformers import SentenceTransformer
        st = SentenceTransformer(MODEL, device=DEV, model_kwargs={'dtype': torch.float16 if PREC == 'fp16' else torch.float32})
        sample = ['Mars, known for its reddish appearance, is often referred to as the Red Planet.', 'The user prefers short answers in Greek.', 'Le projet se construit avec npm run build.', 'Der Nutzer arbeitet in Berlin.']
        a = encode(sample, 'document: ')
        b = st.encode(sample, prompt_name='document', normalize_embeddings=True, convert_to_numpy=True)
        qa = encode(['Which planet is red?'], 'query: ')
        qb = st.encode(['Which planet is red?'], prompt_name='query', normalize_embeddings=True, convert_to_numpy=True)
        print('parity with sentence-transformers (cosine):', np.round((a * b).sum(1), 5).tolist(), round(float((qa * qb).sum()), 5), flush=True)
        del st
    if want('calibration'):
        calibration()
    for n, (repo, split) in BEIR.items():
        if want(n):
            bench(n, repo, 'corpus', 'corpus', 'queries', 'queries', 'default', split)
    for lang in MIRACL:
        n = f'miracl-{lang}'
        if want(n):
            bench(n, 'mteb/MIRACLRetrievalHardNegatives', f'{lang}-corpus', 'dev', f'{lang}-queries', 'dev', f'{lang}-qrels', 'dev')
