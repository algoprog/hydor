#!/usr/bin/env python
"""Pretrain an SLM on the public text of data/pretrain/ (E7), with the multilingual vocabulary of scripts/build_vocab.py.

On the 4 GPUs (DDP, bf16; the .venv-gpu environment):
  .venv-gpu/bin/torchrun --standalone --nproc_per_node 4 scripts/pretrain_slm.py --device cuda --out runs/slm/pre15m \
      --vocab runs/vocab_multi.json --size 15m --tokens 600000000 --bf16 --lr 2e-3 --micro-tokens 16384 --accum 3 --compile
On the CPU (a smoke test, or the 15m model on a few million tokens; the .venv environment, nice 19):
  nice -n 19 .venv/bin/python scripts/pretrain_slm.py --out runs/slm/pre15m_cpu --size 15m --tokens 30000000 --bf16 --threads 4

Sequences (SLM ids; the SLM's own formats, ws/train.py):
- web text: ``<bos> <doc> chunk <eos>`` with chunks of --chunk-tokens tokens (<eos> only ends a document's last chunk), loss on
  every token after <doc>;
- conversations (oasst2, aya): ``<bos> <user> user turn <agent> assistant turn <user> ...`` (a path starts with the prompt, so
  no <agent> before it; every turn is introduced by its role marker, the markers are not predicted, loss on every turn token
  and on the final <eos>), cut at --chat-max-len tokens.
All sources are shuffled together (one pass over the shards, more if --tokens is larger).

Batches: --micro-tokens padded tokens per forward/backward (this sets the memory), --accum micro-batches per optimizer step on
each GPU, so one step is micro-tokens x accum x GPUs padded tokens.  --tokens is the budget of input tokens over all GPUs.
Schedule: linear warmup (--warmup steps), then cosine to --min-lr-frac of --lr.  Every --eval-every steps (GPU 0): the
pretraining dev nll (held-out documents of every source: pdev_nll and pdev_nll_<source>) and the local dev bits per byte of the
user's own dev messages (dev_bpb, computed as scripts/train_slm.py does: chat sequences, user weight 1, no <eos>).  Metrics: JSON
lines on stdout and <out>/metrics.jsonl.  Checkpoints (always plain CPU state dicts, loadable by SLMScorer): <out>/ckpt.pt = best
pretraining dev nll, <out>/last.pt, and every --ckpt-every steps <out>/step_<n>.pt (the last --keep ones); <out>/resume.pt
(model, optimizer, step) lets --resume continue a stopped run.
"""
import argparse
import contextlib
import glob
import json
import os
import sys
import time

_dev = next((sys.argv[i + 1] for i, x in enumerate(sys.argv[:-1]) if x == '--device'), 'cpu')
if not _dev.startswith('cuda'):
    os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')       # the CPU rule of this folder (SPEC.md)
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torch.distributed as dist  # noqa: E402

from ws.slm import SIZES, SLM, SLMConfig, save_ckpt  # noqa: E402
from ws.train import (Corpus, Metrics, Seq, TrainCfg, build_sequences, collate, eval_seqs, lr_at, make_batches,  # noqa: E402
                      make_optimizer)
from ws.pretrain_data import Shards, mix_draw  # noqa: E402
from ws.vocab import DEFAULT_LLM, Vocab, load_vocab  # noqa: E402


def make_plan_lengths(lengths: np.ndarray, batch_tokens: int, rng, tokens=None, steps=None, block: int = 1) -> list:
    """Batches (index arrays) over the shards for `tokens` input tokens, one pass or more."""
    plan, total = [], 0
    while True:
        eb = make_batches(lengths, batch_tokens, rng, block=block)
        if not eb:
            return plan
        for b in eb:
            plan.append(b)
            total += int(lengths[b].sum() - len(b))
            if (steps and len(plan) >= steps) or (tokens and total >= tokens):
                return plan


