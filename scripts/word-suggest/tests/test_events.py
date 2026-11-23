"""E8: the chance features must not depend on the gold word beyond the typed prefix.
Run: .venv/bin/python -m unittest tests.test_events -v   (from the workspace root)"""
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
from tests.test_eval import V1  # noqa: E402

# the features a filter may use; c and y are the label's side (see the test about c)
FEATS = ("top", "second", "margin", "ent", "logn", "toplen", "prev", "agree", "lam")


def causal_rows(prefix, V, salt):
    """A fake causal model: the row after `prefix` is a function of the prefix only."""
    g = torch.Generator().manual_seed(hash((salt,) + tuple(prefix)) % (2 ** 31))
    return torch.log_softmax(torch.randn(V, generator=g) * 2.0, -1)


def make(vocab, toks):
    """An example and (llm rows, slm-alone rows, lambda per row, mixed rows) from a causal fake of both models."""
    V = len(vocab.tb)
    ids = [vocab.id[t.encode()] for t in toks]
    text = "".join(toks)
    offs, pos = [], 0
    for t in toks:
        offs.append((pos, pos + len(t)))
        pos += len(t)
    ex = Example("x", "chat", "en", "", "", "", text, ids, offs)
    llm = torch.stack([causal_rows(ids[:i], V, "llm") for i in range(len(ids) + 1)])
    slm = torch.stack([causal_rows(ids[:i], V, "slm") for i in range(len(ids) + 1)])
    lam = torch.stack([torch.rand(1, generator=torch.Generator().manual_seed(hash(("lam",) + tuple(ids[:i])) % 2 ** 31))[0]
                       for i in range(len(ids) + 1)])
    return ex, llm, slm, lam, mix.linear(llm, slm, lam)


def chances(vocab, ex, llm, slm, lam, lp):
    ev = Evaluator(vocab.tb, [vocab.eos])
    ev.collect = True
    ev.score(ex, lp, dict(llm=llm, slm=slm, lam=lam))
    return {(r["j"], r["k"]): r for r in ev.chances}


class EventFeatures(unittest.TestCase):
    def test_features_ignore_the_gold_continuation(self):
        rnd = random.Random(3)
        pool = [t.decode() for t in V1.id]
        n_compared = 0
        for trial in range(60):
            A = [rnd.choice(pool) for _ in range(rnd.randint(4, 9))]
            m = rnd.randint(1, len(A) - 1)
            B = A[:m] + [rnd.choice(pool) for _ in range(rnd.randint(1, 6))]
            ra, rb = make(V1, A), make(V1, B)
            ca, cb = chances(V1, *ra[:1], *ra[1:]), chances(V1, *rb[:1], *rb[1:])
            start_m = len("".join(A[:m]).encode())          # the typed prefix must end before the first changed token
            ta = ra[0].target
            import re
            starts = [mm.start() for mm in re.finditer(r"\S+", ta)]
            for (j, k), x in ca.items():
                if (j, k) not in cb or starts[j] + k >= start_m:
                    continue
                y = cb[(j, k)]
                n_compared += 1
                for f in FEATS:
                    self.assertEqual(x.get(f), y.get(f), (A, B, j, k, f))
        self.assertGreater(n_compared, 100)

    def test_toy_cat_can(self):
        """'cat' and 'can' typed up to ' ca': the same features; only the label (and c) may differ."""
        rows = [V1.dist({"the": 0.8}), V1.dist({" cat": 0.4, " can": 0.3, " cow": 0.1}),
                V1.dist({" sat": 0.6}), V1.dist({"EOS": 0.9})]
        ev = Evaluator(V1.tb, [V1.eos])
        ev.collect = True
        out = {}
        for last in (" cat", " can"):
            ex, lp = V1.example("the" + last, ["the", last], rows[:3])
            ev.score(ex, lp)
            out[last] = {(r["j"], r["k"]): r for r in ev.chances}
        for k in range(3):                               # ' ', ' c', ' ca' typed
            a, b = out[" cat"][(1, k)], out[" can"][(1, k)]
            for f in FEATS:
                self.assertEqual(a.get(f), b.get(f), (k, f))
        # the label can differ (at k=0 ' cat' is the arg max, so only one of the two is right)
        self.assertNotEqual(out[" cat"][(1, 0)]["y"], out[" can"][(1, 0)]["y"])
        # a wrong suggestion at the first step has the arg max's probability as its confidence = the top feature
        wrong = out[" can"][(1, 0)]
        self.assertAlmostEqual(wrong["c"], wrong["top"], places=6)
        # c is the harness's, measured along the gold path: it is NOT gold-free (this is why show_filter leaves it out):
        # the right one's c is below top (the end check multiplies in), the wrong one's equals top
        self.assertLess(out[" cat"][(1, 0)]["c"], out[" cat"][(1, 0)]["top"])

    def test_feature_values(self):
        row = V1.dist({" cat": 0.5, " car": 0.25, " cow": 0.125})
        ex, lp = V1.example("the cat", ["the", " cat"], [V1.dist({"the": 0.9}), row, V1.dist({"EOS": 0.9})])
        ev = Evaluator(V1.tb, [V1.eos])
        ev.collect = True
        ev.score(ex, lp, dict(llm=lp, slm=lp, lam=torch.full((3,), 0.25)))
        r = {(x["j"], x["k"]): x for x in ev.chances}[(1, 2)]        # typed ' ca'
        ids = V1.evaluator().index.allowed(b" ca").tolist()
        import math
        self.assertEqual(len(ids), 6)                                   # ' ca' ' can' ' car' ' cat' and the prefixes ' c' ' '
        self.assertAlmostEqual(r["logn"], math.log(6))
        ps = sorted((math.exp(row[i].item()) for i in ids), reverse=True)
        tot = sum(ps)
        self.assertAlmostEqual(r["top"], ps[0] / tot, places=5)
        self.assertAlmostEqual(r["second"], ps[1] / tot, places=5)
        self.assertAlmostEqual(r["margin"], (ps[0] - ps[1]) / tot, places=5)
        self.assertAlmostEqual(r["ent"], -sum(p / tot * math.log(p / tot) for p in ps), places=4)
        self.assertEqual(r["toplen"], 4)                                # ' cat'
        self.assertEqual(r["agree"], 1)
        self.assertAlmostEqual(r["lam"], 0.25)
        self.assertEqual(r["prev"], 1)                                  # 'the' was right at k=0
        self.assertEqual(r["L"], 3)                                     # the word's characters
        self.assertEqual({x["j"] for x in ev.chances}, {0, 1})


if __name__ == "__main__":
    unittest.main()
