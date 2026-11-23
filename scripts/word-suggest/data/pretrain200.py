#!/usr/bin/env python3
"""data/pretrain200/: public text in every FLORES-200 language that has some, for the 200-language SLM (E7b).

Tokens are the LLM tokenizer's ids (Qwen/Qwen3.5-0.8B-Base), as in data/pretrain.py (same shard format, same loader).
Sources: FineWeb-2 (HuggingFaceFW/fineweb-2, one config per language; FLORES codes are mapped, see MAP), English from
FineWeb-Edu (sample-10BT), and the chats (oasst2 + aya_dataset, every language, no cap).
Sampling: tokens per language ~ (available tokens)^alpha (alpha 0.3, temperature sampling), scaled to ~2B tokens in all, at most 250M
for one language, at least 1M for each language that has them (all it has if less).  Documents holding a FLORES sentence (a
normalised 60-character prefix, the language's own and English) are dropped; chats are checked against every language.

  1. plan     CUDA_VISIBLE_DEVICES="" .venv/bin/python data/pretrain200.py plan            -> data/pretrain200/plan.json
  2. build    CUDA_VISIBLE_DEVICES="" RAYON_NUM_THREADS=4 nice -n 19 .venv/bin/python data/pretrain200.py build --part 0/2 --deadline-min 90
              (and --part 1/2 in another process: 2 x 4 threads); `build --only chat` makes the chats
  3. merge    .venv/bin/python data/pretrain200.py merge                                     -> data/pretrain200/manifest.json
Per language a source named web_<config> (web_ell_Grek): <s>.{train,dev}.{tok,off}.npy; chat.* as in data/pretrain.py.
manifest.json: per language the target, tokens, documents and why it fell short (if it did); the FLORES codes without data.
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import re
import sys
import time
import unicodedata

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("RAYON_NUM_THREADS", "4")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "true")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ws.vocab import DEFAULT_LLM, get_tokenizer  # noqa: E402
import pretrain as P6  # noqa: E402   (the six-language corpus builder: Store, is_dev, build_chat)

OUT = os.path.join(HERE, "pretrain200")
FLORES = os.path.join(HERE, "flores")
TOTAL = 2_000_000_000
ALPHA = 0.3
CAP = 250_000_000
MIN_TOKENS = 1_000_000
MAX_DOC_TOKENS = 2048
MIN_DOC_CHARS = 100
MIN_LANG_SCORE = 0.75
MAX_CHARS = 16000
KEY = 60
DEV_MIN_DOCS = 5
EN = "eng_Latn"
# FLORES code -> the FineWeb-2 config that holds the language (others have a config of the same name)
MAP = {"est_Latn": "ekk_Latn", "grn_Latn": "gug_Latn", "pes_Arab": "fas_Arab", "tgl_Latn": "fil_Latn", "yue_Hant": "yue_Hani",
       "zho_Hans": "cmn_Hani", "zho_Hant": "cmn_Hani", "aka_Latn": "twi_Latn", "kon_Latn": "kwy_Latn"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).casefold()
    s = re.sub(r"[​-‍⁠﻿]", "", s)
    return re.sub(r"\s+", " ", s).strip()


class KeySet:
    """Normalised KEY-character prefixes of FLORES sentences; hit(text): does the text contain one?  A rolling hash of every
    `p`-character window finds where a key may start, each place is then checked exactly."""

    def __init__(self, keys, p=8):
        self.P = p
        self.by_prefix: dict = {}
        for k in keys:
            self.by_prefix.setdefault(k[:p], []).append(k)
        rng = np.random.RandomState(12345)
        self.w = rng.randint(1, 2 ** 62, size=p, dtype=np.int64).astype(np.uint64) | np.uint64(1)
        self.hashes = np.unique(np.array([self._hash(k) for k in self.by_prefix], dtype=np.uint64)) if self.by_prefix \
            else np.zeros(0, np.uint64)
        self.n_keys = sum(len(v) for v in self.by_prefix.values())

    def _hash(self, s):
        return np.dot(np.frombuffer(s[:self.P].encode("utf-32-le"), dtype=np.uint32).astype(np.uint64), self.w)

    def hit(self, text):
        n = norm(text[:MAX_CHARS])
        m = len(n) - self.P + 1
        if m <= 0 or not len(self.hashes):
            return False
        cps = np.frombuffer(n.encode("utf-32-le"), dtype=np.uint32).astype(np.uint64)
        h = np.zeros(m, dtype=np.uint64)
        for j in range(self.P):
            h += cps[j:j + m] * self.w[j]
        j = np.minimum(np.searchsorted(self.hashes, h), len(self.hashes) - 1)       # sorted unique hashes: a binary search
        for pos in np.flatnonzero(self.hashes[j] == h):
            pos = int(pos)
            for k in self.by_prefix.get(n[pos:pos + self.P], ()):
                if n.startswith(k, pos):
                    return True
        return False


def flores_keys(lang):
    keys = set()
    p = os.path.join(FLORES, lang + ".jsonl")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            n = norm(json.loads(line)["text"])
            if len(n) >= 20:
                keys.add(n[:KEY])
    return keys


def flores_langs():
    return sorted(f[:-6] for f in os.listdir(FLORES) if f.endswith(".jsonl"))


# ---- plan ---------------------------------------------------------------------------------------------------------------
def config_of(lang):
    return MAP.get(lang, lang)


def estimate(tok, dataset, directory):
    """(files, est. documents, est. tokens per document (cut at MAX_DOC_TOKENS), est. total tokens) from the parquet footers and a
    sample of the first file's first documents."""
    from huggingface_hub import HfApi, HfFileSystem
    import pyarrow.parquet as pq
    files = sorted((f.path, f.size) for f in HfApi().list_repo_tree(dataset, path_in_repo=directory, repo_type="dataset")
                   if f.path.endswith(".parquet"))
    if not files:
        return [], 0, 0, 0
    fs = HfFileSystem()
    with fs.open(f"datasets/{dataset}/{files[0][0]}", "rb") as fh:
        pf = pq.ParquetFile(fh)
        rg = pf.metadata.row_group(0)
        rows = rg.num_rows
        bytes_per_doc = sum(rg.column(i).total_compressed_size for i in range(rg.num_columns)) / max(rows, 1)
        batch = next(pf.iter_batches(batch_size=150, columns=["text"]))
        texts = [t[:MAX_CHARS] for t in batch.column(0).to_pylist() if t]
    lens = [min(len(e), MAX_DOC_TOKENS) for e in tok(texts, add_special_tokens=False)["input_ids"]] if texts else [0]
    tpd = float(np.mean(lens))
    # the footer's row-group bytes cover every column (url, id, ...): a proxy, good to a factor of ~1.5
    docs = sum(s for _, s in files) / max(bytes_per_doc, 1)
    return files, docs, tpd, docs * tpd


