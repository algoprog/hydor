# Dumps each benchmark's document and query texts in the order of its cached vectors.
# Usage: python -I texts.py OUT_DIR DATA_DIR WORK_DIR
import json, sys
import numpy as np
from datasets import load_dataset

OUT, DATA, WORK = sys.argv[1:4]
BEIR = {'scifact': 'mteb/scifact', 'nfcorpus': 'mteb/nfcorpus', 'arguana': 'mteb/arguana', 'scidocs': 'mteb/scidocs', 'fiqa': 'mteb/fiqa', 'quora': 'mteb/quora'}
sets = [(n, r, 'corpus', 'corpus', 'queries', 'queries') for n, r in BEIR.items()] + [(f'miracl-{l}', 'mteb/MIRACLRetrievalHardNegatives', f'{l}-corpus', 'dev', f'{l}-queries', 'dev') for l in ['fr', 'de', 'es', 'ar']]
for name, repo, cc, cs, qc, qs in sets:
    z = np.load(f'{OUT}/{name}.fp16.npz')
    c = load_dataset(repo, cc, split=cs, cache_dir=DATA)
    q = load_dataset(repo, qc, split=qs, cache_dir=DATA)
    cid = '_id' if '_id' in c.column_names else 'id'
    qid = '_id' if '_id' in q.column_names else 'id'
    titles = c['title'] if 'title' in c.column_names else [''] * len(c)
    docs = [f'{(t or "").strip()} {(x or "").strip()}'.strip() for t, x in zip(titles, c['text'])]
    assert [str(x) for x in c[cid]] == z['doc_ids'].tolist(), name
    qtext = {str(i): t for i, t in zip(q[qid], q['text'])}
    json.dump({'docs': docs, 'queries': [qtext[k] for k in z['query_ids'].tolist()]}, open(f'{WORK}/{name}.texts.json', 'w'), ensure_ascii=False)
    print(name, len(docs), len(z['query_ids']), flush=True)
