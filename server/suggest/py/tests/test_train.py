import json
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import unittest

import helpers
import numpy as np
import torch

from hydor_suggest import train as T
from hydor_suggest import vocab as V
from hydor_suggest.engine import Engine

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write_texts(path, n_user=30):
    rows = []
    for i in range(n_user):
        text = (helpers.ENGLISH if i % 3 else helpers.GREEK)[i % 5]
        rows.append({'kind': 'user', 'text': text + f' {i}', 'ts': 1000 + i, 'session': 's', 'reply': 'Sure, I can do that for you.'})
    rows.append({'kind': 'agent', 'text': 'Here is the answer you asked for with some words.', 'ts': 5})
    rows.append({'kind': 'doc', 'text': 'Notes about the project and its parser.\n\nThe parser reads words.', 'ts': 6})
    rows.append({'kind': 'user', 'text': '   ', 'ts': 7})
    rows.append({'kind': 'other', 'text': 'ignored', 'ts': 8})
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r) + '\n')
        f.write('not json\n')


def run_train(release, texts, out, init=None, extra=(), env=None, wait=True):
    cmd = [sys.executable, '-I', os.path.join(HERE, 'train.py'), '--texts', texts, '--base', release, '--init', init or release, '--out', out,
           '--replay', os.path.join(release, 'replay'), '--lr', '5e-4', '--batch-tokens', '256', '--w-user', '4', '--replay-ratio', '1.0',
           '--epochs', '1', '--threads', '2', '--device', 'auto', *extra]
    e = {k: v for k, v in os.environ.items() if k != 'PYTHONPATH'}
    e['CUDA_VISIBLE_DEVICES'] = ''
    e.update(env or {})
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', env=e, cwd='/')
    if not wait:
        return p
    out_s, err_s = p.communicate(timeout=600)
    return p.returncode, [json.loads(l) for l in out_s.splitlines() if l.strip()], err_s


class SequenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tok = helpers.make_tokenizer()
        cls.tokens = T.Tokens(cls.tok)

    def ids(self, text):
        return (np.array(self.tok.encode(text, add_special_tokens=False).ids) + V.NSPEC).tolist()

    def test_a_user_message_is_a_chat_sequence_weighted_on_its_own_tokens(self):
        recs = [{'kind': 'user', 'text': 'please fix the bug', 'ts': 1, 'reply': 'Hello how can I help you'}]
        (ri, s), = T.build_sequences(recs, self.tokens, w_user=4.0)
        prefix = [V.BOS, V.AGENT] + self.ids('Hello how can I help you') + [V.USER]
        self.assertEqual(s.ids.tolist(), prefix + self.ids('please fix the bug') + [V.EOS])
        self.assertEqual(s.w.tolist(), [0.0] * len(prefix) + [4.0] * (len(s.ids) - len(prefix)))
        self.assertEqual(s.kind, 'chat')

    def test_a_message_without_a_reply_has_the_short_prefix(self):
        (ri, s), = T.build_sequences([{'kind': 'user', 'text': 'hello', 'ts': 1, 'reply': ''}], self.tokens, 4.0)
        self.assertEqual(s.ids[:2].tolist(), [V.BOS, V.USER])

    def test_a_long_message_is_cut_into_pieces_and_only_the_last_ends(self):
        words = [f'w{i}' for i in range(230)]
        recs = [{'kind': 'user', 'text': ' '.join(words), 'ts': 1, 'reply': ''}]
        seqs = [s for _, s in T.build_sequences(recs, self.tokens, 4.0)]
        self.assertEqual(len(seqs), 3)
        self.assertEqual([int(s.ids[-1] == V.EOS) for s in seqs], [0, 0, 1])
        self.assertEqual(seqs[0].ids[:2].tolist(), [V.BOS, V.USER])
        self.assertEqual(seqs[1].ids.tolist().count(V.USER), 2)                        # a later piece reads the 100 words before it as typed context
        self.assertEqual(seqs[1].w[:int(np.argmax(seqs[1].w > 0))].sum(), 0)

    def test_agent_replies_and_documents(self):
        recs = [{'kind': 'agent', 'text': 'The answer is here.', 'ts': 1, 'reply': ''},
                {'kind': 'doc', 'text': 'My own notes.', 'ts': 2, 'reply': ''}]
        (_, a), (_, d) = T.build_sequences(recs, self.tokens, w_user=4.0, w_agent=1.0)
        self.assertEqual(a.ids.tolist(), [V.BOS, V.AGENT] + self.ids('The answer is here.') + [V.EOS])
        self.assertEqual(a.w.tolist(), [0, 0] + [1.0] * (len(a.ids) - 2))
        self.assertEqual(d.ids[:2].tolist(), [V.BOS, V.DOC])
        self.assertEqual(d.w.tolist(), [0, 0] + [4.0] * (len(d.ids) - 2))               # the person's own writing at the user weight

    def test_a_long_text_is_chunked_with_eos_on_the_last_only(self):
        recs = [{'kind': 'agent', 'text': ' '.join(['word'] * 700), 'ts': 1, 'reply': ''}]
        seqs = [s for _, s in T.build_sequences(recs, self.tokens, 4.0)]
        self.assertGreater(len(seqs), 1)
        self.assertTrue(all(len(s.ids) <= T.CHUNK_TOKENS + 3 for s in seqs))
        self.assertEqual([int(s.ids[-1] == V.EOS) for s in seqs], [0] * (len(seqs) - 1) + [1])

    def test_dev_version_has_no_eos_and_weight_one(self):
        (_, s), = T.build_sequences([{'kind': 'user', 'text': 'please fix the bug', 'ts': 1, 'reply': 'ok then'}], self.tokens, 4.0)
        d = T.dev_version(s)
        self.assertNotEqual(int(d.ids[-1]), V.EOS)
        self.assertEqual(set(d.w.tolist()), {0.0, 1.0})
        self.assertEqual(len(d.ids), len(d.w))

    def test_reading_the_texts_skips_what_is_not_text(self):
        with helpers.tmpdir() as d:
            p = os.path.join(d, 't.jsonl')
            write_texts(p, 3)
            recs = T.read_texts(p)
            self.assertEqual([r['kind'] for r in recs].count('user'), 3)
            self.assertEqual(len(recs), 5)

    def test_lr_schedule(self):
        self.assertLess(T.lr_at(0, 100, 1.0, 10), T.lr_at(9, 100, 1.0, 10))
        self.assertAlmostEqual(T.lr_at(9, 100, 1.0, 10), 1.0)
        self.assertAlmostEqual(T.lr_at(100, 100, 1.0, 10), 0.1)

    def test_batches_cover_every_sequence_once(self):
        lengths = np.random.RandomState(0).randint(5, 60, size=200)
        batches = T.make_batches(lengths, 300, np.random.RandomState(1))
        self.assertEqual(sorted(np.concatenate(batches).tolist()), list(range(200)))
        self.assertTrue(all(lengths[b].max() * len(b) <= 300 or len(b) == 1 for b in batches))


