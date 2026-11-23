#!/usr/bin/env python3
"""data/pretrain/: public text for pretraining the SLM (E7), tokenized with the LLM's tokenizer (Qwen/Qwen3.5-0.8B-Base).

Streams from the Hugging Face Hub (nothing from data/ leaves this computer; the only thing read from it is
data/multi/*.jsonl, to drop any document that contains one of those test paragraphs):
  web_en   HuggingFaceFW/fineweb-edu  (sample-10BT)           200M tokens
  web_el   HuggingFaceFW/fineweb-2    (ell_Grek)               60M    web_de  deu_Latn  60M    web_zh  cmn_Hani  60M
  web_es   HuggingFaceFW/fineweb-2    (spa_Latn)               60M    web_fr  fra_Latn  60M
  chat     OpenAssistant/oasst2 (every language; every conversation path root -> leaf, alternating user / assistant turns), then
           CohereLabs/aya_dataset (one prompt and one answer, 70 languages; the six languages first), up to 40M tokens in all

Output, per source <s> in data/pretrain/:
  <s>.train.tok.npy  int32 tokens, all documents (or turns) back to back      <s>.train.off.npy  int64 offsets [n + 1]
  <s>.dev.tok.npy, <s>.dev.off.npy   the 1% held out (by hash of the document id; oasst2: by conversation tree)
  chat only: <s>.{train,dev}.role.npy (uint8 per turn: 1 user, 0 assistant), <s>.{train,dev}.conv.npy (int64: first turn of
  each conversation, [n + 1]) and <s>.{train,dev}.lang.json (language of each conversation)
  manifest.json (merged from manifest.<source>.json): per source the counts, the dropped documents and (chat) the languages present in oasst2.

    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python data/pretrain.py [--scale 1] [--only web_el,chat] [--force]
"""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("RAYON_NUM_THREADS", "4")        # the tokenizer's threads
os.environ.setdefault("TOKENIZERS_PARALLELISM", "true")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from ws.vocab import DEFAULT_LLM, get_tokenizer  # noqa: E402

WEB = {   # name: (dataset, config / files directory, language, target tokens)
    "web_en": ("HuggingFaceFW/fineweb-edu", "sample/10BT", "en", 200_000_000),
    "web_el": ("HuggingFaceFW/fineweb-2", "data/ell_Grek/train", "el", 60_000_000),
    "web_de": ("HuggingFaceFW/fineweb-2", "data/deu_Latn/train", "de", 60_000_000),
    "web_zh": ("HuggingFaceFW/fineweb-2", "data/cmn_Hani/train", "zh", 60_000_000),
    "web_es": ("HuggingFaceFW/fineweb-2", "data/spa_Latn/train", "es", 60_000_000),
    "web_fr": ("HuggingFaceFW/fineweb-2", "data/fra_Latn/train", "fr", 60_000_000),
}
CHAT = ("chat", "OpenAssistant/oasst2", 40_000_000)
AYA = "CohereLabs/aya_dataset"
AYA_FIRST = ("eng", "ell", "deu", "zho", "spa", "fra")   # aya language codes of the six languages
N_FILES = 16             # parquet files of a web source read round-robin (they are ordered by crawl)
MAX_DOC_TOKENS = 2048    # a document is cut to its first 2048 tokens (variety beats one long page)
MIN_DOC_CHARS = 200
MIN_LANG_SCORE = 0.85    # fineweb-2's language id confidence
MAX_CHARS = 16000        # text kept before tokenizing
KEY = 80                 # the contamination key: this many normalised characters of a paragraph
DEV_PERCENT = 1


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s).casefold()).strip()


