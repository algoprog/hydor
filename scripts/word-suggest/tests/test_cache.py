"""E9: the session cache. Run: .venv/bin/python -m unittest tests.test_cache -v   (from the workspace root)"""
import json
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(2)

from ws.cache import CacheFit, CacheState, ExampleCache, SessionCache, fit_mu, mixed_loglik, paragraphs  # noqa: E402
from ws.evaluate import Scorers, parse_variant  # noqa: E402
from ws.types import Example  # noqa: E402

V = 12


def arr(*x):
    return np.array(x, dtype=np.int64)


class FakeTok:
    """Words to ids (a growing table), the interface of a HF tokenizer's __call__ for the cache."""

    def __init__(self):
        self.table = {}

    def _ids(self, text):
        return [self.table.setdefault(w, len(self.table)) for w in text.split()]

    def __call__(self, text, add_special_tokens=False):
        if isinstance(text, list):
            return {"input_ids": [self._ids(t) for t in text]}
        return {"input_ids": self._ids(text)}


class WittenBell(unittest.TestCase):
    def test_hand_computed(self):
        st = CacheState(V, [arr(1, 2, 1, 3)])
        # N = 4, unigram {1: 2, 2: 1, 3: 1}; history 1 is followed by 2 and 3 once each: c = 2, T = 2
        self.assertAlmostEqual(st.prob(1, 2), (1 + 2 * 0.25) / (2 + 2))
        self.assertAlmostEqual(st.prob(1, 1), (0 + 2 * 0.5) / (2 + 2))
        self.assertAlmostEqual(st.prob(2, 1), (1 + 1 * 0.5) / (1 + 1))
        self.assertAlmostEqual(st.prob(3, 3), 0.25)              # 3 was never followed by anything: the unigram
        self.assertEqual(st.prob(1, 9), 0.0)                     # outside the cache
        self.assertAlmostEqual(st.prob(st.bos, 1), (1 + 1 * 0.5) / (1 + 1))   # the text starts with 1

    def test_rows_sum_to_one_over_the_cache(self):
        rnd = np.random.RandomState(0)
        seqs = [rnd.randint(0, V - 3, size=rnd.randint(1, 30)) for _ in range(5)]
        st = CacheState(V, seqs)
        used = np.zeros(V, dtype=bool)
        for s in seqs:
            used[s] = True
        for h in list(range(V - 3)) + [st.bos]:
            p = st.row(h)
            self.assertAlmostEqual(p.sum(), 1.0, places=9)
            self.assertTrue((p[~used] == 0).all())               # zero outside the cache
            for w in range(V):
                self.assertAlmostEqual(p[w], st.prob(h, w), places=12)
        # still a distribution as the target's own tokens are added
        h = st.bos
        for w in (2, 5, 2, 7):
            st.add(h, w)
            h = w
            for hh in (h, st.bos, 0):
                self.assertAlmostEqual(st.row(hh).sum(), 1.0, places=9)

    def test_empty_cache(self):
        st = CacheState(V, [])
        self.assertEqual(st.N, 0)
        self.assertEqual(st.prob(st.bos, 1), 0.0)
        self.assertEqual(st.seen(st.bos), 0)


