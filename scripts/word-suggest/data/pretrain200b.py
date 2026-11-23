#!/usr/bin/env python3
"""data/pretrain200b/: data/pretrain200 plus more text, for continuing the 200-language SLM on ~4B web tokens (E7d).

Nothing in data/pretrain200 is read again or changed: its shard files are linked into data/pretrain200b/ and new shards are added next
to them (so `pretrain_slm.py --pretrain data/pretrain200b` and `train_slm.py --replay-pretrain data/pretrain200b` see everything).
New shards are named web_<config>_b (and chat.* is linked as it was).

  FineWeb-2 continued: each language's stream is replayed up to the document where data/pretrain200 stopped (manifest `seen`; the
      documents are skipped, not tokenised) and read on from there.  Targets: temperature sampling (alpha 0.3) of ~4B web tokens in
      all, every FLORES language gets all its FineWeb-2 text up to 25M tokens, at most 400M for one language; English from
      FineWeb-Edu.  A language whose FineWeb-2 text is all in already is not read again.
  Top-up: a language still under 25M tokens gets public text from Wikipedia (wikimedia/wikipedia, 20231101.<code>) and then MADLAD-400
      clean (allenai/MADLAD-400, data/<code>/<code>_clean_NNNN.jsonl.gz), in the language's own script only, without a document
      whose first 40 tokens are one already in the language's FineWeb-2 text.
  Every document that holds a FLORES sentence (a normalised 60-character prefix; the language's own and English) is dropped.

  1. plan    .venv/bin/python data/pretrain200b.py plan
  2. build   RAYON_NUM_THREADS=4 nice -n 19 .venv/bin/python data/pretrain200b.py build --part 0/2 --deadline-min 120   (and 1/2)
  3. merge   .venv/bin/python data/pretrain200b.py merge          -> manifest.json (tokens per language and source, under 5M)
"""
import argparse
import hashlib
import json
import os
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
import pretrain as P6  # noqa: E402
import pretrain200 as P2  # noqa: E402

OLD = os.path.join(HERE, "pretrain200")
OUT = os.path.join(HERE, "pretrain200b")
TOTAL = 4_000_000_000
ALPHA = 0.3
CAP = 400_000_000
FLOOR = 25_000_000
LOW = 5_000_000
MAX_DOC_TOKENS, MAX_CHARS, MIN_DOC_CHARS = P2.MAX_DOC_TOKENS, P2.MAX_CHARS, P2.MIN_DOC_CHARS
DEDUP_TOKENS = 40
# FLORES iso3 -> the Wikipedia / MADLAD code when pycountry's two-letter code is not it (macrolanguages, renamed codes)
EXTRA = {"kmr": "ku", "zsm": "ms", "uzn": "uz", "pbt": "ps", "swh": "sw", "khk": "mn", "ory": "or", "npi": "ne", "lvs": "lv",
         "azj": "az", "arb": "ar", "pes": "fa", "plt": "mg", "gaz": "om", "ydd": "yi", "nob": "no", "als": "sq", "ayr": "ay",
         "quy": "qu", "est": "et", "ekk": "et", "tgl": "tl", "yue": "zh-yue", "zho": "zh", "cmn": "zh", "kas": "ks", "bod": "bo",
         "aka": "ak", "twi": "tw", "kon": "kg", "gug": "gn", "grn": "gn", "nus": "nus", "mni": "mni", "sat": "sat"}
NO_WIKI = {"als"}                     # wikimedia 'als' is Alemannic, not Albanian (FLORES als_Latn is Tosk): sq is used instead
SCRIPT_NAMES = {"Latn": {"LATIN"}, "Arab": {"ARABIC"}, "Cyrl": {"CYRILLIC"}, "Deva": {"DEVANAGARI"}, "Beng": {"BENGALI"},
                "Ethi": {"ETHIOPIC"}, "Tfng": {"TIFINAGH"}, "Olck": {"OL"}, "Tibt": {"TIBETAN"}, "Mymr": {"MYANMAR"},
                "Laoo": {"LAO"}, "Khmr": {"KHMER"}, "Thai": {"THAI"}, "Hebr": {"HEBREW"}, "Armn": {"ARMENIAN"},
                "Geor": {"GEORGIAN"}, "Grek": {"GREEK"}, "Guru": {"GURMUKHI"}, "Gujr": {"GUJARATI"}, "Knda": {"KANNADA"},
                "Mlym": {"MALAYALAM"}, "Orya": {"ORIYA"}, "Sinh": {"SINHALA"}, "Taml": {"TAMIL"}, "Telu": {"TELUGU"},
                "Hang": {"HANGUL"}, "Hani": {"CJK", "HIRAGANA", "KATAKANA"}, "Hans": {"CJK"}, "Hant": {"CJK"},
                "Jpan": {"CJK", "HIRAGANA", "KATAKANA"}}


