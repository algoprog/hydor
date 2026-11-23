"""Training data, batching, the training loop and the dev metrics for the SLMs (SPEC.md, E3/E5).

Sequences (all on SLM ids; w[i] is the loss weight of predicting ids[i] from ids[:i]):
- chat (a user message segment): ``slm_prefix_ids(context) + target + <eos>``, loss on target and <eos> at ``w_user``;
  contexts are the ones ws/textdata.py builds (SPEC: the last 100 words of the agent's reply and the typed words).
- agent replies: ``<bos> <agent> text <eos>`` chunks at ``w_agent``; other texts ``<bos> <doc> text <eos>`` chunks at
  ``w_doc`` (author "user": ``w_user``).  <eos> only ends the last chunk of a text.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
import pickle
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Iterable, NamedTuple, Optional

import numpy as np
import torch

from .slm import SLM, SLMConfig, save_ckpt
from . import textdata as td
from .vocab import BOS, DOC, EOS, AGENT, UNK, Vocab, encode_texts, get_tokenizer, llm_vocab_size

def read_jsonl(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def parse_ts(s) -> Optional[int]:
    """ms since epoch from an int, a numeric string, or an ISO date (UTC)."""
    if s is None or s == '':
        return None
    try:
        return int(float(s))
    except ValueError:
        d = dt.datetime.fromisoformat(str(s))
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return int(d.timestamp() * 1000)


def day_of(ts_ms: int) -> str:
    return dt.datetime.fromtimestamp(ts_ms / 1000, dt.timezone.utc).strftime('%Y-%m-%d')


class Corpus:
    """All records tokenized once with the LLM tokenizer (LLM ids); sequences are built from it for any vocab."""

    def __init__(self, users, agents, others, llm_name, v_llm):
        self.users, self.agents, self.others = users, agents, others
        self.llm_name, self.v_llm = llm_name, v_llm

    @classmethod
    def load(cls, data_dir: str, llm_name: str, cache_dir: Optional[str] = None, log=print) -> 'Corpus':
        files = [os.path.join(data_dir, f) for f in ('user_msgs.jsonl', 'agent_texts.jsonl', 'other_texts.jsonl')]
        sig = hashlib.sha1(json.dumps([llm_name, 3] + [(os.path.getsize(f), int(os.path.getmtime(f)))
                                                       if os.path.exists(f) else 0 for f in files]).encode()).hexdigest()[:16]
        cache = os.path.join(cache_dir or os.path.join(data_dir, '..', 'runs', '_cache'), f'corpus-{sig}.pkl')
        if os.path.exists(cache):
            with open(cache, 'rb') as f:
                return pickle.load(f)
        tok = get_tokenizer(llm_name)
        v_llm = llm_vocab_size(llm_name)
        um = list(td.chat_candidates(files[0], 'all', 'agent+user')) if os.path.exists(files[0]) else []
        at, ot = read_jsonl(files[1]), read_jsonl(files[2])
        log(f'tokenizing {len(um)} user segments, {len(at)} agent texts, {len(ot)} other texts', file=sys.stderr)
        strings: dict[str, int] = {}

        def reg(s: str) -> int:
            return strings.setdefault(s, len(strings))

        users: dict[str, dict] = {}
        for c in um:                  # ws.textdata builds the contexts (SPEC), one candidate per segment
            base = c['id'].split('#')[0]
            u = users.setdefault(base, {'id': base, 'ts': c['ts'], 'split': c['split'], 'lang': c['lang'], 'segs': []})
            u['segs'].append((reg(c['agent_ctx']), reg(c['user_ctx']), reg(c['target']), len(c['target'].encode('utf-8'))))
        users = list(users.values())
        agents = [{'id': r['id'], 'ts': int(r.get('ts') or 0), 'split': r.get('split', 'train'), 'text': reg(r['text'])}
                  for r in at if (r.get('text') or '').strip()]
        others = [{'id': r['id'], 'ts': int(r.get('ts') or 0), 'split': r.get('split', 'train'), 'author': r.get('author', 'unknown'),
                   'text': reg(r['text'])} for r in ot if (r.get('text') or '').strip()]
        order = sorted(strings, key=strings.get)
        t0 = time.time()
        enc = encode_texts(tok, order)
        log(f'tokenized {len(order)} strings in {time.time() - t0:.0f}s', file=sys.stderr)
        for u in users:
            u['segs'] = [(enc[a], enc[b], enc[c], nb) for a, b, c, nb in u['segs']]
        for r in agents + others:
            r['ids'] = enc[r.pop('text')]
        c = cls(users, agents, others, llm_name, v_llm)
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache + '.tmp', 'wb') as f:
            pickle.dump(c, f)
        os.replace(cache + '.tmp', cache)
        return c

    def count_ids(self, select: Callable[[str, dict], bool], agent_budget: Optional[int] = None, seed: int = 0):
        """Counts of LLM ids over the selected records' own text (targets, agent replies, other texts)."""
        arrs = []
        for u in self.users:
            if select('user', u):
                arrs += [s[2] for s in u['segs']]
        for r in subsample_agents(self.agents, select, agent_budget, seed):
            arrs.append(r['ids'])
        arrs += [r['ids'] for r in self.others if select('other', r)]
        return Vocab.count_ids(arrs, self.v_llm)


