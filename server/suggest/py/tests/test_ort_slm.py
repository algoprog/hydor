import json
import os
import subprocess
import sys
import unittest

import helpers
import numpy as np

from hydor_suggest import vocab as V
from hydor_suggest.config import SLMConfig
from hydor_suggest.ort_slm import GraphError, OrtSlm, find_graph, graph_metadata, last_logits, log_softmax

PY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CONFIGS = {
    'lfm, factorised embedding': dict(arch='lfm', d=32, n_layers=4, ffn=64, heads=4, kv_heads=2, kernel=3, emb_rank=16),
    'lfm, tied embedding': dict(arch='lfm', d=32, n_layers=4, ffn=64, heads=4, kv_heads=2, kernel=3, emb_rank=0),
    'lfm, kernel 1, no qk norm, no sandwich': dict(arch='lfm', d=32, n_layers=3, ffn=64, heads=4, kv_heads=4, kernel=1, emb_rank=16, qk_norm=False, sandwich=False),
    'tf': dict(arch='tf', d=32, n_layers=3, ffn=64, heads=4, kv_heads=2, emb_rank=0),
    'lfm with sliding windows': dict(arch='lfm', d=32, n_layers=6, ffn=64, heads=4, kv_heads=2, kernel=3, emb_rank=16, window=8),
}


def make(name, folder, seed=1, vocab=300):
    cfg = SLMConfig(vocab=vocab, max_len=256, **CONFIGS[name])
    helpers.save_weights(os.path.join(folder, 'model.safetensors'), helpers.random_weights(cfg, seed))
    helpers.write_graph(folder, cfg)
    return cfg


class OrtSlmTests(unittest.TestCase):
    def test_chunks_of_any_size_give_what_one_pass_gives(self):
        for name in CONFIGS:
            with helpers.tmpdir() as d:
                cfg = make(name, d)
                m = OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1)
                rng = np.random.default_rng(0)
                ids = [int(x) for x in rng.integers(6, cfg.vocab, 40)]
                whole, _ = last_logits(m, ids)
                st = None
                for chunk in (ids[:17], ids[17:18], ids[18:30], ids[30:39], ids[39:]):
                    row, st = last_logits(m, chunk, st)
                self.assertEqual(st.pos, 40)
                fin = np.isfinite(whole)
                self.assertTrue(np.array_equal(fin, np.isfinite(row)))
                self.assertLess(float(np.abs(log_softmax(whole)[fin] - log_softmax(row)[fin]).max()), 1e-4, name)

    def test_a_step_never_changes_its_state(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d)
            m = OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1)
            row, st = last_logits(m, [1, 3, 20, 21, 22])
            before = [x.copy() if isinstance(x, np.ndarray) else tuple(y.copy() for y in x) for x in st.layers]
            r1, st1 = last_logits(m, [30], st)
            r2, _ = last_logits(m, [31], st)
            self.assertEqual(st.pos, 5)
            self.assertEqual(st1.pos, 6)
            for a, b in zip(before, st.layers):
                for x, y in zip(a if isinstance(a, tuple) else (a,), b if isinstance(b, tuple) else (b,)):
                    self.assertTrue(np.array_equal(x, y))
            r1b, _ = last_logits(m, [30], st)
            self.assertTrue(np.array_equal(r1, r1b))
            self.assertFalse(np.array_equal(r1, r2))

    def test_the_specials_that_are_never_predicted_are_masked(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d)
            row, _ = last_logits(OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1), [1, 5])
            for t in V.NEVER_PREDICT:
                self.assertEqual(float(row[t]), float('-inf'))
            self.assertTrue(np.isfinite(row[V.UNK]) and np.isfinite(row[V.EOS]))
            lp = log_softmax(row)
            self.assertAlmostEqual(float(np.exp(lp).sum()), 1.0, places=5)

    def test_the_threads_change_no_number(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d, vocab=9000)
            ids = [1, 5, 9, 100, 200, 300]
            one, _ = last_logits(OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1), ids)
            three, _ = last_logits(OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=3), ids)
            self.assertLess(float(np.abs(one[np.isfinite(one)] - three[np.isfinite(three)]).max()), 1e-4)

    def test_one_graph_serves_other_weights(self):
        with helpers.tmpdir() as d, helpers.tmpdir() as p:
            cfg = make('lfm, factorised embedding', d, seed=1)
            helpers.save_weights(os.path.join(p, 'model.safetensors'), helpers.random_weights(cfg, 2))        # a person's model: no graph beside it
            a, _ = last_logits(OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1), [1, 5, 9])
            b, _ = last_logits(OrtSlm(cfg, os.path.join(p, 'model.safetensors'), folders=[p, d], threads=1), [1, 5, 9])
            self.assertFalse(np.allclose(a[np.isfinite(a)], b[np.isfinite(b)]))
            self.assertIn('hydor_slm', graph_metadata(os.path.join(d, 'slm.onnx')))

    def test_a_graph_for_another_architecture_is_not_used(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d)
            other = SLMConfig(vocab=cfg.vocab, max_len=256, **CONFIGS['tf'])
            with self.assertRaises(GraphError):
                find_graph(other, [d, None])                  # (the one that comes with the app is for the release's own architecture)
            self.assertEqual(find_graph(cfg, [d]), os.path.join(d, 'slm.onnx'))

    def test_weights_that_do_not_fit_are_said_so(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d)
            w = helpers.random_weights(cfg, 1)
            del w['emb_proj.weight']
            helpers.save_weights(os.path.join(d, 'model.safetensors'), w)
            with self.assertRaisesRegex(GraphError, 'missing'):
                OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1)

    def test_weights_of_the_wrong_size_are_refused(self):
        with helpers.tmpdir() as d:
            cfg = make('lfm, factorised embedding', d)
            bigger = SLMConfig(**{**cfg.__dict__, 'vocab': cfg.vocab + 10})
            helpers.save_weights(os.path.join(d, 'model.safetensors'), helpers.random_weights(bigger, 1))
            with self.assertRaises(GraphError):
                OrtSlm(cfg, os.path.join(d, 'model.safetensors'), folders=[d], threads=1)

    def test_the_release_graph_of_the_app_is_for_the_release_architecture(self):
        meta = json.loads(graph_metadata(os.path.join(PY, 'hydor_suggest', 'slm.onnx'))['hydor_slm'])
        self.assertEqual((meta['arch'], meta['d'], meta['n_layers'], meta['emb_rank']), ('lfm', 384, 10, 128))
        names = json.loads(graph_metadata(os.path.join(PY, 'hydor_suggest', 'slm.onnx'))['hydor_weights'])
        self.assertIn(['emb_proj.weight', 'emb_proj.weight'], names)
        self.assertLess(os.path.getsize(os.path.join(PY, 'hydor_suggest', 'slm.onnx')), 1 << 20, 'a graph without its weights is small')

    def test_the_bundled_graph_is_what_the_exporter_makes(self):
        from hydor_suggest.config import config_from_dict
        from hydor_suggest.graph import build
        path = os.path.join(PY, 'hydor_suggest', 'slm.onnx')
        meta = json.loads(graph_metadata(path)['hydor_slm'])
        cfg = config_from_dict(meta)
        import onnx
        made, kept = build(cfg), onnx.load(path, load_external_data=False)
        self.assertEqual([n.SerializeToString() for n in made.graph.node], [n.SerializeToString() for n in kept.graph.node], 'run export_onnx.py again after changing graph.py')
        self.assertEqual({p.key: p.value for p in made.metadata_props}, {p.key: p.value for p in kept.metadata_props})