def script_ok(text, scripts, frac=0.6):
    """True if at least `frac` of the first letters of the text are in one of the scripts (a Wikipedia in another script is not
    this FLORES variant)."""
    want = set().union(*(SCRIPT_NAMES.get(s, set()) for s in scripts)) if scripts else set()
    if not want:
        return True
    n = ok = 0
    for ch in text[:3000]:
        if ch.isalpha():
            n += 1
            ok += unicodedata.name(ch, " ").split()[0] in want
            if n >= 400:
                break
    return n > 0 and ok / n >= frac


def doc_hashes(tok_arr, off_arr, k=DEDUP_TOKENS):
    """One hash per document of its first k tokens (documents shorter than k tokens: all of them)."""
    out = set()
    for i in range(len(off_arr) - 1):
        out.add(hashlib.blake2b(np.ascontiguousarray(tok_arr[off_arr[i]:min(off_arr[i] + k, off_arr[i + 1])]).tobytes(), digest_size=8).digest())
    return out


def hash_ids(ids, k=DEDUP_TOKENS):
    return hashlib.blake2b(np.asarray(ids[:k], dtype=np.int32).tobytes(), digest_size=8).digest()


def new_allocation(plan, man):
    avail = {c: (v["est_tokens"] if c != P2.EN else 1.3e12) for c, v in plan["configs"].items()}
    lo = {c: min(FLOOR, a) for c, a in avail.items()}                 # all of it up to 25M
    hi = {c: max(lo[c], min(CAP, 0.9 * a)) for c, a in avail.items()}
    f = lambda lam: {c: min(hi[c], max(lo[c], lam * a ** ALPHA)) for c, a in avail.items()}
    a, b = 0.0, 1e6
    for _ in range(100):
        m = (a + b) / 2
        a, b = (m, b) if sum(f(m).values()) < TOTAL else (a, m)
    return {c: int(v) for c, v in f(b).items()}


def codes_for(flores, i31, wiki, mad):
    """(wikipedia codes, madlad codes) for a config's FLORES codes."""
    w, m = [], []
    for fl in flores:
        iso3, scr = fl.split("_")
        cands = [EXTRA.get(iso3), i31.get(iso3), iso3, f"{iso3}_{scr}"]
        for c in cands:
            if c and c in wiki and c not in w and iso3 not in NO_WIKI:
                w.append(c)
            if c and c in mad and c not in m:
                m.append(c)
        if iso3 in NO_WIKI and "sq" in wiki and "sq" not in w:
            w.append("sq")
    return w, m


def cmd_plan(a):
    os.makedirs(OUT, exist_ok=True)
    plan = json.load(open(os.path.join(OLD, "plan.json")))
    man = json.load(open(os.path.join(OLD, "manifest.json")))
    lists = json.load(open(a.lists))
    i31 = json.load(open(a.iso))
    wiki = {c.split(".")[1] for c in lists["wiki"]}
    mad = {f.split("/")[1] for f in lists["madlad"] if f.startswith("data/") and "_clean_" in f}
    clean_files = {}
    for f in lists["madlad"]:
        if f.startswith("data/") and "_clean_" in f:
            clean_files.setdefault(f.split("/")[1], []).append(f)
    target = new_allocation(plan, man)
    out = {}
    for cfg, v in plan["configs"].items():
        old = man["sources"]["web_" + cfg]
        w, m = codes_for(v["flores"], i31, wiki, mad)
        per_file = max(v["est_tokens"] / max(len(v["files"]), 1), 1)
        n_open = int(min(len(v["files"]), max(1, np.ceil(v["target_tokens"] / per_file / 4))))     # as pretrain200.py computed it
        out[cfg] = dict(flores=v["flores"], dataset=v["dataset"], directory=v["directory"], files=v["files"], est_tokens=v["est_tokens"],
                        old_tokens=old["train_tokens"], old_dev_tokens=old["dev_tokens"], old_seen=old["seen"], old_n_open=n_open,
                        fw2_exhausted=old["short_reason"] == "ran out of documents", final_target=target[cfg],
                        new_target=max(0, target[cfg] - old["train_tokens"]), wiki=w,
                        madlad={c: sorted(clean_files[c]) for c in m})
    # FLORES languages that FineWeb-2 does not have: only the top-up
    for fl in plan["flores_without_fineweb2"]:
        w, m = codes_for([fl], i31, wiki, mad)
        out[fl] = dict(flores=[fl], dataset=None, directory=None, files=[], est_tokens=0, old_tokens=0, old_dev_tokens=0, old_seen=0,
                       old_n_open=0, fw2_exhausted=True, final_target=FLOOR, new_target=0, wiki=w,
                       madlad={c: sorted(clean_files[c]) for c in m})
    with open(os.path.join(OUT, "plan.json"), "w") as f:
        json.dump(dict(total_target=TOTAL, alpha=ALPHA, cap=CAP, floor=FLOOR, configs=out), f, indent=1)
    tg = sorted(v["final_target"] for k, v in out.items() if v["dataset"])
    new = sum(v["new_target"] for v in out.values())
    print(f"{len(out)} languages; final web target {sum(tg) / 1e9:.2f}B (min {tg[0] / 1e6:.1f}M, median {tg[len(tg) // 2] / 1e6:.1f}M, max "
          f"{tg[-1] / 1e6:.0f}M); new FineWeb-2 tokens to read {new / 1e9:.2f}B; with a top-up code: "
          f"{sum(1 for v in out.values() if v['wiki'] or v['madlad'])}")


