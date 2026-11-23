#!/usr/bin/env python
"""Nightly personalisation over weeks, simulated: drift, and three safeguards (ws/nights.py has the pieces; the recipe is the app's).

  CUDA_VISIBLE_DEVICES=1 WS_GPU_MEM_GB=6 nice -n 19 .venv-gpu/bin/python scripts/nights_sim.py --arm A --out runs/nights/A

Arms (one process each):
  P   the published model, never trained (a reference: what the first night starts from)
  A   today's way: night n starts from the model of the previous night and reads the new text only, public text replayed 1:1,
      a different draw each night (seed = the night's day)
  B   A, and a sample of older writing read again from the data, as many tokens as the new text (all kinds of text, sequences drawn
      uniformly); B2: only the person's own older messages (as many tokens as the new text, or all of them if fewer)
  C   A, and a check after each night: the macro-average loss on a held-out slice of public text (16 languages and chats, documents
      of the corpus' held-out part, never in the replay) must not be worse than the previous model's by more than --margin nats,
      else the previous model stays (the night's text is not read again, unless --carry)
  D   A, and every --reset-days days (counted from the last fresh start) a fresh start from the published model on everything
      written so far (the first night is one)
  R   one run from the published model on everything up to the end of the dev period (what the first run gives)

Measures (counts and losses only, never text): before each night's run, the teacher-forced NLL and acc@1 of that day's own messages
(the model of the previous night: the next day's messages); after it the public held-out loss; every --eval-every nights FLORES-200
dev (23 languages, --flores-n sentences each), the person's earliest messages and, before the dev period, the dev period's messages;
at the end more FLORES sentences, the test period's messages one by one, and the checkpoint (research format) for real decoding.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from ws import nights as N  # noqa: E402
from ws.gpu import setup_device  # noqa: E402

T = N.T


def get_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--arm', required=True, choices=['P', 'A', 'B', 'B2', 'C', 'D', 'R'])
    p.add_argument('--out', required=True)
    p.add_argument('--data', default='data')
    p.add_argument('--release', default='release/hydor-suggest-49m')
    p.add_argument('--vocab', default='runs/slm/pre50b_30m_cmix/vocab.json')
    p.add_argument('--pretrain', default='data/pretrain200b')
    p.add_argument('--device', default='cuda')
    p.add_argument('--margin', type=float, default=0.01, help='C: the most the public held-out loss (nats) may rise in one night')
    p.add_argument('--carry', action='store_true', help='C: the text of a rejected night is read again with the next night')
    p.add_argument('--reset-days', type=int, default=30, help='D: days between fresh starts')
    p.add_argument('--step-days', type=int, default=1, help='one run every this many days')
    p.add_argument('--eval-every', type=int, default=5)
    p.add_argument('--flores-n', type=int, default=30)
    p.add_argument('--flores-final-n', type=int, default=100)
    p.add_argument('--early', type=int, default=200, help='the person\'s earliest messages (segments) kept as a measure')
    p.add_argument('--max-nights', type=int, default=0, help='stop after this many nights (a test)')
    p.add_argument('--lr', type=float, default=5e-4, help='the app\'s 5e-4')
    p.add_argument('--fixed-warmup', action='store_true', help='warm-up always --warmup steps (the app: at most a tenth of the run, so 1 to 3 steps in a short night)')
    p.add_argument('--warmup', type=int, default=50)
    p.add_argument('--micro-tokens', type=int, default=4096)
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--no-final', action='store_true')
    p.add_argument('--resume', action='store_true')
    return p.parse_args(argv)


class Log:
    def __init__(self, path, resume):
        self.path = path
        if not resume and os.path.exists(path):
            os.remove(path)

    def __call__(self, rec):
        rec = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in rec.items()}
        with open(self.path, 'a') as f:
            f.write(json.dumps(rec) + '\n')


def main(argv=None):
    a = get_args(argv)
    torch.set_num_threads(a.threads)
    device = setup_device(a.device)
    os.makedirs(a.out, exist_ok=True)
    log = Log(os.path.join(a.out, 'log.jsonl'), a.resume)
    bf16 = T.use_bf16('cuda' if device.type == 'cuda' else 'cpu')
    split = json.load(open(os.path.join(a.data, 'split.json')))
    anchor, test_from = int(split['dev_from_ts']), int(split['test_from_ts'])

    recs = N.load_records(a.data)
    seqs = N.AllSeqs(recs, os.path.join(a.release, 'tokenizer.json'), cache=os.path.join(os.path.dirname(a.out.rstrip('/')), '_cache', 'seqs.pkl'))
    nights = N.nights_of(recs, anchor, test_from, a.step_days)
    if a.arm == 'R':
        nights = [(nights[-1][0], [ri for _, rs in nights for ri in rs])]
    replay = N.load_replay(a.release)
    model, base_cfg = N.new_model(a.release, None, device)
    base_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    meas = N.Measures(a.release, a.vocab, a.data, device)
    groups = N.public_slice(a.pretrain, meas.vocab, N.CHECK_LANGS, 24, 0)
    pub = lambda: N.public_losses(model, groups, device, bf16)   # noqa: E731

    chat_all = meas.examples('chat_all', split='all', surface='chat', ctx='agent+user', limit=0)
    by_day = {}
    for ex in chat_all:
        by_day.setdefault(N.day_index(ex.ts, anchor), []).append(ex)
    early = sorted(chat_all, key=lambda e: (e.ts, e.id))[:a.early]
    dev_fixed = [ex for ex in chat_all if ex.split == 'dev']
    test_msgs = [ex for ex in chat_all if ex.split == 'test']
    lang_arg = ','.join(N.FLORES_LANGS)
    flores = meas.examples(f'flores{a.flores_n}', split='dev', surface='flores', ctx='agent+user', limit=a.flores_n, lang=lang_arg)

    def eval_set(name_prefix, night_pos, day):
        """FLORES per language, the earliest messages, the dev period's messages (while it is not yet trained on)."""
        t0 = time.time()
        meas.sync(model)
        fl = {}
        for lg in N.FLORES_LANGS:
            exs = [e for e in flores if e.lang == lg]
            fl[lg] = meas.score(exs)
        rec = {'t': 'eval', 'night': night_pos, 'day': day, 'flores': fl, 'early': meas.score(early)}
        if day < 0:
            rec['devfix'] = meas.score(dev_fixed)
        rec['eval_s'] = time.time() - t0
        log(rec)

    state_path = os.path.join(a.out, 'state.pt')
    start_pos, last_reset_day, cur_pub, carried = 0, None, None, []
    if a.resume and os.path.exists(state_path):
        st = torch.load(state_path, map_location='cpu', weights_only=False)
        model.load_state_dict(st['model'])
        start_pos, last_reset_day, cur_pub, carried = st['pos'], st['last_reset_day'], st['cur_pub'], st['carried']
        print(f'resumed at night {start_pos}', file=sys.stderr)
    else:
        cur_pub = pub()
        log({'t': 'start', 'arm': a.arm, 'nights': len(nights), 'first_day': nights[0][0], 'last_day': nights[-1][0],
             'records': len(recs), 'sequences': len(seqs.seqs), 'pub': cur_pub, 'args': vars(a)})
        eval_set('start', -1, nights[0][0] - 1)
    stt = T.Settings(bf16=bf16, lr=a.lr, warmup=a.warmup)

    t_all = time.time()
    for pos, (day, ridx) in enumerate(nights):
        if pos < start_pos:
            continue
        if a.max_nights and pos >= a.max_nights:
            break
        win_start = anchor + day * N.DAY_MS
        win_end = win_start + N.DAY_MS * a.step_days
        # ---- the next day's messages, scored by the model as it is before tonight's run
        pq_exs = [e for d in range(day - a.step_days + 1, day + 1) for e in by_day.get(d, [])]
        meas.sync(model)
        pq = meas.score(pq_exs) if pq_exs else {}
        rec = {'t': 'night', 'arm': a.arm, 'pos': pos, 'day': day, 'n_records': len(ridx), 'pq': pq}
        # ---- tonight's run
        seed = day + 200
        fresh = (a.arm == 'R' or (a.arm in ('A', 'B', 'B2', 'C', 'D') and pos == 0)
                 or (a.arm == 'D' and last_reset_day is not None and day - last_reset_day >= a.reset_days))
        if a.arm == 'P':
            pass
        else:
            if fresh:
                model.load_state_dict(base_state)
                mask = seqs.ts < (win_end if a.arm != 'R' else test_from)
                train_seqs = [s for s, m in zip(seqs.seqs, mask) if m]
                last_reset_day = day
            else:
                ids = list(ridx) + (carried if a.arm == 'C' and a.carry else [])
                sel = np.isin(seqs.rec, np.array(ids, dtype=np.int64))
                train_seqs = [s for s, m in zip(seqs.seqs, sel) if m]
                if a.arm in ('B', 'B2'):
                    want = int(sum(len(s.ids) - 1 for s in train_seqs))
                    older = N.sample_older(seqs, min(recs[i]['ts'] for i in ids), want, np.random.RandomState(seed + 13),
                                           'chat' if a.arm == 'B2' else None)
                    rec['older_tokens'] = int(sum(len(s.ids) - 1 for s in older))
                    train_seqs = train_seqs + older
            if a.arm == 'C':
                backup = {k: v.detach().clone() for k, v in model.state_dict().items()}
            rec['fresh'] = bool(fresh)
            rec['new_tokens'] = int(sum(len(s.ids) - 1 for s in train_seqs))
            r = N.train_run(model, train_seqs, replay, seed=seed, device=device, st=stt, micro_tokens=a.micro_tokens, fixed_warmup=a.fixed_warmup)
            rec.update({k: r[k] for k in ('steps', 'tokens', 'seconds', 'skipped', 'loss_first', 'loss_last')})
        t1 = time.time()
        new_pub = pub()
        rec['pub_s'] = time.time() - t1
        accepted = True
        if a.arm == 'C':
            accepted = new_pub['macro'] <= cur_pub['macro'] + a.margin
            rec['pub_before'], rec['pub_candidate'] = cur_pub['macro'], new_pub['macro']
            if not accepted:
                model.load_state_dict(backup)
                model.train()
                new_pub = cur_pub
                carried = list(ridx) + carried if a.carry else []
            else:
                carried = []
        rec['accepted'] = bool(accepted)
        cur_pub = new_pub
        rec['pub'] = cur_pub
        log(rec)
        if a.eval_every and (pos + 1) % a.eval_every == 0 and a.arm != 'R':
            eval_set('night', pos, day)
        print(f"night {pos + 1}/{len(nights)} day {day} recs {len(ridx)} " + (f"steps {rec.get('steps')} {rec.get('seconds', 0):.1f}s " if 'steps' in rec else '')
              + f"pub {cur_pub['macro']:.4f} acc {accepted} total {time.time() - t_all:.0f}s", file=sys.stderr, flush=True)
        if a.arm not in ('P', 'R') and (pos + 1) % 5 == 0:
            torch.save({'model': {k: v.detach().cpu() for k, v in model.state_dict().items()}, 'pos': pos + 1,
                        'last_reset_day': last_reset_day, 'cur_pub': cur_pub, 'carried': carried}, state_path + '.tmp')
            os.replace(state_path + '.tmp', state_path)

    if a.no_final or a.max_nights:
        return
    # ---- the end: the model as it is after the last night of the dev period
    meas.sync(model)
    t0 = time.time()
    flo_final = meas.examples(f'flores{a.flores_final_n}', split='dev', surface='flores', ctx='agent+user', limit=a.flores_final_n, lang=lang_arg)
    fl = {lg: meas.score([e for e in flo_final if e.lang == lg]) for lg in N.FLORES_LANGS}
    tot, per = meas.score(test_msgs, per_example=True)
    log({'t': 'final', 'arm': a.arm, 'flores': fl, 'early': meas.score(early), 'test': tot, 'pub': pub(), 'seconds': time.time() - t0})
    with open(os.path.join(a.out, 'test_per_example.json'), 'w') as f:
        json.dump(per, f)
    from ws.slm import save_ckpt
    vocab_abs = os.path.abspath(a.vocab)
    save_ckpt(os.path.join(a.out, 'ckpt.pt'), meas.scorer.model.model, vocab_abs, {'arm': a.arm})
    print('done', file=sys.stderr)


if __name__ == '__main__':
    main()
