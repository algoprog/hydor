import unittest

import helpers  # noqa: F401  (sets the import path)  (sets the path)
import torch

from hydor_suggest import vocab as V
from hydor_suggest.model import SLM, SLMConfig, build_model, config_from_dict, last_logits, state_for_save


def tiny(arch='lfm', emb_rank=16, window=0):
    cfg = SLMConfig(arch=arch, vocab=300, d=32, n_layers=4, ffn=64, heads=4, kv_heads=2, kernel=3, emb_rank=emb_rank, window=window, max_len=256)
    torch.manual_seed(1)
    return SLM(cfg).eval(), cfg


class ModelTests(unittest.TestCase):
    def test_incremental_state_matches_full_forward(self):
        for arch, rank, window in (('lfm', 16, 0), ('lfm', 0, 0), ('tf', 0, 0), ('lfm', 16, 8)):
            m, cfg = tiny(arch, rank, window)
            ids = torch.randint(6, cfg.vocab, (1, 40))
            with torch.no_grad():
                full = m(ids)[0]
                st = m.init_state(1)
                got = []
                for chunk in (ids[:, :17], ids[:, 17:18], ids[:, 18:30], ids[:, 30:]):
                    lg, st = m(chunk, st)
                    got.append(lg[0])
                inc = torch.cat(got)
            self.assertLess(float((full - inc).abs().max()), 1e-4, (arch, rank, window))

    def test_state_is_not_changed_by_a_step(self):
        m, cfg = tiny()
        ids = [1, 3, 20, 21, 22]
        row, st = last_logits(m, ids)
        before = [(x.clone() if torch.is_tensor(x) else tuple(y.clone() for y in x)) for x in st.layers]
        r1, st1 = last_logits(m, [30], st)
        r2, st2 = last_logits(m, [31], st)
        self.assertEqual(st.pos, len(ids))
        for a, b in zip(before, st.layers):
            if torch.is_tensor(a):
                self.assertTrue(torch.equal(a, b))
            else:
                self.assertTrue(all(torch.equal(x, y) for x, y in zip(a, b)))
        r1b, _ = last_logits(m, [30], st)
        self.assertTrue(torch.equal(r1, r1b))
        self.assertFalse(torch.equal(r1, r2))

    def test_inference_records_no_autograd(self):
        m, _ = tiny()
        for p in m.parameters():
            p.requires_grad_(True)
        row, st = last_logits(m, [1, 5, 9])
        self.assertFalse(row.requires_grad)
        self.assertFalse(st.layers[0].requires_grad)

    def test_never_predicted_specials_are_masked(self):
        m, _ = tiny()
        row, _ = last_logits(m, [1, 5])
        for t in V.NEVER_PREDICT:
            self.assertEqual(float(row[t]), float('-inf'))
        self.assertTrue(torch.isfinite(row[V.UNK]) and torch.isfinite(row[V.EOS]))

    def test_weights_round_trip_with_the_research_names(self):
        m, cfg = tiny()
        sd = state_for_save(m)
        self.assertIn('embed.weight', sd)
        self.assertIn('emb_proj.weight', sd)
        self.assertIn('blocks.0.mixer.conv', sd)
        self.assertIn('blocks.2.mixer.q_proj.weight', sd)
        m2 = build_model(config_from_dict({**cfg.__dict__}), sd)
        a, _ = last_logits(m, [1, 7, 9])
        b, _ = last_logits(m2, [1, 7, 9])
        self.assertTrue(torch.equal(a, b))
        self.assertFalse(any(p.requires_grad for p in m2.parameters()))

    def test_tied_output_without_a_factorised_embedding(self):
        m, cfg = tiny(emb_rank=0)
        sd = state_for_save(m)
        self.assertNotIn('lm_head.weight', sd)
        m2 = build_model(cfg, sd)
        a, _ = last_logits(m, [1, 7])
        b, _ = last_logits(m2, [1, 7])
        self.assertTrue(torch.equal(a, b))

    def test_weights_that_do_not_fit_are_refused(self):
        m, cfg = tiny()
        sd = state_for_save(m)
        del sd['emb_proj.weight']
        with self.assertRaises(ValueError):
            build_model(cfg, sd)

    def test_loss_matches_a_plain_cross_entropy_and_trains(self):
        m, cfg = tiny()
        m.train()
        ids = torch.randint(6, cfg.vocab, (2, 12))
        w = torch.zeros(2, 11)
        w[:, 4:] = 2.0
        sw, sws, n = m.loss(ids[:, :-1], ids[:, 1:], w)
        self.assertEqual(n, 14)
        self.assertAlmostEqual(float(sws), 28.0)
        logits = m(ids[:, :-1]).float()
        logits[..., list(V.NEVER_PREDICT)] = float('-inf')
        ce = torch.nn.functional.cross_entropy(logits.reshape(-1, cfg.vocab), ids[:, 1:].reshape(-1), reduction='none').view(2, 11)
        self.assertAlmostEqual(float(sw.detach()), float((ce * w).sum().detach()), places=3)
        (sw / sws).backward()
        self.assertTrue(any(p.grad is not None for p in m.parameters()))


if __name__ == '__main__':
    unittest.main()