def link_old():
    """Link data/pretrain200's shard files into data/pretrain200b (the corpus there stays one directory for the loaders)."""
    n = 0
    for fn in sorted(os.listdir(OLD)):
        if fn.endswith((".npy", ".json")) and not fn.startswith(("plan", "manifest.json")):
            dst = os.path.join(OUT, fn)
            if fn.startswith("manifest."):
                dst = os.path.join(OUT, "old." + fn)
            if not os.path.lexists(dst):
                os.symlink(os.path.join(OLD, fn), dst)
                n += 1
    return n


def old_hashes(cfg):
    h = set()
    for part in ("train", "dev"):
        p = os.path.join(OLD, f"web_{cfg}.{part}.tok.npy")
        if os.path.exists(p):
            h |= doc_hashes(np.load(p, mmap_mode="r"), np.load(os.path.join(OLD, f"web_{cfg}.{part}.off.npy")))
    return h


def stream_topup(kind, code, files):
    from datasets import load_dataset
    if kind == "wiki":
        ds = load_dataset("wikimedia/wikipedia", "20231101." + code, split="train", streaming=True)
        for d in ds:
            yield d.get("text") or ""
    else:
        for f in files:
            ds = load_dataset("json", data_files=f"hf://datasets/allenai/MADLAD-400/{f}", split="train", streaming=True)
            for d in ds:
                yield d.get("text") or ""


