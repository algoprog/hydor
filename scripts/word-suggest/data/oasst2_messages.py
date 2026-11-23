#!/usr/bin/env python3
"""data/messages_oasst2.jsonl: what people type to an assistant, from OpenAssistant oasst2 (public test, surface "messages").

Source: https://huggingface.co/datasets/OpenAssistant/oasst2 (Apache-2.0), its **validation** split. The records are the human
`prompter` messages (not deleted, review result true or not reviewed), each with the assistant message it answers as `prev_agent`
(empty for the first message of a conversation: nothing is shown above it) and the earlier prompter messages of the same path as
`prev_user`. The record has the layout of data/user_msgs.jsonl (scripts read it with the chat code), with `lang` a FLORES-200 code
(so that the language switch and the no-space scripts work as for FLORES) and `lang_src` oasst2's own code.

A seeded sample of --n messages with at least --min-words words (characters for the scripts written without spaces), in oasst2's own
mix of languages (about half English): the file is the fixed test, run it with --limit 0. Counts per language are printed and written
to data/messages_oasst2.counts.json.

Caveat (contamination): the released model's small part was pretrained on oasst2's chats, train and validation both (data/pretrain.py
reads both splits; 1% of the conversation trees, by hash, were held out of its training). So this test is not unseen for the small
model: `heldout` marks the messages of those held-out trees (a small, clean subset), and every record says so.

    CUDA_VISIBLE_DEVICES="" python data/oasst2_messages.py [--n 800] [--seed 0]
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from ws.textdata import nwords  # noqa: E402

OUT = os.path.join(HERE, "messages_oasst2.jsonl")
DEV_PERCENT = 1          # as data/pretrain.py: the share of conversation trees held out of the small model's training

# oasst2's language codes -> FLORES-200 codes (the script is the dataset's usual one)
FLORES = {"en": "eng_Latn", "es": "spa_Latn", "ru": "rus_Cyrl", "zh": "zho_Hans", "de": "deu_Latn", "fr": "fra_Latn",
          "pt-BR": "por_Latn", "ca": "cat_Latn", "th": "tha_Thai", "it": "ita_Latn", "ja": "jpn_Jpan", "uk-UA": "ukr_Cyrl",
          "eo": "epo_Latn", "eu": "eus_Latn", "ko": "kor_Hang", "pl": "pol_Latn", "vi": "vie_Latn", "da": "dan_Latn",
          "ar": "arb_Arab", "pt": "por_Latn", "hu": "hun_Latn", "tr": "tur_Latn", "id": "ind_Latn", "cs": "ces_Latn",
          "fi": "fin_Latn", "nl": "nld_Latn", "sv": "swe_Latn", "gl": "glg_Latn", "el": "ell_Grek", "he": "heb_Hebr",
          "hi": "hin_Deva", "ro": "ron_Latn", "bg": "bul_Cyrl", "sk": "slk_Latn", "uk": "ukr_Cyrl", "ms": "zsm_Latn"}


def held_out(tree_id: str) -> bool:
    return int(hashlib.sha1(tree_id.encode()).hexdigest(), 16) % 100 < DEV_PERCENT


def load_rows(split: str):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download, list_repo_files
    files = [f for f in list_repo_files("OpenAssistant/oasst2", repo_type="dataset") if f.startswith(f"data/{split}-")]
    rows = []
    for f in files:
        p = hf_hub_download("OpenAssistant/oasst2", f, repo_type="dataset")
        rows += pq.read_table(p, columns=["message_id", "parent_id", "text", "role", "lang", "deleted", "review_result",
                                          "message_tree_id", "created_date"]).to_pylist()
    return rows


def build(rows, n: int, seed: int, min_words: int):
    by_id = {r["message_id"]: r for r in rows}
    ok = lambda r: (not r["deleted"]) and r["review_result"] in (True, None) and (r["text"] or "").strip()
    cands = []
    for r in rows:
        if r["role"] != "prompter" or not ok(r):
            continue
        fl = FLORES.get(r["lang"])
        if fl is None:
            continue
        text = r["text"].strip()
        if nwords(text, fl) < min_words:
            continue
        path, p = [], r["parent_id"]
        while p and p in by_id:                               # the ancestors, newest first
            path.append(by_id[p])
            p = by_id[p]["parent_id"]
        agent = path[0] if path and path[0]["role"] == "assistant" else None
        users = [m["text"].strip() for m in reversed(path) if m["role"] == "prompter" and ok(m)]
        ts = r["created_date"]
        ts = int(ts.timestamp() * 1000) if isinstance(ts, datetime.datetime) else 0
        cands.append(dict(id="oasst2:" + r["message_id"], session=r["message_tree_id"], agent="assistant", source="oasst2:validation",
                          ts=ts, split="test", lang=fl, lang_src=r["lang"], text=text,
                          prev_agent=(agent["text"].strip() if agent and ok(agent) else ""), prev_user=users,
                          heldout=held_out(r["message_tree_id"]), first_message=agent is None))
    cands.sort(key=lambda c: c["id"])
    if len(cands) > n:
        cands = [cands[i] for i in sorted(random.Random(seed).sample(range(len(cands)), n))]
    return cands


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split", default="validation")
    ap.add_argument("--n", type=int, default=800)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--min-words", type=int, default=4)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    rows = build(load_rows(a.split), a.n, a.seed, a.min_words)
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    counts: dict = {}
    for r in rows:
        counts[r["lang_src"]] = counts.get(r["lang_src"], 0) + 1
    info = dict(source="OpenAssistant/oasst2 (Apache-2.0)", split=a.split, seed=a.seed, min_words=a.min_words, examples=len(rows),
                with_assistant_context=sum(1 for r in rows if r["prev_agent"]), heldout_trees=sum(1 for r in rows if r["heldout"]),
                per_language=dict(sorted(counts.items(), key=lambda kv: -kv[1])))
    with open(os.path.splitext(a.out)[0] + ".counts.json", "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
