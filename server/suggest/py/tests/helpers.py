"""Shared helpers of the tests: a tiny release folder (random weights, a small vocabulary), and a fake llama-server."""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

import numpy as np  # noqa: E402

from hydor_suggest import vocab as V  # noqa: E402
from hydor_suggest.config import SLMConfig, config_to_dict  # noqa: E402

try:                                 # the suggestion path needs no torch: only the training and the model.py comparisons do
    import torch  # noqa: E402
    torch.set_num_threads(2)
except ImportError:
    torch = None

ENGLISH = ['the quick brown fox jumps over the lazy dog', 'hello world how are you today', 'this is a test of the word suggestions',
           'we are writing a message to the assistant about the project', 'could you please fix the bug in the parser',
           'thank you very much for your help with this', 'what is the weather like in the city today',
           'it works and the tests pass now', 'please run the build and send me the results']
GREEK = ['καλημέρα σας τι κάνετε σήμερα', 'ευχαριστώ πολύ για τη βοήθεια σας', 'το πρόγραμμα λειτουργεί σωστά τώρα',
         'θέλω να γράψω ένα μήνυμα για το έργο', 'πού είναι το αρχείο που ζήτησα χθες']


def make_tokenizer():
    """A small byte-level BPE tokenizer (Qwen's layout: NFC, byte-level) trained on the sample sentences."""
    from tokenizers import Tokenizer, decoders, models, normalizers, pre_tokenizers, processors, trainers
    tok = Tokenizer(models.BPE())
    tok.normalizer = normalizers.NFC()
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    tok.post_processor = processors.ByteLevel(trim_offsets=False)
    trainer = trainers.BpeTrainer(vocab_size=420, special_tokens=['<|endoftext|>', '<|im_start|>'],
                                  initial_alphabet=pre_tokenizers.ByteLevel.alphabet(), show_progress=False)
    tok.train_from_iterator((ENGLISH + GREEK) * 4, trainer)
    return tok


def random_weights(cfg, seed=0):
    """Random weights for a configuration, by the names of model.py's state_dict (a release's model.safetensors has these), no torch."""
    rng = np.random.default_rng(seed)
    d, hd = cfg.d, cfg.head_dim
    lin = lambda out, inn, std=0.08: (rng.standard_normal((out, inn)) * std).astype(np.float32)
    norm = lambda n: (1.0 + 0.1 * rng.standard_normal(n)).astype(np.float32)
    w = {}
    for i, kind in enumerate(cfg.layer_types()):
        p = f'blocks.{i}.'
        if kind == 'c':
            w[p + 'mixer.in_proj.weight'] = lin(3 * d, d)
            w[p + 'mixer.conv'] = (rng.standard_normal((cfg.kernel, d)) / np.sqrt(cfg.kernel)).astype(np.float32)
            w[p + 'mixer.out_proj.weight'] = lin(d, d)
        else:
            w[p + 'mixer.q_proj.weight'] = lin(cfg.heads * hd, d)
            w[p + 'mixer.k_proj.weight'] = lin(cfg.kv_heads * hd, d)
            w[p + 'mixer.v_proj.weight'] = lin(cfg.kv_heads * hd, d)
            w[p + 'mixer.o_proj.weight'] = lin(d, cfg.heads * hd)
            if cfg.qk_norm:
                w[p + 'mixer.q_norm.weight'], w[p + 'mixer.k_norm.weight'] = norm(hd), norm(hd)
        w[p + 'mlp.gate.weight'], w[p + 'mlp.up.weight'], w[p + 'mlp.down.weight'] = lin(cfg.ffn, d), lin(cfg.ffn, d), lin(d, cfg.ffn)
        w[p + 'n1.weight'], w[p + 'n2.weight'] = norm(d), norm(d)
        if cfg.sandwich:
            w[p + 'p1.weight'], w[p + 'p2.weight'] = norm(d), norm(d)
    w['embed.weight'] = lin(cfg.vocab, cfg.emb_rank or d, 0.5)
    if cfg.emb_rank:
        w['emb_proj.weight'] = lin(d, cfg.emb_rank)
    w['norm.weight'] = norm(d)
    return w


def save_weights(path, weights):
    from safetensors.numpy import save_file
    save_file(weights, path)


def write_graph(folder, cfg):
    """The ONNX graph of a configuration into a release folder (the worker uses the one beside the weights before its own)."""
    from hydor_suggest.graph import build, write
    write(build(cfg), os.path.join(folder, 'slm.onnx'))


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f)


def make_release(folder, llm_pad=4, seed=0, with_lid=True, with_replay=True, d=32):
    """Write a tiny release into folder and return its config."""
    os.makedirs(folder, exist_ok=True)
    tok = make_tokenizer()
    tok.save(os.path.join(folder, 'tokenizer.json'))
    Vq = tok.get_vocab_size() + llm_pad
    cfg = SLMConfig(arch='lfm', vocab=Vq + V.NSPEC, d=d, n_layers=4, ffn=64, heads=4, kv_heads=2, kernel=3, emb_rank=16, max_len=512)
    save_weights(os.path.join(folder, 'model.safetensors'), random_weights(cfg, seed))
    write_graph(folder, cfg)
    config = {'format': 'hydor-suggest/1', 'slm': config_to_dict(cfg), 'specials': V.SPECIALS, 'llm_vocab': Vq, 'max_ctx_tokens': 256,
              'llm': {'repo': 'tiny', 'gguf_repo': 'tiny'}}
    write_json(os.path.join(folder, 'config.json'), config)
    gate = {'features': ['llm_entropy', 'llm_maxp', 'slm_entropy', 'slm_maxp', 'slm_unk', 'log1p_pos', 'word_start'],
            'w': [-0.5, 0.1, 0.4, -0.1, 0.0, 0.0, 0.1], 'b': 0.2, 'mu': [3.0, 0.4, 3.0, 0.4, 0.0, 1.0, 1.0],
            'sd': [2.0, 0.3, 2.0, 0.3, 1.0, 1.0, 1.0], 'meta': {}}
    write_json(os.path.join(folder, 'gate.json'), gate)
    write_json(os.path.join(folder, 'switch.json'), {'switch': {'eng_Latn': 'llm', 'ell_Grek': 'mix'}, 'switch_default': 'mix'})
    write_json(os.path.join(folder, 'calibration.json'),
               {'mix': {'0.3': 0.2, '0.4': 0.3, '0.5': 0.5}, 'llm': {'0.3': 0.25, '0.4': 0.35, '0.5': 0.55},
                'slm': {'0.3': 0.1, '0.4': 0.15, '0.5': 0.2}})
    if with_lid:
        write_lid(folder, tok)
    if with_replay:
        write_replay(folder, tok)
    return config


