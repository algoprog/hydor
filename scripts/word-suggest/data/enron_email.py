#!/usr/bin/env python3
"""data/email_enron.jsonl: email a person wrote, from the Enron corpus (public test, surface "email", English).

Source: https://huggingface.co/datasets/corbt/enron-emails (517,401 messages, one `train` split, parquet), a parsed copy of the Enron
email corpus that Carnegie Mellon University's CALO project released (William W. Cohen, 2015: https://www.cs.cmu.edu/~enron/), which
is the mail the US Federal Energy Regulatory Commission made public in 2003 during its investigation of Enron. The Hub copy's card
names no licence (it only lists the columns), and the original release has none either: it is a public-record corpus of real people's
mail, used here only to measure keystrokes saved, never to train. The test file stays in data/ (git keeps it out); the corpus's own
rules apply to it. The Enron emails are also in The Pile, so Qwen3.5 may have seen them; the small model did not (its corpora
are FineWeb-2, FineWeb-Edu, Wikipedia, MADLAD-400 and chats).

What is kept of a message: the text its writer typed. Removed: quoted lines (">"), everything from a reply or forward marker on
("-----Original Message-----", "Forwarded by", a "From: ... Sent:" or "To: ... Subject:" header block, "On ... wrote:"), the
signature (after "--", and the name lines under a closing such as "Thanks," that stay as the last line), mailing-list footers and
lines of the headers kind. Lines that the mail program wrapped at about 70 characters are joined, as a person typing in a window
would have them. Then only plain English prose stays: at least --min-words and at most --max-words words (the default 100 makes one email one test example), no tables, few digits,
no addresses or links to speak of, and the words of English (a share of common ones). Duplicates (the same body) are dropped.

Spread: the writer is the `from` address (an @enron.com one); the candidates are ordered by a seeded hash and taken one per writer
before a second one of any, so --n emails come from as many writers as there are (about --n, when the corpus has so many).
A seeded sample: the file is the fixed test, run it with --limit 0. The summary (writers, words) is in data/email_enron.counts.json.

    CUDA_VISIBLE_DEVICES="" python data/enron_email.py [--n 700] [--seed 0]
"""
import argparse
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from ws.textdata import nwords  # noqa: E402

OUT = os.path.join(HERE, "email_enron.jsonl")
REPO = "corbt/enron-emails"
LANG = "eng_Latn"

CUT = [re.compile(p, re.I | re.M) for p in (
    r"^\s*-{2,}\s*original message\s*-{2,}", r"^\s*-{2,}\s*forwarded by", r"^\s*-{3,}.*forwarded", r"^\s*_{5,}\s*$",
    r"^\s*begin forwarded message", r"^\s*from:\s.*$\n(?:.*\n){0,3}?\s*(?:sent|date|to):", r"^\s*on .{5,120}\bwrote:\s*$",
    r"^\s*on .{5,80}\n.{0,80}\bwrote:\s*$", r"^.{3,80}\n\s*\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d\d\s*[ap]m\s*$",
    r"^\s*to:\s.*\n\s*(?:cc|subject):", r"^\s*\*{3,}\s*$", r"^\s*-{2}\s*$", r"^\s*={5,}\s*$", r"^\s*-{8,}\s*$",
    r"^\s*(?:this e-?mail|this message|the information (?:contained|in this)|confidential|disclaimer|to unsubscribe|"
    r"if you (?:are not the intended|wish to unsubscribe|no longer))")]
CLOSER = re.compile(r"^\s*(?:thanks(?: again| a lot| very much)?|thank you|many thanks|regards|best regards|kind regards|best wishes|"
                    r"best|sincerely|cheers|respectfully|yours truly|talk to you soon|take care|later|thx)\s*[,!.]?\s*$", re.I)
STOP = frozenset("the of and to a in is that it for you i on with this be are as at have we will not but by from or can if "
                 "me my your was has do an so they there what about would please thanks".split())
BAD_LINE = re.compile(r"^\s*(?:to|cc|bcc|from|sent|subject|date|attachments?|importance)\s*:", re.I)


