import json
import os
import queue
import subprocess
import sys
import threading
import time
import unittest

import helpers
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Proc:
    """The worker as Node starts it: python -I worker.py, JSON lines both ways."""

    def __init__(self):
        env = {k: v for k, v in os.environ.items() if k not in ('PYTHONPATH',)}
        env['CUDA_VISIBLE_DEVICES'] = ''
        self.p = subprocess.Popen([sys.executable, '-I', os.path.join(HERE, 'worker.py')], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, env=env, cwd='/', text=True, encoding='utf-8')
        self.q: queue.Queue = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()
        threading.Thread(target=lambda: [None for _ in self.p.stderr], daemon=True).start()

    def _read(self):
        for line in self.p.stdout:
            self.q.put(json.loads(line))
        self.q.put(None)

    def send(self, **req):
        self.p.stdin.write(json.dumps(req) + '\n')
        self.p.stdin.flush()

    def raw(self, line):
        self.p.stdin.write(line + '\n')
        self.p.stdin.flush()

    def get(self, timeout=60):
        return self.q.get(timeout=timeout)

    def answer(self, rid, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            m = self.get(max(0.1, end - time.time()))
            if m is not None and m.get('id') == rid:
                return m
        raise TimeoutError(rid)

    def close(self):
        try:
            self.p.stdin.close()
        except Exception:
            pass
        try:
            self.p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.p.kill()
        for f in (self.p.stdout, self.p.stderr):
            try:
                f.close()
            except Exception:
                pass


class WorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = helpers.tmpdir()
        cls.release = os.path.join(cls.dir.name, 'release')
        cls.config = helpers.make_release(cls.release)

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def start(self):
        w = Proc()
        self.addCleanup(w.close)
        self.assertEqual(w.get(), {'status': 'loading'})
        ready = w.get()
        self.assertTrue(ready['ready'])
        self.assertIsInstance(ready['rss'], (int, type(None)))
        return w

    def test_protocol(self):
        w = self.start()
        w.send(id=1, op='suggest', surface='text', text='hello wor')
        self.assertIn('no model is loaded', w.answer(1)['error'])
        w.send(id=2, op='load', model_dir=self.release, personal_dir=None, llm_url=None, threads=2, options={'k': 1000})
        self.assertEqual(w.answer(2), {'id': 2, 'ok': True, 'model': 'base', 'languages': {}})
        w.send(id=3, op='session', session='s', texts=['hello world', 'we wrote a message'])
        self.assertEqual(w.answer(3), {'id': 3, 'ok': True})
        w.send(id=4, op='suggest', surface='chat', text='we wrote a mes', reply='Hello! How can I help?', session='s', precision=0.4,
               next=True, cache=True, switch=True)
        a = w.answer(4)
        self.assertEqual(a['plan'], 'slm')
        for k in ('word', 'next', 'conf', 'conf_next', 'theta', 'show', 'show_next', 'ms'):
            self.assertIn(k, a)
        w.send(id='x-5', op='stats')
        s = w.answer('x-5')
        self.assertEqual(s['requests'], 1)
        self.assertIsNotNone(s['p50_ms'])
        self.assertGreater(s['rss'], 10)
        w.send(id=6, op='nope')
        self.assertIn('unknown op', w.answer(6)['error'])
        w.raw('not json')
        self.assertIn('bad request', w.answer(None)['error'])
        w.send(id=7, op='suggest', surface='text', text='ok')
        self.assertIn('word', w.answer(7))                            # still alive after errors
        w.send(id=8, op='load', model_dir=os.path.join(self.dir.name, 'missing'))
        self.assertIn('error', w.answer(8))

    def test_non_ascii_text_goes_through(self):
        w = self.start()
        w.send(id=1, op='load', model_dir=self.release, threads=2)
        w.answer(1)
        w.send(id=2, op='suggest', surface='text', text='ευχαριστώ πολύ για τη βοή')
        a = w.answer(2)
        self.assertIsInstance(a['word'], str)

    def test_cancel_stops_a_suggestion_between_steps(self):
        fake = helpers.FakeLlama(self.config['llm_vocab'], delay=0.4)
        self.addCleanup(fake.stop)
        w = self.start()
        w.send(id=1, op='load', model_dir=self.release, llm_url=fake.url, threads=2)
        w.answer(1)
        t0 = time.time()
        w.send(id=2, op='suggest', surface='text', text='we write a mess', switch=False)
        time.sleep(0.6)                                            # in the middle of the second step
        w.send(id=3, op='cancel', target=2)
        got = {}
        for _ in range(2):
            m = w.get(30)
            got[m['id']] = m
        self.assertEqual(got[2], {'id': 2, 'cancelled': True})
        self.assertEqual(got[3], {'id': 3, 'ok': True})
        self.assertLess(time.time() - t0, 2.5)                      # a whole word would take many steps of 0.4 s
        self.assertLess(len(fake.requests), 5)

    def test_a_waiting_suggestion_is_dropped_before_it_starts(self):
        fake = helpers.FakeLlama(self.config['llm_vocab'], delay=0.3)
        self.addCleanup(fake.stop)
        w = self.start()
        w.send(id=1, op='load', model_dir=self.release, llm_url=fake.url, threads=2)
        w.answer(1)
        w.send(id=2, op='suggest', surface='text', text='we write a mess', switch=False, next=False)
        w.send(id=3, op='suggest', surface='text', text='we write a mess', switch=False, next=False)
        w.send(id=4, op='cancel', target=3)
        seen = {}
        while 2 not in seen or 3 not in seen:
            m = w.get(60)
            seen[m['id']] = m
        self.assertEqual(seen[3], {'id': 3, 'cancelled': True})
        self.assertIn('word', seen[2])

    def test_exits_when_stdin_closes(self):
        w = self.start()
        w.p.stdin.close()
        self.assertEqual(w.p.wait(timeout=20), 0)


if __name__ == '__main__':
    unittest.main()