@unittest.skipIf(helpers.torch is None, 'needs torch')
class AgainstTorchTests(unittest.TestCase):
    def test_every_configuration_matches_model_py(self):
        from hydor_suggest.model import build_model, last_logits as torch_last
        from safetensors.torch import load_file
        import torch
        for name in CONFIGS:
            with helpers.tmpdir() as d:
                cfg = make(name, d)
                path = os.path.join(d, 'model.safetensors')
                tm = build_model(cfg, load_file(path))
                om = OrtSlm(cfg, path, folders=[d], threads=1)
                rng = np.random.default_rng(3)
                ts = os_ = None
                for n in (17, 1, 1, 12, 1, 30):
                    ids = [int(x) for x in rng.integers(6, cfg.vocab, n)]
                    a, ts = torch_last(tm, ids, ts)
                    b, os_ = last_logits(om, ids, os_)
                    la, lb = torch.log_softmax(a, -1).numpy(), log_softmax(b)
                    fin = np.isfinite(la)
                    self.assertTrue(np.array_equal(fin, np.isfinite(lb)))
                    self.assertLess(float(np.abs(la[fin] - lb[fin]).max()), 2e-4, (name, n))
                    self.assertEqual(int(la.argmax()), int(lb.argmax()))


class NoTorchTests(unittest.TestCase):
    def test_the_worker_and_the_engine_never_import_torch(self):
        with helpers.tmpdir() as d:
            helpers.make_release(d)
            code = (
                'import sys, json\n'
                f'sys.path.insert(0, {PY!r})\n'
                'from hydor_suggest import worker, engine\n'
                'e = engine.Engine()\n'
                f'e.load({d!r}, None, None, 2)\n'
                'r = e.suggest({"surface": "chat", "text": "we are writing a message to the as", "reply": "Hello", "next": True})\n'
                'assert r["plan"] == "slm", r\n'
                'bad = sorted(m for m in sys.modules if m == "torch" or m.startswith("torch."))\n'
                'print(json.dumps(bad[:3]))\n'
            )
            # `-I` as the worker is started, and a sitecustomize-free path; with torch installed or not, none is imported
            out = subprocess.run([sys.executable, '-I', '-c', code], capture_output=True, text=True, timeout=120,
                                 env={**os.environ, 'CUDA_VISIBLE_DEVICES': ''})
            self.assertEqual(out.returncode, 0, out.stderr[-800:])
            self.assertEqual(json.loads(out.stdout.strip().splitlines()[-1]), [])

    def test_a_computer_that_cannot_load_onnx_runtime_is_told_why(self):
        code = (
            'import sys\n'
            f'sys.path.insert(0, {PY!r})\n'
            'sys.modules["onnxruntime"] = None\n'                         # an import that fails, as a build this computer cannot load does
            'from hydor_suggest import worker\n'
            'sys.stdout = sys.stderr\n'
            'sys.stdin = open("/dev/null") if sys.platform != "win32" else sys.stdin\n'
            'worker.main()\n'
        )
        out = subprocess.run([sys.executable, '-I', '-c', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 3)
        self.assertIn('ONNX Runtime could not be loaded on this computer', out.stderr)

    def test_an_engine_without_onnx_runtime_says_why_on_load(self):
        with helpers.tmpdir() as d:
            helpers.make_release(d)
            code = (
                'import sys\n'
                f'sys.path.insert(0, {PY!r})\n'
                'sys.modules["onnxruntime"] = None\n'
                'from hydor_suggest import engine\n'
                'try:\n'
                f'    engine.Engine().load({d!r})\n'
                'except Exception as e:\n'
                '    print(type(e).__name__, e)\n'
            )
            out = subprocess.run([sys.executable, '-I', '-c', code], capture_output=True, text=True, timeout=60)
            self.assertIn('GraphError ONNX Runtime could not be loaded on this computer', out.stdout)


if __name__ == '__main__':
    unittest.main()
