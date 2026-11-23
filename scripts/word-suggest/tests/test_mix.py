#!/usr/bin/env python
"""Tests for the language mix of ws/pretrain_data.py (mix_draw, shard_language):  CUDA_VISIBLE_DEVICES= .venv/bin/python -m unittest tests.test_mix"""
import os
import sys
import unittest

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import numpy as np  # noqa: E402

from ws.pretrain_data import mix_draw, shard_language  # noqa: E402

NAMES = ['chat', 'web_aaa_Latn_f000', 'web_aaa_Latn_f001', 'web_bbb_Cyrl', 'web_bbb_Cyrl_b', 'web_ccc_Arab', 'web_zzz_Latn']


def corpus(seed=0):
    """Items of 7 shards: the number of items per shard, random lengths 3..256 (tokens with a loss = length - 1)."""
    rng = np.random.RandomState(seed)
    n = [300, 500, 400, 200, 150, 100, 800]
    src = np.concatenate([np.full(k, i) for i, k in enumerate(n)]).astype(np.int16)
    return src, rng.randint(3, 257, size=len(src)).astype(np.int64)


def toks(lengths, idx):
    return int((lengths[idx] - 1).sum())


class Mix(unittest.TestCase):
    def test_shard_names(self):
        self.assertEqual([shard_language(n) for n in NAMES], ['chat', 'aaa_Latn', 'aaa_Latn', 'bbb_Cyrl', 'bbb_Cyrl', 'ccc_Arab', 'zzz_Latn'])
        self.assertEqual(shard_language('web_kas_Deva_f012'), 'kas_Deva')
        self.assertIsNone(shard_language('other'))

    def test_targets_met_within_one_sequence(self):
        src, L = corpus()
        mix = {'total_tokens': 94000, 'max_repeats': 10, 'tokens': {'aaa_Latn': 60000, 'bbb_Cyrl': 20000, 'chat': 5000, 'ccc_Arab': 9000}}
        draw, rep = mix_draw(src, L, NAMES, mix, 94000, seed=1)       # scale 1
        for lang, t in mix['tokens'].items():
            r = rep[lang]
            self.assertFalse(r['capped'], lang)
            self.assertGreaterEqual(r['realised'], r['target'], lang)
            self.assertLess(r['realised'] - r['target'], 256, lang)
        self.assertNotIn('zzz_Latn', rep)                           # not in the mix: never read
        zzz = np.flatnonzero(src == 6)
        self.assertFalse(np.isin(draw, zzz).any())
        got = {l: toks(L, draw[np.isin(draw, np.flatnonzero(np.isin(src, [i for i, n in enumerate(NAMES) if (shard_language(n) == l)])))]) for l in mix['tokens']}
        for l in mix['tokens']:
            self.assertEqual(got[l], rep[l]['realised'])

    def test_whole_passes_then_part_and_repeat_cap(self):
        src, L = corpus()
        a_tokens = toks(L, np.flatnonzero(src == 5))               # ccc_Arab: 100 items
        mix = {'total_tokens': 10 * a_tokens, 'max_repeats': 3.0, 'tokens': {'ccc_Arab': 10 * a_tokens}}
        draw, rep = mix_draw(src, L, NAMES, mix, 10 * a_tokens, seed=0)
        r = rep['ccc_Arab']
        self.assertTrue(r['capped'])
        self.assertLessEqual(r['passes'], 3.0 + 1e-9)
        self.assertEqual(r['realised'], 3 * a_tokens)
        counts = np.bincount(draw, minlength=len(L))[src == 5]
        self.assertTrue((counts == 3).all())
        # 2.5 passes: two whole ones and a random half, never an item more than 3 times
        mix = {'total_tokens': 1000, 'max_repeats': 10, 'tokens': {'ccc_Arab': int(2.5 * a_tokens)}}
        draw, rep = mix_draw(src, L, NAMES, mix, 1000, seed=0)
        counts = np.bincount(draw, minlength=len(L))[src == 5]
        self.assertTrue(set(counts.tolist()) <= {2, 3})
        self.assertGreaterEqual(rep['ccc_Arab']['realised'], int(2.5 * a_tokens))
        self.assertLess(rep['ccc_Arab']['realised'] - int(2.5 * a_tokens), 256)

    def test_below_one_pass_is_a_sample_without_replacement(self):
        src, L = corpus()
        a_tokens = toks(L, np.flatnonzero(np.isin(src, [3, 4])))
        mix = {'total_tokens': 1000, 'max_repeats': 10, 'tokens': {'bbb_Cyrl': a_tokens // 3}}
        draw, rep = mix_draw(src, L, NAMES, mix, 1000, seed=5)
        self.assertEqual(len(set(draw.tolist())), len(draw))
        self.assertTrue(np.isin(src[draw], [3, 4]).all())          # both shards of the language are drawn from
        self.assertLess(rep['bbb_Cyrl']['passes'], 0.4)

    def test_deterministic_for_a_seed(self):
        src, L = corpus()
        mix = {'total_tokens': 1000, 'max_repeats': 10, 'tokens': {'aaa_Latn': 500, 'bbb_Cyrl': 300, 'chat': 100}}
        a, ra = mix_draw(src, L, NAMES, mix, 80000, seed=3)
        b, rb = mix_draw(src, L, NAMES, mix, 80000, seed=3)
        c, _ = mix_draw(src, L, NAMES, mix, 80000, seed=4)
        self.assertTrue(np.array_equal(a, b) and ra == rb)
        self.assertFalse(np.array_equal(a, c))

    def test_missing_language_is_reported(self):
        src, L = corpus()
        mix = {'total_tokens': 100, 'max_repeats': 10, 'tokens': {'aaa_Latn': 50, 'nnn_Latn': 50}}
        draw, rep = mix_draw(src, L, NAMES, mix, 1000, seed=0)
        self.assertEqual(rep['_missing'], ['nnn_Latn'])
        self.assertNotIn('nnn_Latn', rep)

    def test_scaled_to_the_run(self):
        src, L = corpus()
        mix = {'total_tokens': 1000, 'max_repeats': 10, 'tokens': {'aaa_Latn': 600, 'chat': 400}}
        draw, rep = mix_draw(src, L, NAMES, mix, 50000, seed=0)
        self.assertAlmostEqual(rep['aaa_Latn']['target'], 30000, delta=1)
        self.assertAlmostEqual(rep['chat']['target'], 20000, delta=1)
        self.assertLess(abs(toks(L, draw) - 50000), 512)


if __name__ == '__main__':
    unittest.main()