def build_language(cfg, info, tok, deadline, log):
    t0 = time.time()
    scripts = sorted({fl.split("_")[1] for fl in info["flores"]})
    keys = set(P2.flores_keys(P2.EN))
    for l in info["flores"]:
        keys |= P2.flores_keys(l)
    block = P2.KeySet(keys)
    train, dev = P6.Store(), P6.Store()
    counts = dict(fineweb=0, wikipedia=0, madlad=0)
    drop = dict(contaminated=0, short=0, low_lang_score=0, duplicate=0, wrong_script=0)
    buf = []
    src = "fineweb"
    seen_hash = set()

    def flush():
        nonlocal buf
        if not buf:
            return
        enc = tok([t for _, t, _ in buf], add_special_tokens=False)["input_ids"]
        for (key, _, s), ids in zip(buf, enc):
            ids = ids[:MAX_DOC_TOKENS]
            if len(ids) < 30:
                continue
            h = hash_ids(ids)
            if s != "fineweb" and h in seen_hash:
                drop["duplicate"] += 1
                continue
            seen_hash.add(h)
            (dev if P6.is_dev(key) else train).add(ids)
            if not P6.is_dev(key):
                counts[s] += len(ids)
        buf = []

    reason = None
    # ---- 1. FineWeb-2 (or Edu) past where data/pretrain200 stopped
    if info["dataset"] and info["new_target"] > 0 and not info["fw2_exhausted"]:
        it = P2.docs_from(info["dataset"], info["files"], info["old_n_open"])
        skipped = 0
        for _ in (it if info["old_seen"] > 0 else ()):                                       # the documents pretrain200 went through: not read into memory further
            skipped += 1
            if skipped >= info["old_seen"]:
                break
        n_seen = 0
        done = False
        try:
            for d in it:
                n_seen += 1
                text = (d.get("text") or "").strip()
                if len(text) < MIN_DOC_CHARS:
                    drop["short"] += 1
                    continue
                if info["dataset"].endswith("fineweb-2") and float(d.get("language_score") or 1) < P2.MIN_LANG_SCORE:
                    drop["low_lang_score"] += 1
                    continue
                if block.hit(text):
                    drop["contaminated"] += 1
                    continue
                buf.append((d.get("id") or f"b{n_seen}", text[:MAX_CHARS], "fineweb"))
                if len(buf) >= 256:
                    flush()
                    if counts["fineweb"] >= info["new_target"]:
                        done = True
                        break
                    if time.time() > deadline:
                        reason = "download time cap"
                        break
            flush()
        except Exception as e:
            flush()
            reason = f"error: {repr(e)[:120]}"
        if not done and reason is None:
            reason = "FineWeb-2 ran out"
    elif info["fw2_exhausted"] and info["dataset"]:
        reason = "FineWeb-2 ran out (already all in pretrain200)"
    # ---- 2. top-up from Wikipedia and MADLAD while the language is under 25M tokens
    total = info["old_tokens"] + counts["fineweb"]
    need = FLOOR - total
    if need > 0 and (info["wiki"] or info["madlad"]) and time.time() < deadline + 600:
        if info["dataset"]:
            seen_hash |= old_hashes(cfg)
        for kind, srcs in (("wiki", info["wiki"]), ("madlad", list(info["madlad"]))):
            for code in srcs:
                s = "wikipedia" if kind == "wiki" else "madlad"
                if FLOOR - (info["old_tokens"] + sum(counts.values())) <= 0:
                    break
                t_src, scanned, taken = time.time(), 0, 0
                try:
                    for text in stream_topup(kind, code, info["madlad"].get(code) if kind == "madlad" else None):
                        scanned += 1
                        # a source in another script or language (arb_Latn against Arabic Wikipedia) must not be read for hours
                        if (scanned >= 4000 and taken < 0.01 * scanned) or time.time() - t_src > (900 if kind == "wiki" else 1500):
                            log(f"  {cfg}: {kind} {code}: stopped after {scanned} documents, {taken} usable")
                            break
                        text = text.strip()
                        if len(text) < MIN_DOC_CHARS:
                            drop["short"] += 1
                            continue
                        if not script_ok(text, scripts):
                            drop["wrong_script"] += 1
                            continue
                        if block.hit(text):
                            drop["contaminated"] += 1
                            continue
                        taken += 1
                        buf.append((f"{s}-{code}-{hashlib.md5(text[:200].encode()).hexdigest()}", text[:MAX_CHARS], s))
                        if len(buf) >= 128:
                            flush()
                            if FLOOR - (info["old_tokens"] + sum(counts.values())) <= 0:
                                break
                    flush()
                except Exception as e:
                    flush()
                    log(f"  {cfg}: {kind} {code}: {repr(e)[:100]}")
    # a language with few documents still gets a held-out set
    nd = len(train.offs) - 1
    if len(dev.offs) - 1 < P2.DEV_MIN_DOCS and nd >= 50:
        move = P2.DEV_MIN_DOCS - (len(dev.offs) - 1)
        tail = train.parts[-move:]
        train.parts, train.offs = train.parts[:-move], train.offs[:-move]
        train.n_tokens = train.offs[-1]
        for p in tail:
            dev.add(p)
    name = f"web_{cfg}_b"
    if train.n_tokens or dev.n_tokens:
        train.save(os.path.join(OUT, f"{name}.train"))
        dev.save(os.path.join(OUT, f"{name}.dev"))
    rec = dict(config=cfg, flores=info["flores"], dataset=info["dataset"], old_tokens=info["old_tokens"], final_target=info["final_target"],
               new_target=info["new_target"], new_train_tokens=train.n_tokens, new_dev_tokens=dev.n_tokens,
               tokens_by_source=dict(fineweb2=info["old_tokens"] + counts["fineweb"], **{k: v for k, v in counts.items() if k != "fineweb"}),
               new_by_source=counts, total_train_tokens=info["old_tokens"] + train.n_tokens, dropped=drop, wiki_codes=info["wiki"],
               madlad_codes=list(info["madlad"]), reason=reason, seconds=round(time.time() - t0))
    with open(os.path.join(OUT, f"manifest.{name}.json"), "w") as f:
        json.dump(rec, f, indent=1)
    return rec


