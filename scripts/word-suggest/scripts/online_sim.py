#!/usr/bin/env python
"""E5: keep the SLM current over the test days (frozen | daily | message | retrain).  See ws/online.py.

  nice -n 19 .venv/bin/python scripts/online_sim.py --init runs/slm_5m_lfm/ckpt.pt --mode daily --out runs/online_daily
"""
import argparse
import os
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import torch  # noqa: E402

from ws.online import OnlineCfg, run_online  # noqa: E402
from ws.train import Corpus, Metrics, TrainCfg  # noqa: E402
from ws.vocab import DEFAULT_LLM  # noqa: E402


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data', default='data')
    p.add_argument('--init', required=True, help='the base checkpoint (trained on the train split)')
    p.add_argument('--out', required=True)
    p.add_argument('--llm', default=DEFAULT_LLM)
    p.add_argument('--mode', default='daily', choices=['frozen', 'daily', 'message', 'retrain'])
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--bf16', action='store_true')
    p.add_argument('--max-days', type=int, default=None)
    p.add_argument('--w-user', type=float, default=4.0)
    p.add_argument('--w-agent', type=float, default=1.0)
    p.add_argument('--w-doc', type=float, default=1.0)
    p.add_argument('--update-agent-tokens', type=int, default=150000, help='cap on new agent tokens per daily update (0: all)')
    p.add_argument('--replay', type=float, default=1.0)
    p.add_argument('--lr', type=float, default=3e-4)
    p.add_argument('--epochs', type=float, default=1.0)
    p.add_argument('--batch-tokens', type=int, default=16384)
    p.add_argument('--msg-lr', type=float, default=1e-4)
    p.add_argument('--msg-steps', type=int, default=1)
    p.add_argument('--msg-replay-seqs', type=int, default=0)
    p.add_argument('--retrain-every', type=int, default=1)
    p.add_argument('--retrain-lr', type=float, default=3e-3)
    p.add_argument('--retrain-epochs', type=float, default=1.0)
    p.add_argument('--replay-dev', action='store_true')
    p.add_argument('--seed', type=int, default=0)
    a = p.parse_args(argv)
    torch.set_num_threads(min(a.threads, 8))
    corpus = Corpus.load(a.data, a.llm)
    cfg = OnlineCfg(mode=a.mode, w_user=a.w_user, w_agent=a.w_agent, w_doc=a.w_doc, replay=a.replay, lr=a.lr,
                    epochs=a.epochs, batch_tokens=a.batch_tokens, msg_lr=a.msg_lr, msg_steps=a.msg_steps,
                    msg_replay_seqs=a.msg_replay_seqs, retrain_every=a.retrain_every, max_days=a.max_days, bf16=a.bf16,
                    seed=a.seed, update_agent_tokens=a.update_agent_tokens or None, replay_dev=a.replay_dev,
                    retrain_cfg=TrainCfg(lr=a.retrain_lr, epochs=a.retrain_epochs, bf16=a.bf16, eval_every=0,
                                         log_every=10 ** 9, batch_tokens=a.batch_tokens))
    run_online(corpus, a.init, a.out, cfg, Metrics(a.out))


if __name__ == '__main__':
    main()
