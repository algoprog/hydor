import math
import unittest

import helpers
import numpy as np

from hydor_suggest.decode import Cancelled, decode, next_word_text, text_after
from hydor_suggest.tokbytes import PrefixIndex, token_bytes

# a tiny vocabulary of made-up tokens
TOKENS = [b'he', b'hello', b'h', b'llo', b'l', b'lo', b' world', b' there', b' ', b'wor', b'ld', b'!', b'a', b'a ', None, b'\n']
EOT = 14        # a token without bytes that ends the text


def index():
    return PrefixIndex(TOKENS, [EOT])


def row_of(spec, n=len(TOKENS)):
    r = np.zeros(n, dtype=np.float32)
    for k, v in spec.items():
        r[k] = v
    return r


class DecodeTests(unittest.TestCase):
    def test_constrained_then_free_and_the_confidence_is_the_product(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        rows = {
            (): row_of({T[b'he']: 0.3, T[b'hello']: 0.2, T[b'h']: 0.1, T[b'a']: 0.4}),             # typed "h": the allowed set renormalises
            (T[b'he'],): row_of({T[b'llo']: 0.6, T[b'l']: 0.2, T[b'lo']: 0.1, T[b' world']: 0.1}),
            (T[b'he'], T[b'llo']): row_of({T[b' world']: 0.7, T[b'!']: 0.3}),                       # the next token begins with whitespace: the word ends
        }
        d = decode(lambda path: rows[path], ix, b'h')
        self.assertEqual(d.produced, b'hello')
        allowed1 = 0.3 + 0.2 + 0.1
        want = (0.3 / allowed1) * (0.6 / (0.6 + 0.2 + 0.1)) ** 0 * 1.0
        # step 1: argmax inside the allowed set = b'he'; step 2 is unconstrained (R is now empty): argmax b'llo' over every valid id; the end mass = whitespace tokens
        want = (0.3 / allowed1) * (0.6 / 1.0) * (0.7 + 0.0)
        self.assertAlmostEqual(d.conf, want, places=5)
        self.assertTrue(d.ended)
        self.assertEqual(text_after(d.produced, b'h'), 'ello')
        self.assertFalse(d.eot)

    def test_token_carrying_the_whitespace_ends_the_word(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        d = decode(lambda path: row_of({T[b'a ']: 0.5, T[b'a']: 0.2}), ix, b'')
        self.assertEqual(d.produced, b'a ')
        self.assertTrue(d.ended)
        self.assertEqual(d.path, (T[b'a '],))
        self.assertAlmostEqual(d.conf, 0.5 / 0.7, places=5)

    def test_end_of_text_ends_the_word_and_counts_its_mass(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        rows = {(): row_of({T[b'hello']: 1.0}), (T[b'hello'],): row_of({EOT: 0.6, T[b'!']: 0.4})}
        d = decode(lambda path: rows[path], ix, b'he')
        self.assertEqual(d.produced, b'hello')
        self.assertTrue(d.ended and d.eot)
        self.assertAlmostEqual(d.conf, 1.0 * 0.6, places=6)

    def test_no_mass_in_the_allowed_set_is_confidence_zero(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        d = decode(lambda path: row_of({T[b'a']: 1.0}), ix, b'h')                 # the model only knows tokens that do not fit "h"
        self.assertEqual(d.conf, 0.0)
        self.assertFalse(d.ended)
        d = decode(lambda path: row_of({}), ix, b'zzz')
        self.assertEqual((d.produced, d.conf), (b'', 0.0))

    def test_token_limit(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        d = decode(lambda path: row_of({T[b'l']: 0.5, T[b'a']: 0.5}), ix, b'', max_tokens=3)
        self.assertFalse(d.ended)
        self.assertEqual(len(d.produced), 3)

    def test_next_word_starts_from_the_path(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        rows = {(): row_of({T[b'hello']: 1.0}), (T[b'hello'],): row_of({T[b' world']: 0.9, T[b' there']: 0.1}),
                (T[b'hello'], T[b' world']): row_of({T[b' there']: 1.0})}
        d = decode(lambda p: rows[p], ix, b'hel')
        self.assertEqual(d.path, (T[b'hello'],))
        d2 = decode(lambda p: rows[p], ix, b'', d.path)
        self.assertEqual(d2.produced, b' world')
        self.assertTrue(d2.ended)
        self.assertEqual(next_word_text(d2.produced), ' world')
        self.assertEqual(next_word_text(b'world '), ' world')
        self.assertEqual(next_word_text(b''), '')

    def test_cancel_between_steps(self):
        ix = index()
        T = {t: i for i, t in enumerate(TOKENS) if t is not None}
        calls = {'n': 0}

        def cancelled():
            calls['n'] += 1
            return calls['n'] > 2
        with self.assertRaises(Cancelled):
            decode(lambda p: row_of({T[b'l']: 1.0}), ix, b'', cancelled=cancelled)

    def test_real_tokenizer_greedy_word(self):
        tok = helpers.make_tokenizer()
        V = tok.get_vocab_size()
        tb = token_bytes(tok, V)
        ix = PrefixIndex(tb, [tok.token_to_id('<|endoftext|>')])
        ids = tok.encode(' world today', add_special_tokens=False).ids
        rows = {}
        path = ()
        for t in ids:
            r = np.full(V, 1e-6, dtype=np.float32)
            r[t] = 0.9
            rows[path] = r
            path = path + (t,)
        rows[path] = np.full(V, 1e-6, dtype=np.float32)
        d = decode(lambda p: rows[p], ix, b' wo')
        self.assertTrue(d.produced.startswith(b' wo'))


if __name__ == '__main__':
    unittest.main()
