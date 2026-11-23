import unittest

import helpers
import numpy as np

from hydor_suggest.llm import MAX_PROMPT_TOKENS, LlamaClient, LlmError, dense_from_top


class LlmTests(unittest.TestCase):
    def test_top_logprobs_over_http_with_the_documented_body(self):
        fake = helpers.FakeLlama(100, script=lambda prompt: [(7, float(np.log(0.5))), (3, float(np.log(0.25)))])
        try:
            c = LlamaClient(fake.url, k=2)
            ids, lp = c.top_logprobs([1, 2, 3])
            self.assertEqual(ids.tolist(), [7, 3])
            np.testing.assert_allclose(np.exp(lp), [0.5, 0.25], rtol=1e-5)
            body = fake.requests[0]
            self.assertEqual(body, {'prompt': [1, 2, 3], 'n_predict': 1, 'n_probs': 2, 'temperature': 0, 'cache_prompt': True})
            c.top_logprobs([1, 2, 3, 4])
            self.assertEqual(len(fake.requests), 2)
            c.close()
        finally:
            fake.stop()

    def test_the_prompt_is_cut_to_its_last_1500_tokens(self):
        fake = helpers.FakeLlama(100)
        try:
            c = LlamaClient(fake.url)
            c.top_logprobs(list(range(2000)))
            self.assertEqual(len(fake.requests[0]['prompt']), MAX_PROMPT_TOKENS)
            self.assertEqual(fake.requests[0]['prompt'][-1], 1999)
        finally:
            fake.stop()

    def test_a_connection_the_server_closed_is_opened_again(self):
        fake = helpers.FakeLlama(100)
        fake.close_each = True
        try:
            c = LlamaClient(fake.url)
            for i in range(3):
                self.assertTrue(len(c.top_logprobs([i + 1])[0]))
            c.close()
        finally:
            fake.stop()

    def test_a_server_that_is_not_there_is_an_error(self):
        with self.assertRaises(LlmError):
            LlamaClient('http://127.0.0.1:1', timeout=2).top_logprobs([1])

    def test_an_answer_without_probabilities_is_an_error(self):
        fake = helpers.FakeLlama(100, script=lambda prompt: [])
        try:
            c = LlamaClient(fake.url)
            with self.assertRaises(LlmError):
                c.top_logprobs([1])
            c.close()
        finally:
            fake.stop()

    def test_missing_mass_is_spread_in_proportion_to_the_small_model(self):
        V = 10
        tail = np.arange(1, V + 1, dtype=np.float32)
        tail /= tail.sum()
        ids = np.array([2, 5])
        lp = np.log(np.array([0.5, 0.3], dtype=np.float32))
        p = dense_from_top(ids, lp, V, tail)
        self.assertAlmostEqual(float(p.sum()), 1.0, places=5)
        self.assertAlmostEqual(float(p[2]), 0.5, places=6)
        self.assertAlmostEqual(float(p[5]), 0.3, places=6)
        rest = [i for i in range(V) if i not in (2, 5)]
        ratio = p[rest] / tail[rest]
        np.testing.assert_allclose(ratio, ratio[0], rtol=1e-4)
        self.assertAlmostEqual(float(p[rest].sum()), 0.2, places=5)

    def test_without_a_tail_the_rest_has_no_mass(self):
        p = dense_from_top(np.array([1, 2]), np.log(np.array([0.4, 0.4], dtype=np.float32)), 6, None)
        self.assertAlmostEqual(float(p.sum()), 0.8, places=5)
        self.assertEqual(float(p[0]), 0.0)

    def test_ids_beyond_the_vocabulary_are_dropped(self):
        p = dense_from_top(np.array([1, 99]), np.log(np.array([0.4, 0.4], dtype=np.float32)), 6, None)
        self.assertAlmostEqual(float(p.sum()), 0.4, places=5)


if __name__ == '__main__':
    unittest.main()
