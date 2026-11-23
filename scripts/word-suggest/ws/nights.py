"""Nightly personalisation, simulated: does the small model drift when it learns a little every night for weeks?

The recipe is the app's (server/suggest/py/hydor_suggest/train.py, imported as it is): the first run starts from the published model and
reads everything written so far; every later run starts from the current personal model and reads only what was written since the
previous run, with the release's public text (replay/) replayed 1:1 in every batch, one epoch, lr 5e-4, batches of 4,096 tokens,
own words x4, AdamW with warm-up 50 and cosine, and a fresh optimizer each run.  This module holds what the simulation adds:

- the records of the owner's data as the app's trainer reads them (a message with the agent reply it answered, an agent reply);
- the nights: the data cut into days that end on the dev boundary (a day is 24 h, the records of a day are one night's new text);
- ``train_run``: one run of the app's loop on given sequences, in a process that keeps the model on the GPU;
- the safeguards' pieces (a sample of older sequences for B, the public held-out slice for C);
- the measures along the way (``Measures``): the harness's teacher-forced metrics (ws/evaluate.py) for the model held in memory.

Private: the data is the owner's own writing.  Nothing here prints or stores text; the logs hold counts and losses only.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import pickle
import sys
import time
from collections import defaultdict
from typing import Optional

import numpy as np
import torch

HERE = os.path.dirname(os.path.realpath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
APP_PY = os.path.join(REPO, 'server', 'suggest', 'py')
if APP_PY not in sys.path:
    sys.path.insert(0, APP_PY)

from hydor_suggest import train as T  # noqa: E402  (the app's trainer, used as it is)
from hydor_suggest import vocab as AV  # noqa: E402
from hydor_suggest.model import build_model, config_from_dict  # noqa: E402

DAY_MS = 86400 * 1000

# FLORES-200 languages of the forgetting measure: English, large and mid languages, and low-resource ones
FLORES_LANGS = ['eng_Latn', 'deu_Latn', 'fra_Latn', 'spa_Latn', 'ell_Grek', 'rus_Cyrl', 'arb_Arab', 'hin_Deva', 'tur_Latn',
                'vie_Latn', 'kor_Hang', 'zho_Hans', 'jpn_Jpan',
                'swh_Latn', 'tam_Taml', 'yor_Latn', 'hau_Latn', 'amh_Ethi', 'cym_Latn', 'mri_Latn', 'gle_Latn', 'kat_Geor',
                'npi_Deva']
LOW_RESOURCE = ['swh_Latn', 'tam_Taml', 'yor_Latn', 'hau_Latn', 'amh_Ethi', 'cym_Latn', 'mri_Latn', 'gle_Latn', 'kat_Geor',
                'npi_Deva']
# the public held-out slice of C: documents of the corpus' own held-out part (never in the replay), in languages that are NOT
# all the forgetting measure's (the low-resource ones are left out on purpose: does the check protect what it does not look at?)
CHECK_LANGS = ['eng_Latn', 'deu_Latn', 'fra_Latn', 'spa_Latn', 'ita_Latn', 'por_Latn', 'rus_Cyrl', 'pol_Latn', 'nld_Latn',
               'arb_Arab', 'hin_Deva', 'tur_Latn', 'ind_Latn', 'ben_Beng', 'tha_Thai', 'cmn_Hani']
COUNT_KEYS = ('n_examples', 'n_tokens', 'nll_nats', 'bytes', 'n_words', 'acc_n@0', 'acc_hit@0', 'acc_n@1', 'acc_hit@1',
              'char_n', 'char_hit')


# ===================================================================================================================
# The records and the nights
# ===================================================================================================================
def read_jsonl(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def load_records(data_dir: str) -> list:
    """The owner's messages and the agents' replies as the app's trainer reads its texts file, oldest first (a stable sort).
    The notes and documents (other_texts) are left out: none is before the dev period and they are agent-written."""
    recs = []
    for r in read_jsonl(os.path.join(data_dir, 'user_msgs.jsonl')):
        text = AV.nfc(str(r.get('text') or '')).strip()
        if text and int(r.get('ts') or 0) > 0:
            recs.append({'kind': 'user', 'text': text, 'ts': int(r['ts']), 'reply': AV.nfc(str(r.get('prev_agent') or '')),
                         'split': r.get('split', 'train')})
    for r in read_jsonl(os.path.join(data_dir, 'agent_texts.jsonl')):
        text = AV.nfc(str(r.get('text') or '')).strip()
        if text and int(r.get('ts') or 0) > 0:
            recs.append({'kind': 'agent', 'text': text, 'ts': int(r['ts']), 'reply': '', 'split': r.get('split', 'train')})
    recs.sort(key=lambda r: r['ts'])
    return recs


class AllSeqs:
    """The training sequences of every record, built once with the app's own builder (and kept in a cache file)."""

    def __init__(self, recs: list, tok_path: str, cache: Optional[str] = None, w_user: float = 4.0, log=print):
        key = [len(recs), sum(r['ts'] for r in recs) % 1000003, w_user]
        if cache and os.path.exists(cache):
            with open(cache, 'rb') as f:
                d = pickle.load(f)
            if d['key'] == key:
                self.seqs, self.rec = d['seqs'], d['rec']
                self._index()
                return
        from tokenizers import Tokenizer
        tok = Tokenizer.from_file(tok_path)
        tok.no_truncation()
        tok.no_padding()
        t0 = time.time()
        built = T.build_sequences(recs, T.Tokens(tok), w_user)
        log(f'built {len(built)} sequences of {len(recs)} records in {time.time() - t0:.0f}s', file=sys.stderr)
        self.rec = np.array([ri for ri, _ in built], dtype=np.int64)
        self.seqs = [s for _, s in built]
        if cache:
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            with open(cache + '.tmp', 'wb') as f:
                pickle.dump({'key': key, 'seqs': self.seqs, 'rec': self.rec}, f)
            os.replace(cache + '.tmp', cache)
        self._index()

    def _index(self):
        self.ts = np.array([s.ts for s in self.seqs], dtype=np.int64)
        self.ntok = np.array([len(s.ids) - 1 for s in self.seqs], dtype=np.int64)
        self.kind = np.array([s.kind for s in self.seqs])


