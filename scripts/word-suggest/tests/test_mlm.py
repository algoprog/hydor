"""mmBERT as a next-token scorer (ws/mlm.py). Run: .venv/bin/python -m unittest tests.test_mlm -v (from the workspace root).
Skipped when jhu-clsp/mmBERT-small is not in the local HF cache. float32 on the CPU, so the comparisons are tight."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import torch  # noqa: E402

torch.set_num_threads(2)

from ws.mlm import Incremental, MLMScorer, parse_llm_spec  # noqa: E402
from ws.types import Example  # noqa: E402

NAME = "jhu-clsp/mmBERT-small"


def available():
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(NAME, local_files_only=True)
        return True
    except Exception:
        return False


def example(tok, target, ctx):
    enc = tok(target, add_special_tokens=False, return_offsets_mapping=True)
    return Example("m", "doc", "en", "", "", ctx, target, list(enc["input_ids"]), [tuple(o) for o in enc["offset_mapping"]])


@unittest.skipUnless(available(), "mmBERT-small not cached")
class MLM(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exact = MLMScorer(NAME, dtype="float32", threads=2, causal=False)
        cls.causal = MLMScorer(NAME, dtype="float32", threads=2, causal=True)
        text = " ".join(f"word{i % 7} the cat sat on a mat" for i in range(25))   # > 128 tokens: the local window matters
        cls.ex = example(cls.exact.tok, "The quick brown fox jumps over the lazy dog and then it ran home.", text)

    def test_spec(self):
        self.assertEqual(parse_llm_spec("mlm:a/b"), ("mlm", "a/b"))
        self.assertEqual(parse_llm_spec("mlm-causal:a/b"), ("mlm-causal", "a/b"))
        self.assertEqual(parse_llm_spec("Qwen/Qwen3.5-0.8B-Base"), ("lm", "Qwen/Qwen3.5-0.8B-Base"))

    def test_causal_equals_incremental_with_saved_states(self):
        """The one-forward causal variant (custom attention masks, sdpa) against token-by-token computation with saved states,
        written by hand from the model's modules: the masks really are applied, in local and global layers."""
        ex, sc = self.ex, self.causal
        lp = sc.logprobs(ex)
        pre = [sc.cls] + sc.prefix_ids(ex)
        self.assertGreater(len(pre), 2 * sc.window)
        inc = Incremental(sc.model, sc.window)
        inc.extend(pre)
        rows = [inc.logprobs(inc.query(sc.mask))]
        for t in ex.target_ids:
            rows.append(inc.logprobs(inc.step(t, sc.mask)))        # keep the token, ask the mask after it, in one pass
        want = torch.stack(rows)
        self.assertEqual(lp.shape, want.shape)
        self.assertLess(float((lp - want).abs().max()), 2e-3)
        self.assertTrue(torch.equal(lp.argmax(-1), want.argmax(-1)))
        # and token by token for the typed tokens too (a one-token extend, then a query)
        inc2 = Incremental(sc.model, sc.window)
        inc2.extend(pre)
        for i, t in enumerate(ex.target_ids[:4]):
            inc2.extend([t])
            self.assertLess(float((inc2.logprobs(inc2.query(sc.mask)) - lp[i + 1]).abs().max()), 2e-3)

    def test_causal_is_causal_and_differs_from_exact(self):
        ex, sc = self.ex, self.causal
        lp = sc.logprobs(ex)
        ids = list(ex.target_ids)
        ids2 = ids[:6] + [(t + 1000) % 200000 + 5 for t in ids[6:]]       # another continuation after 6 typed tokens
        lp2 = sc.logprobs(Example("m2", "doc", "en", "", "", ex.doc_ctx, ex.target, ids2, ex.offsets))
        self.assertTrue(torch.allclose(lp[:7], lp2[:7], atol=1e-4))         # rows 0..6 only read target[:6]
        self.assertFalse(torch.allclose(lp[8:], lp2[8:], atol=1e-3))
        ex_lp = self.exact.logprobs(ex)
        self.assertFalse(torch.allclose(lp, ex_lp, atol=1e-2))            # causal prefix states are not the exact encoding

    def test_exact_batch_equals_single_forward(self):
        ex, sc = self.ex, self.exact
        lp = sc.logprobs(ex)
        pre = [sc.cls] + sc.prefix_ids(ex)
        for i in (0, 5, len(ex.target_ids)):
            s = pre + list(ex.target_ids[:i]) + [sc.mask, sc.sep]
            h = sc.model.model(input_ids=torch.tensor([s])).last_hidden_state[0, len(pre) + i]
            want = sc._head(h[None])[0]
            self.assertLess(float((lp[i] - want).abs().max()), 2e-3, i)
        self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(lp.shape[0]), atol=1e-3))
        sc2 = MLMScorer(NAME, dtype="float32", threads=2, causal=False, ending="none")
        self.assertFalse(torch.allclose(sc2.logprobs(ex), lp, atol=1e-3))


if __name__ == "__main__":
    unittest.main()
