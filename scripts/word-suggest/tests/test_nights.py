"""ws/nights.py: the nights (days that end on the dev boundary), the sample of older text, the counts.  No data, no GPU."""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'))
try:
    from ws import nights as N
except Exception as e:      # the app's trainer needs tokenizers, safetensors and torch
    N = None
    _why = str(e)

DAY = 86400 * 1000


@unittest.skipIf(N is None, 'ws.nights needs the app trainer')
class NightsTest(unittest.TestCase):
    def recs(self, days):
        return [{'ts': 1000 * DAY + int(d * DAY), 'kind': 'agent'} for d in days]

    def test_days_end_on_the_anchor(self):
        anchor = 1000 * DAY
        recs = self.recs([-2.5, -2.4, -1.0, -0.01, 0.0, 0.5])
        nights = N.nights_of(recs, anchor, anchor + DAY)
        self.assertEqual([d for d, _ in nights], [-3, -1, 0])
        self.assertEqual([len(r) for _, r in nights], [2, 2, 2])

    def test_records_after_the_end_are_left_out(self):
        anchor = 1000 * DAY
        nights = N.nights_of(self.recs([0.1, 1.2]), anchor, anchor + DAY)
        self.assertEqual(len(nights), 1)

    def test_every_two_days_reads_the_days_since_the_previous_run(self):
        anchor = 1000 * DAY
        nights = N.nights_of(self.recs([0.1, 1.1, 2.1, 4.1]), anchor, anchor + 10 * DAY, step_days=2)
        self.assertEqual([len(r) for _, r in nights], [2, 1, 1])

    def test_sample_older_tokens_and_cut(self):
        class S:
            pass
        s = S()
        s.ts = np.array([1, 2, 3, 4, 5, 50])
        s.ntok = np.array([10, 10, 10, 10, 10, 10])
        s.kind = np.array(['chat', 'agent', 'chat', 'agent', 'chat', 'chat'])
        s.seqs = list(range(6))
        got = N.sample_older(s, 10, 25, np.random.RandomState(0))
        self.assertTrue(all(i < 5 for i in got))                 # only older than the cut
        self.assertGreaterEqual(10 * len(got), 25)
        self.assertLessEqual(10 * len(got), 35)
        own = N.sample_older(s, 10, 1000, np.random.RandomState(0), 'chat')
        self.assertEqual(sorted(own), [0, 2, 4])                 # fewer than asked: all there is

    def test_counts(self):
        r = N.nll_acc({'n_tokens': 10, 'nll_nats': 20.0, 'bytes': 40, 'acc_n@1': 4, 'acc_hit@1': 1})
        self.assertAlmostEqual(r['nll'], 2.0)
        self.assertAlmostEqual(r['acc@1'], 0.25)


if __name__ == '__main__':
    unittest.main()