class Causality(unittest.TestCase):
    def test_row_i_reads_only_earlier_target_tokens(self):
        ctx = [arr(1, 2, 3, 2, 4), arr(5, 2, 3)]
        a = ExampleCache(V, ctx, [2, 3, 4, 6, 7])
        b = ExampleCache(V, ctx, [2, 3, 4, 9, 1])               # the same first three tokens, other continuation
        la, lb = a.logprobs(), b.logprobs()
        for i in range(4):                                       # rows 0..3 see only tokens 0..2
            self.assertTrue(torch.equal(la[i], lb[i]), i)
        self.assertFalse(torch.equal(la[4], lb[4]))
        self.assertEqual(a.N[:4].tolist(), b.N[:4].tolist())
        self.assertEqual(a.seen[:4].tolist(), b.seen[:4].tolist())
        self.assertTrue(np.array_equal(a.gold_logprobs()[:3], b.gold_logprobs()[:3]))
        # row i has N = context + i tokens: the gold token itself is never in the cache before its row
        self.assertEqual(a.N.tolist(), [8, 9, 10, 11, 12, 13])
        # P of the gold token at row 3 does not know that token 6 comes: it is outside the cache
        self.assertEqual(a.gold_logprobs()[3], -np.inf)
        # dense rows agree with the gold shortcut
        for i in range(5):
            self.assertAlmostEqual(float(la[i, [2, 3, 4, 6, 7][i]]), float(a.gold_logprobs()[i]), places=4)

    def test_sums_to_one_and_mixture_sums_to_one(self):
        ctx = [arr(1, 2, 3, 2, 4), arr(5, 2, 3)]
        ec = ExampleCache(V, ctx, [2, 3, 4, 1])
        lc = ec.logprobs()
        self.assertTrue(torch.allclose(lc.exp().sum(-1), torch.ones(5), atol=1e-5))
        lv = torch.log_softmax(torch.randn(5, V), -1)
        for fit in (CacheFit(-1.0, 0.3, 0.5), CacheFit(2.0, -0.2, -1.0)):
            lp = fit.apply(lv, ec)
            self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(5), atol=1e-5))
            mu = fit.mu(ec.N, ec.seen)
            want = torch.logaddexp(lv + torch.log1p(-mu)[:, None], lc + mu.log()[:, None])
            self.assertTrue(torch.allclose(lp, want, atol=1e-5))
        # an empty cache: the variant itself, mu = 0
        e = ExampleCache(V, [], [2, 3])
        lv = torch.log_softmax(torch.randn(3, V), -1)
        fit = CacheFit(5.0, 1.0, 1.0)
        self.assertEqual(fit.mu(e.N, e.seen).tolist()[0], 0.0)
        out = fit.apply(lv, e)                                    # row 0: nothing cached; rows 1, 2: the target's own
        self.assertTrue(torch.equal(out[0], lv[0]))
        self.assertTrue(torch.allclose(out.exp().sum(-1), torch.ones(3), atol=1e-5))

    def test_fit_recovers_a_useful_cache(self):
        torch.manual_seed(0)
        n = 3000
        N = torch.randint(1, 200, (n,)).double()
        seen = (torch.rand(n) < 0.5).double()
        # the cache is excellent after a seen token, useless otherwise; the variant is mediocre
        lc = torch.where(seen > 0, torch.full((n,), math.log(0.6)), torch.full((n,), -1e4)).double()
        lv = torch.full((n,), math.log(0.05)).double()
        fit = fit_mu(lv, lc, N, seen)
        self.assertGreater(fit.c, 1.0)
        base = float(lv.mean())
        mixed = float(mixed_loglik(fit, lv, lc, N, seen).mean())
        self.assertGreater(mixed, base + 0.1)


