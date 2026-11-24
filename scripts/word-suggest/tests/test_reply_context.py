"""What the agent's reply gives the models and the session cache: its first and last words, and the first and last characters the page
sends (ws/textdata.py cut_ends, window_words, chat_candidates; ws/cache.py SessionCache reply_cut; scripts/real_chances.py's cache
in decoding). No data and no GPU needed. Run: .venv/bin/python -m unittest tests.test_reply_context -v   (from the workspace root)"""
import importlib.util
import json
import math
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np  # noqa: E402
import torch  # noqa: E402

from ws import textdata  # noqa: E402
from ws.cache import CacheFit, ExampleCache, SessionCache  # noqa: E402
from ws.textdata import REPLY_JOIN, cut_ends, parse_pair, window_words  # noqa: E402

from tests.test_cache import FakeTok  # noqa: E402


def words(n, p="w"):
    return " ".join(f"{p}{i}" for i in range(n))


class CutEnds(unittest.TestCase):
    def test_tail_only_is_today(self):
        t = "abcdefghij" * 5
        self.assertEqual(cut_ends(t, 0, 20), t[-20:])
        self.assertEqual(cut_ends(t, 0, 50), t)
        self.assertEqual(cut_ends(t, 0, 0), t)

    def test_head_and_tail(self):
        t = "abcdefghij" * 5
        self.assertEqual(cut_ends(t, 10, 10), t[:10] + REPLY_JOIN + t[-10:])
        self.assertEqual(cut_ends(t, 25, 25), t)                  # fits whole
        self.assertEqual(cut_ends(t, 10, 40), t)

    def test_pair(self):
        self.assertEqual(parse_pair("30:70"), (30, 70))
        self.assertEqual(parse_pair(""), (0, 0))
        with self.assertRaises(SystemExit):
            parse_pair("30")
        with self.assertRaises(SystemExit):
            parse_pair("-1:5")


class WindowWords(unittest.TestCase):
    def test_last_words_is_the_old_rule(self):
        t = words(250)
        self.assertEqual(window_words(t, 0, 100), textdata.last_words(t, 100))
        self.assertEqual(window_words(t, 0, 400), t)

    def test_first_and_last(self):
        t = words(250)
        out = window_words(t, 30, 70)
        self.assertEqual(out, words(30) + REPLY_JOIN + " ".join(f"w{i}" for i in range(180, 250)))
        self.assertEqual(len(out.split()), 30 + 1 + 70)           # the join is one more word
        self.assertEqual(window_words(words(100), 30, 70), words(100))   # a reply of exactly 100 words is whole
        self.assertEqual(window_words(words(101), 30, 70).split()[30], "…")

    def test_whitespace_and_empty(self):
        self.assertEqual(window_words("  \n ", 30, 70), "")
        self.assertEqual(window_words("  hello  world \n", 1, 1), "hello  world")
        self.assertEqual(window_words("a b c d", 1, 1), "a" + REPLY_JOIN + "d")


class Candidates(unittest.TestCase):
    def rec(self, reply):
        return dict(id="m1", session="s", agent="a", source="x", ts=5, split="test", lang="en", text="please write a story about a dog",
                    prev_agent=reply, prev_user=["hi"])

    def run_cands(self, reply, **kw):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "u.jsonl")
            with open(p, "w") as f:
                f.write(json.dumps(self.rec(reply)) + "\n")
            return list(textdata.chat_candidates(p, "test", "agent+user", **kw))

    def test_default_is_the_last_100_words_of_the_whole_reply(self):
        reply = words(300)
        (c,) = self.run_cands(reply)
        self.assertEqual(c["agent_ctx"], textdata.last_words(reply, 100))

    def test_page_cut_then_words(self):
        reply = words(300)                                          # about 1,700 characters
        (c,) = self.run_cands(reply, agent_words=(0, 100), reply_cut=(0, 500))
        self.assertEqual(c["agent_ctx"], textdata.last_words(reply[-500:], 100))
        (c,) = self.run_cands(reply, agent_words=(30, 70), reply_cut=(500, 500))
        cut = reply[:500] + REPLY_JOIN + reply[-500:]
        self.assertEqual(c["agent_ctx"], window_words(cut, 30, 70))
        self.assertTrue(c["agent_ctx"].startswith("w0 w1 w2"))
        self.assertTrue(c["agent_ctx"].endswith("w299"))
        self.assertIn(" … ", c["agent_ctx"])

    def test_other_fields_do_not_change(self):
        a = self.run_cands(words(300))[0]
        b = self.run_cands(words(300), agent_words=(50, 50), reply_cut=(1000, 1000))[0]
        for k in ("id", "target", "user_ctx", "lang", "ts"):
            self.assertEqual(a[k], b[k])

    def test_no_agent_context_without_ctx(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "u.jsonl")
            with open(p, "w") as f:
                f.write(json.dumps(self.rec(words(300))) + "\n")
            (c,) = list(textdata.chat_candidates(p, "test", "none", agent_words=(30, 70)))
            self.assertEqual(c["agent_ctx"], "")


