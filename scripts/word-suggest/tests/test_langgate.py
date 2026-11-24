"""Language-aware gate and language switch. Run: .venv/bin/python -m unittest tests.test_langgate -v (from the workspace root)."""
import json
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import torch  # noqa: E402

torch.set_num_threads(2)

from ws import mix  # noqa: E402
from ws.evaluate import Scorers, parse_variant  # noqa: E402
from tests.test_eval import V1  # noqa: E402

OLD_JSON = dict(features=mix.FEATURES, w=[0.5, -0.2, 0.1, 0.3, -0.4, 0.2, 0.7], b=0.1, mu=[0.0] * 7, sd=[1.0] * 7, meta={"x": 1})


class LangGate(unittest.TestCase):
    def test_switch_reads_two_letter_codes_as_flores_codes(self):
        g = mix.Gate(w=[0.0] * 7, b=0.0, switch={"eng_Latn": "llm", "kor_Hang": "mix", "zho_Hans": "llm"}, switch_default="mix")
        self.assertEqual(g.choice("en"), "llm")             # a test file that says 'en' is switched as eng_Latn
        self.assertEqual(g.choice("eng_Latn"), "llm")
        self.assertEqual(g.choice("ko"), "mix")
        self.assertEqual(g.choice("zh"), "llm")
        self.assertEqual(g.choice("xx"), "mix")             # unknown: the default
        self.assertEqual(g.choice(None), "mix")

    def test_old_json_loads_and_behaves_the_same(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "old.json")
            json.dump(OLD_JSON, open(p, "w"))
            g = mix.Gate.load(p)
            self.assertEqual((g.lang_bias, g.switch), ({}, {}))
            f = torch.randn(10, 7)
            ref = torch.sigmoid(f @ torch.tensor(OLD_JSON["w"]) + OLD_JSON["b"])
            for lang in (None, "eng_Latn", "xx"):
                self.assertTrue(torch.allclose(g.lam(f, lang), ref))
            q = os.path.join(d, "again.json")
            g.save(q)
            self.assertEqual(sorted(json.load(open(q))), sorted(OLD_JSON))     # no new keys when there are no biases

    def test_biases_move_lambda_per_language_and_unseen_falls_back(self):
        g = mix.Gate(w=OLD_JSON["w"], b=OLD_JSON["b"], lang_bias={"kor_Hang": 2.0, "tpi_Latn": -1.5})
        f = torch.randn(8, 7)
        base = torch.sigmoid(f @ torch.tensor(g.w) + g.b)
        self.assertTrue(torch.all(g.lam(f, "kor_Hang") > base))
        self.assertTrue(torch.all(g.lam(f, "tpi_Latn") < base))
        self.assertTrue(torch.allclose(g.lam(f, "fra_Latn"), base))            # unseen: the shared gate
        self.assertTrue(torch.allclose(g.lam(f, None), base))
        self.assertTrue(torch.allclose(torch.logit(g.lam(f, "kor_Hang")), torch.logit(base) + 2.0, atol=1e-4))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "g.json")
            g.save(p)
            h = mix.Gate.load(p)
            self.assertEqual(h.lang_bias, g.lang_bias)
            self.assertTrue(torch.allclose(h.lam(f, "kor_Hang"), g.lam(f, "kor_Hang")))

    def test_fit_recovers_language_biases(self):
        torch.manual_seed(0)
        N = 6000
        f = torch.randn(N, 7)
        langs = [("aaa", "bbb", "ccc")[i % 3] for i in range(N)]
        true = {"aaa": 2.5, "bbb": -2.5, "ccc": 0.0}
        lam = torch.sigmoid(torch.tensor([true[l] for l in langs]))
        # gold token from the LLM (prob .6) or the SLM (prob .6) by lam: each model is right half the time
        pl, ps = torch.full((N,), 0.6), torch.full((N,), 0.05)
        pick = torch.rand(N) < lam
        gl = torch.log(torch.where(pick, pl, ps))
        gs = torch.log(torch.where(pick, ps, pl))
        g0 = mix.fit_gate(f, gl, gs)
        gp = mix.fit_gate(f, gl, gs, langs=langs, lang_l2=1.0)
        self.assertGreater(gp.lang_bias["aaa"], gp.lang_bias["ccc"] + 1.0)
        self.assertLess(gp.lang_bias["bbb"], gp.lang_bias["ccc"] - 1.0)
        # log-likelihood with the biases beats the shared gate
        bias = torch.tensor([gp.lang_bias[l] for l in langs])
        lam_p = torch.sigmoid(((f - torch.tensor(gp.mu)) / torch.tensor(gp.sd)) @ torch.tensor(gp.w) + gp.b + bias)
        lam_0 = g0.lam(f)
        mixll = lambda lm: float(torch.logaddexp(gl + torch.log(lm), gs + torch.log1p(-lm)).mean())
        self.assertGreater(mixll(lam_p), mixll(lam_0) + 0.05)
        # a huge penalty pulls every bias to 0: the shared gate
        gz = mix.fit_gate(f, gl, gs, langs=langs, lang_l2=1e9)
        self.assertLess(max(abs(x) for x in gz.lang_bias.values()), 1e-3)
        # more regularisation, smaller biases
        gm = mix.fit_gate(f, gl, gs, langs=langs, lang_l2=3000.0)
        self.assertLess(abs(gm.lang_bias["aaa"]), abs(gp.lang_bias["aaa"]))

    def test_variants_use_ex_lang(self):
        class Fake:
            def __init__(self, shift):
                self.shift = shift

            def logprobs(self, ex, llm_lp=None):
                n = len(ex.target_ids) + 1
                base = torch.arange(len(V1.tb), dtype=torch.float32) * self.shift
                return torch.log_softmax((base if llm_lp is None else llm_lp * 0.5 + base).expand(n, -1).clone(), -1)

        sc = Scorers.__new__(Scorers)
        sc.llm, sc.others = Fake(0.1), {"slm": Fake(-0.2)}
        with tempfile.TemporaryDirectory() as d:
            plain, biased, sw = (os.path.join(d, x) for x in ("plain.json", "biased.json", "switch.json"))
            json.dump(OLD_JSON, open(plain, "w"))
            mix.Gate.load(plain).save(plain)
            gb = mix.Gate.load(plain)
            gb.lang_bias = {"aaa": 3.0}
            gb.save(biased)
            gs = mix.Gate.load(plain)
            gs.switch = {"aaa": "llm", "bbb": "mix"}
            gs.save(sw)
            vs = [parse_variant(f"llm+slm:gate:{plain}"), parse_variant(f"llm+slm:gate:{biased}"),
                  parse_variant(f"llm+slm:langswitch:{sw}")]
            self.assertEqual(vs[2].mode, "langswitch")
            sc.check(vs)

            def run(v, lang):
                ex, _ = V1.example("cat", ["cat"], [V1.dist({"cat": 0.5}), V1.dist({"EOS": 0.5})], lang=lang)
                r = sc.rows(ex, vs)
                lp, lam = sc.mixed_lam(v, r, V1.tb, ex, {})
                self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(2), atol=1e-4))
                return lp, lam, r
            for lang in ("aaa", "bbb", "zzz"):
                lp0, lam0, _ = run(vs[0], lang)
                lp1, lam1, _ = run(vs[1], lang)
                if lang == "aaa":
                    self.assertTrue(torch.all(lam1 > lam0))                    # the bias is used for its language ...
                else:
                    self.assertTrue(torch.allclose(lam1, lam0))                # ... and only for it; unseen: the shared gate
                lp2, lam2, r = run(vs[2], lang)
                if lang == "aaa":
                    self.assertTrue(torch.equal(lp2, r["llm"]))                # the LLM alone, exactly
                else:
                    self.assertTrue(torch.allclose(lp2, lp0))                  # 'mix' and the default for an unseen language
            # an old gate JSON in the gate variant: the same numbers as before this change
            ex, _ = V1.example("cat", ["cat"], [V1.dist({"cat": 0.5}), V1.dist({"EOS": 0.5})], lang="aaa")
            r = sc.rows(ex, vs[:1])
            from ws.tokbytes import word_start_flags
            want = mix.gate(r["llm"], r["slm+"], mix.Gate.load(plain), r.get("unk:slm"), word_start_flags(V1.tb, ex.target_ids))
            self.assertTrue(torch.equal(sc.mixed(vs[0], r, V1.tb, ex, {}), want))


if __name__ == "__main__":
    unittest.main()