def subsample_agents(agents, select, budget: Optional[int], seed: int):
    sel = [r for r in agents if select('agent', r)]
    if not budget:
        return sel
    rng = np.random.RandomState(seed)
    out, tot = [], 0
    for i in rng.permutation(len(sel)):
        if tot >= budget:
            break
        out.append(sel[i])
        tot += len(sel[i]['ids'])
    return out


class Seq(NamedTuple):
    ids: np.ndarray       # int32 [L]
    w: np.ndarray         # float32 [L]
    kind: str             # 'chat' | 'agent' | 'doc'
    ts: int
    nbytes: int           # UTF-8 bytes of the target text (chat only)


def _chunks(ids: np.ndarray, size: int):
    return [ids[i:i + size] for i in range(0, max(len(ids), 1), size)] if len(ids) else []


def build_sequences(corpus: Corpus, vocab: Vocab, select: Callable[[str, dict], bool], *, w_user=4.0, w_agent=1.0,
                    w_doc=1.0, max_agent_tokens: Optional[int] = None, chunk_tokens=254, max_ctx=256, max_len=1024,
                    eos=True, seed=0, kinds=('chat', 'agent', 'doc')) -> list[Seq]:
    l2s = vocab.llm2slm
    out: list[Seq] = []
    if 'chat' in kinds:
        for u in corpus.users:
            if not select('user', u):
                continue
            for i, (a, us, t, nb) in enumerate(u['segs']):
                prefix = vocab.prefix_from_ids('chat', l2s[a], l2s[us], (), max_ctx)
                tgt = l2s[t][:max(0, max_len - len(prefix) - 1)]
                last = i == len(u['segs']) - 1
                add_eos = eos and last
                ids = np.concatenate([prefix, tgt, [EOS] if add_eos else []]).astype(np.int32)
                w = np.zeros(len(ids), dtype=np.float32)
                w[len(prefix):] = w_user
                out.append(Seq(ids, w, 'chat', u['ts'], nb))

    def text_seqs(recs, marker, weight_of, kind):
        for r in recs:
            body = l2s[r['ids']]
            wt = weight_of(r)
            chunks = _chunks(body, chunk_tokens)
            for j, ch in enumerate(chunks):
                last = j == len(chunks) - 1
                ids = np.concatenate([[BOS, marker], ch, [EOS] if (last and eos) else []]).astype(np.int32)
                w = np.full(len(ids), wt, dtype=np.float32)
                w[:2] = 0
                out.append(Seq(ids, w, kind, r['ts'], 0))

    if 'agent' in kinds:
        text_seqs(subsample_agents(corpus.agents, select, max_agent_tokens, seed), AGENT, lambda r: w_agent, 'agent')
    if 'doc' in kinds:
        text_seqs([r for r in corpus.others if select('other', r)], DOC,
                  lambda r: w_user if r.get('author') == 'user' else w_doc, 'doc')
    return out