def allocate(avail: dict, total=TOTAL, alpha=ALPHA, cap=CAP, floor=MIN_TOKENS, headroom=0.9):
    """tokens per language: lambda * avail^alpha clipped to [min(floor, headroom*avail), min(cap, headroom*avail)], lambda found
    by bisection so that they sum to `total` (or as near as the caps allow)."""
    lo_b = {l: min(floor, headroom * a) for l, a in avail.items()}
    hi_b = {l: min(cap, headroom * a) for l, a in avail.items()}
    f = lambda lam: {l: min(hi_b[l], max(lo_b[l], lam * a ** alpha)) for l, a in avail.items()}
    lo, hi = 0.0, 1e6
    for _ in range(100):
        mid = (lo + hi) / 2
        if sum(f(mid).values()) < total:
            lo = mid
        else:
            hi = mid
    return {l: int(v) for l, v in f(hi).items()}


def cmd_plan(a):
    os.makedirs(OUT, exist_ok=True)
    tok = get_tokenizer(a.llm)
    langs = flores_langs()
    todo = {}                                          # config -> the FLORES languages it serves
    for l in langs:
        todo.setdefault(config_of(l), []).append(l)
    from huggingface_hub import HfApi
    have = {t.path.split("/")[-1] for t in HfApi().list_repo_tree("HuggingFaceFW/fineweb-2", path_in_repo="data", repo_type="dataset")}
    plan, missing = {}, []
    jobs = {}
    for cfg, ls in todo.items():
        if cfg == EN:
            jobs[cfg] = ("HuggingFaceFW/fineweb-edu", "sample/10BT")
        elif cfg in have:
            jobs[cfg] = ("HuggingFaceFW/fineweb-2", f"data/{cfg}/train")
        else:
            missing += ls
    with cf.ThreadPoolExecutor(8) as ex:
        res = dict(zip(jobs, ex.map(lambda c: estimate(tok, *jobs[c]), jobs)))
    avail = {}
    for cfg, (files, docs, tpd, toks) in res.items():
        plan[cfg] = dict(dataset=jobs[cfg][0], directory=jobs[cfg][1], flores=todo[cfg], files=[f for f, _ in files],
                         file_bytes=[s for _, s in files], est_docs=int(docs), est_tokens_per_doc=round(tpd, 1), est_tokens=int(toks))
        avail[cfg] = toks if cfg != EN else 1.3e12      # FineWeb-Edu has 1.3T tokens; the 10BT sample holds enough for the target
    target = allocate(avail, a.total, ALPHA, CAP, MIN_TOKENS)
    for cfg in plan:
        plan[cfg]["target_tokens"] = target[cfg]
    out = dict(total_target=int(sum(target.values())), alpha=ALPHA, cap=CAP, min_tokens=MIN_TOKENS, mapped=MAP,
               flores_without_fineweb2=sorted(missing), configs=plan)
    with open(os.path.join(OUT, "plan.json"), "w") as f:
        json.dump(out, f, indent=1)
    t = sorted(target.values())
    print(f"{len(plan)} configs for {len(langs)} FLORES codes ({len(missing)} without FineWeb-2: {sorted(missing)}); total target "
          f"{out['total_target'] / 1e9:.2f}B; per language min {t[0] / 1e6:.2f}M median {t[len(t) // 2] / 1e6:.1f}M max {t[-1] / 1e6:.0f}M")


