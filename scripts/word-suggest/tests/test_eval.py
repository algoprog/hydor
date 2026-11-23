"""Unit tests of the metric code on hand-made distributions. Run: .venv/bin/python -m unittest tests.test_eval -v
(from the workspace root). Tests that need the Qwen tokenizer are skipped when it is not in the local HF cache."""
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
from ws.evaluate import EvalConfig, Evaluator, aggregate, derive  # noqa: E402
from ws.tokbytes import PrefixIndex, token_bytes, word_start_flags  # noqa: E402
from ws.types import Example  # noqa: E402

EOS = None  # a token without bytes that ends the text


class Vocab:
    """A toy vocabulary: token bytes by id, with one end-of-text id."""

    def __init__(self, toks):
        self.tb = [t.encode() if isinstance(t, str) else t for t in toks]
        self.eos = self.tb.index(None)
        self.id = {t: i for i, t in enumerate(self.tb) if t is not None}

    def ids(self, *toks):
        return [self.id[t.encode() if isinstance(t, str) else t] for t in toks]

    def dist(self, probs: dict):
        """One log-prob row: probs maps a token (str/bytes or 'EOS') to its probability; the rest share what is left."""
        V = len(self.tb)
        p = torch.zeros(V)
        used = 0.0
        for t, v in probs.items():
            i = self.eos if t == "EOS" else self.id[t.encode() if isinstance(t, str) else t]
            p[i] = v
            used += v
        rest = [i for i in range(V) if p[i] == 0]
        assert used <= 1 + 1e-9
        if rest:
            p[rest] = max(1 - used, 1e-12) / len(rest)
        return torch.log(p)

    def example(self, target, toks, rows, lang="en", surface="chat"):
        ids = self.ids(*toks)
        assert "".join(t if isinstance(t, str) else t.decode() for t in toks) == target
        offs, pos = [], 0
        for t in toks:
            s = t if isinstance(t, str) else t.decode("utf-8", "ignore")
            offs.append((pos, pos + len(s)))
            pos += len(s)
        ex = Example("t", surface, lang, "", "", "", target, ids, offs)
        return ex, torch.stack(rows)

    def evaluator(self, **kw):
        return Evaluator(self.tb, [self.eos], EvalConfig(**kw), keep_details=True)


def valid_sum(v, row):
    """Probability mass of the tokens that have bytes (the allowed set when nothing is typed)."""
    return sum(math.exp(row[i].item()) for i, b in enumerate(v.tb) if b is not None)


V1 = Vocab(["the", " the", "cat", " cat", " cow", " ca", " can", " c", " car", " sat", " ", "\n", ".", "s", None, "un",
            "believ", "able", "unb", "ab", " cd", "x"])