def write_lid(folder, tok, top=40):
    """A language guess for English and Greek: each language's most used tokens of the sample sentences, with their frequencies."""
    langs = {'eng_Latn': ENGLISH, 'ell_Grek': GREEK}
    ids, lps, floors = [], [], []
    for sents in langs.values():
        counts = {}
        for s in sents:
            for t in tok.encode(s, add_special_tokens=False).ids:
                counts[t] = counts.get(t, 0) + 1
        items = sorted(counts.items(), key=lambda kv: -kv[1])[:top]
        total = sum(counts.values())
        row_ids = [i for i, _ in items] + [0] * (top - len(items))
        row_lp = [float(np.log(c / total)) for _, c in items] + [-30.0] * (top - len(items))
        ids.append(row_ids)
        lps.append(row_lp)
        floors.append(float(np.log(0.5 / (total + 1000))))
    write_json(os.path.join(folder, 'lid.json'), {'format': 'hydor-suggest-lid/1', 'languages': list(langs), 'top': top, 'floor': floors})
    with open(os.path.join(folder, 'lid.bin'), 'wb') as f:
        f.write(np.asarray(ids, dtype='<u4').tobytes())
        f.write(np.asarray(lps, dtype='<f2').tobytes())


def write_replay(folder, tok, n=12):
    """A few replay sequences in the small model's ids: documents (<bos> <doc> text <eos>) and one chat."""
    os.makedirs(os.path.join(folder, 'replay'), exist_ok=True)
    seqs, flat = [], []
    texts = (ENGLISH + GREEK)[:n]
    for i, t in enumerate(texts):
        body = (np.asarray(tok.encode(t, add_special_tokens=False).ids) + V.NSPEC).tolist()
        ids = [V.BOS, V.DOC] + body + [V.EOS]
        seqs.append([len(flat), len(ids), 'doc', 'eng_Latn' if i < len(ENGLISH) else 'ell_Grek'])
        flat += ids
    a = (np.asarray(tok.encode('hello how can i help you', add_special_tokens=False).ids) + V.NSPEC).tolist()
    u = (np.asarray(tok.encode('please fix the bug', add_special_tokens=False).ids) + V.NSPEC).tolist()
    ids = [V.BOS, V.USER] + u + [V.AGENT] + a + [V.EOS]
    seqs.append([len(flat), len(ids), 'chat', 'eng_Latn'])
    flat += ids
    with open(os.path.join(folder, 'replay', 'replay.u32'), 'wb') as f:
        f.write(np.asarray(flat, dtype='<u4').tobytes())
    write_json(os.path.join(folder, 'replay', 'index.json'), {'format': 'hydor-suggest-replay/1', 'sequences': seqs})


class FakeLlama:
    """A stand-in for llama-server: POST /completion answers completion_probabilities[0].top_logprobs, chosen by `script(prompt_ids)` ->
    list of (id, logprob) (default: a made-up peaked distribution that depends on the prompt's last token)."""

    def __init__(self, vocab, script=None, delay=0.0):
        self.vocab, self.delay = vocab, delay
        self.drop_probs = None           # a function (body) -> bool: answer without probabilities, as llama-server does for part of a character
        self.close_each = False          # answer with Connection: close, as a server that drops idle connections
        self.requests = []
        self.script = script or self._default
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *a):
                pass

            def do_POST(self):
                n = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(n))
                outer.requests.append(body)
                if outer.delay:
                    import time
                    time.sleep(outer.delay)
                k = int(body.get('n_probs') or 1)
                top = [{'id': int(i), 'token': f't{i}', 'logprob': float(lp), 'bytes': []} for i, lp in outer.script(body['prompt'])[:k]]
                if outer.drop_probs and outer.drop_probs(body):
                    top = []
                cp = [{'id': top[0]['id'], 'logprob': top[0]['logprob'], 'top_logprobs': top}] if top else []
                data = json.dumps({'content': '', 'completion_probabilities': cp}).encode()
                self.send_response(200)
                if outer.close_each:
                    self.send_header('Connection', 'close')
                    self.close_connection = True
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.handle_error = lambda *a: None          # a client that timed out and left is not an error of the fake
        self.url = f'http://127.0.0.1:{self.server.server_address[1]}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def _default(self, prompt):
        rng = np.random.RandomState(int(prompt[-1]) % 1000)
        ids = rng.choice(self.vocab, size=50, replace=False)
        p = np.exp(rng.randn(50) * 2.0)
        p = 0.97 * p / p.sum()
        order = np.argsort(-p)
        return [(int(ids[i]), float(np.log(p[i]))) for i in order]

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


def tmpdir(prefix='hydor-suggest-test-'):
    return tempfile.TemporaryDirectory(prefix=prefix)
