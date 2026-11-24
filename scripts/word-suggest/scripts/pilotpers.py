#!/usr/bin/env python
"""Personalise a model with the app's recipe (server/suggest/train.ts) on the owner's train split, as the app does it.

Run from the folder that holds data/, runs/, release/ (see README). The app's own trainer (server/suggest/py/hydor_suggest/train.py) runs
as it is, from a texts file built the way the app builds it (an own message with the agent reply it answered, the agents' replies, the own
notes and documents) from the train split only (before the dev period).  The settings are the app's: --init from the model, --max-tokens
4000000, --replay-ratio 0.5 from the release's replay/, --holdout 0, lr 5e-4, batches of 4096 tokens, one epoch, warm-up 50 (shrinks with a
short run), cosine, own words x4, seed 0.

  scripts/pilotpers.py texts  --texts private/train.jsonl                       the texts file (private: the owner's writing)
  CUDA_VISIBLE_DEVICES=3 WS_GPU_MEM_GB=6 .venv-gpu/bin/python scripts/pilotpers.py train --texts private/train.jsonl \
      --init runs/pilotpers/app_pilot --out runs/pilotpers/pers_pilot            personalise (the folder: model.safetensors, config.json, meta.json)
  scripts/pilotpers.py ckpt --app runs/pilotpers/pers_pilot --vocab runs/slm/pre50b_30m_cmix/vocab.json   research checkpoint for real_chances.py

Private: the texts file holds the owner's own writing; nothing here prints text, and the logs hold counts and losses only.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
APP_PY = os.path.join(REPO, 'server', 'suggest', 'py')


def read_jsonl(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def build_texts(a):
    """The texts file the app would write for this person, from the train split: messages with the reply each answered, agent replies,
    own notes and documents (other_texts: none of them is in the train split)."""
    split = json.load(open(os.path.join(a.data, 'split.json')))
    end = int(split['dev_from_ts'])
    n = {'user': 0, 'agent': 0, 'doc': 0}
    fd = os.open(a.texts, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        for r in read_jsonl(os.path.join(a.data, 'user_msgs.jsonl')):
            if int(r.get('ts') or 0) < end and r.get('split', 'train') == 'train' and str(r.get('text') or '').strip():
                out.write(json.dumps({'kind': 'user', 'text': r['text'], 'ts': int(r['ts']), 'reply': r.get('prev_agent') or ''}) + '\n')
                n['user'] += 1
        for r in read_jsonl(os.path.join(a.data, 'agent_texts.jsonl')):
            if int(r.get('ts') or 0) < end and r.get('split', 'train') == 'train' and str(r.get('text') or '').strip():
                out.write(json.dumps({'kind': 'agent', 'text': r['text'], 'ts': int(r['ts'])}) + '\n')
                n['agent'] += 1
        for r in read_jsonl(os.path.join(a.data, 'other_texts.jsonl')):
            if r.get('author', 'user') == 'user' and int(r.get('ts') or 0) < end and r.get('split', 'train') == 'train' and str(r.get('text') or '').strip():
                out.write(json.dumps({'kind': 'doc', 'text': r['text'], 'ts': int(r['ts'])}) + '\n')
                n['doc'] += 1
    print(json.dumps({'records': n, 'train_until_ts': end}))


def train(a):
    import torch
    if os.environ.get('WS_GPU_MEM_GB') and torch.cuda.is_available():
        torch.cuda.set_device(0)
        total = torch.cuda.get_device_properties(0).total_memory
        torch.cuda.set_per_process_memory_fraction(min(1.0, float(os.environ['WS_GPU_MEM_GB']) * 2 ** 30 / total), 0)
    sys.path.insert(0, APP_PY)
    from hydor_suggest import train as AT
    rel = a.release
    argv = ['--texts', a.texts, '--base', rel, '--init', a.init, '--out', a.out, '--replay', os.path.join(rel, 'replay'),
            '--lr', '5e-4', '--batch-tokens', '4096', '--w-user', '4', '--replay-ratio', '0.5', '--epochs', '1',
            '--holdout', '0', '--max-tokens', '4000000', '--threads', str(a.threads), '--device', a.device, '--seed', '0',
            '--micro-tokens', str(a.micro_tokens)]
    AT.main(argv)


def to_ckpt(a):
    import torch
    from safetensors.torch import load_file
    from ws.slm import SLM, SLMConfig, save_ckpt
    cfg = json.load(open(os.path.join(a.app, 'config.json')))
    m = SLM(SLMConfig(**cfg['slm']))
    m.load_state_dict(load_file(os.path.join(a.app, 'model.safetensors')), strict=True)
    out = a.ckpt or os.path.join(a.app, 'ckpt.pt')
    save_ckpt(out, m, os.path.abspath(a.vocab), {'from': os.path.basename(a.app.rstrip('/'))})
    print(out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    t = sub.add_parser('texts')
    t.add_argument('--data', default='data')
    t.add_argument('--texts', required=True)
    r = sub.add_parser('train')
    r.add_argument('--texts', required=True)
    r.add_argument('--init', required=True)
    r.add_argument('--out', required=True)
    r.add_argument('--release', default='release/hydor-suggest-49m')
    r.add_argument('--device', default='cuda')
    r.add_argument('--threads', type=int, default=4)
    r.add_argument('--micro-tokens', type=int, default=4096)
    c = sub.add_parser('ckpt')
    c.add_argument('--app', required=True)
    c.add_argument('--vocab', default='runs/slm/pre50b_30m_cmix/vocab.json')
    c.add_argument('--ckpt', default=None)
    a = p.parse_args()
    {'texts': build_texts, 'train': train, 'ckpt': to_ckpt}[a.cmd](a)


if __name__ == '__main__':
    main()