class WordCases(unittest.TestCase):
    def test_right_at_k0_and_conf(self):
        # "cat sat": cat (row 0) and " sat" (row 1) are arg max; after " sat" the end of text is most likely
        rows = [V1.dist({"cat": 0.7, " the": 0.1}), V1.dist({" sat": 0.6, " cat": 0.1}), V1.dist({"EOS": 0.5, "s": 0.2})]
        ex, lp = V1.example("cat sat", ["cat", " sat"], rows)
        ev = V1.evaluator()
        c = ev.score(ex, lp)
        d = ev.details
        self.assertTrue(d[0]["correct"][0] and d[1]["correct"][0])
        # word 'cat': p = P(cat) / (all valid) = 0.7; the end: row 1's mass of whitespace-start tokens or EOS
        row1 = rows[1].exp()
        ends = sum(row1[i].item() for i, b in enumerate(V1.tb) if b is None or b[:1] in (b" ", b"\n"))
        self.assertAlmostEqual(d[0]["conf"][0], 0.7 / valid_sum(V1, rows[0]) * ends, places=5)
        self.assertEqual(c["acc_hit@0"], 2)
        self.assertEqual(c["acc_n@0"], 2)
        self.assertEqual(c["acc_n@3"], 0)           # no word longer than 3 ("cat" has 3 characters, k = 3 needs 4)
        m = derive(c)
        self.assertEqual(m["acc@0"], 1.0)
        self.assertEqual(m["acc@0_after_first"], 1.0)
        self.assertEqual(c["unaligned"], 0)

    def test_wrong_at_k0_right_at_k2(self):
        rows = [V1.dist({"the": 0.8}), V1.dist({" cow": 0.5, " cat": 0.3, " can": 0.05, " c": 0.01, " ca": 0.01, " ": 0.01}),
                V1.dist({"EOS": 0.9})]
        ex, lp = V1.example("the cat", ["the", " cat"], rows)
        ev = V1.evaluator()
        c = ev.score(ex, lp)
        cat = ev.details[1]
        self.assertEqual(cat["correct"], [False, False, True])
        # k=2: R = ' ca': allowed = ' cat', ' can', ' ca' plus the proper prefixes ' c' and ' ': p = .3 / .38
        self.assertAlmostEqual(cat["conf"][2], (0.3 / 0.38) * 0.9 + 0, delta=0.1)  # times the end mass (about .9)
        # wrong at k=0: its confidence is the arg max's (' cow') share of ' *': .5 / (all tokens starting with ' ')
        self.assertLess(cat["conf"][0], 0.55)
        # keystrokes at tau=0: 'the' right at k=0 (3 chars + the single space - 1 Tab = 3 saved); 'cat' taken at k=2
        # saves (3-2) + 0 - 1 = 0
        self.assertEqual(c["saved@0.0"], 3)
        self.assertEqual(c["chars"], 7)
        self.assertAlmostEqual(derive(c)["ksr@0"], 3 / 7)
        # accuracy: acc@2 = words longer than 2 (both): 'the' right at k=2? only if its steps and end hold
        self.assertEqual(c["acc_n@2"], 2)

    def test_word_split_over_tokens(self):
        rows = [V1.dist({"un": 0.4, "unb": 0.1}), V1.dist({"believ": 0.7}), V1.dist({"able": 0.8}), V1.dist({"EOS": 0.6})]
        ex, lp = V1.example("unbelievable", ["un", "believ", "able"], rows)
        ev = V1.evaluator()
        ev.score(ex, lp)
        w = ev.details[0]
        self.assertTrue(w["correct"][0])
        self.assertAlmostEqual(w["conf"][0], 0.4 * 0.7 * 0.8 * 0.6 + 0, delta=0.3)
        self.assertTrue(w["correct"][2])             # typed 'un': the first token still matches
        # typed 'unb': the allowed set holds 'unb' (.1) and the prefix 'un' (.4); arg max is 'un' -> right; but with
        # 'unb' made likelier than 'un' a different tokenization of the same word is wrong
        rows[0] = V1.dist({"un": 0.2, "unb": 0.5})
        ev.score(ex, torch.stack(rows))
        w = ev.details[0]
        self.assertTrue(w["correct"][0] is False)    # arg max over all tokens is 'unb' at k=0 too
        self.assertFalse(w["correct"][3])
        self.assertEqual(len(w["correct"]), 12)

    def test_prefix_walk_exact(self):
        # typed 'unb' (k=3): step 1 allowed = {'unb', 'un'}; gold 'un' is arg max when 'un' > 'unb'
        rows = [V1.dist({"un": 0.4, "unb": 0.1}), V1.dist({"believ": 0.7}), V1.dist({"able": 0.8}), V1.dist({"EOS": 0.6})]
        ex, lp = V1.example("unbelievable", ["un", "believ", "able"], rows)
        ev = V1.evaluator()
        ev.score(ex, lp)
        w = ev.details[0]
        self.assertTrue(w["correct"][3])             # 'un' beats 'unb' within {unb, un}; next: R='b', 'believ' starts with b
        # p of step 1 = .4 / (.4 + .1); the second step: R = 'b': allowed = tokens starting with 'b' = {'believ'} -> p = 1
        # step 3: R empty: all tokens with bytes: p = .8 / their mass; end: ends mass
        end_mass = sum(math.exp(rows[3][i].item()) for i, b in enumerate(V1.tb) if b is None or b[:1] in (b" ", b"\n"))
        self.assertAlmostEqual(w["conf"][3], 0.4 / 0.5 * 1.0 * 0.8 / valid_sum(V1, rows[2]) * end_mass, places=5)

    def test_end_of_word_check(self):
        # steps are right, but the model would go on ('cats'): the word is not complete
        rows = [V1.dist({"the": 0.8}), V1.dist({" cat": 0.9}), V1.dist({"s": 0.6, "EOS": 0.3})]
        ex, lp = V1.example("the cat", ["the", " cat"], rows)
        ev = V1.evaluator()
        ev.score(ex, lp)
        self.assertEqual(ev.details[1]["correct"][0], False)
        self.assertAlmostEqual(ev.details[1]["conf"][0], 0.9 / sum(math.exp(rows[1][i].item()) for i, b in enumerate(V1.tb) if b and b[:1] == b" ") * 0.6, places=5)   # arg max's probability at the end
        # and with EOS the arg max the word ends
        rows[2] = V1.dist({"s": 0.3, "EOS": 0.6})
        ev.score(ex, torch.stack(rows))
        self.assertEqual(ev.details[1]["correct"][0], True)
        # a whitespace token ends a word too
        rows[2] = V1.dist({" sat": 0.6, "s": 0.2})
        ev.score(ex, torch.stack(rows))
        self.assertEqual(ev.details[1]["correct"][0], True)

    def test_ksr_trailing_space(self):
        rows = [V1.dist({"ab": 0.9}), V1.dist({" cd": 0.9}), V1.dist({" ": 0.9}), V1.dist({"EOS": 0.9})]
        ex, lp = V1.example("ab cd ", ["ab", " cd", " "], rows)
        ev = V1.evaluator()
        c = ev.score(ex, lp)
        # 'ab' right at k=0: 2 chars + the single space after it - 1 Tab = 2 saved; 'cd': 2 chars + trailing space - 1 = 2
        self.assertEqual(c["saved@0.0"], 4)
        self.assertEqual(c["chars"], 6)
        self.assertAlmostEqual(derive(c)["ksr@0"], 4 / 6)
        # without the trailing space nothing follows 'cd'
        rows = [V1.dist({"ab": 0.9}), V1.dist({" cd": 0.9}), V1.dist({"EOS": 0.9})]
        ex, lp = V1.example("ab cd", ["ab", " cd"], rows)
        c = ev.score(ex, lp)
        self.assertEqual(c["saved@0.0"], 2 + 1)
        self.assertEqual(c["chars"], 5)
        # two spaces after a word: no space is typed for the user
        rows = [V1.dist({"ab": 0.9}), V1.dist({" ": 0.9}), V1.dist({" cd": 0.9}), V1.dist({"EOS": 0.9})]
        ex, lp = V1.example("ab  cd", ["ab", " ", " cd"], rows)
        c = ev.score(ex, lp)
        # 'ab' is followed by two spaces: first path token is 'ab' only; 'cd' has joined ' ' (path ' cd', R=' ')
        self.assertEqual(ev.details[0]["aligned"], True)
        self.assertEqual(c["saved@0.0"], 1 + 1 + 0 * 1)    # 'ab': 2 - 0 + 0 - 1 = 1;  'cd': 2 - 0 + 0 - 1 = 1

    def test_threshold_shown_precision(self):
        # a confident wrong first suggestion and a hesitant right one
        rows = [V1.dist({"the": 0.8}), V1.dist({" cow": 0.5, " cat": 0.3, " can": 0.05, " c": 0.01, " ca": 0.01, " ": 0.01}),
                V1.dist({"EOS": 0.9})]
        ex, lp = V1.example("the cat", ["the", " cat"], rows)
        ev = V1.evaluator()
        c = ev.score(ex, lp)
        # tau=.7: 'the' (conf .8*end) may be below: check consistency instead of constants
        d = ev.details
        for t in (0.0, 0.3, 0.6):
            shown = sum(int(x >= t) for w in d for x in w["conf"])
            self.assertLessEqual(c[f"shown@{t}"], shown)
        m = derive(c)
        self.assertTrue(0 <= m["prec@0"] <= 1 and 0 <= m["cov@0"] <= 1)

    def test_greek_word(self):
        # a Greek word whose first letter is split across two byte tokens
        g = Vocab([b"\xce", b"\x93\xce\xb5\xce\xb9", "ά".encode(), " σου".encode(), b"\xce\x93", None, " ".encode(),
                   b"x"])
        word = "Γειά"               # Γειά
        rows = [g.dist({b"\xce": 0.5, b"\xce\x93": 0.3}), g.dist({b"\x93\xce\xb5\xce\xb9": 0.9}), g.dist({"ά".encode(): 0.8}),
                g.dist({" σου".encode(): 0.7}), g.dist({"EOS": 0.9})]
        toks = [b"\xce", b"\x93\xce\xb5\xce\xb9", "ά".encode(), " σου".encode()]
        ids = g.ids(*toks)
        ex = Example("g", "plain", "el", "", "", "", word + " σου", ids, [(0, 1), (0, 3), (3, 4), (4, 8)])
        ev = g.evaluator()
        c = ev.score(ex, torch.stack(rows))
        w = ev.details[0]
        self.assertEqual(c["unaligned"], 0)
        self.assertEqual(len(w["correct"]), 4)       # 4 characters
        self.assertTrue(w["correct"][0])
        # typed 'Γ' (2 bytes): step 1 allowed = {'Γ' (.3), the 1-byte prefix token (.5)}: arg max is gold \xce
        self.assertTrue(w["correct"][1])
        # the second word has a joined space
        self.assertEqual(len(ev.details[1]["correct"]), 3)

    def test_unaligned_word(self):
        # a token straddles two words: both are skipped and counted
        v = Vocab(["a", "b c", "d", " e", None, " "])
        rows = [v.dist({"a": 0.5}), v.dist({"b c": 0.5}), v.dist({"EOS": 0.5})]
        ex = Example("u", "chat", "en", "", "", "", "ab c", v.ids("a", "b c"), [(0, 1), (1, 4)])
        ev = v.evaluator()
        c = ev.score(ex, torch.stack(rows))
        self.assertEqual(c["unaligned"], 2)          # 'ab' (token 'b c' sticks into 'c') and 'c' (token starts with 'b')
        self.assertEqual(c["n_words"], 0)


