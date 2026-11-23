#!/usr/bin/env python
"""Train (or continue training) an SLM from data/*.jsonl.  Metrics: JSON lines on stdout and <out>/metrics.jsonl.

  nice -n 19 .venv/bin/python scripts/train_slm.py --out runs/slm_5m_lfm --arch lfm --size 5m --threads 4 --epochs 3
  ... --init runs/slm_5m_lfm/ckpt.pt --from-ts 2026-10-01 --to-ts 2026-10-08 --replay 2 --steps 50 --lr 3e-4

Personalising a pretrained base (E7): --init <pretrained ckpt> with no --from-ts / --to-ts continues on the whole local train split
(user weight --w-user; never dev or test), e.g.
  nice -n 19 .venv/bin/python scripts/train_slm.py --out runs/slm/pre15m_w4 --init runs/slm/pre15m/ckpt.pt \
      --vocab runs/vocab_multi.json --w-user 4 --epochs 1 --lr 5e-4 --bf16 --threads 4
--vocab must be the checkpoint's own vocabulary (checked).  --device cuda trains on the first GPU (CPU is the default).
Against forgetting the languages the base was pretrained on: --replay-pretrain data/pretrain --replay-pretrain-ratio 1.0 puts R tokens
of pretraining text (the corpus's own language mix, held-out documents excluded, loss weight 1, the formats pretrain_slm.py uses) into
every batch per token of local data; --freeze-embeddings keeps the embedding (and the tied output factors) as pretrained.
LoRA instead of full fine-tuning: add --lora-rank 8 (adapters on the attention, MLP and convolution projections, everything else frozen;
--train-proj / --train-embed also train the embedding projection / the embedding table, which is the output layer, in full). The checkpoint
written has the adapters merged into the weights: every evaluation script loads it as before.
"""
import argparse
import os
import sys

_dev = next((sys.argv[i + 1] for i, x in enumerate(sys.argv[:-1]) if x == '--device'), 'cpu')
if not _dev.startswith('cuda'):
    os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')       # the CPU rule of this folder (SPEC.md)
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'true')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from ws.slm import SIZES, SLM, SLMConfig, load_ckpt, resolve_vocab_path  # noqa: E402
from ws.train import (Corpus, Metrics, TrainCfg, build_sequences, fit, parse_ts, seq_tokens)  # noqa: E402
from ws.vocab import DEFAULT_LLM, Vocab, load_vocab  # noqa: E402


def get_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data', default='data')
    p.add_argument('--out', required=True)
    p.add_argument('--llm', default=DEFAULT_LLM)
    p.add_argument('--arch', default='lfm', choices=['lfm', 'tf'])
    p.add_argument('--size', default='5m', choices=list(SIZES))
    p.add_argument('--kernel', type=int, default=3)
    p.add_argument('--window', type=int, default=0, help='sliding window of the sliding attention layers (0: full)')
    p.add_argument('--min-count', type=int, default=3)
    p.add_argument('--vocab', default=None, help="use this vocab.json instead of building one; 'full' = every LLM id")
    p.add_argument('--emb-rank', type=int, default=0, help='from scratch: factorised tied embedding of this rank (0: plain)')
    p.add_argument('--w-user', type=float, default=4.0)
    p.add_argument('--w-agent', type=float, default=1.0)
    p.add_argument('--w-doc', type=float, default=1.0)
    p.add_argument('--max-agent-tokens', type=int, default=None)
    p.add_argument('--chunk-tokens', type=int, default=254)
    p.add_argument('--batch-tokens', type=int, default=16384)
    p.add_argument('--lr', type=float, default=2e-3)
    p.add_argument('--wd', type=float, default=0.1)
    p.add_argument('--warmup', type=int, default=50)
    p.add_argument('--epochs', type=float, default=None)
    p.add_argument('--tokens', type=int, default=None, help='training token budget (input tokens)')
    p.add_argument('--steps', type=int, default=None)
    p.add_argument('--max-seconds', type=float, default=None)
    p.add_argument('--bf16', action='store_true')
    p.add_argument('--device', default='cpu', help='cpu (default) or cuda / cuda:N')
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--eval-every', type=int, default=200)
    p.add_argument('--log-every', type=int, default=20)
    p.add_argument('--dev-max', type=int, default=600)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--init', default=None, help='continue from this checkpoint')
    p.add_argument('--from-ts', default=None, help='continued training: window start (ms or ISO date)')
    p.add_argument('--to-ts', default=None, help='window end (exclusive)')
    p.add_argument('--ngram', action='store_true', help='also build <out>/ngram.npz (interpolated Kneser-Ney, order 4) from the same weighted data')
    p.add_argument('--ngram-only', action='store_true', help='build the n-gram only, no neural training')
    p.add_argument('--ngram-order', type=int, default=4)
    p.add_argument('--replay-pretrain', default=None, help='a pretraining corpus directory (data/pretrain, data/pretrain200) to mix into every batch')
    p.add_argument('--replay-pretrain-ratio', type=float, default=1.0, help='tokens of pretraining text per token of local data in a batch')
    p.add_argument('--replay-sources', default=None, help='comma list of shard names to replay (default: all)')
    p.add_argument('--freeze-embeddings', action='store_true', help='keep the embedding and the tied output factors fixed')
    p.add_argument('--replay', type=float, default=1.0, help='mix R x as many older tokens into a continued run')
    p.add_argument('--lora-rank', type=int, default=0, help='LoRA (ws/lora.py): adapters of this rank on the projections, the rest of a continued model frozen (0: full fine-tuning)')
    p.add_argument('--lora-alpha', type=float, default=None, help='LoRA scale alpha (the update is multiplied by alpha / rank; default 2 x rank)')
    p.add_argument('--lora-targets', default='attn,mlp,conv', help='LoRA: groups of projections: attn (q k v o), mlp (gate up down), conv (in_proj out_proj of the convolution layers)')
    p.add_argument('--lora-dropout', type=float, default=0.0)
    p.add_argument('--train-proj', action='store_true', help='LoRA: also train the embedding projection (emb_proj, d <-> rank), in full')
    p.add_argument('--train-embed', action='store_true', help='LoRA: also train the embedding table (vocabulary x rank; it is the output layer too), in full')
    return p.parse_args(argv)


