#!/usr/bin/env python3
"""Typed text for fitting the gate and the language switch: data/typed_dev_conv.jsonl, typed_dev_enron.jsonl, typed_dev_sinabis.jsonl.

The dev parts of the typed shards of data/typed.py (the hash-split `dev` of the WildChat conversations, of the Enron writers and of
the Sinabis mailbox: never in the pretraining of the pilot, and not in any public test or FLORES sentence, which typed.py kept out)
written back as text, in the layouts of the public tests so that every script reads them with a surface of ws/textdata.py:

  typed_conv     what people typed to an assistant (WildChat), one record per typed turn, with the assistant turn above it (its last 128
                 tokens, from a word boundary) as `prev_agent` and the person's earlier turns as `prev_user`; layout of messages_oasst2.jsonl
  typed_enron    Enron email (writers other than the 700 of the public test), English; layout of email_enron.jsonl
  typed_sinabis  Sinabis synthetic mailbox, English, German, French and Italian (the language is guessed from common words)

`lang` is a FLORES-200 code, so that the language switch and the scripts written without spaces work as for FLORES. A conversation
whose language has no FLORES code is left out.  Counts per source and language: data/typed_dev.counts.json.

    CUDA_VISIBLE_DEVICES="" python data/typed_dev.py        (from the folder that holds data/, with data/typed/ built)
"""
import json
import os
import re
import sys
from collections import Counter

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from ws.langs import ISO_TO_FLORES as FLORES  # noqa: E402
from ws.textdata import nwords  # noqa: E402
from ws.vocab import DEFAULT_LLM, get_tokenizer  # noqa: E402

DATA = os.path.abspath(os.environ.get("WS_DATA", HERE))
TYPED = os.path.join(DATA, "typed")
CTX_TOKENS = 128          # as typed.py: a context turn longer than this was cut to its last tokens

STOP = {"en": "the and to of is in that for with this you are not have".split(),
        "de": "der die und das ist nicht ein eine mit zu den für auf wir sie".split(),
        "fr": "le la les des est et pour que une dans nous vous pas sur avec".split(),
        "it": "il di che è per un una non sono con del della le nel gli".split()}


def guess_lang(text):
    words = re.findall(r"[^\W\d_]+", text.casefold())
    score = {l: sum(w in set(s) for w in words) for l, s in STOP.items()}
    return max(score, key=score.get)


def load(name, part):
    base = os.path.join(TYPED, f"{name}.{part}")
    return np.load(base + ".tok.npy", mmap_mode="r"), np.load(base + ".off.npy")


def write(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def conversations(tok):
    ids, off = load("typed_conv", "dev")
    base = os.path.join(TYPED, "typed_conv.dev")
    role, conv = np.load(base + ".role.npy"), np.load(base + ".conv.npy")
    lang = json.load(open(base + ".lang.json"))
    rows, dropped = [], Counter()
    for ci, ln in enumerate(lang):
        code = FLORES.get(ln)
        if not code:
            dropped[ln] += 1
            continue
        turns = [(int(role[t]), np.asarray(ids[off[t]:off[t + 1]]).tolist()) for t in range(conv[ci], conv[ci + 1])]
        texts = tok.batch_decode([t for _, t in turns], skip_special_tokens=True)
        prev_user, prev_agent, k = [], "", 0
        for (r, t), text in zip(turns, texts):
            if r == 2:
                text = text.strip()
                if len(t) >= CTX_TOKENS:                       # cut inside a word: from the next one
                    m = re.search(r"\s", text[:30])
                    text = text[m.end():] if m else text
                prev_agent = text
                continue
            text = text.strip()
            if text:
                rows.append(dict(id=f"wildchat-dev:{ci}:{k}", session=f"wildchat-dev:{ci}", agent="assistant", source="wildchat:dev",
                                 ts=0, split="dev", lang=code, lang_src=ln, text=text, prev_agent=prev_agent,
                                 prev_user=list(prev_user), first_message=k == 0))
                prev_user.append(text)
            prev_agent, k = "", k + 1
    return rows, dropped


def emails(tok, name, source, enron):
    ids, off = load(name, "dev")
    texts = tok.batch_decode([np.asarray(ids[off[i]:off[i + 1]]).tolist() for i in range(len(off) - 1)], skip_special_tokens=True)
    rows = []
    for i, text in enumerate(texts):
        text = text.strip()
        if not text:
            continue
        lang = "en" if enron else guess_lang(text)
        rows.append(dict(id=f"{name}-dev:{i}", source=source, ts=0, split="dev", lang={"en": "eng_Latn", "de": "deu_Latn", "fr": "fra_Latn",
                                                                                      "it": "ita_Latn"}[lang],
                         writer=f"{name}-dev:{i}", text=text))
    return rows


def main():
    tok = get_tokenizer(DEFAULT_LLM)
    out, counts = {}, {}
    rows, dropped = conversations(tok)
    out["typed_dev_conv.jsonl"] = rows
    counts["typed_conv"] = dict(records=len(rows), words=sum(nwords(r["text"], "") for r in rows), dropped_conversations=dict(dropped),
                                by_language=dict(Counter(r["lang"] for r in rows).most_common()),
                                words_by_language={l: sum(nwords(r["text"], r["lang"].split("_")[0]) for r in rows if r["lang"] == l)
                                                   for l, _ in Counter(r["lang"] for r in rows).most_common()})
    for fn, name, src, enron in (("typed_dev_enron.jsonl", "typed_email_enron", "enron:corbt/enron-emails:dev", True),
                                 ("typed_dev_sinabis.jsonl", "typed_email_sinabis", "sinabis:dev", False)):
        rows = emails(tok, name, src, enron)
        out[fn] = rows
        counts[fn[10:-6]] = dict(records=len(rows), words=sum(nwords(r["text"], "") for r in rows),
                                 by_language=dict(Counter(r["lang"] for r in rows).most_common()))
    for fn, rows in out.items():
        write(os.path.join(DATA, fn), rows)
    with open(os.path.join(DATA, "typed_dev.counts.json"), "w") as f:
        json.dump(counts, f, indent=1)
    print(json.dumps({k: {a: b for a, b in v.items() if a != "words_by_language"} for k, v in counts.items()}, indent=1))


if __name__ == "__main__":
    main()