class Blocklist:
    """The 80-character normalised prefixes of every paragraph (text and prev) of data/multi/*.jsonl.

    hit(): a rolling hash of every 8-character window of the document finds the places where a key may start; each is then
    checked exactly (does a key start there?)."""

    P = 8

    def __init__(self, multi_dir: str):
        keys = set()
        for fn in sorted(os.listdir(multi_dir)) if os.path.isdir(multi_dir) else []:
            if not fn.endswith(".jsonl"):
                continue
            with open(os.path.join(multi_dir, fn), encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    r = json.loads(line)
                    paras = list(r.get("paragraphs") or []) + [r.get("text") or "", r.get("prev") or ""]
                    for p in paras:
                        for piece in re.split(r"\n\s*\n", p):
                            n = norm(piece)
                            if len(n) >= 40:     # shorter pieces are headings or titles, not paragraphs
                                keys.add(n[:KEY])
        self.n_keys = len(keys)
        self.n_short = sum(len(k) < KEY for k in keys)       # a paragraph shorter than 80 characters
        self.by_prefix: dict[str, list[str]] = {}
        for k in keys:
            self.by_prefix.setdefault(k[:self.P], []).append(k)
        rng = np.random.RandomState(12345)
        self.w = rng.randint(1, 2 ** 62, size=self.P, dtype=np.int64).astype(np.uint64) | np.uint64(1)
        self.hashes = np.unique(np.array([self._hash(k[:self.P]) for k in self.by_prefix], dtype=np.uint64)) \
            if self.by_prefix else np.zeros(0, np.uint64)

    def _hash(self, s: str) -> np.uint64:
        return np.dot(np.frombuffer(s.encode("utf-32-le"), dtype=np.uint32).astype(np.uint64), self.w)

    def hit(self, text: str) -> bool:
        """True if the (normalised) text contains any key."""
        n = norm(text[:MAX_CHARS])
        if len(n) < self.P or not len(self.hashes):
            return False
        cps = np.frombuffer(n.encode("utf-32-le"), dtype=np.uint32).astype(np.uint64)
        m = len(cps) - self.P + 1
        h = np.zeros(m, dtype=np.uint64)
        for j in range(self.P):
            h += cps[j:j + m] * self.w[j]
        for pos in np.flatnonzero(np.isin(h, self.hashes)):
            pos = int(pos)
            for k in self.by_prefix.get(n[pos:pos + self.P], ()):
                if n.startswith(k, pos):
                    return True
        return False


def is_dev(key: str) -> bool:
    return int(hashlib.sha1(key.encode()).hexdigest(), 16) % 100 < DEV_PERCENT


class Store:
    """Documents (token arrays) of one split, written as one flat token file plus offsets."""

    def __init__(self):
        self.parts, self.n_tokens, self.offs = [], 0, [0]

    def add(self, ids) -> None:
        a = np.asarray(ids, dtype=np.int32)
        self.parts.append(a)
        self.n_tokens += len(a)
        self.offs.append(self.n_tokens)

    def save(self, base: str) -> None:
        tok = np.concatenate(self.parts) if self.parts else np.zeros(0, np.int32)
        np.save(base + ".tok.npy", tok)
        np.save(base + ".off.npy", np.asarray(self.offs, dtype=np.int64))


def stream_files(dataset: str, directory: str, n: int):
    from huggingface_hub import list_repo_files
    files = sorted(f for f in list_repo_files(dataset, repo_type="dataset") if f.startswith(directory + "/") and f.endswith(".parquet"))
    if not files:
        raise SystemExit(f"{dataset}: no parquet files under {directory}")
    picks = sorted({files[int(i * (len(files) - 1) / max(n - 1, 1))] for i in range(min(n, len(files)))})
    return picks


def web_docs(dataset: str, directory: str, n_files: int, log):
    """Documents round-robin over parquet files spread over the whole repository directory."""
    from datasets import load_dataset
    files = stream_files(dataset, directory, n_files)
    log(f"  files: {files}")
    iters = [iter(load_dataset("parquet", data_files=f"hf://datasets/{dataset}/{f}", split="train", streaming=True)) for f in files]
    alive = list(range(len(iters)))
    while alive:
        for i in list(alive):
            try:
                yield next(iters[i])
            except StopIteration:
                alive.remove(i)


def build_web(name, out_dir, scale, tok, block, log, max_minutes=30.0):
    dataset, directory, lang, target = WEB[name]
    target = int(target * scale)
    log(f"{name}: {dataset} {directory} -> {target} tokens")
    t0 = time.time()
    train, dev = Store(), Store()
    n_seen = n_contam = n_short = n_lowlang = 0
    capped = False
    buf = []

    def flush():
        nonlocal buf
        if not buf:
            return
        enc = tok([t for _, t in buf], add_special_tokens=False)["input_ids"]
        for (key, _), ids in zip(buf, enc):
            ids = ids[:MAX_DOC_TOKENS]
            if len(ids) < 30:
                continue
            (dev if is_dev(key) else train).add(ids)
        buf = []

    for d in web_docs(dataset, directory, N_FILES if "fineweb-2" in dataset else 4, log):
        text = (d.get("text") or "").strip()
        n_seen += 1
        if len(text) < MIN_DOC_CHARS:
            n_short += 1
            continue
        if "fineweb-2" in dataset and float(d.get("language_score") or 1) < MIN_LANG_SCORE:
            n_lowlang += 1
            continue
        if block.hit(text):
            n_contam += 1
            continue
        buf.append((d.get("id") or str(n_seen), text[:MAX_CHARS]))
        if len(buf) >= 256:
            flush()
            if train.n_tokens >= target:
                break
            if time.time() - t0 > max_minutes * 60:
                log(f"  {name}: time cap of {max_minutes} minutes reached")
                capped = True
                break
            if len(train.offs) % 20000 < 256:
                log(f"  {name}: {train.n_tokens / 1e6:.2f}M tokens, {len(train.offs) - 1} docs, {time.time() - t0:.0f}s")
    flush()
    train.save(os.path.join(out_dir, f"{name}.train"))
    dev.save(os.path.join(out_dir, f"{name}.dev"))
    return dict(dataset=dataset, config=directory, lang=lang, target_tokens=target, train_tokens=train.n_tokens,
                dev_tokens=dev.n_tokens, train_docs=len(train.offs) - 1, dev_docs=len(dev.offs) - 1,
                seen=n_seen, dropped_contaminated=n_contam, dropped_short=n_short, dropped_low_lang_score=n_lowlang, stopped_by_time_cap=capped,
                seconds=round(time.time() - t0))


def build_chat(out_dir, scale, tok, block, log, seed=0, max_minutes=30.0):
    """oasst2 (every conversation path) first, then aya_dataset (prompt + answer), up to the token target in all."""
    from datasets import load_dataset
    name, dataset, target = CHAT
    target = int(target * scale)
    log(f"chat: {dataset} + {AYA} -> {target} tokens")
    t0 = time.time()
    stores = {p: dict(turns=Store(), role=[], conv=[0], lang=[], src=[]) for p in ("train", "dev")}
    used = {"train": 0, "dev": 0}
    by_set: dict = {}
    n_contam = [0]

    def add_conv(key, texts, roles, lang, dset):
        """texts: turn strings; roles: 1 user, 0 assistant.  False if skipped."""
        if used["train"] >= target:
            return False
        if any(block.hit(t) for t in texts):
            n_contam[0] += 1
            return False
        enc = tok([t.strip()[:MAX_CHARS] for t in texts], add_special_tokens=False)["input_ids"]
        enc = [e[:MAX_DOC_TOKENS] for e in enc]
        if any(len(e) == 0 for e in enc):
            return False
        part = "dev" if is_dev(key) else "train"
        st = stores[part]
        for e, r in zip(enc, roles):
            st["turns"].add(e)
            st["role"].append(r)
        st["conv"].append(len(st["role"]))
        st["lang"].append(lang)
        st["src"].append(dset)
        n = sum(len(e) for e in enc)
        used[part] += n
        D = by_set.setdefault(dset, {}).setdefault(lang, dict(conversations=0, tokens=0)) if part == "train" else None
        if D:
            D["conversations"] += 1
            D["tokens"] += n
        return True

    # ---- oasst2: root -> leaf paths of the (reviewed, not deleted) message trees
    rows = []
    for split in ("train", "validation"):
        ds = load_dataset(dataset, split=split)
        rows += [dict(id=r["message_id"], parent=r["parent_id"], tree=r["message_tree_id"], text=r["text"], role=r["role"],
                      lang=r["lang"], deleted=bool(r["deleted"]), ok=r["review_result"]) for r in ds]
    lang_msgs: dict[str, int] = {}
    for r in rows:
        lang_msgs[r["lang"]] = lang_msgs.get(r["lang"], 0) + 1
    keep = {r["id"]: r for r in rows if not r["deleted"] and r["ok"] in (True, None) and (r["text"] or "").strip()}
    children: dict[str, list] = {}
    roots: list = []
    for r in keep.values():
        p = r["parent"]
        if p in (None, "None", ""):
            roots.append(r)
        elif p in keep:
            children.setdefault(p, []).append(r)
    log(f"  oasst2: {len(rows)} messages, {len(keep)} kept, {len(roots)} trees; languages: {len(lang_msgs)}")
    paths = []
    for root in roots:
        stack = [(root, [root])]
        while stack:
            node, path = stack.pop()
            kids = children.get(node["id"], [])
            if not kids:
                paths.append(path)
            for k in kids:
                stack.append((k, path + [k]))
    rng = random.Random(seed)
    rng.shuffle(paths)
    n_oasst = 0
    for path in paths:
        if add_conv(path[0]["tree"], [m["text"] for m in path], [1 if m["role"] == "prompter" else 0 for m in path],
                    path[0]["lang"], "oasst2"):
            n_oasst += 1
    oasst_tokens = used["train"] + used["dev"]
    log(f"  oasst2: {len(paths)} paths, {n_oasst} used, {used['train'] / 1e6:.2f}M train tokens, {time.time() - t0:.0f}s")

    # ---- aya_dataset: one prompt and its answer; the six languages first
    aya_info = {}
    if used["train"] < target:
        try:
            ds = load_dataset(AYA, split="train")
            order = list(range(len(ds)))
            rng.shuffle(order)
            codes = ds["language_code"]
            order.sort(key=lambda i: 0 if codes[i] in AYA_FIRST else 1)
            ins, outs = ds["inputs"], ds["targets"]
            n_aya = 0
            for i in order:
                if used["train"] >= target or time.time() - t0 > max_minutes * 60:
                    break
                if (ins[i] or "").strip() and (outs[i] or "").strip():
                    if add_conv(f"aya-{i}", [ins[i], outs[i]], [1, 0], codes[i], "aya"):
                        n_aya += 1
            aya_info = dict(dataset=AYA, rows=len(ds), conversations_used=n_aya, languages_in_dataset=len(set(codes)))
        except Exception as e:      # a gated or missing set: say so and go on with oasst2
            aya_info = dict(dataset=AYA, error=repr(e)[:200])
            log(f"  aya: {aya_info}")
    for part, st in stores.items():
        base = os.path.join(out_dir, f"chat.{part}")
        st["turns"].save(base)
        np.save(base + ".role.npy", np.asarray(st["role"], dtype=np.uint8))
        np.save(base + ".conv.npy", np.asarray(st["conv"], dtype=np.int64))
        with open(base + ".lang.json", "w") as f:
            json.dump(st["lang"], f)
        with open(base + ".src.json", "w") as f:
            json.dump(st["src"], f)
    return dict(dataset=f"{dataset} + {AYA}", target_tokens=target, train_tokens=used["train"], dev_tokens=used["dev"],
                train_conversations=len(stores["train"]["conv"]) - 1, dev_conversations=len(stores["dev"]["conv"]) - 1,
                train_turns=len(stores["train"]["role"]), oasst2_paths_available=len(paths), dropped_contaminated=n_contam[0],
                oasst2_messages=len(rows), oasst2_messages_kept=len(keep), oasst2_trees=len(roots), aya=aya_info,
                languages_in_oasst2=dict(sorted(lang_msgs.items(), key=lambda kv: -kv[1])),
                train_by_dataset_and_language={d: dict(sorted(v.items(), key=lambda kv: -kv[1]["tokens"])) for d, v in by_set.items()},
                train_tokens_by_dataset={d: sum(x["tokens"] for x in v.values()) for d, v in by_set.items()},
                seconds=round(time.time() - t0))


def merge_manifest(out_dir, llm):
    man = {"llm": llm, "dev_percent": DEV_PERCENT, "max_doc_tokens": MAX_DOC_TOKENS, "sources": {}}
    for fn in sorted(os.listdir(out_dir)):
        if fn.startswith("manifest.") and fn != "manifest.json" and fn.endswith(".json"):
            man["sources"][fn[len("manifest."):-5]] = json.load(open(os.path.join(out_dir, fn)))
    by_lang: dict = {}
    for n, v in man["sources"].items():
        if n.startswith("web_"):
            by_lang[v["lang"]] = by_lang.get(v["lang"], 0) + v["train_tokens"]
    man["totals"] = dict(train_tokens=sum(v["train_tokens"] for v in man["sources"].values()),
                         dev_tokens=sum(v["dev_tokens"] for v in man["sources"].values()), web_by_language=by_lang)
    tmp = os.path.join(out_dir, "manifest.json.tmp")
    with open(tmp, "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    os.replace(tmp, os.path.join(out_dir, "manifest.json"))
    return man


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(HERE, "pretrain"))
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--scale", type=float, default=1.0, help="multiply every token target (a smoke test uses 0.001)")
    ap.add_argument("--only", default=None, help="comma list of sources: " + ",".join(list(WEB) + ["chat"]))
    ap.add_argument("--force", action="store_true", help="make a source again although its manifest.<source>.json is there")
    ap.add_argument("--max-minutes", type=float, default=30.0, help="stop reading a source after this long")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    log = lambda s: print(s, file=sys.stderr, flush=True)
    tok = get_tokenizer(a.llm)
    block = Blocklist(os.path.join(HERE, "multi"))
    log(f"blocklist: {block.n_keys} keys ({block.n_short} shorter than {KEY} characters)")
    for name in (a.only.split(",") if a.only else list(WEB) + ["chat"]):
        mp = os.path.join(a.out, f"manifest.{name}.json")
        if os.path.exists(mp) and not a.force:
            log(f"{name}: done already (use --force)")
            continue
        info = build_chat(a.out, a.scale, tok, block, log, max_minutes=a.max_minutes) if name == "chat" \
            else build_web(name, a.out, a.scale, tok, block, log, a.max_minutes)
        info["scale"] = a.scale
        with open(mp, "w") as f:
            json.dump(info, f, indent=1, ensure_ascii=False)
        merge_manifest(a.out, a.llm)
        log(f"{name}: {info['train_tokens']} train tokens, {info['dev_tokens']} dev tokens, {info['seconds']}s")
    print(json.dumps(merge_manifest(a.out, a.llm)["totals"]))
    sys.stdout.flush()
    os._exit(0)  # the streaming reader's threads crash the interpreter on a normal exit


if __name__ == "__main__":
    main()
