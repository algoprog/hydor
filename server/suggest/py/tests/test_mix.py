import json
import math
import unittest

import helpers  # noqa: F401
import numpy as np

from hydor_suggest.mix import FEATURES, Gate, Switch, entropy_maxp, gate_features, linear


class MixTests(unittest.TestCase):
    def test_entropy_and_max_probability(self):
        p = np.array([0.5, 0.25, 0.25, 0.0], dtype=np.float32)
        e, m = entropy_maxp(p)
        self.assertAlmostEqual(e, -(0.5 * math.log(0.5) + 2 * 0.25 * math.log(0.25)), places=6)
        self.assertEqual(m, 0.5)

    def test_gate_features_in_the_documented_order(self):
        a = np.array([0.7, 0.1, 0.1, 0.1], dtype=np.float32)
        b = np.array([0.25, 0.25, 0.25, 0.25], dtype=np.float32)
        f = gate_features(a, b, unk=0.02, position=4, word_start=1)
        self.assertEqual(len(f), len(FEATURES))
        self.assertAlmostEqual(f[1], 0.7, places=6)
        self.assertAlmostEqual(f[2], math.log(4), places=6)
        self.assertAlmostEqual(f[3], 0.25, places=6)
        self.assertAlmostEqual(f[4], 0.02, places=6)
        self.assertAlmostEqual(f[5], math.log1p(4), places=6)
        self.assertEqual(f[6], 1.0)

    def test_gate_lambda_is_the_language_models_weight(self):
        g = Gate(w=[-1.0, 0, 0, 0, 0, 0, 0], b=0.0)
        sure = g.lam([0.1, 0, 0, 0, 0, 0, 0])
        unsure = g.lam([5.0, 0, 0, 0, 0, 0, 0])
        self.assertGreater(sure, unsure)               # a language model with a high entropy gets less weight
        self.assertAlmostEqual(g.lam([0.0] * 7), 0.5)

    def test_gate_standardises_the_features(self):
        g = Gate(w=[1.0] + [0.0] * 6, b=0.0, mu=[2.0] + [0.0] * 6, sd=[4.0] + [1.0] * 6)
        self.assertAlmostEqual(g.lam([6.0] + [0.0] * 6), 1 / (1 + math.exp(-1.0)))

    def test_gate_loads_the_research_format_and_refuses_other_features(self):
        d = {'features': FEATURES, 'w': [0.1] * 7, 'b': 0.3, 'mu': [0.0] * 7, 'sd': [1.0] * 7, 'meta': {'x': 1}}
        g = Gate.from_dict(d)
        self.assertEqual(g.b, 0.3)
        with self.assertRaises(ValueError):
            Gate.from_dict({**d, 'features': ['other'] * 7})

    def test_linear_mix(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([0.0, 1.0], dtype=np.float32)
        np.testing.assert_allclose(linear(a, b, 0.25), [0.25, 0.75], rtol=1e-6)
        self.assertAlmostEqual(float(linear(a, b, 2.0)[0]), 1.0, places=5)      # kept inside (0, 1)
        self.assertAlmostEqual(float(linear(a, b, -1.0)[1]), 1.0, places=5)

    def test_switch_research_format_and_default(self):
        s = Switch.from_dict({'switch': {'eng_Latn': 'llm', 'ace_Latn': 'mix'}, 'switch_default': 'mix', 'w': [0]})
        self.assertEqual(s.choice('eng_Latn'), 'llm')
        self.assertEqual(s.choice('ace_Latn'), 'mix')
        self.assertEqual(s.choice('xxx_Latn'), 'mix')
        self.assertEqual(s.choice(None), 'mix')
        s2 = Switch.from_dict({'languages': {'a': 'llm'}, 'default': 'llm'})
        self.assertEqual(s2.choice('zzz'), 'llm')


if __name__ == '__main__':
    unittest.main()