def clean(body: str) -> str:
    t = body.replace("\r\n", "\n").replace("\r", "\n")
    for rx in CUT:
        m = rx.search(t)
        if m:
            t = t[:m.start()]
    lines = [l for l in t.split("\n") if not l.lstrip().startswith(">")]
    out = []
    for l in lines:
        if BAD_LINE.match(l):
            continue
        out.append(l.rstrip())
    # signature: nothing after the first closing line but the closing itself
    for i, l in enumerate(out):
        if CLOSER.match(l) and i > 0:
            out = out[:i + 1]
            break
    # reflow: a line the mail program wrapped near the margin continues in the next
    paras, cur = [], []
    for l in out:
        if not l.strip():
            if cur:
                paras.append(cur)
            cur = []
        else:
            cur.append(l.strip())
    if cur:
        paras.append(cur)
    res = []
    for p in paras:
        s = p[0]
        for l in p[1:]:
            if len(s.split("\n")[-1]) >= 50 and not re.match(r"^(?:[-*\d]+[.)]?\s|\w+:\s)", l):
                s += " " + l
            else:
                s += "\n" + l
        res.append(s)
    t = "\n\n".join(res)
    return re.sub(r"[ \t]+", " ", t).strip()


def plain_english(t: str, min_words: int, max_words: int) -> bool:
    w = t.split()
    if not (min_words <= len(w) <= max_words):
        return False
    letters = sum(c.isalpha() for c in t)
    if letters < 0.75 * len(t.replace(" ", "").replace("\n", "")):
        return False
    if sum(c.isdigit() for c in t) > 0.06 * len(t):
        return False
    if sum(1 for c in t if ord(c) > 127) > 0:
        return False
    if re.search(r"https?://|www\.|\S+@\S+\.\S+", t) and len(re.findall(r"https?://|www\.|\S+@\S+\.\S+", t)) > 1:
        return False
    if len(re.findall(r"\b[A-Z]{4,}\b", t)) > 0.15 * len(w):
        return False
    lw = [x.strip(".,;:!?()\"'").lower() for x in w]
    if sum(x in STOP for x in lw) < 0.18 * len(lw):
        return False
    lines = [l for l in t.split("\n") if l.strip()]
    if sum(len(l.split()) <= 3 for l in lines) > 0.4 * len(lines) and len(lines) > 4:       # lists and tables
        return False
    return True


def candidates(seed: int, min_words: int, max_words: int):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download, list_repo_files
    files = sorted(f for f in list_repo_files(REPO, repo_type="dataset") if f.startswith("data/train-"))
    seen = set()
    for f in files:
        p = hf_hub_download(REPO, f, repo_type="dataset")
        for batch in pq.ParquetFile(p).iter_batches(batch_size=5000, columns=["message_id", "from", "date", "body", "file_name"]):
            for r in batch.to_pylist():
                sender = (r["from"] or "").strip().lower()
                if not sender.endswith("@enron.com") or not r["body"]:
                    continue
                t = clean(r["body"])
                if not plain_english(t, min_words, max_words):
                    continue
                h = hashlib.sha1(re.sub(r"\W+", "", t.lower()).encode()).hexdigest()
                if h in seen:
                    continue
                seen.add(h)
                key = hashlib.sha1(f"{seed}:{r['message_id']}".encode()).hexdigest()
                d = r["date"]
                yield dict(id="enron:" + hashlib.sha1(r["message_id"].encode()).hexdigest()[:16], writer=sender, text=t, key=key,
                           ts=int(d.timestamp() * 1000) if d else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=700)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--min-words", type=int, default=25)
    ap.add_argument("--max-words", type=int, default=100)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    by_writer: dict = {}
    total = 0
    for c in candidates(a.seed, a.min_words, a.max_words):
        by_writer.setdefault(c["writer"], []).append(c)
        total += 1
    for v in by_writer.values():
        v.sort(key=lambda c: c["key"])
    picked = []
    rnd = 0
    while len(picked) < a.n and any(len(v) > rnd for v in by_writer.values()):
        layer = sorted((v[rnd] for v in by_writer.values() if len(v) > rnd), key=lambda c: c["key"])
        picked += layer[:a.n - len(picked)]
        rnd += 1
    picked.sort(key=lambda c: c["id"])
    with open(a.out, "w", encoding="utf-8") as f:
        for c in picked:
            f.write(json.dumps(dict(id=c["id"], source="enron:corbt/enron-emails", ts=c["ts"], split="test", lang=LANG, writer=c["writer"],
                                    text=c["text"]), ensure_ascii=False) + "\n")
    words = sorted(nwords(c["text"]) for c in picked)
    info = dict(source=REPO + " (Enron corpus, CMU; no licence stated)", seed=a.seed, candidates=total, writers_available=len(by_writer),
                examples=len(picked), writers=len({c["writer"] for c in picked}), words_min=words[0], words_median=words[len(words) // 2],
                words_max=words[-1], words_total=sum(words))
    with open(os.path.splitext(a.out)[0] + ".counts.json", "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