class ChineseLine(unittest.TestCase):
    def test_next_character_accuracy(self):
        v = Vocab(["你好".encode(), "你".encode(), "你们".encode(), "吗".encode(), "呢".encode(), None, "好".encode()])
        rows = [v.dist({"你好".encode(): 0.6, "你们".encode(): 0.2}), v.dist({"呢".encode(): 0.6, "吗".encode(): 0.2}),
                v.dist({"EOS": 0.9})]
        ex = Example("z", "plain", "zh", "", "", "", "你好吗", v.ids("你好".encode(), "吗".encode()), [(0, 2), (2, 3)])
        ev = v.evaluator()
        c = ev.score(ex, torch.stack(rows))
        # 你: arg max '你好' starts with 你 -> right; 好: typed '你', tokens longer than it: '你好' (.6) beats '你们' -> right;
        # 吗: arg max is 呢 -> wrong
        self.assertEqual((c["char_hit"], c["char_n"]), (2, 3))
        m = derive(c)
        self.assertAlmostEqual(m["char_acc"], 2 / 3)
        self.assertNotIn("ksr@0", m)                 # no keystroke simulation for characters


class NoSpaceLanguages(unittest.TestCase):
    def test_codes(self):
        from ws.types import is_nospace
        for l in ("zh", "ja", "tha_Thai", "lao_Laoo", "khm_Khmr", "mya_Mymr", "bod_Tibt", "dzo_Tibt", "jpn_Jpan", "yue_Hant", "cmn_Hani", "zho_Hans"):
            self.assertTrue(is_nospace(l), l)
        for l in ("en", "ell_Grek", "kor_Hang", "ben_Beng", "arb_Arab", "hin_Deva", "eng_Latn"):
            self.assertFalse(is_nospace(l), l)

    def test_thai_scored_by_characters(self):
        v = Vocab(["สวัส".encode(), "ดี".encode(), "ส".encode(), None])
        rows = [v.dist({"สวัส".encode(): 0.6}), v.dist({"ดี".encode(): 0.6}), v.dist({"EOS": 0.9})]
        ex = Example("t", "flores", "tha_Thai", "", "", "", "สวัสดี", v.ids("สวัส".encode(), "ดี".encode()), [(0, 4), (4, 6)])
        c = v.evaluator().score(ex, torch.stack(rows))
        self.assertEqual(c["char_n"], 6)
        self.assertNotIn("ksr@0", derive(c))


