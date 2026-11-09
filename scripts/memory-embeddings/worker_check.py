# Drives server/memory/embed_worker.py the way the app does (JSON lines), on the CPU (HYDOR_EMBED_MODEL_DIR: the model's
# folder): start time, memory,
# speed, the vectors of two benchmarks (to compare with the GPU's fp16 ones), and cosine similarities of
# memory-like pairs to set the app's thresholds.
# Usage: python -I worker_check.py WORKER_PYTHON WORKER_PY OUT_DIR DATA_DIR
import base64, json, os, subprocess, sys, time
import numpy as np
from datasets import load_dataset

PY, WORKER, OUT, DATA = sys.argv[1:5]
env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG') if k in os.environ}
# The model's folder: model_q8.onnx, tokenizer.json and tokenizer_config.json (the app's cache, or HYDOR_EMBED_MODEL_DIR).
env.update(HYDOR_EMBED_MODEL_DIR=os.environ.get('HYDOR_EMBED_MODEL_DIR', ''), HYDOR_EMBED_THREADS='4', CUDA_VISIBLE_DEVICES='', PYTHONDONTWRITEBYTECODE='1')
t0 = time.time()
p = subprocess.Popen([PY, '-I', WORKER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, text=True, bufsize=1)


def peak():
    with open(f'/proc/{p.pid}/status') as f:
        return {l.split(':')[0]: l.split(':')[1].strip() for l in f if l.startswith(('VmHWM', 'VmRSS'))}


while True:
    m = json.loads(p.stdout.readline())
    if m.get('ready'):
        break
print(f"ready in {time.time() - t0:.1f}s on {m['name']} ({m['dtype']}), rss {m['rss']} MB, {peak()}", flush=True)
seq = 0


def ask(texts, kind):
    global seq
    seq += 1
    p.stdin.write(json.dumps({'id': seq, 'kind': kind, 'texts': texts}) + '\n')
    r = json.loads(p.stdout.readline())
    assert r['id'] == seq and 'error' not in r, r
    return np.frombuffer(base64.b64decode(r['vectors']), dtype='<f4').reshape(-1, r['dim'])


# Latency of one query and of one short note, warm.
for kind, text in [('query', 'what did we decide about the deploy?'), ('document', 'The user prefers short answers.')]:
    ask([text], kind)
    t = time.time()
    for _ in range(10):
        ask([text], kind)
    print(f'one {kind}: {(time.time() - t) / 10 * 1000:.0f} ms', flush=True)

# Memory-like pairs: (a, b, kind of pair, b's prompt).
pairs = [
    ('The user prefers short answers.', 'The user likes brief replies.', 'same', 'document'),
    ('The user lives in Paris.', 'The user lives in Paris, France.', 'same', 'document'),
    ('Build the server with npm run build:server.', 'The server is built with `npm run build:server`.', 'same', 'document'),
    ('The user publishes machine learning models on Hugging Face.', 'The user releases ML models on the Hugging Face Hub.', 'same', 'document'),
    ('Deploy by restarting web-agent.service after building.', 'To deploy, build and then restart web-agent.service.', 'same', 'document'),
    ("L'utilisateur préfère des réponses courtes.", 'The user prefers short answers.', 'same', 'document'),
    ('Der Nutzer arbeitet in Berlin.', 'The user works in Berlin.', 'same', 'document'),
    ('The daily tech news brief is exactly 5 lines.', 'The daily news brief has five lines, one story each.', 'same', 'document'),
    ('The user lives in Paris.', 'The user moved to Berlin in 2025.', 'update', 'document'),
    ('The project uses Node 20.', 'The project now requires Node 22.12 or newer.', 'update', 'document'),
    ('The user prefers dark mode.', 'The user switched to light mode.', 'update', 'document'),
    ('The brief is sent at 9:00.', 'The brief is now sent at 14:27 New York time.', 'update', 'document'),
    ('The user prefers short answers.', 'The user writes in Greek.', 'related', 'document'),
    ('Build the server with npm run build:server.', 'Tests run with node dist/dev/memory-test.js.', 'related', 'document'),
    ('The user publishes models on Hugging Face.', 'The user has four RTX 4090 GPUs.', 'related', 'document'),
    ('Memory notes are stored in SQLite.', 'The indexer uses FTS5 for session search.', 'related', 'document'),
    ('The user is vegetarian.', 'The user is allergic to nuts.', 'related', 'document'),
    ('The user prefers short answers.', 'The project deploys with systemd.', 'unrelated', 'document'),
    ('The user is vegetarian.', 'Build the web app with vite build.', 'unrelated', 'document'),
    ('The user lives in Paris.', 'The tests need DATA_DIR under /tmp.', 'unrelated', 'document'),
    ('The trip to Lisbon is on 12 November.', 'The repo uses TypeScript 7.', 'unrelated', 'document'),
    ('The user likes jazz.', 'Commits carry no co-author lines.', 'unrelated', 'document'),
    ('how should I deploy this?', 'Deploy by restarting web-agent.service after building.', 'query-hit', 'query'),
    ('write me a short reply', 'The user prefers short answers.', 'query-hit', 'query'),
    ('what GPUs do I have?', 'The user has four RTX 4090 GPUs.', 'query-hit', 'query'),
    ('book a restaurant for dinner', 'The user is vegetarian.', 'query-hit', 'query'),
    ('can you run the tests', 'Tests run with node dist/dev/memory-test.js.', 'query-hit', 'query'),
    ('quel temps fait-il à Paris ?', 'The user lives in Paris.', 'query-hit', 'query'),
    ('how should I deploy this?', 'The user is vegetarian.', 'query-miss', 'query'),
    ('write me a short reply', 'The repo uses TypeScript 7.', 'query-miss', 'query'),
    ('what GPUs do I have?', 'The trip to Lisbon is on 12 November.', 'query-miss', 'query'),
    ('book a restaurant for dinner', 'Build the web app with vite build.', 'query-miss', 'query'),
    ('can you run the tests', 'The user likes jazz.', 'query-miss', 'query'),
    ('thanks', 'The user prefers short answers.', 'query-miss', 'query'),
]
sims = {}
for a, b, kind, prompt in pairs:
    va = ask([a], 'query' if prompt == 'query' else 'document')[0]
    vb = ask([b], 'document')[0]
    sims.setdefault(kind, []).append(round(float(va @ vb), 3))
for k, v in sims.items():
    print(f'{k:11s} min {min(v):.3f} max {max(v):.3f}  {v}', flush=True)

# Two benchmarks through the worker, to compare with the GPU's fp16 vectors.
for name, repo in [('scifact', 'mteb/scifact'), ('nfcorpus', 'mteb/nfcorpus')]:
    c = load_dataset(repo, 'corpus', split='corpus', cache_dir=DATA)
    q = load_dataset(repo, 'queries', split='queries', cache_dir=DATA)
    z = np.load(f'{OUT}/{name}.fp16.npz')
    qtext = {str(i): t for i, t in zip(q['_id'], q['text'])}
    docs = [f'{(t or "").strip()} {(x or "").strip()}'.strip() for t, x in zip(c['title'], c['text'])]
    assert [str(x) for x in c['_id']] == z['doc_ids'].tolist()
    # A sample: long abstracts take about a second each on four threads.
    n = 200
    t = time.time()
    D = np.concatenate([ask(docs[i : min(i + 32, n)], 'document') for i in range(0, n, 32)])
    dt = time.time() - t
    qids = z['query_ids'].tolist()[:200]
    t = time.time()
    Q = np.concatenate([ask([qtext[k] for k in qids[i : i + 32]], 'query') for i in range(0, len(qids), 32)])
    dq = time.time() - t
    cos = (D * z['docs'][:n]).sum(1)
    qcos = (Q * z['queries'][: len(qids)]).sum(1)
    print(f'{name}: {n} docs in {dt:.0f}s ({n / dt:.1f}/s), {len(qids)} queries in {dq:.1f}s; cosine with the GPU fp16 vectors: docs mean {cos.mean():.5f} min {cos.min():.5f}, queries mean {qcos.mean():.5f} min {qcos.min():.5f}; {peak()}', flush=True)
p.stdin.close()
p.wait(timeout=30)
print('exit', p.returncode, flush=True)