class BatchSet(torch.utils.data.Dataset):
    """Micro-batch k of the plan as tensors (ids, targets, weights) and its input-token count."""

    def __init__(self, shards: Shards, plan: list, pad_to: int = 16):
        self.shards, self.plan, self.pad_to = shards, plan, pad_to

    def __len__(self):
        return len(self.plan)

    def __getitem__(self, k):
        ids, tg, w = collate([self.shards[int(i)] for i in self.plan[k]])
        pad = (-ids.shape[1]) % self.pad_to           # a few distinct lengths: friendlier to torch.compile
        if pad:
            ids, tg, w = (torch.nn.functional.pad(x, (0, pad)) for x in (ids, tg, w))
        return ids, tg, w, int(self.shards.lengths[self.plan[k]].sum() - len(self.plan[k]))     # input tokens, no padding


class Trainee(torch.nn.Module):
    """What DDP wraps: forward -> (sum of weighted CE, sum of weights)."""

    def __init__(self, model: SLM, chunk: int):
        super().__init__()
        self.model, self.chunk = model, chunk

    def forward(self, ids, tg, w):
        sw, sws, _ = self.model.loss(ids, tg, w, chunk=self.chunk)
        return sw, sws


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--out', required=True)
    p.add_argument('--vocab', default='runs/vocab_multi.json', help="a vocabulary file, or 'full': every LLM id (248,320 + 6 specials)")
    p.add_argument('--emb-rank', type=int, default=0, help='> 0: factorised tied embedding of this rank (use 128 with --vocab full)')
    p.add_argument('--pretrain', default='data/pretrain')
    p.add_argument('--data', default='data', help='the local data (for the local dev bits per byte)')
    p.add_argument('--llm', default=DEFAULT_LLM)
    p.add_argument('--arch', default='lfm', choices=['lfm', 'tf'])
    p.add_argument('--size', default='15m', choices=list(SIZES))
    p.add_argument('--kernel', type=int, default=3)
    p.add_argument('--device', default='cpu', help='cpu, or cuda (one process per GPU under torchrun)')
    p.add_argument('--sources', default=None, help='comma list of shard names to use (default: all)')
    p.add_argument('--chunk-tokens', type=int, default=254)
    p.add_argument('--chat-max-len', type=int, default=768)
    p.add_argument('--micro-tokens', type=int, default=None, help='padded tokens per forward/backward (default 8192 CPU, 16384 GPU)')
    p.add_argument('--accum', type=int, default=1, help='micro-batches per optimizer step on each device')
    p.add_argument('--loss-chunk', type=int, default=None, help='positions per lm-head chunk (default 2048; 1024 for a vocabulary over 65k; 0: all at once)')
    p.add_argument('--tokens', type=int, default=None, help='training token budget (input tokens, all devices)')
    p.add_argument('--steps', type=int, default=None, help='optimizer steps (instead of --tokens)')
    p.add_argument('--max-seconds', type=float, default=None, help='stop after this long (the schedule still spans the plan)')
    p.add_argument('--skip-steps', type=int, default=0, help='--max-seconds counts from the end of this step (a throughput test skips the compile)')
    p.add_argument('--lr', type=float, default=2e-3)
    p.add_argument('--min-lr-frac', type=float, default=0.1)
    p.add_argument('--wd', type=float, default=0.1)
    p.add_argument('--warmup', type=int, default=100)
    p.add_argument('--bf16', action='store_true')
    p.add_argument('--compile', action='store_true', help='torch.compile the model body')
    p.add_argument('--compile-head', action='store_true', help='also compile the chunked cross-entropy of the factorised head (a large vocabulary)')
    p.add_argument('--block-shuffle', type=int, default=1, help='shuffle runs of this many consecutive sequences (16 for a corpus too big for the page cache)')
    p.add_argument('--mix', default=None, help='a JSON of tokens per language (data/mix_complement.json): the run reads each language for its '
                   'target (scaled to --tokens, whole passes then a random part, at most the JSON\'s max_repeats passes), shuffled; one pass over the mix')
    p.add_argument('--workers', type=int, default=2, help='data loader processes per device')
    p.add_argument('--mem-gb', type=float, default=6.0, help='GPU memory cap per process (an OOM error beyond it)')
    p.add_argument('--threads', type=int, default=4, help='CPU threads (per process on a GPU run: 1)')
    p.add_argument('--eval-every', type=int, default=500)
    p.add_argument('--log-every', type=int, default=20)
    p.add_argument('--ckpt-every', type=int, default=500)
    p.add_argument('--keep', type=int, default=3, help='step checkpoints kept')
    p.add_argument('--pdev-chunks', type=int, default=64, help='pretraining dev sequences per source in each evaluation')
    p.add_argument('--pdev-total', type=int, default=4000, help='at most this many pretraining dev sequences in all (many sources: fewer each)')
    p.add_argument('--dev-max', type=int, default=300, help='local dev sequences in the periodic evaluation (all in the last)')
    p.add_argument('--no-local-dev', action='store_true', help='skip the local dev bits per byte')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--resume', action='store_true', help='continue from <out>/resume.pt')
    p.add_argument('--auto-resume', action='store_true', help='continue from <out>/resume.pt if it is there (and then ignore --init), else start: '
                   'the same command after a preemption or the time limit goes on where the last checkpoint was')
    p.add_argument('--ckpt-minutes', type=float, default=0.0, help='also checkpoint (resume.pt, step_N.pt, last.pt) when this many minutes passed since the last')
    p.add_argument('--init', default=None, help='warm start: load the weights of this checkpoint (a new optimizer, a fresh warmup + cosine '
                   'schedule); its vocabulary and model config must be the ones given here')
    a = p.parse_args(argv)

    if a.auto_resume and os.path.exists(os.path.join(a.out, 'resume.pt')):
        a.resume, a.init = True, None
    rank, world = int(os.environ.get('RANK', 0)), int(os.environ.get('WORLD_SIZE', 1))
    local_rank = int(os.environ.get('LOCAL_RANK', 0))
    cuda = a.device.startswith('cuda')
    if cuda:
        torch.cuda.set_device(local_rank)
        dev = torch.device('cuda', local_rank)
        cap_gb = min(a.mem_gb, float(os.environ['WS_GPU_MEM_GB'])) if os.environ.get('WS_GPU_MEM_GB') else a.mem_gb   # the GPUs are shared
        torch.cuda.set_per_process_memory_fraction(min(1.0, cap_gb * 2 ** 30 / torch.cuda.get_device_properties(dev).total_memory), dev)
        torch.set_num_threads(1)
        torch.backends.cuda.matmul.allow_tf32 = True
    else:
        dev = torch.device('cpu')
        torch.set_num_threads(min(a.threads, 8))
    if world > 1:
        dist.init_process_group('nccl' if cuda else 'gloo')
    main_proc = rank == 0
    micro = a.micro_tokens or (16384 if cuda else 8192)
    torch.manual_seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    metrics = Metrics(a.out) if main_proc else Metrics(None, quiet=True)
    vocab = load_vocab(a.vocab, a.llm)
    if a.loss_chunk is None:
        a.loss_chunk = 2048 if vocab.v_sub <= 65536 else 1024
    vocab_path = os.path.join(a.out, 'vocab.json')
    if main_proc:
        vocab.save(vocab_path)
    sources = a.sources.split(',') if a.sources else None
    train = Shards(a.pretrain, 'train', vocab, sources, a.chunk_tokens, a.chat_max_len)
    rng = np.random.RandomState(a.seed)
    per_step = world * a.accum
    want_micro = a.steps * per_step if a.steps else None
    mix_report = None
    if a.mix:
        if not a.tokens:
            raise SystemExit('--mix needs --tokens (the size of the run; the JSON\'s targets are scaled to it)')
        draw, mix_report = mix_draw(train.item_src, train.lengths, train.names, json.load(open(a.mix)), a.tokens, a.seed)
        eb = make_batches(train.lengths[draw], micro, rng, block=a.block_shuffle)      # batches of positions in the draw (runs of files stay together)
        plan = [draw[b] for b in eb]
    else:
        plan = make_plan_lengths(train.lengths, micro, rng, a.tokens, want_micro, a.block_shuffle)
    total = len(plan) // per_step                       # optimizer steps
    plan = plan[:total * per_step]
    cfg = TrainCfg(lr=a.lr, min_lr_frac=a.min_lr_frac, warmup=a.warmup, wd=a.wd, bf16=a.bf16)
    model = SLM(SLMConfig.for_size(a.size, a.arch, vocab.v_sub, kernel=a.kernel, emb_rank=a.emb_rank)).to(dev)
    if a.init:
        if a.resume:
            raise SystemExit('--init and --resume together: --resume continues this run, --init starts a new one from another run')
        ck = torch.load(a.init, map_location='cpu', weights_only=False)
        from ws.slm import resolve_vocab_path
        from dataclasses import asdict
        old_v = Vocab.load(resolve_vocab_path(a.init, ck))
        if old_v.llm_name != vocab.llm_name or not np.array_equal(old_v.slm2llm, vocab.slm2llm):
            raise SystemExit(f'--init {a.init}: its vocabulary ({old_v.v_sub} ids) is not --vocab {a.vocab} ({vocab.v_sub} ids)')
        if ck['config'] != asdict(model.cfg):
            raise SystemExit(f"--init {a.init}: its model config {ck['config']} is not this run's {asdict(model.cfg)} (--size / --emb-rank / --kernel)")
        model.load_state_dict(ck['state_dict'])
        del ck
    opt = make_optimizer(model, a.lr, a.wd, fused=cuda)
    if a.compile:
        model.body = torch.compile(model.body, dynamic=True)
    model.compile_head = bool(a.compile_head)
    net = Trainee(model, a.loss_chunk)
    if world > 1:
        net = torch.nn.parallel.DistributedDataParallel(net, device_ids=[local_rank] if cuda else None)

    pdev, local_dev = {}, None
    if main_proc:
        dev_shards = Shards(a.pretrain, 'dev', vocab, sources, a.chunk_tokens, a.chat_max_len)
        drng = np.random.RandomState(1)
        for si, n in enumerate(dev_shards.names):
            idx = np.flatnonzero(dev_shards.item_src == si)
            per = max(2, min(a.pdev_chunks, a.pdev_total // max(len(dev_shards.names), 1)))
            if len(idx) > per:
                idx = np.sort(drng.choice(idx, per, replace=False))
            pdev[n] = [dev_shards[int(i)] for i in idx]
        if not a.no_local_dev and not os.path.exists(os.path.join(a.data, 'user_msgs.jsonl')):
            a.no_local_dev = True              # no private messages here (a cluster run): the local dev bits per byte is skipped
        if not a.no_local_dev:
            corpus = Corpus.load(a.data, a.llm)
            local_dev = build_sequences(corpus, vocab, lambda k, r: r['split'] == 'dev', w_user=1.0, eos=False, kinds=('chat',))
        metrics.emit({'params': model.n_params(), 'params_body': model.n_params_body(), 'v_sub': vocab.v_sub, 'world': world,
                      'device': str(dev), 'init': a.init or '', 'micro_tokens': micro, 'accum': a.accum,
                      'step_padded_tokens': micro * per_step, 'train_seqs': len(train), 'train_tokens_available': train.tokens(),
                      'plan_steps': total, 'plan_tokens': int(sum(train.lengths[b].sum() - len(b) for b in plan)),
                      'pdev_seqs': sum(len(v) for v in pdev.values()), 'local_dev_seqs': len(local_dev or []),
                      **{f'tokens_{k}': v for k, v in train.by_source().items()}})
        if mix_report is not None:
            lang_rep = {k: v for k, v in mix_report.items() if not k.startswith('_')}
            real = sum(v['realised'] for v in lang_rep.values())
            metrics.emit({'mix_file': a.mix, 'mix_languages': len(lang_rep), 'mix_missing': mix_report['_missing'], 'mix_realised_tokens': real,
                          'mix_capped': sorted(k for k, v in lang_rep.items() if v['capped']),
                          'mix_passes_min': min(v['passes'] for v in lang_rep.values()), 'mix_passes_max': max(v['passes'] for v in lang_rep.values())})
            with open(os.path.join(a.out, 'mix_report.json'), 'w') as f:
                json.dump(mix_report, f, indent=1)

    t_base, start_step, tokens, best = 0.0, 0, 0, float('inf')
    if a.resume:
        r = torch.load(os.path.join(a.out, 'resume.pt'), map_location='cpu', weights_only=False)
        model.load_state_dict(r['model']); opt.load_state_dict(r['opt'])
        start_step, tokens, t_base, best = r['step'], r['tokens'], r['elapsed_s'], r['best']
        metrics.emit({'resumed_at_step': start_step})
    steps_ckpts: list = []
    step = start_step
    t0 = t_ckpt = time.time()

    def run_eval(final=False):
        nonlocal best
        out = {'step': step, 'tokens': tokens, 'elapsed_s': t_base + time.time() - t0}
        s = n = s_iv = n_iv = 0
        by_src = {}
        model.eval()
        for name, seqs in pdev.items():
            if not seqs:
                continue
            d = eval_seqs(model, vocab, seqs, 4096, a.bf16, dev)
            by_src[name] = d['dev_nll']
            if len(pdev) <= 12:
                out[f'pdev_nll_{name}'] = d['dev_nll']
            s += d['nll_sum']; n += d['dev_tokens']; s_iv += d['nll_iv_sum']; n_iv += d['n_iv']
        out['pdev_nll'] = s / max(n, 1)
        out['pdev_nll_iv'] = s_iv / max(n_iv, 1)
        if local_dev:
            sub = local_dev
            if not final and len(local_dev) > a.dev_max:
                sub = [local_dev[i] for i in sorted(np.random.RandomState(1).choice(len(local_dev), a.dev_max, replace=False))]
            d = eval_seqs(model, vocab, sub, 4096, a.bf16, dev)
            out.update({'dev_bpb': d['dev_bpb'], 'dev_nll': d['dev_nll'], 'dev_oov': d['dev_oov']})
        model.train()
        metrics.emit(out)
        if len(pdev) > 12:       # many sources (languages): their nll in a file of its own
            with open(os.path.join(a.out, 'pdev_by_source.jsonl'), 'a') as f:
                f.write(json.dumps({'step': step, **{k: round(v, 4) for k, v in by_src.items()}}) + '\n')
        if out['pdev_nll'] < best:
            best = out['pdev_nll']
            save_ckpt(os.path.join(a.out, 'ckpt.pt'), model, vocab_path, {'step': step, 'tokens': tokens, **out, 'args': vars(a)})

    def checkpoint():
        pth = os.path.join(a.out, f'step_{step}.pt')
        save_ckpt(pth, model, vocab_path, {'step': step, 'tokens': tokens, 'args': vars(a)})
        save_ckpt(os.path.join(a.out, 'last.pt'), model, vocab_path, {'step': step, 'tokens': tokens, 'args': vars(a)})
        steps_ckpts.append(pth)
        while len(steps_ckpts) > a.keep:
            try:
                os.remove(steps_ckpts.pop(0))
            except OSError:
                pass
        tmp = os.path.join(a.out, 'resume.pt.tmp')
        torch.save({'model': {k: v.cpu() for k, v in model.state_dict().items()}, 'opt': opt.state_dict(), 'step': step,
                    'tokens': tokens, 'elapsed_s': t_base + time.time() - t0, 'best': best}, tmp)
        os.replace(tmp, os.path.join(a.out, 'resume.pt'))

    def sync():
        if world > 1:
            dist.barrier()

    # the micro-batches of this rank: step s uses plan[(s * world + rank) * accum + k], k < accum
    order = [((s * world + rank) * a.accum + k) for s in range(start_step, total) for k in range(a.accum)]
    loader = torch.utils.data.DataLoader(BatchSet(train, plan), batch_size=None, sampler=order, num_workers=a.workers,
                                         prefetch_factor=4 if a.workers else None, pin_memory=cuda,
                                         persistent_workers=False, multiprocessing_context='fork' if a.workers else None)
    it = iter(loader)
    model.train()
    win_t, win_tok, win_loss, win_n = time.time(), 0, torch.zeros((), device=dev), 0
    t_run = time.time()
    data_wait = 0.0
    for step in range(start_step + 1, total + 1):
        if step == start_step + a.skip_steps + 1:
            t_run = time.time()
        if a.max_seconds and step > start_step + a.skip_steps:               # every rank must stop at the same step
            flag = torch.tensor([float(time.time() - t_run > a.max_seconds)], device=dev)
            if world > 1:
                dist.all_reduce(flag, op=dist.ReduceOp.MAX)
            if flag.item() > 0:
                step -= 1
                break
        lr = lr_at(step - 1, total, cfg)
        for g in opt.param_groups:
            g['lr'] = lr
        opt.zero_grad(set_to_none=True)
        ntok_step = 0
        for k in range(a.accum):
            t_w = time.time()
            ids, tg, w, nt = next(it)
            data_wait += time.time() - t_w
            ids, tg, w = ids.to(dev, non_blocking=True), tg.to(dev, non_blocking=True), w.to(dev, non_blocking=True)
            ntok_step += nt
            sync_ctx = net.no_sync() if (world > 1 and k < a.accum - 1) else contextlib.nullcontext()
            with sync_ctx:
                with torch.autocast(dev.type, dtype=torch.bfloat16, enabled=a.bf16):
                    sw, sws = net(ids, tg, w)
                loss = sw / sws.clamp(min=1e-8)
                (loss / a.accum).backward()
            win_loss += loss.detach() / a.accum
        torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.clip)
        opt.step()
        tokens += ntok_step * world           # input tokens of all devices
        win_tok += ntok_step * world
        win_n += 1
        if step % a.log_every == 0 or step == total:
            wl = win_loss.clone()
            if world > 1:
                dist.all_reduce(wl)
                wl /= world
            if cuda:
                torch.cuda.synchronize(dev)
            now = time.time()
            metrics.emit({'step': step, 'train_loss': float(wl) / win_n, 'tokens_per_s': win_tok / max(now - win_t, 1e-9),
                          'elapsed_s': t_base + now - t0, 'lr': lr, 'tokens': tokens,
                          'data_wait_frac': data_wait / max(now - win_t, 1e-9),
                          **({'mem_gb': torch.cuda.max_memory_allocated(dev) / 2 ** 30} if cuda else {})})
            win_t, win_tok, win_loss, win_n = now, 0, torch.zeros((), device=dev), 0
            data_wait = 0.0
        if a.eval_every and step % a.eval_every == 0 and step < total:
            if main_proc:
                run_eval()
            sync()
            win_t = time.time()
        if a.ckpt_every and step % a.ckpt_every == 0 and step < total:
            if main_proc:
                checkpoint()
            sync()
            win_t = time.time()
            t_ckpt = time.time()
        if a.ckpt_minutes and step < total:
            due = torch.tensor([float(time.time() - t_ckpt > a.ckpt_minutes * 60)], device=dev)       # rank 0's clock decides for all
            if world > 1:
                dist.broadcast(due, 0)
            if due.item() > 0:
                if main_proc:
                    checkpoint()
                sync()
                win_t = t_ckpt = time.time()
    if main_proc:
        run_eval(final=True)
        save_ckpt(os.path.join(a.out, 'last.pt'), model, vocab_path, {'step': step, 'tokens': tokens, 'args': vars(a)})
        if not os.path.exists(os.path.join(a.out, 'ckpt.pt')):
            save_ckpt(os.path.join(a.out, 'ckpt.pt'), model, vocab_path, {'step': step, 'tokens': tokens, 'args': vars(a)})
        metrics.emit({'final_steps': step, 'final_tokens': tokens, 'wall_s': t_base + time.time() - t0, 'best_pdev_nll': best})
    sync()
    if world > 1:
        dist.destroy_process_group()


if __name__ == '__main__':
    main()