def day_index(ts: int, anchor: int) -> int:
    return (int(ts) - anchor) // DAY_MS


def nights_of(recs: list, anchor: int, end_ts: int, step_days: int = 1) -> list:
    """[(day, [record indexes])] for the days that have new writing before end_ts, oldest first.  A day is 24 h, the days end on
    the dev boundary (anchor), so day d holds ts in [anchor + d*DAY, anchor + (d+1)*DAY); the night of day d reads it, at its end.
    step_days > 1: a run every step_days days reads the days since the previous run."""
    by = defaultdict(list)
    for ri, r in enumerate(recs):
        if r['ts'] < end_ts:
            by[day_index(r['ts'], anchor)].append(ri)
    days = sorted(by)
    if step_days <= 1:
        return [(d, by[d]) for d in days]
    out, cur, cur_day = [], [], None
    first, last_day = days[0], days[-1]
    for d in range(first, last_day + 1):
        cur += by.get(d, [])
        if (d - first) % step_days == step_days - 1 or d == last_day:
            if cur:
                out.append((d, cur))
            cur = []
    return out


# ===================================================================================================================
# Replay (the release's public text, as the app reads it)
# ===================================================================================================================
def load_replay(release_dir: str):
    return T.Replay(os.path.join(release_dir, 'replay'))


def new_model(release_dir: str, init_dir: Optional[str], device) -> tuple:
    """(the app's model in train mode on the device, the config dict) from the release (or a personal folder)."""
    with open(os.path.join(release_dir, 'config.json'), encoding='utf-8') as f:
        base_cfg = json.load(f)
    from safetensors.torch import load_file
    model = build_model(config_from_dict(base_cfg['slm']), load_file(os.path.join(init_dir or release_dir, 'model.safetensors')), freeze=False)
    model.train()
    model.to(device)
    return model, base_cfg


def reset_weights(model, state: dict) -> None:
    model.load_state_dict(state)
    model.train()