class FromData(unittest.TestCase):
    """SessionCache: which texts a chat message or a document paragraph may see."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = self.tmp.name
        agent = [dict(id="a1", session="s1", ts=100, split="train", text="alpha beta gamma"),
                 dict(id="a2", session="s1", ts=200, split="train", text="delta alpha"),
                 dict(id="a3", session="s1", ts=300, split="dev", text="omega omega omega"),       # after the message
                 dict(id="a4", session="s1", ts=240, split="dev", text="sigma"),
                 dict(id="b1", session="s2", ts=100, split="train", text="other session")]
        user = [dict(id="u1", session="s1", ts=250, split="dev", text="alpha delta beta", lang="en",
                     prev_user=["first message", "second one"], prev_agent=""),
                dict(id="u2", session="s9", ts=250, split="dev", text="lonely message", lang="en", prev_user=[],
                     prev_agent="")]
        docs = [dict(id="o1", source="wiki", ts=1, split="dev", author="agent",
                     text="one two three four\n\nfive six seven eight\n\nnine ten eleven twelve")]
        for name, rows in (("agent_texts", agent), ("user_msgs", user), ("other_texts", docs)):
            with open(os.path.join(d, name + ".jsonl"), "w") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
        self.tok = FakeTok()
        self.sc = SessionCache(self.tok, d)

    def tearDown(self):
        self.tmp.cleanup()

    def words(self, seqs):
        inv = {i: w for w, i in self.tok.table.items()}
        return sorted(" ".join(inv[int(t)] for t in s) for s in seqs)

    def chat(self, mid="u1", session="s1", ts=250, text="alpha delta beta", seg=0):
        ids = self.tok(text)["input_ids"]
        return Example(mid, "chat", "en", "", "", "", text, ids, [(0, 0)] * len(ids), ts=ts, split="dev",
                       meta=dict(session=session, seg=seg))

    def test_chat_context_is_strictly_earlier(self):
        got = self.words(self.sc.context(self.chat()))
        self.assertEqual(got, sorted(["alpha beta gamma", "delta alpha", "sigma", "first message", "second one"]))
        # a message sent at the same time as a reply does not see that reply, one a tick later does
        got = self.words(self.sc.context(self.chat(ts=200)))
        self.assertEqual(got, sorted(["alpha beta gamma", "first message", "second one"]))
        got = self.words(self.sc.context(self.chat(ts=201)))
        self.assertIn("delta alpha", got)
        # other sessions never leak in; a session with no replies has only the typed messages
        self.assertEqual(self.words(self.sc.context(self.chat("u2", "s9"))), [])

    def test_later_segment_sees_its_own_earlier_text(self):
        text = " ".join(f"w{i}" for i in range(130))
        self.sc.context(self.chat())                              # loads the table
        self.sc._user["u1"] = (text, ["first message"])
        ex = self.chat(text=" ".join(f"w{i}" for i in range(100, 130)), seg=1)
        got = self.words(self.sc.context(ex))
        self.assertIn(" ".join(f"w{i}" for i in range(100)), got)    # the first 100 words, typed already
        self.assertNotIn("w100", " ".join(got))

    def test_doc_context_is_the_text_before_the_target(self):
        ids = self.tok("nine ten eleven twelve")["input_ids"]
        ex = Example("o1:2", "doc", "en", "", "", "x", "nine ten eleven twelve", ids, [(0, 0)] * 4, ts=1, split="dev",
                     meta=dict(para=2, seg=0, source="wiki"))
        got = self.words(self.sc.context(ex))
        self.assertEqual(got, sorted(["one two three four", "five six seven eight"]))
        ex1 = Example("o1:1", "doc", "en", "", "", "x", "five six seven eight", ids, [(0, 0)] * 4, ts=1, split="dev",
                      meta=dict(para=1, seg=0, source="wiki"))
        self.assertEqual(self.words(self.sc.context(ex1)), ["one two three four"])
        self.assertEqual(self.sc.warned, 0)
        self.assertEqual([p for _, p in paragraphs("a b\n\nc\n \nd")], ["a b", "c", "d"])

    def test_variant_syntax_and_plumbing(self):
        v = parse_variant("llm+slm:gate:runs/gate/x.json|cache:runs/cache/c.json")
        self.assertEqual((v.parts, v.mode, v.param, v.cache), (["llm", "slm"], "gate", "runs/gate/x.json", "runs/cache/c.json"))
        self.assertEqual(parse_variant("llm").cache, "")
        with self.assertRaises(ValueError):
            parse_variant("llm|cache:")

        class Fake:
            def logprobs(self, ex, llm_lp=None):
                return torch.log_softmax(torch.randn(len(ex.target_ids) + 1, 40), -1)

        sc = Scorers.__new__(Scorers)
        sc.llm, sc.others, sc.tok, sc.data_dir = Fake(), {}, self.tok, self.tmp.name
        ex = self.chat()
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "fit.json")
            CacheFit(0.0, 0.2, 0.5).save(p)
            v = parse_variant(f"llm|cache:{p}")
            rows = sc.rows(ex, [v])
            lp = sc.mixed(v, rows, [None] * 40, ex, {})
            self.assertEqual(lp.shape, rows["llm"].shape)
            self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(lp.shape[0]), atol=1e-4))
            self.assertFalse(torch.equal(lp, rows["llm"]))          # the cache changed something
            base = sc.mixed(parse_variant("llm"), rows, [None] * 40, ex, {})
            self.assertTrue(torch.equal(base, rows["llm"]))


if __name__ == "__main__":
    unittest.main()
