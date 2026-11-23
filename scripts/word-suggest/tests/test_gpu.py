"""The GPU paths against the CPU ones. Run: .venv/bin/python -m unittest tests.test_gpu -v (from the workspace root).
The batched allowed-set statistics of the Evaluator run on the CPU too (fast=True) so they are tested without a GPU; the tests
on a real GPU are skipped when none is visible (run them with .venv-gpu and CUDA_VISIBLE_DEVICES=<n>)."""
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import torch  # noqa: E402

torch.set_num_threads(2)

from ws import mix  # noqa: E402
from ws.evaluate import Evaluator  # noqa: E402
from ws.types import Example  # noqa: E402

HAS_CUDA = torch.cuda.is_available()


def random_case(seed):
    rnd = random.Random(seed)
    alpha = "abc de"
    toks = {" "} | {"".join(rnd.choice(alpha) for _ in range(rnd.randint(1, 4))) for _ in range(150)}
    toks = [t.encode() for t in sorted(toks)] + [None]
    eos = len(toks) - 1
    ids, text = [], ""
    for _ in range(rnd.randint(4, 14)):
        i = rnd.randrange(len(toks) - 1)
        ids.append(i)
        text += toks[i].decode()
    offs, pos = [], 0
    for i in ids:
        offs.append((pos, pos + len(toks[i])))
        pos += len(toks[i])
    ex = Example("r", "chat", "en", "", "", "", text, ids, offs)
    g = torch.Generator().manual_seed(seed)
    lp = torch.log_softmax(torch.randn(len(ids) + 1, len(toks), generator=g) * 2.5, -1)
    if seed % 3 == 0:
        lp[:, torch.randint(0, len(toks) - 1, (20,), generator=g)] = float("-inf")     # an SLM that rules tokens out
        lp = torch.log_softmax(lp, -1)
    return toks, eos, ex, lp


def close(a, b):
    assert a.keys() == b.keys(), set(a) ^ set(b)
    for k in a:
        assert abs(a[k] - b[k]) <= 1e-6 * max(1.0, abs(a[k])), (k, a[k], b[k])


class Batched(unittest.TestCase):
    def test_batched_statistics_equal_the_loop(self):
        n_words = 0
        for seed in range(150):
            toks, eos, ex, lp = random_case(seed)
            slow = Evaluator(toks, [eos])
            fast = Evaluator(toks, [eos], index=slow.index)
            fast.fast = True                         # the batched path, on the CPU
            c1, c2 = slow.score(ex, lp), fast.score(ex, lp)
            n_words += c1["n_words"]
            close(c1, c2)
        self.assertGreater(n_words, 100)

    def test_real_decoder_batched_first_step_equals_single_steps(self):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
        from real_chances import Decoder, Node
        import math
        for seed in range(30):
            toks, eos, ex, lp = random_case(seed)
            ev = Evaluator(toks, [eos])
            dec = Decoder(ev, toks, 4)
            root = Node((), lp[0], None)
            Rs = [b"", b" ", b"a", b" a", b"ab", b"zz", b" cd"]
            dec.prefetch(root, Rs)
            for R in Rs:
                tok, m, lse, _, _ = dec.stat(lp[0], R, False) if len(dec.allowed(R)[0]) else (None, 0, 0, 0, 0)
                if R in root.pre:
                    t2, m2, l2 = root.pre[R]
                    self.assertEqual(t2, tok)
                    self.assertAlmostEqual(m, m2, places=5)
                    self.assertAlmostEqual(lse, l2, places=4)
                else:
                    self.assertEqual(len(dec.allowed(R)[0]), 0)

    @unittest.skipUnless(HAS_CUDA, "no GPU visible")
    def test_gpu_evaluator_and_mixing(self):
        for seed in range(15):
            toks, eos, ex, lp = random_case(seed)
            slow = Evaluator(toks, [eos])
            gpu = Evaluator(toks, [eos], index=slow.index, device="cuda")
            slow.collect = gpu.collect = True
            extra = dict(llm=lp, slm=lp.flip(0), lam=torch.full((lp.shape[0],), 0.3))
            c1 = slow.score(ex, lp, extra)
            c2 = gpu.score(ex, lp.cuda(), {k: v.cuda() for k, v in extra.items()})
            close(c1, c2)
            self.assertEqual(len(slow.chances), len(gpu.chances))
            for a, b in zip(slow.chances, gpu.chances):
                for k in a:
                    if isinstance(a[k], float):
                        self.assertAlmostEqual(a[k], b[k], places=4, msg=k)
                    else:
                        self.assertEqual(a[k], b[k], k)
        g = mix.Gate(w=[0.1] * 7, b=0.2, lang_bias={"x": 1.0})
        a, b = torch.log_softmax(torch.randn(5, 50), -1), torch.log_softmax(torch.randn(5, 50), -1)
        cpu = mix.gate(a, b, g, torch.rand(5), [1, 0, 1, 0, 1], "x")
        gpu = mix.gate(a.cuda(), b.cuda(), g, torch.rand(5).cuda(), [1, 0, 1, 0, 1], "x")
        self.assertEqual(gpu.device.type, "cuda")
        self.assertEqual(gpu.shape, cpu.shape)

    @unittest.skipUnless(HAS_CUDA and os.path.exists("runs/slm/pre200_30m/ckpt.pt"), "no GPU or checkpoint")
    def test_slm_on_the_gpu_matches_the_cpu(self):
        from ws.gpu import to_device
        from ws.slm import SLMScorer
        cpu, gpu = SLMScorer("runs/slm/pre200_30m/ckpt.pt", threads=2), SLMScorer("runs/slm/pre200_30m/ckpt.pt", threads=2)
        to_device(gpu, torch.device("cuda"))
        V = int(cpu.vocab.v_llm)
        ids = [int(x) for x in cpu.vocab.slm2llm[cpu.vocab.slm2llm >= 0][5:25]]
        ex = Example("g", "plain", "en", "", "", "the cat sat", "hello world", ids[:6], [(0, 0)] * 6)
        llm = torch.log_softmax(torch.randn(7, V), -1)
        for use_llm in (None, llm):
            a = cpu.logprobs(ex, use_llm)
            b = gpu.logprobs(ex, None if use_llm is None else use_llm.cuda()).cpu()
            fin = torch.isfinite(a)
            self.assertTrue(torch.equal(fin, torch.isfinite(b)))
            self.assertLess(float((a[fin] - b[fin]).abs().max()), 2e-3)


if __name__ == "__main__":
    unittest.main()