# ---- build --------------------------------------------------------------------------------------------------------------
def spread_files(files, n):
    """n files out of the sorted list, evenly spread (the files are ordered by crawl)."""
    n = max(1, min(n, len(files)))
    return [files[int(i * (len(files) - 1) / max(n - 1, 1))] for i in range(n)]


def docs_from(dataset, files, n_open):
    """Documents round-robin over `n_open` spread files; more files are opened as these run out."""
    from datasets import load_dataset
    order = spread_files(files, len(files))
    seen, queue = set(), []
    for f in spread_files(files, n_open):
        queue.append(f)
    pending = [f for f in order if f not in set(queue)]
    iters = []

    def opener(f):
        return iter(load_dataset("parquet", data_files=f"hf://datasets/{dataset}/{f}", split="train", streaming=True))
    iters = [opener(f) for f in queue]
    while iters:
        for it in list(iters):
            try:
                yield next(it)
            except StopIteration:
                iters.remove(it)
                if pending:
                    iters.append(opener(pending.pop(0)))


def build_language(cfg, info, tok, out_dir, deadline, log):
    target = info["target_tokens"]
    name = f"web_{cfg}"
    t0 = time.time()
    keys = set(flores_keys(EN))
    for l in info["flores"]:
        keys |= flores_keys(l)
    block = KeySet(keys)
    train, dev = P6.Store(), P6.Store()
    n_seen = n_contam = n_short = n_lowlang = 0
    reason = None
    buf = []

    def flush():
        nonlocal buf
        if not buf:
            return
        enc = tok([t for _, t in buf], add_special_tokens=False)["input_ids"]
        for (key, _), ids in zip(buf, enc):
            ids = ids[:MAX_DOC_TOKENS]
            if len(ids) >= 30:
                (dev if P6.is_dev(key) else train).add(ids)
        buf = []

    files = info["files"]
    per_file = max(info["est_tokens"] / max(len(files), 1), 1)
    n_open = int(min(len(files), max(1, np.ceil(target / per_file / 4))))     # a few files at a time, spread over the crawls
    done = False
    try:
        for d in docs_from(info["dataset"], files, n_open):
            n_seen += 1
            text = (d.get("text") or "").strip()
            if len(text) < MIN_DOC_CHARS:
                n_short += 1
                continue
            if info["dataset"].endswith("fineweb-2") and float(d.get("language_score") or 1) < MIN_LANG_SCORE:
                n_lowlang += 1
                continue
            if block.hit(text):
                n_contam += 1
                continue
            buf.append((d.get("id") or str(n_seen), text[:MAX_CHARS]))
            if len(buf) >= 256:
                flush()
                if train.n_tokens >= target:
                    done = True
                    break
                if time.time() > deadline:
                    reason = "download time cap"
                    break
        flush()
    except Exception as e:                    # a broken file: keep what was read
        flush()
        reason = f"error: {repr(e)[:120]}"
    if not done and reason is None:
        reason = "ran out of documents"
    if train.n_tokens >= target:
        reason = None
    # a language with few documents still gets a held-out set: the last DEV_MIN_DOCS documents
    nd = len(train.offs) - 1
    if len(dev.offs) - 1 < DEV_MIN_DOCS and nd >= 50:
        move = DEV_MIN_DOCS - (len(dev.offs) - 1)
        tail = train.parts[-move:]
        train.parts, train.offs = train.parts[:-move], train.offs[:-move]
        train.n_tokens = train.offs[-1]
        for p in tail:
            dev.add(p)
    train.save(os.path.join(out_dir, f"{name}.train"))
    dev.save(os.path.join(out_dir, f"{name}.dev"))
    rec = dict(config=cfg, flores=info["flores"], dataset=info["dataset"], target_tokens=target, train_tokens=train.n_tokens,
               dev_tokens=dev.n_tokens, train_docs=len(train.offs) - 1, dev_docs=len(dev.offs) - 1, seen=n_seen,
               dropped_contaminated=n_contam, dropped_short=n_short, dropped_low_lang_score=n_lowlang,
               short_reason=reason, seconds=round(time.time() - t0))
    with open(os.path.join(out_dir, f"manifest.{name}.json"), "w") as f:
        json.dump(rec, f, indent=1)
    return rec


