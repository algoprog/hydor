"""The phrase simulation (scripts/phrase_sim.py) against a plain walk written word by word, and against the old simulation
(show_filter.Events.sim) for one word. Run: python -m unittest tests.test_phrase_sim -v   (from scripts/word-suggest)"""
import json
import os
import random
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "scripts"))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np  # noqa: E402

import phrase_sim  # noqa: E402
import show_filter  # noqa: E402


def make_events(path, seed, n_ex=7, m_extra=4):
    """Random events of the real_chances layout: words with chances k = 0 .. K-1, and phrases for the right first words."""
    rnd = random.Random(seed)
    lines = []
    for e in range(n_ex):
        eid = f"ex{e:02d}"
        chars, recs = 0, []
        j = 0
        words = []
        for w in range(rnd.randint(3, 9)):
            L, bonus = rnd.randint(2, 9), rnd.randint(0, 1)
            words.append((L, bonus))
        for w, (L, bonus) in enumerate(words):
            if rnd.random() < 0.15:                 # an unaligned word: no chances
                continue
            chars += L + bonus
            K = min(L, 5)
            for k in range(K):
                y = int(rnd.random() < 0.35)
                c = rnd.random() ** 1.5
                r = dict(t="c", id=eid, j=w, k=k, L=L, bonus=bonus, y=y, c=c)
                if y and c >= 0.05:
                    ph, cum = [], c
                    for i in range(m_extra):
                        if w + 1 + i >= len(words):
                            break
                        gl, gb = words[w + 1 + i]
                        yy = int(rnd.random() < 0.6)
                        own = rnd.random()
                        cum *= own
                        ph.append([yy, own, cum, gl, gb])
                        if not yy or cum < 0.05:
                            break
                    r["ph"] = ph
                recs.append(r)
        lines.append(dict(t="e", id=eid, surface="x", lang="aa" if e % 2 else "bb", chars=chars))
        lines.extend(recs)
    with open(path, "w") as f:
        for l in lines:
            f.write(json.dumps(l) + "\n")


def walk(path, theta, n_words, rule, stricter):
    """The simulation the plain way: example by example, word by word."""
    chances, exs = show_filter.read_events(path)
    out = {}
    for ex in exs:
        by = {}
        for r in chances:
            if r["id"] == ex:
                by.setdefault(r["j"], []).append(r)
        saved = shown = good = ncha = pgood = taken = wtaken = wshown = 0
        nxt = 0
        for j in sorted(by):
            if j < nxt:
                continue
            nxt = j + 1
            for r in sorted(by[j], key=lambda r: r["k"]):
                ncha += 1
                if r["c"] < theta - 1e-12:
                    continue
                shown += 1
                if not r["y"]:
                    continue
                good += 1
                ph = r.get("ph", [])[:n_words - 1]
                thx = theta if stricter is None else max(theta, stricter)
                m, right, rr = 1, True, 1
                gold = 0
                alive = True
                for yy, own, cum, L, b in ph:
                    if not ((cum if rule == "path" else own) >= thx - 1e-12):
                        break
                    m += 1
                    if right and yy:
                        rr += 1
                        gold += L + b
                    else:
                        right = False
                keys = 1 if rr == m else rr
                saved += r["L"] - r["k"] + r["bonus"] + gold - keys
                pgood += int(rr == m)
                taken += 1
                wtaken += rr
                wshown += m
                nxt = j + rr
                break
        out[ex] = [saved, shown, good, ncha, pgood, taken, wtaken, wshown]
    return out


class PhraseSim(unittest.TestCase):
    def test_against_a_plain_walk(self):
        with tempfile.TemporaryDirectory() as d:
            for seed in range(4):
                p = os.path.join(d, f"e{seed}.jsonl")
                make_events(p, seed)
                ev = phrase_sim.PhraseEvents(p, floor=0.05)
                th = np.array([0.05, 0.1, 0.25, 0.4, 0.6, 0.8])
                for n_words, rule, stricter in ((1, "path", None), (2, "own", None), (2, "path", None), (3, "path", None),
                                                (4, "path", 0.3), (5, "path", 0.6), (5, "path", 0.9)):
                    S = ev.sim(th, n_words, rule, stricter, chunk=4)
                    for ti, t in enumerate(th):
                        ref = walk(p, t, n_words, rule, stricter)
                        for ei, eid in enumerate(ev.ids):
                            self.assertEqual(list(S[:, ei, ti]), [float(x) for x in ref[eid]],
                                             (seed, n_words, rule, stricter, t, eid))

    def test_one_word_is_the_old_simulation(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "e.jsonl")
            make_events(p, 9, n_ex=12)
            ev = phrase_sim.PhraseEvents(p)
            old = show_filter.Events(p, names=["top"] if False else None) if False else None
            chances, exs = show_filter.read_events(p)
            for r in chances:
                r.setdefault("top", 0.0)
            q = os.path.join(d, "old.jsonl")
            with open(q, "w") as f:
                for r in exs.values():
                    f.write(json.dumps(r) + "\n")
                for r in chances:
                    f.write(json.dumps({k: v for k, v in r.items() if k != "ph"}) + "\n")
            old = show_filter.Events(q, names=["top"])
            th = np.array([0.05, 0.2, 0.5, 0.7])
            S = ev.sim(th, 1)
            for ti, t in enumerate(th):
                a = old.sim(old.c, t)
                for row in range(4):
                    np.testing.assert_allclose(S[row, :, ti], a[row])


if __name__ == "__main__":
    unittest.main()
