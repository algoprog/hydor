import math
import unittest

import helpers  # noqa: F401
import numpy as np

from hydor_suggest.cache import CacheBase, CacheFit, CacheState, SessionCaches

V = 20


def brute_prob(seqs, h, w, extra_target=()):
    """Witten-Bell by definition over the sequences (each a separate text), the history -1 meaning the text start."""
    uni, bi = {}, {}
    n = 0
    for s in list(seqs) + ([list(extra_target)] if len(extra_target) else []):
        prev = -1
        for t in s:
            uni[t] = uni.get(t, 0) + 1
            n += 1
            bi.setdefault(prev, {})
            bi[prev][t] = bi[prev].get(t, 0) + 1
            prev = t
    pu = uni.get(w, 0) / n
    f = bi.get(h, {})
    c, T = sum(f.values()), len(f)
    return pu if c == 0 else (f.get(w, 0) + T * pu) / (c + T)


class CacheTests(unittest.TestCase):
    seqs = [[1, 2, 3, 2, 3, 4], [5, 2, 3], [7, 7, 7]]

    def test_witten_bell_matches_the_definition(self):
        st = CacheState(CacheBase(V, self.seqs))
        for h in (-1, 2, 3, 7, 9):
            for w in range(V):
                hh = st.bos if h == -1 else h
                self.assertAlmostEqual(st.prob(hh, w), brute_prob(self.seqs, h, w), places=9, msg=(h, w))

    def test_rows_sum_to_one_and_are_zero_outside_the_cache(self):
        st = CacheState(CacheBase(V, self.seqs))
        ids, p = st.row(2)
        self.assertAlmostEqual(float(p.sum()), 1.0, places=9)
        self.assertEqual(set(ids.tolist()), {1, 2, 3, 4, 5, 7})
        self.assertEqual(st.prob(2, 19), 0.0)

    def test_added_tokens_count_like_a_text_of_their_own(self):
        st = CacheState(CacheBase(V, self.seqs))
        st.add_sequence([2, 3, 9])
        for h, w in ((-1, 2), (2, 3), (3, 9), (3, 2), (9, 9)):
            hh = st.bos if h == -1 else h
            self.assertAlmostEqual(st.prob(hh, w), brute_prob(self.seqs, h, w, [2, 3, 9]), places=9, msg=(h, w))
        self.assertEqual(st.N, 12 + 3)

    def test_a_fork_grows_alone(self):
        st = CacheState(CacheBase(V, self.seqs))
        st.add_sequence([2, 3])
        a = st.fork()
        b = st.fork()
        a.add(3, 11)
        self.assertEqual(st.prob(3, 11), 0.0)
        self.assertEqual(b.prob(3, 11), 0.0)
        self.assertGreater(a.prob(3, 11), 0.0)
        self.assertEqual(b.N, st.N)
        self.assertEqual(a.N, st.N + 1)
        b.add(3, 12)
        self.assertEqual(a.prob(3, 12), 0.0)

    def test_seen_counts_the_token_apart_from_the_one_just_typed(self):
        st = CacheState(CacheBase(V, [[1, 2, 3]]))
        self.assertEqual(st.seen(st.bos), 1)
        self.assertEqual(st.seen(2), 1)
        self.assertEqual(st.seen(9), 0)
        st.add(st.bos, 9)                              # the person typed 9: it is counted, but it is not "seen before"
        self.assertEqual(st.seen(9, own=1), 0)
        st.add(9, 9)
        self.assertEqual(st.seen(9, own=1), 1)
        self.assertEqual(CacheState(CacheBase(V, ())).seen(1), 0)

    def test_empty_cache_never_mixes(self):
        st = CacheState(CacheBase(V, ()))
        p = np.full(V, 1 / V, dtype=np.float32)
        out = st.mix(p, None, False, CacheFit(0, 0, 0))
        self.assertIs(out, p)

    def test_mix_is_a_convex_combination(self):
        st = CacheState(CacheBase(V, self.seqs))
        p = np.full(V, 1 / V, dtype=np.float32)
        fit = CacheFit(-1.0, 0.1, 0.5)
        out = st.mix(p, 2, True, fit)
        mu = fit.mu(st.N, st.seen(2, 1))
        ids, pc = st.row(2)
        want = (1 - mu) * p
        want[ids] += mu * pc
        np.testing.assert_allclose(out, want, rtol=1e-5)
        self.assertAlmostEqual(float(out.sum()), 1.0, places=5)

    def test_mu_formula(self):
        f = CacheFit(-2.0, 0.5, 1.0)
        self.assertAlmostEqual(f.mu(10, 1), 1 / (1 + math.exp(-(-2.0 + 0.5 * math.log(11) + 1.0))))
        self.assertEqual(f.mu(0, 1), 0.0)

    def test_session_caches_keep_the_last_few_and_their_extras(self):
        sc = SessionCaches(V, size=2)
        sc.set('a', [[1, 2, 3]])
        sc.set('b', [[4, 5]])
        sc.set('c', [[6]])
        self.assertEqual(sc.state('a').N, 0)           # forgotten: an empty cache
        self.assertEqual(sc.state('b').N, 2)
        st = sc.state('c', [[8, 9]], 'k1')
        self.assertEqual(st.N, 3)
        st.add(9, 1)                                   # a request's own growth never reaches the session
        self.assertEqual(sc.state('c', [[8, 9]], 'k1').N, 3)
        self.assertEqual(sc.state('c', [[8, 9, 10]], 'k2').N, 4)
        self.assertEqual(sc.state(None, [[1]], 'x').N, 1)


if __name__ == '__main__':
    unittest.main()