class MicroBatchTests(unittest.TestCase):
    def test_micro_batches_give_the_gradient_of_the_whole_batch(self):
        from hydor_suggest.model import SLM, SLMConfig
        torch.manual_seed(3)
        cfg = SLMConfig(arch='lfm', vocab=200, d=32, n_layers=4, ffn=64, heads=4, kv_heads=2, emb_rank=16, max_len=128)
        rng = np.random.RandomState(0)
        batch = []
        for L in (9, 14, 23, 31, 12, 40, 7, 18):
            ids = rng.randint(6, 200, size=L).astype(np.int32)
            w = np.zeros(L, dtype=np.float32)
            w[L // 3:] = rng.choice([1.0, 4.0], size=L - L // 3)
            batch.append(T.Seq(ids, w, 'chat', 0, 0))
        grads, losses = [], []
        for micro in (10 ** 6, 64, 1):
            m = SLM(cfg)
            torch.manual_seed(3)
            m = SLM(cfg)
            m.train()
            loss, ntok = T.train_step(m, batch, micro, False, 'cpu')
            losses.append(loss)
            grads.append(torch.cat([p.grad.flatten() for p in m.parameters() if p.grad is not None]))
        self.assertGreater(len(T.micro_groups(batch, 64)), 2)
        self.assertEqual(len(T.micro_groups(batch, 10 ** 6)), 1)
        for l, g in zip(losses[1:], grads[1:]):
            self.assertAlmostEqual(l, losses[0], places=5)
            self.assertLess(float((g - grads[0]).abs().max()), 1e-5)

    def test_groups_hold_every_sequence_once_within_the_size(self):
        batch = [T.Seq(np.zeros(L, dtype=np.int32), np.ones(L, dtype=np.float32), 'chat', 0, 0) for L in (5, 50, 7, 30, 12, 90)]
        groups = T.micro_groups(batch, 100)
        self.assertEqual(sorted(len(s.ids) for g in groups for s in g), sorted(len(s.ids) for s in batch))
        for g in groups:
            self.assertTrue(max(len(s.ids) for s in g) * len(g) <= 100 or len(g) == 1)


class ReplayTests(unittest.TestCase):
    def test_sampling_reaches_the_tokens_asked_and_weights_follow_the_markers(self):
        with helpers.tmpdir() as d:
            helpers.write_replay(d, helpers.make_tokenizer())
            r = T.Replay(os.path.join(d, 'replay'))
            self.assertGreater(len(r), 5)
            q = r.sample(120, np.random.RandomState(0))
            self.assertGreaterEqual(sum(len(s.ids) - 1 for s in q), 120)
            for s in q:
                self.assertEqual(int(s.ids[0]), V.BOS)
                marker = s.ids < V.NSPEC
                self.assertTrue(np.all(s.w[marker & (s.ids != V.EOS)] == 0))
                self.assertTrue(np.all(s.w[~marker] == 1))
            self.assertEqual(r.sample(0, np.random.RandomState(0)), [])
            a = r.sample(50, np.random.RandomState(3))
            b = r.sample(50, np.random.RandomState(3))
            self.assertEqual([x.ids.tolist() for x in a], [x.ids.tolist() for x in b])

    def test_a_replay_that_does_not_fit_its_index_is_refused(self):
        with helpers.tmpdir() as d:
            helpers.write_replay(d, helpers.make_tokenizer())
            p = os.path.join(d, 'replay', 'replay.u32')
            with open(p, 'r+b') as f:
                f.truncate(40)
            with self.assertRaises(ValueError):
                T.Replay(os.path.join(d, 'replay'))


class TrainRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = helpers.tmpdir()
        cls.release = os.path.join(cls.dir.name, 'release')
        cls.config = helpers.make_release(cls.release)
        cls.texts = os.path.join(cls.dir.name, 'texts.jsonl')
        write_texts(cls.texts)

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def test_a_run_writes_a_personal_model_the_engine_loads(self):
        out = os.path.join(self.dir.name, 'p1')
        code, lines, err = run_train(self.release, self.texts, out)
        self.assertEqual(code, 0, err)
        progress = [l for l in lines if 'progress' in l]
        self.assertGreaterEqual(len(progress), 2)
        self.assertEqual(progress[0]['progress']['done'], 0)
        total = progress[0]['progress']['total']
        self.assertEqual(progress[-1]['progress'], {'done': total, 'total': total})
        self.assertTrue(all(isinstance(l['loss'], float) and l['loss'] == l['loss'] for l in progress[1:]))
        done = lines[-1]
        self.assertTrue(done['done'])
        self.assertEqual(set(done) - {'dev_nll_before'}, {'done', 'dev_nll', 'tokens', 'seconds', 'languages'})
        self.assertIsNotNone(done['dev_nll'])                      # 30 messages: the last 5% (one or two) are held out
        self.assertGreater(done['tokens'], 100)
        self.assertGreater(done['languages'].get('eng_Latn', 0), 0)
        self.assertEqual(sorted(os.listdir(out)), ['config.json', 'meta.json', 'model.safetensors'])
        with open(os.path.join(out, 'meta.json')) as f:
            meta = json.load(f)
        self.assertEqual((meta['tokens'], meta['languages']), (done['tokens'], done['languages']))
        self.assertGreater(meta['trained_at'], 1.7e12)
        e = Engine()
        res = e.load(self.release, out, None, 2)
        self.assertEqual(res['model'], 'personal')
        self.assertEqual(res['languages'], done['languages'])
        from safetensors.torch import load_file
        a, b = load_file(os.path.join(out, 'model.safetensors')), load_file(os.path.join(self.release, 'model.safetensors'))
        self.assertEqual(set(a), set(b))
        self.assertTrue(any(not torch.equal(a[k], b[k]) for k in a))
        self.assertEqual(next(iter(a.values())).dtype, torch.float32)

    def test_learning_lowers_the_dev_loss(self):
        out = os.path.join(self.dir.name, 'p2')
        code, lines, err = run_train(self.release, self.texts, out, extra=['--epochs', '6', '--lr', '2e-3', '--replay-ratio', '0.5'])
        self.assertEqual(code, 0, err)
        done = lines[-1]
        self.assertLess(done['dev_nll'], done['dev_nll_before'])

    def test_a_second_run_continues_from_the_personal_model_and_adds_up(self):
        a = os.path.join(self.dir.name, 'p3a')
        b = os.path.join(self.dir.name, 'p3b')
        _, l1, _ = run_train(self.release, self.texts, a)
        code, l2, err = run_train(self.release, self.texts, b, init=a)
        self.assertEqual(code, 0, err)
        self.assertEqual(l2[-1]['tokens'], 2 * l1[-1]['tokens'])
        self.assertEqual(l2[-1]['languages']['eng_Latn'], 2 * l1[-1]['languages']['eng_Latn'])

    def test_without_replay_and_without_a_lid_it_still_runs(self):
        with helpers.tmpdir() as d:
            rel = os.path.join(d, 'r')
            helpers.make_release(rel, with_lid=False, with_replay=False)
            out = os.path.join(d, 'o')
            code, lines, err = run_train(rel, self.texts, out)
            self.assertEqual(code, 0, err)
            self.assertEqual(lines[-1]['languages'], {})

    def test_no_text_is_an_error(self):
        empty = os.path.join(self.dir.name, 'empty.jsonl')
        with open(empty, 'w'):
            pass
        code, lines, err = run_train(self.release, empty, os.path.join(self.dir.name, 'p5'))
        self.assertEqual(code, 3)   # 3: nothing to learn from (2 is argparse's own usage error)
        self.assertEqual(lines[-1], {'error': 'no text to learn from'})
        self.assertFalse(os.path.exists(os.path.join(self.dir.name, 'p5', 'model.safetensors')))

    def test_a_stopped_run_resumes_and_gets_the_same_model(self):
        ref = os.path.join(self.dir.name, 'p6ref')
        code, ref_lines, err = run_train(self.release, self.texts, ref, extra=['--epochs', '3'])
        self.assertEqual(code, 0, err)
        total = ref_lines[0]['progress']['total']
        out = os.path.join(self.dir.name, 'p6')
        p = run_train(self.release, self.texts, out, extra=['--epochs', '3'], wait=False)
        q: queue.Queue = queue.Queue()
        threading.Thread(target=lambda: [q.put(l) for l in p.stdout], daemon=True).start()
        done_steps = 0
        while done_steps < 3:
            done_steps = json.loads(q.get(timeout=120)).get('progress', {}).get('done', 0)
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(timeout=60), 143)
        p.stdout.close()
        p.stderr.close()
        self.assertTrue(os.path.isfile(os.path.join(out, '.resume', 'state.pt')))
        self.assertFalse(os.path.exists(os.path.join(out, 'model.safetensors')))
        code, lines, err = run_train(self.release, self.texts, out, extra=['--epochs', '3', '--resume'])
        self.assertEqual(code, 0, err)
        self.assertGreater(lines[0]['progress']['done'], 0)
        self.assertEqual(lines[0]['progress']['total'], total)
        self.assertFalse(os.path.exists(os.path.join(out, '.resume')))
        from safetensors.torch import load_file
        a, b = load_file(os.path.join(out, 'model.safetensors')), load_file(os.path.join(ref, 'model.safetensors'))
        worst = max(float((a[k] - b[k]).abs().max()) for k in a)
        self.assertLess(worst, 1e-3)

    def test_a_resume_state_of_other_texts_is_not_used(self):
        out = os.path.join(self.dir.name, 'p7')
        os.makedirs(os.path.join(out, '.resume'))
        torch.save({'sig': 'something else', 'model': {}, 'opt': {}, 'replay_rng': None, 'step': 5, 'tokens': 1}, os.path.join(out, '.resume', 'state.pt'))
        code, lines, err = run_train(self.release, self.texts, out, extra=['--resume'])
        self.assertEqual(code, 0, err)
        self.assertEqual(lines[0]['progress']['done'], 0)


class RobustnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = helpers.tmpdir()
        cls.release = os.path.join(cls.dir.name, 'release')
        helpers.make_release(cls.release)
        cls.texts = os.path.join(cls.dir.name, 'texts.jsonl')
        write_texts(cls.texts)

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def test_reading_the_texts_is_tolerant(self):
        p = os.path.join(self.dir.name, 'odd.jsonl')
        with open(p, 'wb') as f:
            f.write(b'[1, 2]\n"a string"\n3\nnull\n')
            f.write(json.dumps({'kind': 'user', 'text': 'good one', 'ts': 'abc'}).encode() + b'\n')
            f.write(json.dumps({'kind': 'user', 'text': 'string ts', 'ts': '1700000000000'}).encode() + b'\n')
            f.write(json.dumps({'kind': 'user', 'text': 'null ts', 'ts': None}).encode() + b'\n')
            f.write(json.dumps({'kind': 'user', 'text': 'inf ts', 'ts': 1e999}).encode() + b'\n')
            f.write(b'{"kind": "user", "text": "bad \xff\xfe byte", "ts": 1}\n')
        recs = T.read_texts(p)
        self.assertEqual([r['text'][:6] for r in recs], ['good o', 'string', 'null t', 'inf ts', 'bad \ufffd\ufffd'])
        self.assertEqual([r['ts'] for r in recs], [0, 1700000000000, 0, 0, 1])

    def test_holdout_defaults_follow_where_the_run_starts_from(self):
        a = os.path.join(self.dir.name, 'h1')
        code, lines, err = run_train(self.release, self.texts, a)                 # from the release: 5% held out
        self.assertEqual(code, 0, err)
        self.assertIn('dev_nll', lines[-1])
        b = os.path.join(self.dir.name, 'h2')
        code, lines, err = run_train(self.release, self.texts, b, init=a)          # from a personal model: nothing held out
        self.assertEqual(code, 0, err)
        self.assertNotIn('dev_nll', lines[-1])
        self.assertNotIn('dev_nll_before', lines[-1])
        with open(os.path.join(b, 'meta.json')) as f:
            self.assertNotIn('dev_nll', json.load(f))
        c = os.path.join(self.dir.name, 'h3')
        code, lines, err = run_train(self.release, self.texts, c, init=a, extra=['--holdout', '0.1'])    # asked for explicitly
        self.assertEqual(code, 0, err)
        self.assertIn('dev_nll', lines[-1])
        d = os.path.join(self.dir.name, 'h4')
        code, lines, err = run_train(self.release, self.texts, d, extra=['--holdout', '0'])
        self.assertEqual(code, 0, err)
        self.assertNotIn('dev_nll', lines[-1])

    def test_the_output_is_private(self):
        out = os.path.join(self.dir.name, 'priv')
        code, lines, err = run_train(self.release, self.texts, out)
        self.assertEqual(code, 0, err)
        self.assertEqual(os.stat(out).st_mode & 0o777, 0o700)
        for name in os.listdir(out):
            self.assertEqual(os.stat(os.path.join(out, name)).st_mode & 0o777, 0o600, name)

    def test_a_non_finite_step_is_skipped_and_non_finite_weights_are_never_saved(self):
        # a release whose weights contain a nan: every step is non-finite, the run must not write a model
        with helpers.tmpdir() as d:
            rel = os.path.join(d, 'r')
            helpers.make_release(rel)
            from safetensors.torch import load_file, save_file
            sd = load_file(os.path.join(rel, 'model.safetensors'))
            sd['blocks.0.n1.weight'] = sd['blocks.0.n1.weight'].clone()
            sd['blocks.0.n1.weight'][0] = float('nan')
            save_file(sd, os.path.join(rel, 'model.safetensors'))
            out = os.path.join(d, 'o')
            code, lines, err = run_train(rel, self.texts, out)
            self.assertEqual(code, 1, err)
            self.assertIn('non-finite', lines[-1]['error'])
            self.assertTrue(any(l.get('skipped') for l in lines if 'progress' in l))
            self.assertFalse(os.path.exists(os.path.join(out, 'model.safetensors')))
            for l in lines:                                                        # every line is valid JSON without NaN
                json.dumps(l, allow_nan=False)

    def test_say_never_writes_nan(self):
        self.assertEqual(T._finite({'a': float('nan'), 'b': [1.0, float('inf')], 'c': {'d': 2}}), {'a': None, 'b': [1.0, None], 'c': {'d': 2}})

    def test_a_failed_resume_starts_again_from_the_init_weights(self):
        out = os.path.join(self.dir.name, 'rs1')
        ref = os.path.join(self.dir.name, 'rs1ref')
        code, ref_lines, err = run_train(self.release, self.texts, ref, extra=['--epochs', '2'])
        self.assertEqual(code, 0, err)
        # a resume state with the right signature but a broken optimizer part
        p = run_train(self.release, self.texts, out, extra=['--epochs', '2'], wait=False)
        q: queue.Queue = queue.Queue()
        threading.Thread(target=lambda: [q.put(l) for l in p.stdout], daemon=True).start()
        n = 0
        while n < 2:
            n = json.loads(q.get(timeout=120)).get('progress', {}).get('done', 0)
        p.send_signal(signal.SIGTERM)
        p.wait(timeout=60)
        p.stdout.close()
        p.stderr.close()
        path = os.path.join(out, '.resume', 'state.pt')
        state = torch.load(path, map_location='cpu', weights_only=True)
        state['opt'] = {'state': {0: {'exp_avg': torch.zeros(1)}}, 'param_groups': 'broken'}
        torch.save(state, path)
        code, lines, err = run_train(self.release, self.texts, out, extra=['--epochs', '2', '--resume'])
        self.assertEqual(code, 0, err)
        self.assertEqual(lines[0]['progress']['done'], 0)                          # started again, not from the checkpoint's step
        from safetensors.torch import load_file
        a, b = load_file(os.path.join(out, 'model.safetensors')), load_file(os.path.join(ref, 'model.safetensors'))
        self.assertLess(max(float((a[k] - b[k]).abs().max()) for k in a), 1e-3)    # the same model as a clean run

    def test_the_resume_state_is_plain_data_and_loads_safely(self):
        out = os.path.join(self.dir.name, 'rs2')
        p = run_train(self.release, self.texts, out, extra=['--epochs', '2'], wait=False)
        q: queue.Queue = queue.Queue()
        threading.Thread(target=lambda: [q.put(l) for l in p.stdout], daemon=True).start()
        n = 0
        while n < 1:
            n = json.loads(q.get(timeout=120)).get('progress', {}).get('done', 0)
        p.send_signal(signal.SIGTERM)
        p.wait(timeout=60)
        p.stdout.close()
        p.stderr.close()
        path = os.path.join(out, '.resume', 'state.pt')
        state = torch.load(path, map_location='cpu', weights_only=True)            # would raise on anything but tensors and plain data
        self.assertEqual(os.stat(os.path.dirname(path)).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        self.assertEqual(state['replay_rng'][0], 'MT19937')
        rng = np.random.RandomState(3)
        rng.randint(0, 100, size=7)
        plain = T.rng_to_plain(rng)
        other = np.random.RandomState(0)
        T.rng_from_plain(other, json.loads(json.dumps(plain)))
        self.assertEqual(rng.randint(0, 1000, size=5).tolist(), other.randint(0, 1000, size=5).tolist())
        old = os.path.join(self.dir.name, 'old.pt')                                # a file of the older kind (a numpy tuple) still loads
        torch.save({'x': np.random.RandomState(1).get_state()}, old)
        self.assertIn('x', T.load_resume(old))

    def test_the_resume_signature_follows_the_init_weights_and_the_holdout(self):
        out = os.path.join(self.dir.name, 'rs3')
        def stopped(extra, rel):
            p = run_train(rel, self.texts, out, extra=['--epochs', '3', *extra], wait=False)
            q: queue.Queue = queue.Queue()
            threading.Thread(target=lambda: [q.put(l) for l in p.stdout], daemon=True).start()
            n = 0
            while n < 2:
                n = json.loads(q.get(timeout=120)).get('progress', {}).get('done', 0)
            p.send_signal(signal.SIGTERM)
            p.wait(timeout=60)
            p.stdout.close()
            p.stderr.close()
        stopped([], self.release)
        path = os.path.join(out, '.resume', 'state.pt')
        sig0 = torch.load(path, map_location='cpu', weights_only=True)['sig']
        shutil.rmtree(out)
        stopped(['--holdout', '0.2'], self.release)
        self.assertNotEqual(torch.load(path, map_location='cpu', weights_only=True)['sig'], sig0)      # the hold-out is in it
        shutil.rmtree(out)
        with helpers.tmpdir() as d:                                                # same size, another time and another content
            rel = os.path.join(d, 'r')
            shutil.copytree(self.release, rel)
            os.utime(os.path.join(rel, 'model.safetensors'), (1, 1))
            stopped([], rel)
            self.assertNotEqual(torch.load(path, map_location='cpu', weights_only=True)['sig'], sig0)


if __name__ == '__main__':
    unittest.main()
