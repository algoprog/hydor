# Hydor's embedding worker, for memory's search by meaning (server/memory/embed.ts starts it). It reads
# requests as JSON lines on stdin and answers each with unit-length vectors, as base64 float32, on stdout:
#   {"id": 1, "kind": "document" | "query", "texts": ["..."]}  ->  {"id": 1, "dim": 768, "vectors": "..."}
# On a GPU with room the model runs in fp16. On a CPU its body runs in float32 while its 256k-word table,
# which is only looked up, stays in fp16 (about 830 MB of weights rather than 1.2 GB), on a few threads, so
# it fits beside everything else on a computer with 8 GB.
import base64
import json
import os
import sys

# The model the codebook in codebook.ts was fitted for: another needs its own.
MODEL = 'lightonai/mDenseOn'
PROMPTS = {'query': 'query: ', 'document': 'document: '}
MAX_TOKENS = 512


def say(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def rss_mb():
    try:
        with open('/proc/self/statm') as f:
            return round(int(f.read().split()[1]) * os.sysconf('SC_PAGE_SIZE') / 2**20)
    except Exception:
        return None


def pick_device(torch):
    want = os.environ.get('HYDOR_EMBED_DEVICE', '').strip()
    if want:
        return want
    # The GPU with the most free memory, when it has room for the model and its work; a GPU in a bad state
    # (its driver erring) leaves the CPU.
    try:
        if torch.cuda.is_available():
            free, i = max((torch.cuda.mem_get_info(i)[0], i) for i in range(torch.cuda.device_count()))
            if free > 2 * 2**30:
                return f'cuda:{i}'
    except Exception:  # noqa: BLE001
        pass
    return 'cpu'


def main():
    import torch
    from transformers import AutoModel, AutoTokenizer

    device = pick_device(torch)
    cpu = device == 'cpu'
    if cpu:
        torch.set_num_threads(int(os.environ.get('HYDOR_EMBED_THREADS') or max(1, min(4, (os.cpu_count() or 2) // 2))))
    say({'status': 'loading'})
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL, dtype=torch.float16)
    if cpu:
        table = model.get_input_embeddings()
        for p in model.parameters():
            if p is not table.weight:
                p.data = p.data.float()
        for b in model.buffers():
            if b.is_floating_point():
                b.data = b.data.float()
        table.register_forward_hook(lambda _m, _args, out: out.float())
    model = model.to(device).eval()
    name = torch.cuda.get_device_name(torch.device(device)) if device.startswith('cuda') else 'CPU'
    budget = 4096 if cpu else 65536

    def encode(texts, prompt):
        texts = [prompt + t for t in texts]
        lens = [len(x) for x in tok(texts, truncation=True, max_length=MAX_TOKENS)['input_ids']]
        order = sorted(range(len(texts)), key=lambda i: -lens[i])
        out = [None] * len(texts)
        i = 0
        while i < len(order):
            n = max(1, min(256, budget // max(1, lens[order[i]])))
            idx = order[i : i + n]
            enc = tok([texts[j] for j in idx], padding=True, truncation=True, max_length=MAX_TOKENS, return_tensors='pt').to(device)
            with torch.inference_mode():
                h = model(**enc).last_hidden_state[:, 0].float()
            h = torch.nn.functional.normalize(h, dim=-1).cpu()
            for k, j in enumerate(idx):
                out[j] = h[k]
            i += n
        return torch.stack(out).numpy().astype('<f4')

    dim = model.config.hidden_size
    say({'ready': True, 'model': MODEL, 'device': device, 'name': name, 'dtype': 'float32, table fp16' if cpu else 'float16', 'dim': dim, 'rss': rss_mb()})
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
