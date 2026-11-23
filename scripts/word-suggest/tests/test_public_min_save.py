"""The public message and email tests (ws/textdata.py, data/oasst2_messages.py, data/enron_email.py) and the minimum length of a suggestion
(scripts/show_filter.py --min-save, scripts/real_chances.py plen). No data and no GPU needed; the surfaces test needs Qwen3.5's tokenizer."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np  # noqa: E402

from ws import textdata  # noqa: E402


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class Surfaces(unittest.TestCase):
    def test_messages_and_email_candidates(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "messages_oasst2.jsonl"), "w") as f:
                f.write(json.dumps(dict(id="oasst2:a", session="t", agent="assistant", source="x", ts=1, split="test", lang="eng_Latn",
                                        text="please explain how the moon moves around the earth", prev_agent="Hello, how can I help?",
                                        prev_user=["hi there"])) + "\n")
            with open(os.path.join(d, "email_enron.jsonl"), "w") as f:
                f.write(json.dumps(dict(id="enron:b", source="x", ts=2, split="test", lang="eng_Latn", writer="a@enron.com",
                                        text=" ".join(["word%d" % i for i in range(130)]))) + "\n")
            m = list(textdata.messages_candidates(os.path.join(d, "messages_oasst2.jsonl"), "test", "agent+user"))
            self.assertEqual(len(m), 1)
            self.assertEqual((m[0]["surface"], m[0]["agent_ctx"], m[0]["user_ctx"].startswith("hi")), ("messages", "Hello, how can I help?", True))
            e = list(textdata.email_candidates(os.path.join(d, "email_enron.jsonl"), "test", "agent+user", 4))
            self.assertEqual([c["id"] for c in e], ["enron:b:0", "enron:b:0#1"])          # 130 words: two segments
            self.assertEqual((e[0]["doc_ctx"], e[0]["agent_ctx"]), ("", ""))
            self.assertEqual(len(e[1]["doc_ctx"].split()), 100)                             # the 100 words before it
            self.assertEqual(e[1]["surface"], "email")

    def test_chat_prefix_for_messages(self):
        from ws.types import CHAT_SURFACES
        from ws.vocab import AGENT, BOS, DOC, USER, Vocab
        self.assertEqual(Vocab.prefix_from_ids("messages", [10, 11]), [BOS, AGENT, 10, 11, USER])
        self.assertEqual(Vocab.prefix_from_ids("chat", [10, 11]), [BOS, AGENT, 10, 11, USER])
        self.assertEqual(Vocab.prefix_from_ids("email", doc=[10]), [BOS, DOC, 10, DOC])
        self.assertIn("messages", CHAT_SURFACES)


class EmailCleaning(unittest.TestCase):
    def test_clean(self):
        en = load("data/enron_email.py", "enron_email")
        body = ("Mark,\n\nPlease send me the final numbers for the October invoices when you have a chance this afternoon,\n"
                "and let me know if anything looks off to you.\n\nThanks,\nLeslie Smith\nEnron North America\n"
                "-----Original Message-----\nFrom: Mark\nSent: Monday\nTo: Leslie\nSubject: numbers\n\nold text here")
        t = en.clean(body)
        self.assertNotIn("Original", t)
        self.assertNotIn("old text", t)
        self.assertNotIn("Leslie", t)
        self.assertTrue(t.endswith("Thanks,"))
        self.assertIn("this afternoon, and let me know", t)                    # the wrapped line is joined
        self.assertEqual(en.clean("> quoted\nmine is here"), "mine is here")
        self.assertTrue(en.plain_english("the " * 5 + "of and to for you will be there " * 3, 10, 100))
        self.assertFalse(en.plain_english("12345 67890 " * 20, 10, 100))


class MinSave(unittest.TestCase):
    def events(self, d):
        """Two examples. Word 0: gold 'hello' (L 5, bonus 1) with typed k = 0, 1, 2, 3: right at k = 0 (5 letters), k = 1 (4), k = 2 (3),
        k = 3 (2 letters); wrong suggestions in between would not matter here."""
        rows = []
        for ex, lens in (("a", [5, 4, 3, 2]), ("b", [5, 4, 3, 2])):
            rows.append(dict(t="e", id=ex, surface="chat", lang="en", chars=6))
            for k, pl in enumerate(lens):
                rows.append(dict(t="c", id=ex, j=0, k=k, L=5, bonus=1, y=int(ex == "a" or k >= 2), c=0.9 - 0.1 * k, top=0.9, plen=pl))
        p = os.path.join(d, "ev.jsonl")
        with open(p, "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        return p

    def test_suggestion_letters(self):
        rc = load("scripts/real_chances.py", "real_chances")
        self.assertEqual(rc.suggestion_letters(b" hello", 2), 3)
        self.assertEqual(rc.suggestion_letters(b"hello", 0), 5)
        self.assertEqual(rc.suggestion_letters(b"he", 4), 0)

    def test_hiding(self):
        sf = load("scripts/show_filter.py", "show_filter")
        with tempfile.TemporaryDirectory() as d:
            ev = sf.EventsPlen(self.events(d), names=["top"])
            self.assertEqual(list(ev.plen[:4]), [5, 4, 3, 2])
            score, th = sf.min_save_scores(ev, 0)
            self.assertTrue((score == ev.c).all())
            score, th = sf.min_save_scores(ev, 3)                              # hides plen 1, 2, 3 (saves 0, 1, 2 keys); keeps 5 and 4
            self.assertEqual(list(score[:4] >= 0), [True, True, False, False])
            self.assertTrue((th >= 0).all())
            # example a is right at k = 0 -> saves 5 + 1 - 1 = 5 keys at any m <= 4; at m = 6 nothing is shown, nothing saved
            S0 = ev.sweep(*(lambda s, t: (s, [t[0]]))(*sf.min_save_scores(ev, 0)))
            self.assertEqual(S0[0][:, 0].tolist(), [5.0, 3.0 + 0.0])       # b: first right shown is k = 2 (plen 3): 5 - 2 + 1 - 1 = 3
            S6, th6 = sf.min_save_scores(ev, 6)
            self.assertFalse(np.isfinite(th6[0]))
            rows = []
            sf.compare_min_save([self.events(d)], ["x"], [0.3], [0, 1, 2, 3], 50, 0, lambda r: rows.append(r))
            self.assertEqual(len(rows), 4)
            self.assertTrue(all(r["tag"] == "min_save" for r in rows))
            self.assertAlmostEqual(rows[0]["ksr"], 8 / 12)                    # (5 + 3) keys of 12 characters
            self.assertNotIn("delta_vs_min", rows[0])
            self.assertIn("delta_vs_min", rows[1])


if __name__ == "__main__":
    unittest.main()