def seq_tokens(seqs) -> int:
    return int(sum(len(s.ids) - 1 for s in seqs))


# ===================================================================================================================
# Batches
# ===================================================================================================================
def make_batches(lengths: np.ndarray, batch_tokens: int, rng: np.random.RandomState, shuffle=True, block: int = 1) -> list[np.ndarray]:
    """Length-bucketed batches of about batch_tokens padded tokens: sort inside windows of shuffled sequences.
    block > 1: the shuffle moves runs of `block` consecutive sequences (a big corpus on a network disk is then read in runs, not at
    random: one page holds 16 sequences of 256 tokens)."""
    n = len(lengths)
    if n == 0:
        return []
    if not shuffle:
        perm = np.arange(n)
    elif block > 1:
        nb = -(-n // block)
        perm = (rng.permutation(nb).astype(np.int64)[:, None] * block + np.arange(block)[None, :]).ravel()
        perm = perm[perm < n]
    else:
        perm = rng.permutation(n)
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


def make_plan(seqs, batch_tokens, rng, epochs: Optional[float] = None, tokens: Optional[int] = None,
              steps: Optional[int] = None) -> list[np.ndarray]:
    """Batches for `steps` steps, or `tokens` input tokens, or `epochs` passes (default 1) over seqs."""
    lengths = np.array([len(s.ids) for s in seqs])
    plan: list[np.ndarray] = []
    total_tok, n_ep, per_epoch = 0, 0, None
    while True:
        eb = make_batches(lengths, batch_tokens, rng)
        if not eb:
            return plan
        per_epoch = per_epoch or len(eb)
        for b in eb:
            plan.append(b)
            total_tok += int(lengths[b].sum() - len(b))
            if steps and len(plan) >= steps:
                return plan
            if tokens and total_tok >= tokens:
                return plan
            if not steps and not tokens and len(plan) >= (epochs or 1) * per_epoch:
                return plan
        n_ep += 1


def collate(seqs: list[Seq]):
    L = max(len(s.ids) for s in seqs)
    ids = np.zeros((len(seqs), L), dtype=np.int64)
    w = np.zeros((len(seqs), L), dtype=np.float32)
    for i, s in enumerate(seqs):
        ids[i, :len(s.ids)] = s.ids
        w[i, :len(s.ids)] = s.w
    ids, w = torch.from_numpy(ids), torch.from_numpy(w)
    return ids[:, :-1], ids[:, 1:], w[:, 1:]


# ===================================================================================================================
# Evaluation
# ===================================================================================================================
@torch.no_grad()
def eval_seqs(model: SLM, vocab: Vocab, seqs: list[Seq], batch_tokens=16384, bf16=False, device='cpu') -> dict:
    """NLL and bits per byte over the positions with weight > 0 (use sequences without <eos> and with w = 1).

    A target token outside the vocabulary (gold = <unk>) is charged -log P(<unk>) + log(n outside): the <unk> mass
    spread evenly over the LLM ids outside the vocabulary (a proper probability, a pessimistic one; with the LLM
    behind it that mass goes to the LLM's choice).  ``dev_nll_iv`` leaves those tokens out.
    """
    was = model.training
    model.eval()
    log_out = math.log(max(vocab.n_outside, 1))
    tot = tot_iv = 0.0
    n = n_iv = 0
    lengths = np.array([len(s.ids) for s in seqs])
    for b in make_batches(lengths, batch_tokens, np.random.RandomState(0), shuffle=False):
        ids, tg, w = (x.to(device) for x in collate([seqs[i] for i in b]))
        with torch.autocast(torch.device(device).type, dtype=torch.bfloat16, enabled=bf16):
            nll, gold = model.token_nll(ids, tg, w > 0)
        nll = nll.float()
        oov = gold == UNK
        tot += float(nll.sum() + oov.sum() * log_out)
        tot_iv += float(nll[~oov].sum())
        n += len(nll)
        n_iv += int((~oov).sum())
    model.train(was)
    nbytes = sum(s.nbytes for s in seqs)
    return {'dev_nll': tot / max(n, 1), 'dev_bpb': tot / math.log(2) / max(nbytes, 1),
            'dev_nll_iv': tot_iv / max(n_iv, 1), 'dev_oov': 1 - n_iv / max(n, 1), 'dev_tokens': n,
            'dev_bytes': nbytes, 'nll_sum': tot, 'nll_iv_sum': tot_iv, 'n_iv': n_iv}


# ===================================================================================================================
# Training
# ===================================================================================================================
@dataclass
class TrainCfg:
    lr: float = 2e-3
    min_lr_frac: float = 0.1
    warmup: int = 50
    wd: float = 0.1
    clip: float = 1.0
    batch_tokens: int = 16384
    epochs: Optional[float] = None
    tokens: Optional[int] = None
    steps: Optional[int] = None
    bf16: bool = False
    eval_every: int = 200
    log_every: int = 20
    dev_max: int = 600          # dev sequences used for the periodic evaluation (all for the last)
    max_seconds: Optional[float] = None
    seed: int = 0


def make_optimizer(model: SLM, lr: float, wd: float, fused: bool = False):
    dec, nodec = [], []
    for n, p in model.named_parameters():
        if not p.requires_grad:                # frozen (train_slm.py --freeze-embeddings)
            continue
        (dec if p.ndim >= 2 and 'embed' not in n and 'conv' not in n and 'lm_head' not in n else nodec).append(p)
    return torch.optim.AdamW([{'params': dec, 'weight_decay': wd}, {'params': nodec, 'weight_decay': 0.0}],
                             lr=lr, betas=(0.9, 0.95), eps=1e-8, **({'fused': True} if fused else {}))


def lr_at(step: int, total: int, cfg: TrainCfg) -> float:
    if step < cfg.warmup:
        return cfg.lr * (step + 1) / cfg.warmup
    p = (step - cfg.warmup) / max(1, total - cfg.warmup)
    return cfg.lr * (cfg.min_lr_frac + (1 - cfg.min_lr_frac) * 0.5 * (1 + math.cos(math.pi * min(1.0, p))))


def train_step(model: SLM, opt, batch: list[Seq], lr: float, clip: float, bf16: bool, device='cpu') -> tuple[float, int]:
    """One optimizer step on a batch of sequences.  Returns (weighted mean loss, input tokens)."""
    for g in opt.param_groups:
        g['lr'] = lr
    ids, tg, w = (x.to(device) for x in collate(batch))
    with torch.autocast(torch.device(device).type, dtype=torch.bfloat16, enabled=bf16):
        chunk = 1024 if model.cfg.vocab <= 65536 else 0       # the lm head in chunks: the same loss, bounded memory (0: the model's own default, 384 for a full vocabulary)
        sw, sws, _ = model.loss(ids, tg, w, chunk=chunk)
    loss = sw / sws.clamp(min=1e-8)
    opt.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), clip)
    opt.step()
    return float(loss.detach()), int(ids.numel())