# ===================================================================================================================
# One run of the app's loop
# ===================================================================================================================
def train_run(model, seqs: list, replay, *, seed: int, device, st: Optional[T.Settings] = None, micro_tokens: int = 4096,
              log_losses: bool = False) -> dict:
    """The app's training loop (train.py main) on `seqs`, from the model's weights, with a fresh optimizer: one plan of batches of
    st.batch_tokens padded tokens over `seqs`, replay_ratio public tokens per token of the batch, warm-up min(50, steps // 10), cosine
    to 10% of lr, gradient clipping, a step with a non-finite loss is skipped.  `seed` seeds the plan and (+7) the replay's draws."""
    st = st or T.Settings(bf16=T.use_bf16('cuda' if torch.device(device).type == 'cuda' else 'cpu'), seed=seed)
    rng = np.random.RandomState(seed)
    lengths = np.array([len(s.ids) for s in seqs])
    plan = T.make_plan(lengths, st.batch_tokens, rng, st.epochs)
    total = len(plan)
    warmup = min(st.warmup, max(1, total // 10))
    opt = T.make_optimizer(model, st.lr, st.wd)
    replay_rng = np.random.RandomState(seed + 7)
    model.train()
    t0 = time.time()
    losses, tokens, skipped, own_tokens = [], 0, 0, 0
    for step in range(total):
        b = [seqs[i] for i in plan[step]]
        if replay is not None:
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
            g['lr'] = T.lr_at(step, total, st.lr, warmup)
        opt.zero_grad(set_to_none=True)
        loss, ntok = T.train_step(model, b, micro_tokens, st.bf16, device)
        gnorm = float(torch.nn.utils.clip_grad_norm_(model.parameters(), st.clip))
        if math.isfinite(loss) and math.isfinite(gnorm):
            opt.step()
        else:
            opt.zero_grad(set_to_none=True)
            skipped += 1
        tokens += ntok
        losses.append(loss)
    if device != 'cpu' and torch.device(device).type == 'cuda':
        torch.cuda.synchronize()
    return {'steps': total, 'tokens': tokens, 'seconds': time.time() - t0, 'skipped': skipped,
            'loss_first': float(np.mean(losses[:max(1, len(losses) // 5)])) if losses else None,
            'loss_last': float(np.mean(losses[-max(1, len(losses) // 5):])) if losses else None,
            **({'losses': losses} if log_losses else {})}


def sample_older(seqs: 'AllSeqs', before_ts: int, want_tokens: int, rng: np.random.RandomState, kind: Optional[str] = None) -> list:
    """Sequences of records older than before_ts, drawn uniformly (without replacement) until they hold want_tokens
    (kind: only 'chat' = the person's own messages).  Fewer if the pool is smaller.  Read again from the data: nothing is kept."""
    mask = seqs.ts < before_ts
    if kind:
        mask &= seqs.kind == kind
    idx = np.nonzero(mask)[0]
    if not len(idx) or want_tokens <= 0:
        return []
    idx = idx[rng.permutation(len(idx))]
    cum = np.cumsum(seqs.ntok[idx])
    n = int(np.searchsorted(cum, want_tokens)) + 1
    return [seqs.seqs[i] for i in idx[:n]]


# ===================================================================================================================
# The public held-out slice (C's check and a drift measure for every arm)
# ===================================================================================================================
def public_slice(pre_dir: str, vocab, langs: list, per_lang: int = 24, seed: int = 0) -> dict:
    """{group: [Seq]}: per_lang chunks of the held-out ('dev') documents of the corpus for each language, and the held-out chats.
    Held-out documents are never in the corpus' train part, so never in the replay."""
    from ws.pretrain_data import Shards
    rng = np.random.RandomState(seed)
    out = {}
    for lg in langs:
        names = [n for n in (f'web_{lg}', f'web_{lg}_b') if os.path.exists(os.path.join(pre_dir, f'{n}.dev.tok.npy'))]
        if not names:
            continue
        sh = Shards(pre_dir, 'dev', vocab, sources=names)
        full = np.nonzero(sh.lengths >= 200)[0]            # whole chunks only: the same amount of text per sequence
        pick = rng.choice(full, size=min(per_lang, len(full)), replace=False)
        out[lg] = [sh[int(i)] for i in sorted(pick)]
    sh = Shards(pre_dir, 'dev', vocab, sources=['chat'], chat_max_len=256)
    pick = rng.choice(len(sh), size=min(per_lang, len(sh)), replace=False)
    out['chat'] = [sh[int(i)] for i in sorted(pick)]
    return out


@torch.no_grad()
def public_losses(model, groups: dict, device, bf16: bool) -> dict:
    """Mean NLL (nats per token) of each group and their macro average (every language counts the same)."""
    res = {}
    for g, seqs in groups.items():
        res[g] = T.eval_nll(model, seqs, batch_tokens=16384, bf16=bf16, device=device)
    res['macro'] = float(np.mean([v for v in res.values()]))
    return res


# ===================================================================================================================
# Measures: the harness's teacher-forced metrics for the model held in memory
# ===================================================================================================================
class Measures:
    def __init__(self, release_dir: str, vocab_path: str, data_dir: str, device, taus=(0.0, 0.4), log=print):
        from transformers import AutoTokenizer
        from ws.evaluate import EvalConfig, Evaluator
        from ws.scorers import llm_vocab_size
        from ws.slm import SLM, SLMConfig, SLMScorer
        from ws.tokbytes import end_token_ids, token_bytes
        from ws.vocab import DEFAULT_LLM, Vocab
        from ws.gpu import to_device
        self.device, self.data_dir = torch.device(device), data_dir
        self.tok = AutoTokenizer.from_pretrained(DEFAULT_LLM)
        V = llm_vocab_size(DEFAULT_LLM)
        self.tb = token_bytes(self.tok, V)
        self.ev = Evaluator(self.tb, end_token_ids(self.tok, V), EvalConfig(taus=taus), device=str(self.device))
        with open(os.path.join(release_dir, 'config.json'), encoding='utf-8') as f:
            cfg = json.load(f)['slm']
        self.vocab = Vocab.load(vocab_path)
        model = SLM(SLMConfig(**cfg))

        class Mem(SLMScorer):
            def __init__(s, m, v):
                s.model, s.vocab, s.ckpt, s.name = m, v, {}, 'slm:mem'
        self.scorer = Mem(model, self.vocab)
        to_device(self.scorer, self.device)
        self._cache: dict = {}

    def sync(self, app_model) -> None:
        """Copy the app model's weights into the scorer's model."""
        sd = {k: v.detach() for k, v in app_model.state_dict().items()}
        self.scorer.model.model.load_state_dict(sd)
        self.scorer.model.eval()

    def examples(self, key: str, **kw):
        if key not in self._cache:
            from ws.textdata import load_examples
            self._cache[key] = load_examples(self.tok, data_dir=self.data_dir, **kw)
        return self._cache[key]

    def score(self, exs: list, per_example: bool = False):
        """The summed counts of the examples (COUNT_KEYS), and the per-example counts if asked."""
        tot, per = defaultdict(float), []
        for ex in exs:
            lp = self.scorer.logprobs(ex, None)
            c = self.ev.score(ex, lp)
            for k in COUNT_KEYS:
                if k in c:
                    tot[k] += c[k]
            if per_example:
                per.append({'id': ex.id, 'lang': ex.lang, **{k: c[k] for k in COUNT_KEYS if k in c}})
        tot = dict(tot)
        return (tot, per) if per_example else tot


def nll_acc(c: dict) -> dict:
    """nll (nats per token), bpb, acc@0, acc@1, char accuracy from summed counts."""
    out = {'n_examples': c.get('n_examples', 0), 'n_tokens': c.get('n_tokens', 0)}
    if c.get('n_tokens'):
        out['nll'] = c['nll_nats'] / c['n_tokens']
    if c.get('bytes'):
        out['bpb'] = c['nll_nats'] / math.log(2) / c['bytes']
    for k in (0, 1):
        if c.get(f'acc_n@{k}'):
            out[f'acc@{k}'] = c[f'acc_hit@{k}'] / c[f'acc_n@{k}']
    if c.get('char_n'):
        out['char_acc'] = c['char_hit'] / c['char_n']
    return out