def main(argv=None):
    a = get_args(argv)
    torch.set_num_threads(min(a.threads, 8))
    device = torch.device(a.device)
    # A hard cap on this process's GPU memory (WS_GPU_MEM_GB, e.g. 6): the GPUs are shared with live services, so a step
    # that needs more fails here, inside this process, instead of growing into the memory they use.
    if device.type == 'cuda' and os.environ.get('WS_GPU_MEM_GB'):
        gpu = device.index if device.index is not None else torch.cuda.current_device()
        total = torch.cuda.get_device_properties(gpu).total_memory
        torch.cuda.set_per_process_memory_fraction(min(1.0, float(os.environ['WS_GPU_MEM_GB']) * 2**30 / total), gpu)
    torch.manual_seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    metrics = Metrics(a.out)
    corpus = Corpus.load(a.data, a.llm)
    vocab_path = os.path.join(a.out, 'vocab.json')
    from_ts, to_ts = parse_ts(a.from_ts), parse_ts(a.to_ts)
    continued = a.init is not None

    if continued:
        model, vocab, ck = load_ckpt(a.init)
        if a.vocab:
            want = load_vocab(a.vocab, a.llm)
            if want.llm_name != vocab.llm_name or not np.array_equal(want.slm2llm, vocab.slm2llm):
                raise SystemExit(f'--vocab {a.vocab} is not the vocabulary of {a.init} ({want.v_sub} ids vs {vocab.v_sub})')
        vocab.save(vocab_path)
    else:
        def sel_train(kind, r):
            return r['split'] == 'train'
        if a.vocab:
            vocab = load_vocab(a.vocab, a.llm)
        else:
            vocab = Vocab.from_counts(a.llm, corpus.count_ids(sel_train, a.max_agent_tokens, a.seed), a.min_count)
        vocab.save(vocab_path)
        model = SLM(SLMConfig.for_size(a.size, a.arch, vocab.v_sub, kernel=a.kernel, window=a.window, emb_rank=a.emb_rank))

    kw = dict(w_user=a.w_user, w_agent=a.w_agent, w_doc=a.w_doc, chunk_tokens=a.chunk_tokens, seed=a.seed)
    windowed = from_ts is not None or to_ts is not None
    if continued and not windowed:
        # personalising a pretrained base: the whole local train split, once (SPEC E7); dev and test are never trained on
        train_seqs = build_sequences(corpus, vocab, lambda k, r: r['split'] == 'train',
                                     max_agent_tokens=a.max_agent_tokens, **kw)
    elif continued:
        lo, hi = from_ts or 0, to_ts or (1 << 62)
        new = build_sequences(corpus, vocab, lambda k, r: lo <= r['ts'] < hi and r['split'] != 'dev',
                              max_agent_tokens=a.max_agent_tokens, **kw)
        old = build_sequences(corpus, vocab, lambda k, r: r['ts'] < lo and r['split'] != 'dev',
                              max_agent_tokens=a.max_agent_tokens, **kw)
        rng = np.random.RandomState(a.seed)
        want = a.replay * seq_tokens(new)
        rep, tot = [], 0
        for i in rng.permutation(len(old)):
            if tot >= want:
                break
            rep.append(old[i])
            tot += len(old[i].ids) - 1
        train_seqs = new + rep
        metrics.emit({'new_seqs': len(new), 'new_tokens': seq_tokens(new), 'replay_seqs': len(rep), 'replay_tokens': tot})
    else:
        train_seqs = build_sequences(corpus, vocab, lambda k, r: r['split'] == 'train',
                                     max_agent_tokens=a.max_agent_tokens, **kw)
    dev_seqs = build_sequences(corpus, vocab, lambda k, r: r['split'] == 'dev', w_user=1.0, eos=False, kinds=('chat',))
    metrics.emit({'params': model.n_params(), 'params_body': model.n_params_body(), 'v_sub': vocab.v_sub,
                  'train_seqs': len(train_seqs), 'train_tokens': seq_tokens(train_seqs), 'dev_seqs': len(dev_seqs),
                  'min_count': vocab.min_count})
    if not train_seqs:
        raise SystemExit('no training sequences')
    if (a.ngram or a.ngram_only) and not continued:
        import time
        from ws.ngram import KNModel, eval_ngram
        t0 = time.time()
        kn = KNModel.build([(s.ids, s.w) for s in train_seqs], vocab.v_sub, a.ngram_order, {'args': {k: v for k, v in vars(a).items() if isinstance(v, (int, float, str, type(None)))}})
        kn.save(os.path.join(a.out, 'ngram.npz'), vocab_path)
        metrics.emit({'ngram_build_s': time.time() - t0, 'ngram_order': kn.order,
                      **{f'ngram_entries_{i + 1}': n for i, n in enumerate(kn.meta['n_entries'])}})
        dev_ng = build_sequences(corpus, vocab, lambda k, r: r['split'] == 'dev', w_user=1.0, eos=False, kinds=('chat',))
        metrics.emit({'ngram_' + k: v for k, v in eval_ngram(kn, vocab, dev_ng).items()})
        if a.ngram_only:
            return

    cfg = TrainCfg(lr=a.lr, warmup=a.warmup, wd=a.wd, batch_tokens=a.batch_tokens, epochs=a.epochs, tokens=a.tokens,
                   steps=a.steps, bf16=a.bf16, eval_every=a.eval_every, log_every=a.log_every, dev_max=a.dev_max,
                   max_seconds=a.max_seconds, seed=a.seed)
    if not (cfg.epochs or cfg.tokens or cfg.steps):
        cfg.epochs = 1
    if a.lora_rank:
        if not continued:
            raise SystemExit('--lora-rank personalises a pretrained model: it needs --init')
        from ws.lora import apply_lora
        metrics.emit({'lora': apply_lora(model, a.lora_rank, a.lora_alpha, [g for g in a.lora_targets.split(',') if g],
                                         train_proj=a.train_proj, train_embed=a.train_embed, dropout=a.lora_dropout)})
    elif a.train_proj or a.train_embed:
        raise SystemExit('--train-proj and --train-embed go with --lora-rank (full fine-tuning trains everything)')
    if a.freeze_embeddings:
        frozen = [model.embed.weight] + ([model.emb_proj.weight] if model.emb_proj is not None else [])
        for q in frozen:
            q.requires_grad_(False)
        metrics.emit({'frozen_params': int(sum(q.numel() for q in frozen))})
    replay = None
    if a.replay_pretrain:
        from ws.pretrain_data import Replay
        replay = Replay(a.replay_pretrain, vocab, a.replay_sources.split(',') if a.replay_sources else None, chat_max_len=256)   # replayed chats no longer than the local messages, so a batch pads little
        metrics.emit({'replay_seqs': len(replay), 'replay_ratio': a.replay_pretrain_ratio})
    model.to(device)
    res = fit(model, train_seqs, cfg, dev_seqs=dev_seqs, vocab=vocab, out_dir=a.out, vocab_path=vocab_path,
              metrics=metrics, ckpt_extra={'args': vars(a)}, device=device,
              replay=replay, replay_ratio=a.replay_pretrain_ratio)
    metrics.emit({'final_steps': res['steps'], 'final_tokens': res['tokens'], 'cpu_s': res['cpu_s'],
                  'wall_s': res['wall_s'], 'best_dev_nll': res['best'].get('dev_nll', float('nan')),
                  'best_dev_bpb': res['best'].get('dev_bpb', float('nan')), 'best_step': res['best'].get('step', 0)})


if __name__ == '__main__':
    main()