class Metrics:
    def __init__(self, out_dir: Optional[str], quiet=False):
        self.path = os.path.join(out_dir, 'metrics.jsonl') if out_dir else None
        self.quiet = quiet
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

    def emit(self, rec: dict):
        rec = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in rec.items()}
        s = json.dumps(rec)
        if not self.quiet:
            print(s, flush=True)
        if self.path:
            with open(self.path, 'a') as f:
                f.write(s + '\n')


def fit(model: SLM, train_seqs: list[Seq], cfg: TrainCfg, *, dev_seqs: Optional[list[Seq]] = None,
        vocab: Optional[Vocab] = None, out_dir: Optional[str] = None, vocab_path: Optional[str] = None,
        metrics: Optional[Metrics] = None, ckpt_extra: Optional[dict] = None, plan=None, device='cpu',
        replay=None, replay_ratio: float = 0.0) -> dict:
    """Train `model` on `train_seqs`; keep the best checkpoint by dev NLL in out_dir/ckpt.pt (last.pt at the end).
    replay: an object with sample(n_tokens, rng) -> list[Seq] (ws/pretrain_data.py Replay), mixed into every batch.
    Returns {'steps', 'tokens', 'cpu_s', 'wall_s', 'best': {...}}."""
    rng = np.random.RandomState(cfg.seed)
    metrics = metrics or Metrics(out_dir)
    plan = plan if plan is not None else make_plan(train_seqs, cfg.batch_tokens, rng, cfg.epochs, cfg.tokens, cfg.steps)
    total = len(plan)
    opt = make_optimizer(model, cfg.lr, cfg.wd)
    dev_rng = np.random.RandomState(1)
    dev_sub = dev_seqs
    if dev_seqs and len(dev_seqs) > cfg.dev_max:
        dev_sub = [dev_seqs[i] for i in sorted(dev_rng.choice(len(dev_seqs), cfg.dev_max, replace=False))]
    best = {'dev_nll': float('inf')}
    replay_rng = np.random.RandomState(cfg.seed + 7)
    model.train()
    t0, c0 = time.time(), time.process_time()
    win_t, win_tok, win_loss, win_n = time.time(), 0, 0.0, 0
    tokens = 0
    step = 0

    def do_eval(final=False):
        nonlocal best
        if not dev_seqs:
            return
        d = eval_seqs(model, vocab, dev_seqs if final else dev_sub, cfg.batch_tokens, cfg.bf16, device)
        metrics.emit({'step': step, 'elapsed_s': time.time() - t0, **d})
        if d['dev_nll'] < best['dev_nll'] and out_dir:
            best = {**d, 'step': step}
            save_ckpt(os.path.join(out_dir, 'ckpt.pt'), model, vocab_path, {'step': step, **d, **(ckpt_extra or {})})
        elif d['dev_nll'] < best['dev_nll']:
            best = {**d, 'step': step}

    for step in range(1, total + 1):
        if cfg.max_seconds and time.time() - t0 > cfg.max_seconds:
            step -= 1
            break
        b = [train_seqs[i] for i in plan[step - 1]]
        if replay is not None and replay_ratio > 0:
            # pretraining text in the same batch: replay_ratio tokens of it per token of the local data, at loss weight 1.
            # Each replayed piece is cut to the local batch's longest sequence (from its start, so its markers stay), and
            # more are drawn until the ratio is met: a batch of short messages is never padded to the replay chunks' length.
            need = int(replay_ratio * sum(len(q.ids) - 1 for q in b))
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
        loss, ntok = train_step(model, opt, b, lr_at(step - 1, total, cfg), cfg.clip, cfg.bf16, device)
        tokens += ntok
        win_tok, win_loss, win_n = win_tok + ntok, win_loss + loss, win_n + 1
        if step % cfg.log_every == 0 or step == total:
            now = time.time()
            metrics.emit({'step': step, 'train_loss': win_loss / win_n, 'tokens_per_s': win_tok / max(now - win_t, 1e-9),
                          'elapsed_s': now - t0, 'lr': lr_at(step - 1, total, cfg), 'tokens': tokens})
            win_t, win_tok, win_loss, win_n = now, 0, 0.0, 0
        if cfg.eval_every and step % cfg.eval_every == 0 and step < total:
            do_eval()
            win_t = time.time()
    do_eval(final=True)
    if out_dir and vocab_path:
        save_ckpt(os.path.join(out_dir, 'last.pt'), model, vocab_path, {'step': step, **(ckpt_extra or {})})
        if not os.path.exists(os.path.join(out_dir, 'ckpt.pt')):
            save_ckpt(os.path.join(out_dir, 'ckpt.pt'), model, vocab_path, {'step': step, **(ckpt_extra or {})})
    return {'steps': step, 'tokens': tokens, 'cpu_s': time.process_time() - c0, 'wall_s': time.time() - t0,
            'best': best}
