"""Personalising the small model on what the person writes, with the public text replayed beside it (server/suggest runs this at the
lowest priority, usually when the computer is idle).

  python -I train.py --texts texts.jsonl --base <release dir> --init <release dir | personal dir> --out <new personal dir>
      --replay <release dir>/replay --lr 5e-4 --batch-tokens 4096 --w-user 4 --replay-ratio 1.0 --epochs 1 --threads N
      --device auto --resume

Each line of the texts file: {"kind": "user"|"agent"|"doc", "text", "ts", "session"?, "reply"?}; a user message carries the agent reply it
answered. The recipe is the research's:
- a user message is a chat sequence in the small model's own format, `<bos> <agent> reply <user> text... <eos>`, its tokens weighted
  --w-user (a message of more than 100 words is cut into pieces of 100, a later piece reading the 100 words before it); an agent reply
  is `<bos> <agent> chunk <eos>` and a document or note the person wrote `<bos> <doc> chunk <eos>` (chunks of 254 tokens; the person's
  own at --w-user, the replies at 1);
- the last 5% of the person's messages (by time) are held out and their loss printed;
- public text from the release's replay folder is mixed into every batch at --replay-ratio tokens per token of the person's, weight 1,
  or the other languages are forgotten;
- AdamW (betas 0.9 / 0.95, weight decay 0.1 except on the embeddings, convolutions and norms), warm-up and cosine decay, gradient
  clipping at 1, bf16 autocast on the CPU (and on a graphics card that supports it), batches of --batch-tokens padded tokens, --epochs passes (one).

Output: JSON lines on stdout: {"progress": {"done", "total"}, "loss"} after each step and at the end {"done": true, "dev_nll", "tokens",
"seconds", "languages": {lang: the person's tokens}}. Every 10 minutes the state is saved to <out>/.resume (--resume continues from it
when the texts and settings are the same); model.safetensors, config.json and meta.json are written into --out only at the end.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import signal
import sys
import time
from dataclasses import dataclass
from typing import NamedTuple, Optional

import numpy as np
import torch

from . import vocab as V
from .lid import Lid
from .model import SLM, build_model, config_from_dict, state_for_save

CHUNK_TOKENS = 254
MAX_LEN = 1024
CTX_WORDS = 100
SEG_WORDS = 100
RESUME_SECONDS = 600
CPU_MICRO_TOKENS = 4096       # padded tokens of one forward and backward on the CPU (the whole of a usual batch: the cache-friendly head makes it cheap)
DEVICE_MICRO_TOKENS = 1024    # on a graphics card or an Apple GPU, whose memory is smaller


class Seq(NamedTuple):
    ids: np.ndarray       # int32 [L], the small model's ids
    w: np.ndarray         # float32 [L]: w[i] is the loss weight of predicting ids[i] from ids[:i]
    kind: str             # 'chat' | 'agent' | 'doc'
    ts: int
    nbytes: int


def _finite(x):
    """The object with every float that is not finite (nan, inf) as None: the output is always valid JSON."""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: _finite(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_finite(v) for v in x]
    return x


def say(obj: dict) -> None:
    sys.stdout.write(json.dumps(_finite(obj), separators=(',', ':'), allow_nan=False) + '\n')
    sys.stdout.flush()


# ===================================================================================================================
# The texts -> sequences
# ===================================================================================================================
def _ts(x) -> int:
    """A timestamp as an int: numbers and numeric strings; anything else is 0."""
    try:
        v = float(x)
        return int(v) if math.isfinite(v) else 0
    except (TypeError, ValueError, OverflowError):
        return 0


def read_texts(path: str) -> list:
    """The records of the texts file that are text. A line that is not a JSON object, has another kind, or has no text is skipped; a ts
    that is not a number is 0; bytes that are not UTF-8 are replaced."""
    out = []
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if not isinstance(r, dict):
                continue
            kind = r.get('kind')
            text = V.nfc(str(r.get('text') or '')).strip()
            if kind not in ('user', 'agent', 'doc') or not text:
                continue
            out.append({'kind': kind, 'text': text, 'ts': _ts(r.get('ts')), 'reply': V.nfc(str(r.get('reply') or ''))})
    return out


class Tokens:
    """Qwen ids of strings, each tokenized alone, in batches."""

    def __init__(self, tok):
        self.tok = tok
        self.memo: dict = {}

    def many(self, texts) -> None:
        todo = [t for t in dict.fromkeys(texts) if t and t not in self.memo]
        for i in range(0, len(todo), 256):
            chunk = todo[i:i + 256]
            for t, e in zip(chunk, self.tok.encode_batch(chunk, add_special_tokens=False)):
                self.memo[t] = np.asarray(e.ids, dtype=np.int64)

    def __call__(self, text: str) -> np.ndarray:
        if not text:
            return np.zeros(0, dtype=np.int64)
        if text not in self.memo:
            self.many([text])
        return self.memo[text]


def build_sequences(records: list, tokens: Tokens, w_user: float, w_agent: float = 1.0) -> list:
    """The training sequences of the records, in order, each tagged with the index of its record (a list of (record index, Seq))."""
    pieces = []      # (record index, agent_ctx, user_ctx, seg, last)
    for ri, r in enumerate(records):
        if r['kind'] != 'user':
            continue
        text = r['text']
        agent_ctx = V.last_words(r['reply'], CTX_WORDS)
        segs = V.segments(text, SEG_WORDS)
        for si, (a, b) in enumerate(segs):
            user_ctx = '' if si == 0 else V.last_words(text[:a], CTX_WORDS)
            pieces.append((ri, agent_ctx, user_ctx, text[a:b], si == len(segs) - 1))
    tokens.many([p[1] for p in pieces] + [p[2] for p in pieces] + [p[3] for p in pieces]
                + [r['text'] for r in records if r['kind'] != 'user'])
    out = []
    for ri, agent_ctx, user_ctx, seg, last in pieces:
        prefix = V.prefix_from_ids('chat', V.to_slm(tokens(agent_ctx)), V.to_slm(tokens(user_ctx)), (), V.MAX_CTX_TOKENS)
        tgt = V.to_slm(tokens(seg))[:max(0, MAX_LEN - len(prefix) - 1)]
        ids = np.concatenate([prefix, tgt, [V.EOS] if last else []]).astype(np.int32)
        w = np.zeros(len(ids), dtype=np.float32)
        w[len(prefix):] = w_user
        out.append((ri, Seq(ids, w, 'chat', records[ri]['ts'], len(seg.encode('utf-8')))))
    for ri, r in enumerate(records):
        if r['kind'] == 'user':
            continue
        marker = V.AGENT if r['kind'] == 'agent' else V.DOC
        weight = w_agent if r['kind'] == 'agent' else w_user       # the documents and notes in this file are the person's own
        body = V.to_slm(tokens(r['text']))
        chunks = [body[i:i + CHUNK_TOKENS] for i in range(0, len(body), CHUNK_TOKENS)]
        for j, ch in enumerate(chunks):
            ids = np.concatenate([[V.BOS, marker], ch, [V.EOS] if j == len(chunks) - 1 else []]).astype(np.int32)
            w = np.full(len(ids), weight, dtype=np.float32)
            w[:2] = 0
            out.append((ri, Seq(ids, w, r['kind'], r['ts'], 0)))
    return out


def dev_version(s: Seq) -> Seq:
    """A held-out sequence for the dev loss: no <eos>, every target token at weight 1."""
    ids = s.ids[:-1] if s.ids[-1] == V.EOS else s.ids
    w = np.where(s.w[:len(ids)] > 0, 1.0, 0.0).astype(np.float32)
    return Seq(ids, w, s.kind, s.ts, s.nbytes)


def own_tokens_by_language(records: list, tokens: Tokens, lid: Optional[Lid]) -> tuple:
    """(the person's own tokens, {language: tokens}): the messages and documents they wrote, each guessed on its own."""
    total, langs = 0, {}
    for r in records:
        if r['kind'] == 'agent':
            continue
        ids = tokens(r['text'])
        total += len(ids)
        if lid is not None:
            lang, _, _ = lid.guess(ids[:2000])
            if lang:
                langs[lang] = langs.get(lang, 0) + len(ids)
    return total, langs


# ===================================================================================================================
# Replay
# ===================================================================================================================
class Replay:
    """Public text, already tokenized in the small model's ids: replay.u32 (little-endian uint32, all sequences concatenated) and index.json
    ({"format": "hydor-suggest-replay/1", "sequences": [[offset, length, kind, lang], ...]}). Sampled uniformly over the sequences."""

    def __init__(self, folder: str):
        with open(os.path.join(folder, 'index.json'), encoding='utf-8') as f:
            idx = json.load(f)
        if idx.get('format') != 'hydor-suggest-replay/1':
            raise ValueError('unknown replay format')
        seqs = idx['sequences']
        self.off = np.array([s[0] for s in seqs], dtype=np.int64)
        self.len = np.array([s[1] for s in seqs], dtype=np.int64)
        self.data = np.memmap(os.path.join(folder, 'replay.u32'), dtype='<u4', mode='r')
        if len(seqs) and int((self.off + self.len).max()) > len(self.data):
            raise ValueError('replay.u32 is shorter than its index says')
        self.mean = float(self.len.mean()) - 1 if len(seqs) else 1.0

    def __len__(self) -> int:
        return len(self.off)

    def get(self, i: int) -> Seq:
        ids = np.asarray(self.data[self.off[i]:self.off[i] + self.len[i]], dtype=np.int32)
        w = np.where(ids < V.NSPEC, 0.0, 1.0).astype(np.float32)            # the markers and <bos> carry no loss; <unk> is never a target
        w[ids == V.EOS] = 1.0
        return Seq(ids, w, 'replay', 0, 0)

    def sample(self, n_tokens: int, rng: np.random.RandomState) -> list:
        """Sequences drawn until their tokens (inputs) reach n_tokens (within one sequence)."""
        if n_tokens <= 0 or not len(self):
            return []
        k = max(1, int(round(n_tokens / max(self.mean, 1.0))))
        out, tot = [], 0
        for i in rng.randint(0, len(self), size=k):
            q = self.get(int(i))
            out.append(q)
            tot += len(q.ids) - 1
            if tot >= n_tokens:
                return out
        while tot < n_tokens:
            q = self.get(int(rng.randint(0, len(self))))
            out.append(q)
            tot += len(q.ids) - 1
        return out


# ===================================================================================================================
# Batches, evaluation, the optimizer
# ===================================================================================================================
def make_batches(lengths: np.ndarray, batch_tokens: int, rng: np.random.RandomState, shuffle: bool = True) -> list:
    """Length-bucketed batches of about batch_tokens padded tokens: sort inside windows of shuffled sequences."""
    n = len(lengths)
    if n == 0:
        return []
    perm = rng.permutation(n) if shuffle else np.arange(n)
    win = int(max(64, 32 * batch_tokens / max(1.0, lengths.mean())))
    batches = []
    for a in range(0, n, win):
        idx = perm[a:a + win]
        idx = idx[np.argsort(lengths[idx], kind='stable')]
        cur, cur_max = [], 0
        for i in idx:
            m = max(cur_max, int(lengths[i]))
            if cur and m * (len(cur) + 1) > batch_tokens:
                batches.append(np.asarray(cur))
                cur, m = [], int(lengths[i])
            cur.append(i)
            cur_max = m
        if cur:
            batches.append(np.asarray(cur))
    if shuffle:
        batches = [batches[i] for i in rng.permutation(len(batches))]
    return batches


def collate(seqs: list):
    L = max(len(s.ids) for s in seqs)
    ids = np.zeros((len(seqs), L), dtype=np.int64)
    w = np.zeros((len(seqs), L), dtype=np.float32)
    for i, s in enumerate(seqs):
        ids[i, :len(s.ids)] = s.ids
        w[i, :len(s.ids)] = s.w
    ids, w = torch.from_numpy(ids), torch.from_numpy(w)
    return ids[:, :-1], ids[:, 1:], w[:, 1:]


@torch.no_grad()
def eval_nll(model: SLM, seqs: list, batch_tokens: int = 16384, bf16: bool = False, device='cpu') -> Optional[float]:
    """Mean NLL (nats) over the target tokens (weight > 0) of the sequences, or None without any."""
    if not seqs:
        return None
    was = model.training
    model.eval()
    tot, n = 0.0, 0
    lengths = np.array([len(s.ids) for s in seqs])
    for b in make_batches(lengths, batch_tokens, np.random.RandomState(0), shuffle=False):
        ids, tg, w = (x.to(device) for x in collate([seqs[i] for i in b]))
        with torch.autocast(torch.device(device).type, dtype=torch.bfloat16, enabled=bf16):
            nll, _ = model.token_nll(ids, tg, w > 0)
        tot += float(nll.float().sum())
        n += len(nll)
    model.train(was)
    return tot / max(n, 1)


def make_optimizer(model: SLM, lr: float, wd: float):
    dec, nodec = [], []
    for n, p in model.named_parameters():
        if not p.requires_grad:
            continue
        (dec if p.ndim >= 2 and 'embed' not in n and 'conv' not in n and 'lm_head' not in n else nodec).append(p)
    return torch.optim.AdamW([{'params': dec, 'weight_decay': wd}, {'params': nodec, 'weight_decay': 0.0}],
                             lr=lr, betas=(0.9, 0.95), eps=1e-8)


def lr_at(step: int, total: int, lr: float, warmup: int, min_frac: float = 0.1) -> float:
    if step < warmup:
        return lr * (step + 1) / warmup
    p = (step - warmup) / max(1, total - warmup)
    return lr * (min_frac + (1 - min_frac) * 0.5 * (1 + math.cos(math.pi * min(1.0, p))))


@dataclass
class Settings:
    lr: float = 5e-4
    batch_tokens: int = 4096
    w_user: float = 4.0
    replay_ratio: float = 1.0
    epochs: float = 1.0
    wd: float = 0.1
    clip: float = 1.0
    warmup: int = 50
    seed: int = 0
    bf16: bool = True


def micro_groups(batch: list, micro_tokens: int) -> list:
    """The sequences of a batch in groups of about micro_tokens padded tokens (a sequence longer than that is a group of its own)."""
    order = sorted(range(len(batch)), key=lambda i: len(batch[i].ids))
    groups, cur, cur_max = [], [], 0
    for i in order:
        m = max(cur_max, len(batch[i].ids))
        if cur and m * (len(cur) + 1) > micro_tokens:
            groups.append(cur)
            cur, m = [], len(batch[i].ids)
        cur.append(i)
        cur_max = m
    if cur:
        groups.append(cur)
    return [[batch[i] for i in g] for g in groups]


def train_step(model: SLM, batch: list, micro_tokens: int, bf16: bool, device) -> tuple:
    """Forward and backward of one batch, in micro-batches whose gradients add up to the batch's: the loss is the weighted mean over the
    whole batch (each micro-batch's weighted sum divided by the batch's total weight), so the gradient is the one a single pass would give,
    with the activations of one micro-batch in memory at a time. Returns (the batch's loss, its input tokens)."""
    total = max(sum(float(s.w[1:].sum()) for s in batch), 1e-8)
    loss, tokens = 0.0, 0
    for group in micro_groups(batch, micro_tokens):
        ids, tg, w = (x.to(device) for x in collate(group))
        with torch.autocast(torch.device(device).type, dtype=torch.bfloat16, enabled=bf16):
            sw, _, _ = model.loss(ids, tg, w)
        (sw / total).backward()
        loss += float(sw.detach()) / total
        tokens += int(ids.numel())
    return loss, tokens


def cpu_bf16_native() -> bool:
    """Whether bf16 is worth it on this CPU: its maths done in hardware (AVX-512 BF16 or AMX on x86; on anything else, or when torch cannot
    say, it stays as it was: on). Without that the bf16 conversions cost more than they save, and plain float32 is the faster."""
    import platform
    if platform.machine().lower() not in ('x86_64', 'amd64'):
        return True
    try:
        return bool(torch.cpu._is_avx512_bf16_supported() or torch.cpu._is_amx_tile_supported())
    except Exception:
        return True


def use_bf16(device: str) -> bool:
    """bf16 autocast on the processor (where it does the maths in hardware, see cpu_bf16_native), and on a graphics card only when it supports it (older NVIDIA cards do not; the others, an Apple GPU
    too, run in float32)."""
    if device == 'cpu':
        return cpu_bf16_native()
    if device == 'cuda':
        try:
            return bool(torch.cuda.is_bf16_supported())
        except Exception:
            return False
    return False


def to_cpu(obj):
    """The same structure (dicts, lists, tuples, tensors) with every tensor on the processor: a resume state is the same wherever it was saved."""
    if isinstance(obj, torch.Tensor):
        return obj.detach().cpu()
    if isinstance(obj, dict):
        return {k: to_cpu(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return type(obj)(to_cpu(v) for v in obj)
    return obj


def optimizer_to(opt, device) -> None:
    """The optimizer's state (its moments) on the device of its parameters: a state saved on another device is moved to this one."""
    for group in opt.param_groups:
        for p in group['params']:
            for k, v in opt.state.get(p, {}).items():
                if isinstance(v, torch.Tensor) and k != 'step':
                    opt.state[p][k] = v.to(device=p.device, dtype=p.dtype if v.is_floating_point() else v.dtype)


def pick_device(name: str) -> str:
    if name != 'auto':
        return name
    if torch.cuda.is_available():
        return 'cuda'
    mps = getattr(torch.backends, 'mps', None)
    if mps is not None and mps.is_available():
        return 'mps'
    return 'cpu'


def make_plan(lengths: np.ndarray, batch_tokens: int, rng: np.random.RandomState, epochs: float) -> list:
    plan, per_epoch = [], None
    while True:
        eb = make_batches(lengths, batch_tokens, rng)
        if not eb:
            return plan
        per_epoch = per_epoch or len(eb)
        for b in eb:
            plan.append(b)
            if len(plan) >= max(1, round(epochs * per_epoch)):
                return plan


def file_signature(path: str) -> str:
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def private_file(path: str) -> str:
    """Create the file (empty) readable by this user only, so whatever is written into it never has wider rights."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.close(fd)
    return path


def private_dir(path: str) -> None:
    os.makedirs(path, mode=0o700, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass


def write_atomic(path: str, data: bytes) -> None:
    tmp = private_file(path + '.tmp')
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)


def rng_to_plain(rng: np.random.RandomState) -> list:
    name, keys, pos, has_gauss, cached = rng.get_state()
    return [name, [int(k) for k in keys], int(pos), int(has_gauss), float(cached)]


def rng_from_plain(rng: np.random.RandomState, state: list) -> None:
    name, keys, pos, has_gauss, cached = state
    rng.set_state((name, np.array(keys, dtype=np.uint32), pos, has_gauss, cached))


def load_resume(path: str) -> dict:
    """The resume state: tensors and plain data only, so it loads with weights_only; a file from an older run (it is our own private
    file) that does not is loaded the other way."""
    try:
        return torch.load(path, map_location='cpu', weights_only=True)
    except Exception:
        return torch.load(path, map_location='cpu', weights_only=False)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description='Personalise the word suggestions small model.')
    p.add_argument('--texts', required=True)
    p.add_argument('--base', required=True, help='the release folder')
    p.add_argument('--init', default=None, help='the weights to start from: the release folder (default) or a personal model folder')
    p.add_argument('--out', required=True)
    p.add_argument('--replay', default=None, help="the release's replay folder")
    p.add_argument('--lr', type=float, default=5e-4)
    p.add_argument('--batch-tokens', type=int, default=4096)
    p.add_argument('--w-user', type=float, default=4.0)
    p.add_argument('--replay-ratio', type=float, default=1.0)
    p.add_argument('--epochs', type=float, default=1.0)
    p.add_argument('--threads', type=int, default=0)
    p.add_argument('--device', default='auto')
    p.add_argument('--resume', action='store_true')
    p.add_argument('--micro-tokens', type=int, default=0, help=f'padded tokens of one forward and backward (a batch is run in pieces of this size: the same gradient, less memory); 0: {CPU_MICRO_TOKENS} on the CPU, {DEVICE_MICRO_TOKENS} on a graphics card')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--warmup', type=int, default=50)
    p.add_argument('--holdout', type=float, default=None, help="the share of the person's messages, the latest, kept out for the dev loss (default 0.05 when starting from the release; 0 when --init is a personal model, whose later messages would otherwise never be learned from)")
    a = p.parse_args(argv)
    t_start = time.time()
    torch.set_num_threads(a.threads if a.threads > 0 else max(1, (os.cpu_count() or 2) // 2))
    device = pick_device(a.device)
    torch.manual_seed(a.seed)
    st = Settings(lr=a.lr, batch_tokens=a.batch_tokens, w_user=a.w_user, replay_ratio=a.replay_ratio, epochs=a.epochs,
                  warmup=a.warmup, seed=a.seed, bf16=use_bf16(device))

    # ---- the release, the weights to start from ----
    with open(os.path.join(a.base, 'config.json'), encoding='utf-8') as f:
        base_cfg = json.load(f)
    cfg = config_from_dict(base_cfg['slm'])
    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(os.path.join(a.base, 'tokenizer.json'))
    tok.no_truncation()
    tok.no_padding()
    init = a.init or a.base
    from safetensors.torch import load_file, save_file
    model = build_model(cfg, load_file(os.path.join(init, 'model.safetensors')), freeze=False)
    model.train()
    prev_meta = {}
    if os.path.isfile(os.path.join(init, 'meta.json')):
        with open(os.path.join(init, 'meta.json'), encoding='utf-8') as f:
            prev_meta = json.load(f)
    lid = Lid.load(a.base)
    personal_init = os.path.realpath(init) != os.path.realpath(a.base)
    holdout = a.holdout if a.holdout is not None else (0.0 if personal_init else 0.05)

    # ---- the texts ----
    records = read_texts(a.texts)
    tokens = Tokens(tok)
    built = build_sequences(records, tokens, st.w_user)
    user_idx = sorted((ri for ri, r in enumerate(records) if r['kind'] == 'user'), key=lambda i: records[i]['ts'])
    n_dev = int(len(user_idx) * holdout) if len(user_idx) >= 20 else 0
    dev_records = set(user_idx[len(user_idx) - n_dev:]) if n_dev else set()
    train_seqs = [s for ri, s in built if ri not in dev_records]
    dev_seqs = [dev_version(s) for ri, s in built if ri in dev_records]
    if not train_seqs:
        say({'error': 'no text to learn from'})
        sys.exit(3)   # nothing to learn from (the server reads 3 as that, and 2 stays argparse's usage error)
    own_tokens, languages_new = own_tokens_by_language(records, tokens, lid)
    replay = None
    if a.replay and st.replay_ratio > 0 and os.path.isfile(os.path.join(a.replay, 'index.json')):
        replay = Replay(a.replay)
        if not len(replay):
            replay = None

    # ---- the plan, the optimizer, the resume state ----
    rng = np.random.RandomState(st.seed)
    lengths = np.array([len(s.ids) for s in train_seqs])
    plan = make_plan(lengths, st.batch_tokens, rng, st.epochs)
    total = len(plan)
    warmup = min(st.warmup, max(1, total // 10))
    micro_tokens = a.micro_tokens or (CPU_MICRO_TOKENS if device == 'cpu' else DEVICE_MICRO_TOKENS)
    model.to(device)
    opt = make_optimizer(model, st.lr, st.wd)
    replay_rng = np.random.RandomState(st.seed + 7)
    resume_dir = os.path.join(a.out, '.resume')
    sig = hashlib.sha1(json.dumps([file_signature(a.texts), [st.lr, st.batch_tokens, st.w_user, st.replay_ratio, st.epochs, st.seed, warmup],
                                   base_cfg.get('slm'), [os.stat(os.path.join(init, 'model.safetensors')).st_size,
                                                         os.stat(os.path.join(init, 'model.safetensors')).st_mtime_ns],
                                   len(replay) if replay is not None else 0, round(holdout, 6)]).encode()).hexdigest()
    private_dir(a.out)
    step, trained_tokens = 0, 0
    if a.resume and os.path.isfile(os.path.join(resume_dir, 'state.pt')):
        try:
            state = load_resume(os.path.join(resume_dir, 'state.pt'))
            if state.get('sig') == sig:
                opt.load_state_dict(state['opt'])             # the optimizer first: if either fails, the weights below are the init's
                optimizer_to(opt, device)                     # a state saved on another device (the processor, a graphics card) moves to this one
                model.load_state_dict(state['model'])
                rng_from_plain(replay_rng, state['replay_rng'])
                step, trained_tokens = int(state['step']), int(state['tokens'])
        except Exception as e:
            print(f'could not resume: {e}', file=sys.stderr)
            # a half-applied resume must not leave the checkpoint's weights under a fresh plan: start again from what we were given
            model.load_state_dict(load_file(os.path.join(init, 'model.safetensors')), strict=False)
            opt = make_optimizer(model, st.lr, st.wd)
            replay_rng = np.random.RandomState(st.seed + 7)
            step, trained_tokens = 0, 0
    dev_before = eval_nll(model, dev_seqs, bf16=st.bf16, device=device) if dev_seqs and step == 0 else None

    stop = {'now': False}

    def on_term(signum, frame):
        stop['now'] = True
    for name in ('SIGTERM', 'SIGINT'):
        try:
            signal.signal(getattr(signal, name), on_term)
        except (ValueError, OSError, AttributeError):
            pass

    def save_resume():
        private_dir(resume_dir)
        tmp = private_file(os.path.join(resume_dir, 'state.pt.tmp'))
        torch.save({'sig': sig, 'model': {k: v.detach().cpu() for k, v in model.state_dict().items()}, 'opt': to_cpu(opt.state_dict()),
                    'replay_rng': rng_to_plain(replay_rng), 'step': step, 'tokens': trained_tokens}, tmp)
        os.replace(tmp, os.path.join(resume_dir, 'state.pt'))

    say({'progress': {'done': step, 'total': total}})
    last_save = time.time()
    resume_every = float(os.environ.get('HYDOR_SUGGEST_RESUME_SECONDS') or RESUME_SECONDS)
    while step < total:
        if stop['now']:
            save_resume()
            sys.exit(143)
        b = [train_seqs[i] for i in plan[step]]
        if replay is not None:
            # public text in the same batch: replay_ratio tokens of it per token of the person's, at weight 1; each piece is cut to the
            # batch's longest sequence (from its start, so its markers stay), so a batch of short messages is never padded to long chunks
            need = int(st.replay_ratio * sum(len(q.ids) - 1 for q in b))
            lmax = max(8, max(len(q.ids) for q in b))
            extra, got = [], 0
            while got < need:
                for q in replay.sample(need - got, replay_rng):
                    if len(q.ids) > lmax:
                        q = q._replace(ids=q.ids[:lmax], w=q.w[:lmax])
                    extra.append(q)
                    got += len(q.ids) - 1
                    if got >= need:
                        break
            b = b + extra
        for g in opt.param_groups:
            g['lr'] = lr_at(step, total, st.lr, warmup)
        opt.zero_grad(set_to_none=True)
        loss, ntok = train_step(model, b, micro_tokens, st.bf16, device)
        gnorm = float(torch.nn.utils.clip_grad_norm_(model.parameters(), st.clip))
        finite = math.isfinite(loss) and math.isfinite(gnorm)
        if finite:
            opt.step()
        else:                                                 # a step whose loss or gradient is not finite is skipped, never applied
            opt.zero_grad(set_to_none=True)
        step += 1
        trained_tokens += ntok
        say({'progress': {'done': step, 'total': total}, **({'loss': round(loss, 5)} if finite else {'skipped': True})})
        if time.time() - last_save >= resume_every and step < total:
            save_resume()
            last_save = time.time()

    # ---- the end: the dev loss, the files ----
    dev_nll = eval_nll(model, dev_seqs, bf16=st.bf16, device=device) if dev_seqs else None
    model.cpu()
    weights = state_for_save(model)
    bad = [k for k, v in weights.items() if not bool(torch.isfinite(v).all())]
    if bad:                                                   # never write a model with a nan or an inf in it
        say({'error': f'the trained model has non-finite weights ({bad[0]}, {len(bad)} tensors): not saved'})
        shutil.rmtree(resume_dir, ignore_errors=True)
        sys.exit(1)
    languages = {str(k): int(v) for k, v in (prev_meta.get('languages') or {}).items()}
    for k, v in languages_new.items():
        languages[k] = languages.get(k, 0) + v
    own_total = int(prev_meta.get('tokens') or 0) + own_tokens
    write_atomic(os.path.join(a.out, 'config.json'), json.dumps(base_cfg, indent=1).encode())
    tmp = os.path.join(a.out, 'model.safetensors.tmp')
    save_file(weights, private_file(tmp))
    os.replace(tmp, os.path.join(a.out, 'model.safetensors'))
    held = {} if dev_nll is None else {'dev_nll': dev_nll, 'dev_nll_before': dev_before}     # only when something was held out
    meta = {'format': 'hydor-suggest-personal/1', 'trained_at': int(time.time() * 1000), 'tokens': own_total, 'languages': languages,
            **held, 'steps': total}
    write_atomic(os.path.join(a.out, 'meta.json'), json.dumps(meta, indent=1).encode())
    shutil.rmtree(resume_dir, ignore_errors=True)
    say({'done': True, **held, 'tokens': own_total, 'seconds': round(time.time() - t_start, 1),
         'languages': languages})
