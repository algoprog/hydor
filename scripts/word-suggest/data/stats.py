#!/usr/bin/env python3
"""Writes data/stats.md from the files extract.py and multi.py made."""
import json, random, statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

D = Path(__file__).resolve().parent
rd = lambda n: [json.loads(l) for l in open(D / n)]
U, A, O = rd("user_msgs.jsonl"), rd("agent_texts.jsonl"), rd("other_texts.jsonl")
split = json.load(open(D / "split.json"))
S = json.load(open(D / "sessions_typed.json"))
words = lambda t: len(t.split())
SPL = ("train", "dev", "test")
out = []
w = out.append


def table(head, rows):
    w("| " + " | ".join(head) + " |")
    w("|" + "|".join("---" for _ in head) + "|")
    for r in rows:
        w("| " + " | ".join(str(x) for x in r) + " |")
    w("")


def agg(items, key):
    d = defaultdict(lambda: dict(n=0, words=0, chars=0))
    for i in items:
        k = key(i)
        d[k]["n"] += 1
        d[k]["words"] += words(i["text"])
        d[k]["chars"] += len(i["text"])
    return d


w("# Word-suggest data: statistics\n")
w("Private data: stays in research/word-suggest/data (git-excluded). Made by data/extract.py from Hydor's database (read-only), as of %s.\n" % datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
w("Split rule: %s.\n" % split["rule"])
table(["boundary", "time (UTC)", "ms"], [["train < dev", split["dev_from"], split["dev_from_ts"]], ["dev < test", split["test_from"], split["test_from_ts"]], ["last user message", split["last_user_msg"], split["last_user_msg_ts"]]])

w("## User messages (typed by the user): %d\n" % len(U))
a = agg(U, lambda m: m["split"])
table(["split", "messages", "words", "chars", "words/msg (median)", "with prev_agent", "slash commands"],
      [[s, a[s]["n"], a[s]["words"], a[s]["chars"], statistics.median([words(m["text"]) for m in U if m["split"] == s] or [0]),
        "%.1f%%" % (100 * sum(1 for m in U if m["split"] == s and m["prev_agent"]) / max(a[s]["n"], 1)), sum(1 for m in U if m["split"] == s and m.get("slash"))] for s in SPL]
      + [["all", len(U), sum(v["words"] for v in a.values()), sum(v["chars"] for v in a.values()), statistics.median([words(m["text"]) for m in U]),
          "%.1f%%" % (100 * sum(1 for m in U if m["prev_agent"]) / len(U)), sum(1 for m in U if m.get("slash"))]])
for name, key in (("source", lambda m: m["source"]), ("agent", lambda m: m["agent"]), ("language", lambda m: m["lang"])):
    w("By %s:\n" % name)
    d = agg(U, key)
    rows = []
    for k in sorted(d, key=lambda k: -d[k]["n"]):
        rows.append([k] + [sum(1 for m in U if key(m) == k and m["split"] == s) for s in SPL] + [d[k]["n"], d[k]["words"], d[k]["chars"]])
    table([name, "train", "dev", "test", "all", "words", "chars"], rows)
w("Prefix share: prev_agent non-empty for %.1f%% of messages; prev_agent cut at 4000 characters by the search index (tail missing, not recoverable) for %.1f%%; prev_user non-empty for %.1f%%.\n" % (
    100 * sum(1 for m in U if m["prev_agent"]) / len(U), 100 * sum(1 for m in U if m.get("prev_agent_cut")) / len(U), 100 * sum(1 for m in U if m["prev_user"]) / len(U)))
pa = sorted(words(m["prev_agent"]) for m in U if m["prev_agent"])
w("prev_agent length in words (messages that have one): median %d, 90th percentile %d, max %d.\n" % (pa[len(pa) // 2], pa[int(len(pa) * .9)], pa[-1]))
ln = sorted(words(m["text"]) for m in U)
w("Message length in words: p10 %d, median %d, p90 %d, p99 %d, max %d.\n" % (ln[int(len(ln) * .1)], ln[len(ln) // 2], ln[int(len(ln) * .9)], ln[int(len(ln) * .99)], ln[-1]))

w("Messages per week (ISO week, Monday start, UTC):\n")
wk = Counter()
for m in U:
    d = datetime.fromtimestamp(m["ts"] / 1000, timezone.utc)
    iso = d.isocalendar()
    wk["%d-W%02d" % (iso[0], iso[1])] += 1
table(["week", "messages"], [[k, wk[k]] for k in sorted(wk)])
sess = Counter(m["session"] for m in U)
w("Typed sessions with at least one kept message: %d (median %d messages per session, max %d).\n" % (len(sess), statistics.median(sess.values()), max(sess.values())))

w("### Sanity check: 8 random short user messages (at most 12 words)\n")
random.seed(5)
for m in random.sample([m for m in U if words(m["text"]) <= 12], 8):
    w("- (%s, %s, %s) `%s`" % (m["source"], m["split"], m["lang"], m["text"].replace("`", "'").replace("\n", " ")))
w("")

w("## Agent texts (prose replies): %d\n" % len(A))
d = agg(A, lambda x: x["split"])
table(["split", "texts", "words", "chars", "cut at 4000"], [[s, d[s]["n"], d[s]["words"], d[s]["chars"], sum(1 for x in A if x["split"] == s and x.get("cut"))] for s in SPL])
table(["agent", "source", "typed session", "texts", "words"], [[k[0], k[1], k[2], v["n"], v["words"]] for k, v in sorted(agg(A, lambda x: (x["agent"], x["source"], x["typed_session"])).items(), key=lambda kv: -kv[1]["n"])])

w("## Other texts: %d\n" % len(O))
d = agg(O, lambda x: (x["source"], x["author"]))
table(["source", "author", "train", "dev", "test", "words", "chars"], [[k[0], k[1]] + [sum(1 for x in O if (x["source"], x["author"]) == k and x["split"] == s) for s in SPL] + [v["words"], v["chars"]] for k, v in sorted(d.items(), key=lambda kv: -kv[1]["n"])])
w("No text here is marked author `user`: memory notes are written by agents or by Hydor's own note-taking, wiki articles by its digest agents, pages mostly by agents (a page a person later edited is `unknown`).\n")

w("## Sessions: how the typed ones were told apart\n")
cnt, um = Counter(), Counter()
for k, v in S.items():
    cnt[v["typed"]] += 1
w("Sessions in the index: %d; typed in by the user: %d; started by Hydor, a scheduled task, an app, another agent or a script: %d.\n" % (len(S), cnt[True], cnt[False]))
rs = Counter(r for v in S.values() for r in v["why"])
table(["sign that a session was not typed in", "sessions"], [[k, v] for k, v in rs.most_common()])
w("Dropped while extracting:\n")
table(["what", "rows"], [[k, v] for k, v in split["extraction"].items()])

w("## Multilingual paragraphs (data/multi/*.jsonl, test only)\n")
rows = []
for f in sorted((D / "multi").glob("*.jsonl")):
    R = [json.loads(l) for l in open(f)]
    rows.append([f.stem, len(R), sum(words(r["text"]) for r in R), sum(len(r["text"]) for r in R), f.stat().st_size])
table(["lang", "paragraphs", "words (space-split)", "chars", "bytes"], rows)
w("Files:\n")
table(["file", "bytes"], [[p.name, p.stat().st_size] for p in sorted(D.glob("*.jsonl")) + sorted(D.glob("*.json"))])
(D / "stats.md").write_text("\n".join(out))
print("\n".join(out)[:6000])
