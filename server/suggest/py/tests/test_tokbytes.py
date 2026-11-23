import unittest

import helpers
import numpy as np

from hydor_suggest.tokbytes import PrefixIndex, end_token_ids, starts_with_whitespace, token_bytes, word_start_flags

TEXTS = ['hello world', ' the quick brown fox', 'καλημέρα σας', 'Ευχαριστώ πολύ!', 'naïve café 😀 ok', 'a\nb\tc', '  two  spaces ']


class TokBytesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tok = helpers.make_tokenizer()
        cls.V = cls.tok.get_vocab_size() + 4
        cls.tb = token_bytes(cls.tok, cls.V)
        cls.index = PrefixIndex(cls.tb, end_token_ids(cls.tok, cls.V))

    def test_bytes_of_the_ids_are_the_text(self):
        for t in TEXTS:
            ids = self.tok.encode(t, add_special_tokens=False).ids
            self.assertEqual(b''.join(self.tb[i] for i in ids), t.encode('utf-8'), t)

    def test_control_and_padded_ids_have_no_bytes(self):
        eot = self.tok.token_to_id('<|endoftext|>')
        self.assertIsNone(self.tb[eot])
        self.assertTrue(all(self.tb[i] is None for i in range(self.tok.get_vocab_size(), self.V)))
        self.assertIn(eot, end_token_ids(self.tok, self.V))

    def test_allowed_sets_match_brute_force(self):
        for R in (b'', b' ', b'h', b' th', b'the', b' the q', 'κ'.encode(), ' κα'.encode(), b'xyz', b'\xce'):
            got = set(self.index.allowed(R).tolist())
            want = {i for i, b in enumerate(self.tb) if b is not None and (b.startswith(R) or (len(b) < len(R) and R.startswith(b) and len(b) > 0))}
            if not R:
                want = {i for i, b in enumerate(self.tb) if b is not None}
            self.assertEqual(got, want, R)

    def test_empty_allowed_set_for_an_impossible_word(self):
        idx = PrefixIndex([b'a', b'ab', None, b' c'], [])
        self.assertEqual(len(idx.allowed(b'x')), 0)
        self.assertEqual(sorted(idx.allowed(b'a').tolist()), [0, 1])
        self.assertEqual(sorted(idx.allowed(b'abc').tolist()), [0, 1])        # the tokens that are prefixes of the typed bytes

    def test_whitespace_only_tokens_are_not_taken_where_the_tokenizer_would_not_write_them(self):
        tb = [b' ', b'  ', b'\n', b'\n\n', b' ga', b' g', b'ga', b'1', b' the', b'\n ', b' 3', b'x']
        ix = PrefixIndex(tb, [])
        step = lambda R, started=False: sorted(tb[i] for i in ix.step_allowed(R, started))
        self.assertEqual(step(b' ga'), [b' g', b' ga'])                   # a lone space never comes before a letter
        self.assertEqual(step(b' g'), [b' g', b' ga'])
        self.assertEqual(step(b' 1'), [b' '])                             # before a digit it does
        self.assertEqual(step(b'  ga'), [b' '])                           # two spaces: the first is a token of its own
        self.assertEqual(step(b' '), [b' 3', b' g', b' ga', b' the'])     # the separator is typed: the word is the next one
        self.assertEqual(step(b'\n'), [b'\n'])                            # a typed newline run is consumed exactly, the word follows
        self.assertEqual(step(b'\n\nx'), [b'\n', b'\n\n'])
        self.assertNotIn(b' ', step(b''))                                 # a whole word wanted: no whitespace-only token
        self.assertNotIn(b'\n', step(b''))
        self.assertIn(b'ga', step(b''))
        self.assertEqual(len(ix.step_allowed(b'', True)), len(ix.valid_ids))      # mid-word nothing is filtered
        self.assertTrue(ix.ws_only[0] and ix.ws_only[3] and not ix.ws_only[4])

    def test_ends_word_marks_whitespace_tokens_and_end_of_text(self):
        eot = self.tok.token_to_id('<|endoftext|>')
        self.assertTrue(self.index.ends_word[eot])
        space_tokens = [i for i, b in enumerate(self.tb) if b and b[:1] == b' ']
        self.assertTrue(space_tokens)
        self.assertTrue(all(self.index.ends_word[i] for i in space_tokens))
        letters = [i for i, b in enumerate(self.tb) if b and b[:1].isalpha()]
        self.assertFalse(any(self.index.ends_word[i] for i in letters))
        self.assertEqual(set(self.index.ends_ids.tolist()), set(np.flatnonzero(self.index.ends_word).tolist()))

    def test_starts_with_whitespace(self):
        self.assertTrue(starts_with_whitespace(b' a'))
        self.assertTrue(starts_with_whitespace(' x'.encode()))
        self.assertFalse(starts_with_whitespace(b'a '))
        self.assertFalse(starts_with_whitespace(None))
        self.assertFalse(starts_with_whitespace(b''))

    def test_word_start_flags_end_with_one(self):
        ids = self.tok.encode('hello world', add_special_tokens=False).ids
        flags = word_start_flags(self.tb, ids)
        self.assertEqual(len(flags), len(ids) + 1)
        self.assertEqual(flags[0], 1)
        self.assertEqual(flags[-1], 1)


if __name__ == '__main__':
    unittest.main()