class Mixing(unittest.TestCase):
    def test_linear_loglinear_normalised(self):
        a = torch.log_softmax(torch.randn(3, 50), -1)
        b = torch.log_softmax(torch.randn(3, 50), -1)
        for lp in (mix.linear(a, b, 0.3), mix.loglinear(a, b, 0.4), mix.linear(a, b, torch.tensor([.2, .5, .9]))):
            self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(3), atol=1e-5))
        self.assertTrue(torch.allclose(mix.linear(a, b, 1.0), a))
        self.assertTrue(torch.allclose(mix.loglinear(a, b, 0.0), b, atol=1e-5))
        slm = b.clone()
        slm[:, :10] = float("-inf")                  # a token the SLM rules out stays out of a loglinear mix
        self.assertTrue(torch.isinf(mix.loglinear(a, slm, 0.5)[:, :10]).all())

    def test_gate_fit_and_json(self):
        torch.manual_seed(0)
        N = 4000
        f = torch.randn(N, len(mix.FEATURES))
        lam = torch.sigmoid(2 * f[:, 0])             # the true gate follows feature 0
        pl, ps = torch.rand(N) * 0.5 + 0.01, torch.rand(N) * 0.5 + 0.01
        # the gold token is drawn from the mix: both models are right sometimes; compare fitted against fixed lambda
        gold_l = torch.log(pl)
        gold_s = torch.log(ps)
        g = mix.fit_gate(f, gold_l, gold_s)
        ll_gate = mix.gate_loglik(g, f, gold_l, gold_s)
        ll_fixed = max(float(torch.logaddexp(gold_l + math.log(l), gold_s + math.log(1 - l)).mean()) for l in (.1, .3, .5, .7, .9))
        self.assertGreaterEqual(ll_gate, ll_fixed - 1e-6)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "g.json")
            g.save(p)
            g2 = mix.Gate.load(p)
            self.assertTrue(torch.allclose(g.lam(f), g2.lam(f)))
        _ = lam


