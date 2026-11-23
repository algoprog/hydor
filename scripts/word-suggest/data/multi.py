#!/usr/bin/env python3
"""data/multi/<lang>.jsonl: about 300 public Wikipedia paragraphs per language (el, de, zh, es, fr, en), test only.

Source: Hugging Face `wikimedia/wikipedia`, config `20231101.<lang>`, streamed: only the first articles are read.
Paragraphs are 40-150 words (zh: 60-250 characters). Fields: id, lang, text, plus article (title), idx (paragraph number in
the article) and prev (the article's previous paragraph, "" for the first: the context of the plain surface).
    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python data/multi.py [per_lang=300]
"""
import json
import os
import re
import sys
from pathlib import Path

from datasets import load_dataset

OUT = Path(__file__).resolve().parent / "multi"
LANGS = ["el", "de", "zh", "es", "fr", "en"]
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 300
PER_ARTICLE = 2
MAX_ARTICLES = 6000


def size_ok(lang, p):
    if lang == "zh":
        n = len(re.sub(r"\s", "", p))
        return 60 <= n <= 250
    return 40 <= len(p.split()) <= 150


def clean_ok(lang, p):
    letters = sum(ch.isalpha() for ch in p)
    if letters / max(len(p), 1) < 0.6:  # tables, lists of numbers
        return False
    if sum(ch.isdigit() for ch in p) / max(len(p), 1) > 0.12:
        return False
    return p.rstrip()[-1] in ".!?…。！？»”\")" if lang != "zh" else p.rstrip()[-1] in "。！？」”）"


def paragraphs(text):
    out = []
    for line in text.split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            out.append(line)
    return out


def build(lang):
    ds = load_dataset("wikimedia/wikipedia", "20231101." + lang, split="train", streaming=True)
    recs = []
    for n, art in enumerate(ds):
        if len(recs) >= PER or n >= MAX_ARTICLES:
            break
        ps = paragraphs(art["text"])
        taken = 0
        for i, p in enumerate(ps):
            if taken >= PER_ARTICLE:
                break
            if i == 0 or not size_ok(lang, p) or not clean_ok(lang, p):
                continue  # the first paragraph often is the title line; a context needs a paragraph before
            recs.append(dict(id="%s-%s-%d" % (lang, art["id"], i), lang=lang, text=p, article=art["title"], idx=i, prev=ps[i - 1]))
            taken += 1
            if len(recs) >= PER:
                break
    return recs


def main():
    OUT.mkdir(exist_ok=True)
    for lang in LANGS:
        recs = build(lang)
        with open(OUT / (lang + ".jsonl"), "w") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(lang, len(recs), "paragraphs", sum(len(r["text"].split()) if lang != "zh" else len(r["text"]) for r in recs) // max(len(recs), 1), "avg", "chars" if lang == "zh" else "words")


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    os._exit(0)  # the streaming reader's threads crash the interpreter on a normal exit