class CacheCut(unittest.TestCase):
    def test_replies_are_cut_as_the_page_sends_them(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "agent_texts.jsonl"), "w") as f:
                f.write(json.dumps(dict(session="s", ts=1, text=" ".join(f"a{i}" for i in range(12)))) + "\n")
            tok = FakeTok()
            whole = SessionCache(tok, d)
            self.assertEqual(len(whole._agent_session("s")[1][0]), 12)
            tail = SessionCache(tok, d, reply_cut=(0, 10))              # the last 10 characters: "a9 a10 a11"
            self.assertEqual(len(tail._agent_session("s")[1][0]), 3)
            ends = SessionCache(tok, d, reply_cut=(6, 10))              # "a0 a1 " + join + the last 10 characters
            ids = ends._agent_session("s")[1][0]
            self.assertEqual(len(ids), 2 + 1 + 3)                       # a0, a1, the "…", a9, a10, a11
            self.assertEqual(len(SessionCache(tok, d, reply_cut=(30, 30))._agent_session("s")[1][0]), 12)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


class DecodingCache(unittest.TestCase):
    """real_chances.py's Stepper mixes the cache into every row it decodes: the first row of a word equals the teacher-forced
    ExampleCache row, and a row after a path token reads the same counts."""

    def test_rows_match_example_cache(self):
        rc = load("scripts/real_chances.py", "real_chances_t")
        V = 12
        ctx = [np.array([1, 2, 3, 2, 4], dtype=np.int64), np.array([5, 2, 3], dtype=np.int64)]
        gold = [2, 3, 6, 2, 7, 3]
        fit = CacheFit(-1.0, 0.3, 0.8)
        ec = ExampleCache(V, ctx, gold)
        lc = ec.logprobs()
        base = torch.log_softmax(torch.linspace(0, 1, V) * torch.arange(V).flip(0), dim=-1)

        class FakeSc:
            def session_cache(self_):
                class S:
                    def context(self__, ex):
                        return ctx
                return S()

        st = rc.Stepper.__new__(rc.Stepper)
        st.sc, st.tb, st.cfit = FakeSc(), [b""] * V, fit
        st.begin_example(None)
        for a in range(len(gold) + 1):
            st.sync_cache(gold, a)
            got = st.with_cache(base, gold[:a])
            mu = float(fit.mu([ec.N[a]], [ec.seen[a]])[0])
            want = torch.logaddexp(base + math.log1p(-mu), lc[a] + math.log(mu)) if ec.N[a] > 0 else base
            self.assertTrue(torch.allclose(got, want, atol=1e-5), a)
        # a path token after the gold ones: the cache is the same, its own occurrence is not discounted
        got = st.with_cache(base, gold + [2])
        self.assertEqual(st.cst.N, len(ctx[0]) + len(ctx[1]) + len(gold))
        mu = float(fit.mu([st.cst.N], [st.cst.seen(2, 0)])[0])
        with np.errstate(divide="ignore"):
            lc2 = torch.from_numpy(np.log(st.cst.row(2))).float()
        want = torch.logaddexp(base + math.log1p(-mu), lc2 + math.log(mu))
        self.assertTrue(torch.allclose(got, want, atol=1e-5))

    def test_empty_cache_is_the_variant(self):
        rc = load("scripts/real_chances.py", "real_chances_t")
        st = rc.Stepper.__new__(rc.Stepper)
        st.cst = None
        x = torch.randn(5)
        self.assertTrue(torch.equal(st.with_cache(x, [1]), x))


if __name__ == "__main__":
    unittest.main()