def cmd_build(a):
    os.makedirs(OUT, exist_ok=True)
    log = lambda s: print(s, file=sys.stderr, flush=True)
    link_old()
    tok = get_tokenizer(a.llm)
    plan = json.load(open(os.path.join(OUT, "plan.json")))["configs"]
    names = sorted(plan, key=lambda c: plan[c]["new_target"] + (FLOOR if plan[c]["wiki"] or plan[c]["madlad"] else 0))
    k, n = (int(x) for x in a.part.split("/"))
    mine = [c for i, c in enumerate(names) if i % n == k]
    if a.only:
        mine = [c for c in mine if c in a.only.split(",")]
    deadline = time.time() + a.deadline_min * 60
    for i, cfg in enumerate(mine):
        mp = os.path.join(OUT, f"manifest.web_{cfg}_b.json")
        if os.path.exists(mp) and not a.force:
            continue
        left = deadline - time.time()
        if left <= 0:
            log(f"{cfg}: deadline passed, not built")
            continue
        rest = sum(plan[c]["new_target"] + 1_000_000 for c in mine[i:])
        share = left * (plan[cfg]["new_target"] + 1_000_000) / max(rest, 1)
        rec = build_language(cfg, plan[cfg], tok, time.time() + max(120.0, 3 * share), log)
        log(f"[{i + 1}/{len(mine)}] {cfg}: +{rec['new_train_tokens'] / 1e6:.2f}M (fineweb {rec['new_by_source']['fineweb'] / 1e6:.2f}, wiki "
            f"{rec['new_by_source']['wikipedia'] / 1e6:.2f}, madlad {rec['new_by_source']['madlad'] / 1e6:.2f}) -> "
            f"{rec['total_train_tokens'] / 1e6:.2f}M of {rec['final_target'] / 1e6:.1f}M, {rec['seconds']}s {rec['reason'] or ''}")
    os._exit(0)


def cmd_merge(a):
    plan = json.load(open(os.path.join(OUT, "plan.json")))["configs"]
    oldman = json.load(open(os.path.join(OLD, "manifest.json")))
    man = dict(llm=a.llm, alpha=ALPHA, cap=CAP, floor=FLOOR, total_target=TOTAL, languages={}, not_built=[])
    for cfg in plan:
        p = os.path.join(OUT, f"manifest.web_{cfg}_b.json")
        if os.path.exists(p):
            man["languages"][cfg] = json.load(open(p))
        else:
            man["not_built"].append(cfg)
    tot = lambda f: sum(f(v) for v in man["languages"].values())
    low = sorted((v["total_train_tokens"], c) for c, v in man["languages"].items() if v["total_train_tokens"] < LOW)
    man["totals"] = dict(web_train_tokens=tot(lambda v: v["total_train_tokens"]), new_web_tokens=tot(lambda v: v["new_train_tokens"]),
                         fineweb2=tot(lambda v: v["tokens_by_source"]["fineweb2"]), wikipedia=tot(lambda v: v["tokens_by_source"]["wikipedia"]),
                         madlad=tot(lambda v: v["tokens_by_source"]["madlad"]), chat_train_tokens=oldman["sources"]["chat"]["train_tokens"],
                         languages=len(man["languages"]))
    man["under_5M"] = [dict(config=c, tokens=t) for t, c in low]
    man["under_25M"] = sorted(c for c, v in man["languages"].items() if v["total_train_tokens"] < FLOOR)
    man["topped_up"] = {c: dict(wikipedia=v["new_by_source"]["wikipedia"], madlad=v["new_by_source"]["madlad"])
                        for c, v in man["languages"].items() if v["new_by_source"]["wikipedia"] or v["new_by_source"]["madlad"]}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    print(json.dumps(man["totals"]), "under 5M:", len(low), "under 25M:", len(man["under_25M"]), "not built:", man["not_built"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["plan", "build", "merge"])
    ap.add_argument("--llm", default=DEFAULT_LLM)
    ap.add_argument("--part", default="0/1")
    ap.add_argument("--only", default=None)
    ap.add_argument("--deadline-min", type=float, default=120.0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--lists", default=os.path.join(OUT, "hub_lists.json"), help="plan: Hub file lists {madlad: [...], wiki: [...]} (list_repo_files of allenai/MADLAD-400 and the wikimedia/wikipedia configs)")
    ap.add_argument("--iso", default=os.path.join(OUT, "iso3to1.json"), help="plan: iso 639-3 -> 639-1 codes (pycountry)")
    a = ap.parse_args()
    {"plan": cmd_plan, "build": cmd_build, "merge": cmd_merge}[a.cmd](a)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
