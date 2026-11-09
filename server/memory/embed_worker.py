# Hydor's embedding worker, for memory's search by meaning (server/memory/embed.ts starts it). It reads
# requests as JSON lines on stdin and answers each with unit-length vectors, as base64 float32, on stdout:
#   {"id": 1, "kind": "document" | "query", "texts": ["..."]}  ->  {"id": 1, "dim": 768, "vectors": "..."}
# It runs lightonai/mDenseOn through ONNX Runtime on the CPU, in its 8-bit build (algoprog/mDenseOn-ONNX: the layers'
# weights and the word table in 8 bits, the arithmetic in float32; cosine >= 0.9995 to the model in float32), with
# Hugging Face's own tokenizer, on a few threads: about 1 GB once loaded, a second to start, so it fits beside
# everything else on a computer with 8 GB. The model's folder (HYDOR_EMBED_MODEL_DIR) holds model_q8.onnx,
# tokenizer.json and tokenizer_config.json, downloaded by the app before it starts this.
import base64
import json
import os
import sys

# The model the codebook in codebook.ts was fitted for: another needs its own.
MODEL = 'lightonai/mDenseOn'
PROMPTS = {'query': 'query: ', 'document': 'document: '}
MAX_TOKENS = 512
# Tokens in one pass: a CPU does best with small batches.
BUDGET = 4096


def say(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def rss_mb():
    try:
        with open('/proc/self/statm') as f:
            return round(int(f.read().split()[1]) * os.sysconf('SC_PAGE_SIZE') / 2**20)
    except Exception:
        return None


def main():
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer

    folder = os.environ['HYDOR_EMBED_MODEL_DIR']
    say({'status': 'loading'})
    tok = Tokenizer.from_file(os.path.join(folder, 'tokenizer.json'))
    with open(os.path.join(folder, 'tokenizer_config.json'), encoding='utf-8') as f:
        pad = json.load(f).get('pad_token') or '<pad>'
    tok.enable_truncation(MAX_TOKENS)
    tok.no_padding()
    pad_id = tok.token_to_id(pad) or 0
    threads = int(os.environ.get('HYDOR_EMBED_THREADS') or max(1, min(4, (os.cpu_count() or 2) // 2)))
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.log_severity_level = 3
    sess = ort.InferenceSession(os.path.join(folder, 'model_q8.onnx'), so, providers=['CPUExecutionProvider'])
    names = {i.name for i in sess.get_inputs()}

    def encode(texts, prompt):
        """Texts in, unit vectors out (float32), the longest first in batches of about BUDGET tokens."""
        enc = tok.encode_batch([prompt + t for t in texts], add_special_tokens=True)
        lens = [len(e.ids) for e in enc]
        order = sorted(range(len(texts)), key=lambda i: -lens[i])
        out = np.zeros((len(texts), 0), dtype='<f4')
        i = 0
        while i < len(order):
            n = max(1, min(256, BUDGET // max(1, lens[order[i]])))
            idx = order[i : i + n]
            width = max(lens[j] for j in idx)
            ids = np.full((len(idx), width), pad_id, dtype=np.int64)
            mask = np.zeros((len(idx), width), dtype=np.int64)
            for k, j in enumerate(idx):
                ids[k, : lens[j]] = enc[j].ids
                mask[k, : lens[j]] = 1
            feed = {'input_ids': ids, 'attention_mask': mask}
            if 'token_type_ids' in names:
                feed['token_type_ids'] = np.zeros_like(ids)
            h = sess.run(None, feed)[0][:, 0].astype(np.float32)
            h /= np.maximum(np.linalg.norm(h, axis=1, keepdims=True), 1e-12)
            if out.shape[1] == 0:
                out = np.zeros((len(texts), h.shape[1]), dtype='<f4')
            out[idx] = h
            i += n
        return out

    dim = encode(['A first vector.'], PROMPTS['document']).shape[1]
    say({'ready': True, 'model': MODEL, 'device': 'cpu', 'name': 'CPU', 'dtype': '8-bit weights, float32 arithmetic', 'dim': dim, 'threads': threads, 'rss': rss_mb()})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get('id')
            texts = [str(t) for t in req.get('texts', [])][:512]
            vecs = encode(texts, PROMPTS[req.get('kind', 'document')]) if texts else None
            say({'id': rid, 'dim': dim, 'vectors': base64.b64encode(vecs.tobytes()).decode() if vecs is not None else '', 'rss': rss_mb()})
        except Exception as e:  # noqa: BLE001 - every failure goes back to the server as an answer
            say({'id': rid, 'error': f'{type(e).__name__}: {e}'[:400]})


if __name__ == '__main__':
    main()