def all_keys_blocklist():
    keys = set()
    for l in flores_langs():
        keys |= flores_keys(l)
    return KeySet(keys, p=12)


def cmd_build(a):
    os.makedirs(OUT, exist_ok=True)
    log = lambda s: print(s, file=sys.stderr, flush=True)
    tok = get_tokenizer(a.llm)
    if a.only == "chat":
        block = all_keys_blocklist()
        log(f"chat blocklist: {block.n_keys} keys")
        t0 = time.time()
        info = P6.build_chat(OUT, 1000.0, tok, block, log, max_minutes=a.deadline_min)
        info["scale"] = "all"
        with open(os.path.join(OUT, "manifest.chat.json"), "w") as f:
            json.dump(info, f, indent=1, ensure_ascii=False)
        log(f"chat: {info['train_tokens']} train tokens, {info['dev_tokens']} dev, {time.time() - t0:.0f}s")
        os._exit(0)
    plan = json.load(open(os.path.join(OUT, "plan.json")))["configs"]
    names = sorted(plan, key=lambda c: plan[c]["target_tokens"])           # the small ones first: they are never cut by the clock
    k, n = (int(x) for x in a.part.split("/"))
    mine = [c for i, c in enumerate(names) if i % n == k]
    if a.only:
        mine = [c for c in mine if c in a.only.split(",")]
    deadline = time.time() + a.deadline_min * 60
    for i, cfg in enumerate(mine):
        if os.path.exists(os.path.join(OUT, f"manifest.web_{cfg}.json")) and not a.force:
            continue
        left = deadline - time.time()
        if left <= 0:
            log(f"{cfg}: deadline passed, not built")
            continue
        # a fair share of the time left for this language and the ones after it (the big ones need it most)
        rest = sum(plan[c]["target_tokens"] for c in mine[i:])
        share = left * plan[cfg]["target_tokens"] / max(rest, 1)
        rec = build_language(cfg, plan[cfg], tok, OUT, time.time() + max(60.0, 3 * share), log)
        log(f"[{i + 1}/{len(mine)}] {cfg}: {rec['train_tokens'] / 1e6:.2f}M of {rec['target_tokens'] / 1e6:.2f}M tokens, "
            f"{rec['train_docs']} docs, {rec['seconds']}s {rec['short_reason'] or ''}")
    os._exit(0)


def cmd_merge(a):
    plan = json.load(open(os.path.join(OUT, "plan.json")))
    man = dict(llm=a.llm, alpha=ALPHA, cap=CAP, min_tokens=MIN_TOKENS, dev_percent=P6.DEV_PERCENT, sources={}, not_built=[],
               flores_without_fineweb2=plan["flores_without_fineweb2"], mapped=MAP)
    for cfg in plan["configs"]:
        p = os.path.join(OUT, f"manifest.web_{cfg}.json")
        if os.path.exists(p):
            man["sources"][f"web_{cfg}"] = json.load(open(p))
        else:
            man["not_built"].append(cfg)
    p = os.path.join(OUT, "manifest.chat.json")
    if os.path.exists(p):
        man["sources"]["chat"] = json.load(open(p))
    web = [v for k, v in man["sources"].items() if k != "chat"]
    man["totals"] = dict(web_train_tokens=sum(v["train_tokens"] for v in web), web_dev_tokens=sum(v["dev_tokens"] for v in web),
                         chat_train_tokens=man["sources"].get("chat", {}).get("train_tokens", 0), languages=len(web),
                         short=sorted(v["config"] for v in web if v["short_reason"]))
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    print(json.dumps(man["totals"]), "not built:", man["not_built"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["plan", "build", "merge"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--total", type=int, default=TOTAL)
    ap.add_argument("--part", default="0/1")
    ap.add_argument("--only", default=None, help="build: 'chat', or a comma list of configs")
    ap.add_argument("--deadline-min", type=float, default=90.0)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    {"plan": cmd_plan, "build": cmd_build, "merge": cmd_merge}[a.cmd](a)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