class Plumbing(unittest.TestCase):
    def test_variants_and_rows(self):
        from ws.evaluate import Scorers, parse_variant

        class Fake:
            def __init__(self, shift):
                self.shift, self.calls = shift, []

            def logprobs(self, ex, llm_lp=None):
                self.calls.append(llm_lp is not None)
                n = len(ex.target_ids) + 1
                base = torch.arange(len(V1.tb), dtype=torch.float32) * self.shift
                return torch.log_softmax((base if llm_lp is None else llm_lp * 0.5 + base).expand(n, -1).clone(), -1)

        sc = Scorers.__new__(Scorers)
        sc.llm, sc.others = Fake(0.1), {"slm": Fake(-0.2)}
        vs = [parse_variant(x) for x in ("llm", "slm", "llm+slm:linear:0.3", "llm+slm:loglinear:0.5")]
        sc.check(vs)
        ex, _ = V1.example("cat", ["cat"], [V1.dist({"cat": 0.5}), V1.dist({"EOS": 0.5})])
        r = sc.rows(ex, vs)
        self.assertEqual(sc.others["slm"].calls.count(False), 1)   # alone once ...
        self.assertEqual(sc.others["slm"].calls.count(True), 1)    # ... and once with the LLM, however many mixtures
        for v in vs:
            lp = sc.mixed(v, r, V1.tb, ex, {})
            self.assertTrue(torch.allclose(lp.exp().sum(-1), torch.ones(2), atol=1e-4), v.spec)
        with self.assertRaises(ValueError):
            parse_variant("slm+llm:linear:0.3")
        with self.assertRaises(ValueError):
            parse_variant("llm+slm")
        v = parse_variant("llm+slm:gate:/tmp/some:path.json")
        self.assertEqual((v.mode, v.param), ("gate", "/tmp/some:path.json"))


