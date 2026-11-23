import os
import unittest

import helpers
import numpy as np

from hydor_suggest.lid import Lid


class LidTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = helpers.tmpdir()
        cls.tok = helpers.make_tokenizer()
        helpers.write_lid(cls.dir.name, cls.tok)
        cls.lid = Lid.load(cls.dir.name)

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def ids(self, text):
        return self.tok.encode(text, add_special_tokens=False).ids

    def test_guesses_each_language(self):
        lang, p, n = self.lid.guess(self.ids('the quick brown fox jumps over the lazy dog'))
        self.assertEqual(lang, 'eng_Latn')
        self.assertGreater(p, 0.9)
        lang, p, n = self.lid.guess(self.ids('ευχαριστώ πολύ για τη βοήθεια σας'))
        self.assertEqual(lang, 'ell_Grek')

    def test_too_few_tokens_is_no_language(self):
        lang, p, n = self.lid.guess(self.ids('the quick brown fox')[:3])
        self.assertIsNone(lang)
        self.assertEqual(n, 3)

    def test_unsure_is_no_language(self):
        lang, p, n = self.lid.guess(self.ids('the quick brown fox jumps over the lazy dog'), min_posterior=1.1)
        self.assertIsNone(lang)

    def test_specials_shifted_back_are_ignored(self):
        ids = self.ids('the quick brown fox jumps over the lazy dog')
        with_specials = [-5, -4] + ids + [-1]
        self.assertEqual(self.lid.guess(with_specials)[2], len(ids))

    def test_score_is_the_sum_of_log_probabilities_with_the_floor(self):
        ids = np.array(self.ids('the dog') + [self.tok.get_vocab_size() - 1])
        s = self.lid.scores(ids)
        with open(os.path.join(self.dir.name, 'lid.bin'), 'rb') as f:
            raw = f.read()
        L, N = 2, 40
        tok_ids = np.frombuffer(raw, dtype='<u4', count=L * N).reshape(L, N)
        lps = np.frombuffer(raw, dtype='<f2', count=L * N, offset=L * N * 4).reshape(L, N).astype(np.float64)
        for l in range(L):
            want = 0.0
            for t in ids:
                where = np.flatnonzero(tok_ids[l] == t)
                want += lps[l][where[0]] if len(where) else self.lid.floor[l]
            self.assertAlmostEqual(s[l], want, places=3)

    def test_files_that_do_not_fit_are_refused(self):
        with helpers.tmpdir() as d:
            helpers.write_lid(d, self.tok)
            with open(os.path.join(d, 'lid.bin'), 'ab') as f:
                f.write(b'\0')
            with self.assertRaises(ValueError):
                Lid.load(d)

    def test_no_files_no_guess(self):
        with helpers.tmpdir() as d:
            self.assertIsNone(Lid.load(d))


if __name__ == '__main__':
    unittest.main()