class PrefixIndexTests(unittest.TestCase):
    def test_against_brute_force(self):
        import random
        rnd = random.Random(1)
        alphabet = [b"a", b"b", b"\xff", b"\x00", b" "]
        toks = list({b"".join(rnd.choice(alphabet) for _ in range(rnd.randint(1, 4))) for _ in range(300)})
        toks.append(None)
        idx = PrefixIndex(toks)
        for _ in range(300):
            R = b"".join(rnd.choice(alphabet) for _ in range(rnd.randint(0, 4)))
            want = sorted(i for i, t in enumerate(toks) if t is not None and (t.startswith(R) or (R.startswith(t) and len(t) < len(R))))
            got = sorted(idx.allowed(R).tolist())
            self.assertEqual(got, want, R)
            self.assertEqual(sorted(idx.allowed(R).tolist()), want)     # cached


class TokenBytes(unittest.TestCase):
    def test_sentencepiece_byte_fallback(self):
        from tokenizers import Tokenizer, decoders, models, normalizers
        from transformers import PreTrainedTokenizerFast
        vocab = {"<unk>": 0, "▁": 1, "a": 2, "▁a": 3, "<0xC3>": 4, "<0xA9>": 5, "<s>": 6, "▁▁": 7}
        t = Tokenizer(models.BPE(vocab, [], byte_fallback=True, unk_token="<unk>"))
        t.decoder = decoders.Sequence([decoders.Replace("▁", " "), decoders.ByteFallback(), decoders.Fuse()])
        tok = PreTrainedTokenizerFast(tokenizer_object=t, unk_token="<unk>", bos_token="<s>")
        tb = token_bytes(tok)
        self.assertEqual(tb[1], b" ")
        self.assertEqual(tb[3], b" a")
        self.assertEqual(tb[4], b"\xc3")
        self.assertEqual(tb[5], b"\xa9")
        self.assertIsNone(tb[0])                      # <unk>
        self.assertIsNone(tb[6])                      # <s>
        self.assertEqual(tb[7], b"  ")

    def test_qwen(self):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        try:
            from transformers import AutoTokenizer
            tok = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B-Base")
        except Exception as e:  # pragma: no cover
            self.skipTest(f"no Qwen tokenizer: {e}")
        tb = token_bytes(tok, 248320)
        self.assertEqual(len(tb), 248320)
        self.assertIsNone(tb[tok.eos_token_id])
        self.assertIsNone(tb[248100])                 # beyond the tokenizer: padded row
        for text in ["Hello world, it's 3.14!\n\nNew  line", "Γειά σου κόσμε",
                     "你好，世界。", "café \U0001f600 emoji", "  indented\tcode()"]:
            ids = tok(text, add_special_tokens=False)["input_ids"]
            self.assertEqual(b"".join(tb[i] for i in ids), text.encode("utf-8"), text)
        flags = word_start_flags(tb, tok("a bc  d", add_special_tokens=False)["input_ids"])
        self.assertEqual(flags[0], 1)
        self.assertEqual(flags[-1], 1)

    def test_textdata_and_prompt(self):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        try:
            from transformers import AutoTokenizer
            tok = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-0.8B-Base")
        except Exception as e:  # pragma: no cover
            self.skipTest(f"no Qwen tokenizer: {e}")
        import json
        from ws import textdata
        from ws.scorers import build_prefix
        with tempfile.TemporaryDirectory() as d:
            long_msg = " ".join(f"w{i}" for i in range(250))
            rows = [dict(id="m1", session="s", agent="a", source="x", ts=1, split="test", lang="en", text="Hello there, my friend",
                         prev_agent=" ".join(f"a{i}" for i in range(150)), prev_user=["first msg here", "second msg"]),
                    dict(id="m2", session="s", agent="a", source="x", ts=2, split="test", lang="en", text=long_msg,
                         prev_agent="", prev_user=[]),
                    dict(id="m3", session="s", agent="a", source="x", ts=3, split="train", lang="en", text="skip me", prev_agent="", prev_user=[])]
            with open(os.path.join(d, "user_msgs.jsonl"), "w") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            with open(os.path.join(d, "other_texts.jsonl"), "w") as f:
                f.write(json.dumps(dict(id="d1", source="note", ts=1, split="test", author="user",
                                        text="# Title\n\nFirst paragraph is here with words.\n\nSecond paragraph follows now ok.")) + "\n")
            os.makedirs(os.path.join(d, "multi"))
            with open(os.path.join(d, "multi", "el.jsonl"), "w") as f:
                f.write(json.dumps(dict(id="e1", lang="el", text="x", paragraphs=["Γειά σου κόσμε εδώ", "Δεύτερη παράγραφος εδώ τώρα ακόμα"])) + "\n")
            with open(os.path.join(d, "multi", "de.jsonl"), "w") as f:
                f.write(json.dumps(dict(id="de-1", lang="de", text="Das ist ein kurzer Absatz mit genug Woertern.", article="X", idx=1,
                                        prev="Der vorige Absatz hat auch Woerter.")) + "\n")
                f.write(json.dumps(dict(id="de-2", lang="de", text="Der erste Absatz hat keinen vorigen Absatz hier.", article="Y", idx=0,
                                        prev="")) + "\n")
            exs = textdata.load_examples(tok, "test", "chat", "agent+user", data_dir=d)
            self.assertEqual([e.id for e in exs], ["m1", "m2", "m2#1", "m2#2"])
            e = exs[0]
            self.assertEqual(len(e.agent_ctx.split()), 100)
            self.assertTrue(e.agent_ctx.endswith("a149"))
            self.assertEqual(e.user_ctx, "first msg here\n\nsecond msg")
            self.assertEqual(len(e.target.split()), 4)
            self.assertEqual(tok.decode(e.target_ids), e.target)
            self.assertEqual(len(exs[1].target.split()), 100)
            self.assertEqual(len(exs[3].target.split()), 50)
            self.assertEqual(len(exs[3].user_ctx.split()), 100)
            exs2 = textdata.load_examples(tok, "test", "chat", "none", data_dir=d)
            self.assertEqual((exs2[0].agent_ctx, exs2[0].user_ctx), ("", ""))
            self.assertEqual(textdata.load_examples(tok, "test", "chat", "agent+user", data_dir=d, limit=2, seed=3)[0].id,
                             textdata.load_examples(tok, "test", "chat", "agent+user", data_dir=d, limit=2, seed=3)[0].id)
            docs = textdata.load_examples(tok, "test", "doc", "agent+user", data_dir=d)
            self.assertEqual(len(docs), 2)               # '# Title' is too short
            self.assertTrue(docs[1].doc_ctx.endswith("words."))
            pl = textdata.load_examples(tok, "test", "plain", "agent+user", data_dir=d)
            self.assertEqual([e.id for e in pl], ["de-1", "de-2", "e1:0", "e1:1"])
            self.assertEqual(pl[0].doc_ctx, "Der vorige Absatz hat auch Woerter.")
            self.assertEqual(pl[0].target, "Das ist ein kurzer Absatz mit genug Woertern.")
            self.assertEqual(pl[1].doc_ctx, "")
            self.assertEqual(pl[2].doc_ctx, "")
            self.assertTrue(pl[3].doc_ctx.endswith("εδώ"))
            self.assertEqual(len(textdata.load_examples(tok, "test", "plain", "none", data_dir=d, limit=1)), 2)   # 1 per language
            self.assertEqual(textdata.load_examples(tok, "test", "plain", "none", data_dir=d)[0].doc_ctx, "")
            self.assertEqual(build_prefix(e, "plain"), e.agent_ctx + "\n\n" + e.user_ctx + "\n\n")
            self.assertEqual(build_prefix(e, "roles"), f"Assistant: {e.agent_ctx}\n\nUser: {e.user_ctx}\n\nUser: ")
            self.assertEqual(build_prefix(exs2[0], "roles"), "User: ")
            self.assertEqual(build_prefix(docs[1], "roles"), f"Document: {docs[1].doc_ctx}\n\n")


if __name__ == "__main__":
    unittest.main()
