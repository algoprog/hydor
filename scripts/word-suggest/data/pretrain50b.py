#!/usr/bin/env python3
"""data/pretrain50b/: a ~50B-token corpus in every FLORES-200 language that has text, for the 200-language SLM (E7g, a cluster build).

The same recipe as data/pretrain200b.py, scaled, and made to run as many processes at once (on one or several cluster jobs):
  FineWeb-2   one config per language (FLORES codes mapped as in data/pretrain200.py MAP), English from FineWeb-Edu.  Temperature
              sampling (alpha 0.3) over what is available: tokens per language = min(all it has, lambda * available^alpha, 2.5B), lambda
              set so that the languages add up to --total (so a language with little text gets all of it).  The parquet files are
              downloaded whole with huggingface_hub (xet), tokenised, and deleted: one file is one task.
  Top-up      a language with little FineWeb-2 text (estimated under 150M tokens, or none) is one task that reads all its FineWeb-2
              files, then adds Wikipedia (wikimedia/wikipedia 20231101.<code>) and MADLAD-400 clean (allenai/MADLAD-400) in its own
              script until it has --floor tokens (100M), without a document whose first 40 tokens one already read has.
  Chats       oasst2 + aya_dataset, all languages, as before (one task).
  Every document holding a FLORES sentence (a normalised 60-character prefix; the language's own and English) is dropped; 0.5% of the
  documents of each source are held out (by hash of the document id; at least 5 for a source with 50 or more documents).

Output (shards as data/pretrain.py: <s>.{train,dev}.{tok,off}.npy, chat.* with roles; manifest.<task>.json per task; manifest.json):
  web_<config>_f<k>   one FineWeb-2 file of a big language       web_<config>   a small language (FineWeb-2 + top-up in one shard)

  .venv/bin/python data/pretrain50b.py plan  --out $OUT --total 50e9                   (needs the Hub; writes plan.json)
  .venv/bin/python data/pretrain50b.py run   --out $OUT --workers 16 --deadline-min 700  (any number of jobs at once: tasks are claimed)
  .venv/bin/python data/pretrain50b.py merge --out $OUT                                 -> manifest.json and a summary on stdout
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import math
import multiprocessing as mp
import os
import sys
import time

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "true")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

TOTAL = 50_000_000_000
ALPHA = 0.3
CAP = 2_500_000_000
FLOOR = 100_000_000            # top-up target for a small language
TOPUP_MAX_EST = 150_000_000    # a language estimated under this many FineWeb-2 tokens is a top-up candidate
LOW = 5_000_000
DEV_FRAC = 0.005
DEV_MIN_DOCS = 5
MAX_DOC_TOKENS, MAX_CHARS, MIN_DOC_CHARS, MIN_LANG_SCORE = 2048, 16000, 100, 0.75
DEDUP_TOKENS = 40


def is_dev(key: str) -> bool:
    return int(hashlib.sha1(key.encode()).hexdigest()[:8], 16) < DEV_FRAC * 2 ** 32


def retry(fn, tries=8, what=""):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:                 # the Hub rate-limits and drops connections: wait and try again
            if i == tries - 1:
                raise
            time.sleep(min(120, 5 * 2 ** i))


def download(repo, filename, dest):
    from huggingface_hub import hf_hub_download
    return retry(lambda: hf_hub_download(repo, filename, repo_type="dataset", local_dir=dest))


# ---- plan --------------------------------------------------------------------------------------------------------------------
def cmd_plan(a):
    import pretrain200 as P2
    import pretrain200b as P2b
    from huggingface_hub import HfApi, list_repo_files
    from ws.vocab import get_tokenizer
    os.makedirs(a.out, exist_ok=True)
    tok = get_tokenizer(a.llm)
    langs = P2.flores_langs()
    todo = {}
    for l in langs:
        todo.setdefault(P2.config_of(l), []).append(l)
    have = {t.path.split("/")[-1] for t in HfApi().list_repo_tree("HuggingFaceFW/fineweb-2", path_in_repo="data", repo_type="dataset")}
    jobs, missing = {}, []
    for cfg, ls in todo.items():
        if cfg == P2.EN:
            jobs[cfg] = ("HuggingFaceFW/fineweb-edu", "sample/10BT")
        elif cfg in have:
            jobs[cfg] = ("HuggingFaceFW/fineweb-2", f"data/{cfg}/train")
        else:
            missing += ls
    with cf.ThreadPoolExecutor(8) as ex:
        res = dict(zip(jobs, ex.map(lambda c: retry(lambda: P2.estimate(tok, *jobs[c])), jobs)))
    avail = {c: (toks if c != P2.EN else 1.3e12) for c, (f, d, t, toks) in res.items()}     # FineWeb-Edu has 1.3T; the 10BT sample enough
    target = P2.allocate(avail, a.total, ALPHA, CAP, 1_000_000, headroom=1.0)
    # the Hub's file lists for the top-up
    wiki_files = {}
    for f in list_repo_files("wikimedia/wikipedia", repo_type="dataset"):
        if f.startswith("20231101.") and f.endswith(".parquet"):
            wiki_files.setdefault(f.split("/")[0].split(".", 1)[1], []).append(f)
    mad_files = {}
    for f in list_repo_files("allenai/MADLAD-400", repo_type="dataset"):
        if f.startswith("data/") and "_clean_" in f:
            mad_files.setdefault(f.split("/")[1], []).append(f)
    i31 = json.load(open(os.path.join(HERE, "iso3to1.json")))
    tasks, cfgs = [], {}
    for cfg, (files, docs, tpd, toks) in res.items():
        w, m = P2b.codes_for(todo[cfg], i31, set(wiki_files), set(mad_files))
        names = [f for f, _ in files]
        sizes = [s for _, s in files]
        small = toks < TOPUP_MAX_EST
        cfgs[cfg] = dict(flores=todo[cfg], dataset=jobs[cfg][0], directory=jobs[cfg][1], n_files=len(names), est_tokens=int(toks),
                         target_tokens=int(target[cfg]), est_tokens_per_doc=round(tpd, 1), topup=bool(small and (w or m)),
                         wiki={c: sorted(wiki_files[c]) for c in w}, madlad={c: sorted(mad_files[c]) for c in m})
        if small:
            tasks.append(dict(id=f"web_{cfg}", kind="lang", cfg=cfg, dataset=jobs[cfg][0], files=names, cap=int(1.3 * target[cfg]) + 1, est=int(min(toks, target[cfg])) + (FLOOR if (w or m) else 0)))
        else:
            tpf = max(toks / max(len(names), 1), 1)
            n = int(min(len(names), max(1, math.ceil(target[cfg] / tpf))))
            cap = int(target[cfg] / n)                    # tokens of this language one task takes (a file is often more than that)
            for k, f in enumerate(P2.spread_files(names, n)):
                tasks.append(dict(id=f"web_{cfg}_f{names.index(f):03d}", kind="file", cfg=cfg, dataset=jobs[cfg][0], file=f,
                                  cap=cap, whole=bool(cap > 0.6 * tpf), est=int(min(tpf, cap))))
        cfgs[cfg]["n_tasks"] = sum(1 for t in tasks if t["cfg"] == cfg)
    for fl in missing:                      # FLORES languages FineWeb-2 does not have: only the top-up
        w, m = P2b.codes_for([fl], i31, set(wiki_files), set(mad_files))
        cfgs[fl] = dict(flores=[fl], dataset=None, directory=None, n_files=0, est_tokens=0, target_tokens=0, topup=bool(w or m),
                        wiki={c: sorted(wiki_files[c]) for c in w}, madlad={c: sorted(mad_files[c]) for c in m}, n_tasks=1)
        tasks.append(dict(id=f"web_{fl}", kind="lang", cfg=fl, dataset=None, files=[], est=FLOOR))
    tasks.append(dict(id="chat", kind="chat", est=int(a.chat_est)))
    tasks.sort(key=lambda t: -t["est"])
    with open(os.path.join(a.out, "plan.json"), "w") as f:
        json.dump(dict(total=a.total, alpha=ALPHA, cap=CAP, floor=FLOOR, configs=cfgs, tasks=tasks, flores_without_fineweb2=sorted(missing)), f, indent=1)
    print(f"{len(cfgs)} languages, {len(tasks)} tasks; FineWeb-2 target {sum(c['target_tokens'] for c in cfgs.values()) / 1e9:.1f}B, "
          f"largest {max(c['target_tokens'] for c in cfgs.values()) / 1e9:.2f}B; top-up candidates {sum(c['topup'] for c in cfgs.values())}; "
          f"without FineWeb-2: {sorted(missing)}")


# ---- documents -> tokens -----------------------------------------------------------------------------------------------------
class Shard:
    """The documents of one task: train and dev token stores (as data/pretrain.py's Store), the first-tokens hashes, the counts."""

    def __init__(self):
        import pretrain as P6
        self.train, self.dev = P6.Store(), P6.Store()
        self.hashes = set()
        self.by_source = {}
        self.drop = dict(contaminated=0, short=0, low_lang_score=0, duplicate=0, wrong_script=0)

    def add_tokens(self, docs, source, dup_check):
        for key, ids in docs:
            ids = ids[:MAX_DOC_TOKENS]
            if len(ids) < 30:
                continue
            h = hashlib.blake2b(np.asarray(ids[:DEDUP_TOKENS], dtype=np.int32).tobytes(), digest_size=8).digest()
            if dup_check and h in self.hashes:
                self.drop["duplicate"] += 1
                continue
            self.hashes.add(h)
            if is_dev(key):
                self.dev.add(ids)
            else:
                self.train.add(ids)
                self.by_source[source] = self.by_source.get(source, 0) + len(ids)

    def save(self, out, name):
        nd = len(self.train.offs) - 1
        if len(self.dev.offs) - 1 < DEV_MIN_DOCS and nd >= 50:
            move = DEV_MIN_DOCS - (len(self.dev.offs) - 1)
            tail = self.train.parts[-move:]
            self.train.parts, self.train.offs = self.train.parts[:-move], self.train.offs[:-move]
            self.train.n_tokens = self.train.offs[-1]
            for p in tail:
                self.dev.add(p)
        if self.train.n_tokens or self.dev.n_tokens:
            self.train.save(os.path.join(out, f"{name}.train"))
            self.dev.save(os.path.join(out, f"{name}.dev"))


def encode(tok, items, shard, source, dup_check=False):
    """items: [(key, text)] -> tokenised into the shard."""
    if not items:
        return
    enc = tok([t for _, t in items], add_special_tokens=False)["input_ids"]
    shard.add_tokens([(k, e) for (k, _), e in zip(items, enc)], source, dup_check)


def read_fw_file(path, fw2, block, shard, tok, deadline, cap=None, source="fineweb", log=None):
    """path: a local parquet file or an open remote one (range reads: only the row groups used are fetched).  Stops after `cap` tokens."""
    import pyarrow.parquet as pq
    pf = pq.ParquetFile(path)
    cols = [c for c in ("text", "id", "language_score") if c in pf.schema_arrow.names]
    buf, n = [], 0
    stop = None
    for batch in pf.iter_batches(batch_size=512, columns=cols):
        d = batch.to_pydict()
        for i, text in enumerate(d["text"]):
            n += 1
            text = (text or "").strip()
            if len(text) < MIN_DOC_CHARS:
                shard.drop["short"] += 1
                continue
            if fw2 and float((d.get("language_score") or [1] * len(d["text"]))[i] or 1) < MIN_LANG_SCORE:
                shard.drop["low_lang_score"] += 1
                continue
            if block.hit(text):
                shard.drop["contaminated"] += 1
                continue
            buf.append((d["id"][i] if "id" in d else f"{path}:{n}", text[:MAX_CHARS]))
        encode(tok, buf, shard, source)
        buf = []
        if time.time() > deadline:
            stop = "time cap"
            break
        if cap and shard.by_source.get(source, 0) >= cap:
            break
    return stop


def script_scan(items_iter, scripts, block, shard, tok, source, need, deadline, label, log):
    """Documents of a top-up source in the language's script, until `need()` tokens are no longer wanted."""
    import pretrain200b as P2b
    buf, scanned, taken, t0 = [], 0, 0, time.time()
    for text in items_iter:
        scanned += 1
        if (scanned >= 4000 and taken < 0.01 * scanned) or time.time() - t0 > 3600 or time.time() > deadline:
            log(f"  {label}: stopped after {scanned} documents, {taken} usable")
            break
        text = (text or "").strip()
        if len(text) < MIN_DOC_CHARS:
            shard.drop["short"] += 1
            continue
        if not P2b.script_ok(text, scripts):
            shard.drop["wrong_script"] += 1
            continue
        if block.hit(text):
            shard.drop["contaminated"] += 1
            continue
        taken += 1
        buf.append((f"{source}-{hashlib.md5(text[:200].encode()).hexdigest()}", text[:MAX_CHARS]))
        if len(buf) >= 256:
            encode(tok, buf, shard, source, dup_check=True)
            buf = []
            if need() <= 0:
                break
    encode(tok, buf, shard, source, dup_check=True)


def wiki_texts(files, dl):
    import pyarrow.parquet as pq
    for f in files:
        p = download("wikimedia/wikipedia", f, dl)
        try:
            for b in pq.ParquetFile(p).iter_batches(batch_size=512, columns=["text"]):
                yield from b.column(0).to_pylist()
        finally:
            os.remove(p)


def madlad_texts(files, dl):
    import gzip
    for f in files:
        p = download("allenai/MADLAD-400", f, dl)
        try:
            with gzip.open(p, "rt", encoding="utf-8") as fh:
                for line in fh:
                    try:
                        yield json.loads(line).get("text") or ""
                    except ValueError:
                        continue
        finally:
            os.remove(p)


# ---- tasks -------------------------------------------------------------------------------------------------------------------
def keyset(flores):
    import pretrain200 as P2
    keys = set(P2.flores_keys(P2.EN))
    for l in flores:
        keys |= P2.flores_keys(l)
    return P2.KeySet(keys)


def run_task(task, plan, out, tok, deadline, log):
    t0 = time.time()
    dl = os.path.join(out, "_dl", f"{os.getpid()}")
    os.makedirs(dl, exist_ok=True)
    kind = task["kind"]
    if kind == "chat":
        import pretrain as P6
        import pretrain200 as P2
        block = P2.all_keys_blocklist()
        info = P6.build_chat(out, 1000.0, tok, block, log, max_minutes=max(5.0, (deadline - time.time()) / 60))
        info["seconds"] = round(time.time() - t0)
        return info
    cfg = task["cfg"]
    c = plan["configs"][cfg]
    shard = Shard()
    block = keyset(c["flores"])
    reason = None
    fw2 = bool(task["dataset"]) and task["dataset"].endswith("fineweb-2")
    files = [task["file"]] if kind == "file" else task["files"]
    cap = task.get("cap")
    for f in files:
        if cap and shard.by_source.get("fineweb", 0) >= cap:
            break
        if task.get("whole", True):                  # most of the file is wanted: download it, read it, delete it
            p = download(task["dataset"], f, dl)
            try:
                r = read_fw_file(p, fw2, block, shard, tok, deadline, cap, log=log)
            finally:
                os.remove(p)
        else:                                        # a small part of a big file: read only the row groups needed
            from huggingface_hub import HfFileSystem
            with retry(lambda: HfFileSystem().open(f"datasets/{task['dataset']}/{f}", "rb", block_size=32 * 2 ** 20)) as fh:
                r = read_fw_file(fh, fw2, block, shard, tok, deadline, cap, log=log)
        if r:
            reason = r
            break
    fw_tokens = shard.by_source.get("fineweb", 0)
    if kind == "lang" and (c["wiki"] or c["madlad"]) and not reason:
        scripts = sorted({fl.split("_")[1] for fl in c["flores"]})
        need = lambda: FLOOR - sum(shard.by_source.values())
        for src, key, texts in (("wikipedia", "wiki", wiki_texts), ("madlad", "madlad", madlad_texts)):
            for code, files_c in c[key].items():
                if need() <= 0 or time.time() > deadline:
                    break
                try:
                    script_scan(texts(files_c, dl), scripts, block, shard, tok, src, need, deadline, f"{cfg} {src} {code}", log)
                except Exception as e:
                    log(f"  {cfg}: {src} {code}: {repr(e)[:120]}")
    if kind == "lang" and fw_tokens < c["target_tokens"] * 0.97 and not reason:
        reason = "FineWeb-2 ran out"
    shard.save(out, task["id"])
    return dict(id=task["id"], kind=kind, config=cfg, flores=c["flores"], dataset=task["dataset"], target_tokens=c["target_tokens"],
                train_tokens=shard.train.n_tokens, dev_tokens=shard.dev.n_tokens, train_docs=len(shard.train.offs) - 1,
                tokens_by_source=shard.by_source, dropped=shard.drop, reason=reason, seconds=round(time.time() - t0))


def worker(wid, out, deadline, only, rayon):
    os.environ["RAYON_NUM_THREADS"] = str(rayon)
    from ws.vocab import DEFAULT_LLM, get_tokenizer
    tok = get_tokenizer(DEFAULT_LLM)
    plan = json.load(open(os.path.join(out, "plan.json")))
    log = lambda s: print(f"[w{wid} {time.strftime('%H:%M:%S')}] {s}", flush=True)
    claims = os.path.join(out, "claims")
    os.makedirs(claims, exist_ok=True)
    for task in plan["tasks"]:
        if only and task["id"] not in only and task.get("cfg") not in only:
            continue
        if os.path.exists(os.path.join(out, f"manifest.{task['id']}.json")):
            continue
        if time.time() > deadline:
            log("deadline passed")
            return
        try:
            os.mkdir(os.path.join(claims, task["id"]))              # whoever makes the directory owns the task
        except FileExistsError:
            continue
        try:
            rec = run_task(task, plan, out, tok, deadline, log)
        except Exception as e:
            log(f"{task['id']}: FAILED {repr(e)[:300]}")
            os.rmdir(os.path.join(claims, task["id"]))
            continue
        rec["id"] = task["id"]
        with open(os.path.join(out, f"manifest.{task['id']}.json.tmp"), "w") as f:
            json.dump(rec, f, indent=1, ensure_ascii=False)
        os.replace(os.path.join(out, f"manifest.{task['id']}.json.tmp"), os.path.join(out, f"manifest.{task['id']}.json"))
        log(f"{task['id']}: {rec['train_tokens'] / 1e6:.1f}M train tokens ({rec['seconds']}s) {rec.get('reason') or ''}")


def cmd_run(a):
    if a.reset_claims:                                   # after a killed job: free the tasks that never finished
        cl = os.path.join(a.out, "claims")
        for t in (os.listdir(cl) if os.path.isdir(cl) else []):
            if not os.path.exists(os.path.join(a.out, f"manifest.{t}.json")):
                os.rmdir(os.path.join(cl, t))
    deadline = time.time() + a.deadline_min * 60
    only = set(a.only.split(",")) if a.only else None
    ctx = mp.get_context("spawn")
    procs = [ctx.Process(target=worker, args=(i, a.out, deadline, only, a.rayon)) for i in range(a.workers)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()


# ---- merge -------------------------------------------------------------------------------------------------------------------
def script_group(code):
    s = code.split("_")[-1]
    return {"Latn": "Latin", "Cyrl": "Cyrillic", "Arab": "Arabic", "Deva": "Indic", "Beng": "Indic", "Guru": "Indic", "Gujr": "Indic",
            "Orya": "Indic", "Taml": "Indic", "Telu": "Indic", "Knda": "Indic", "Mlym": "Indic", "Sinh": "Indic", "Olck": "Indic",
            "Hani": "CJK", "Hans": "CJK", "Hant": "CJK", "Jpan": "CJK", "Hang": "CJK", "Thai": "SE Asian", "Laoo": "SE Asian",
            "Khmr": "SE Asian", "Mymr": "SE Asian", "Ethi": "Ethiopic"}.get(s, "other")


def cmd_merge(a):
    plan = json.load(open(os.path.join(a.out, "plan.json")))
    langs, chat, pending = {}, None, []
    for t in plan["tasks"]:
        p = os.path.join(a.out, f"manifest.{t['id']}.json")
        if not os.path.exists(p):
            pending.append(t["id"])
            continue
        r = json.load(open(p))
        if t["kind"] == "chat":
            chat = r
            continue
        L = langs.setdefault(t["cfg"], dict(config=t["cfg"], flores=plan["configs"][t["cfg"]]["flores"], target=plan["configs"][t["cfg"]]["target_tokens"],
                                            fineweb2=0, wikipedia=0, madlad=0, dev=0, tasks=0, reasons=[]))
        for k, v in r["tokens_by_source"].items():
            L["fineweb2" if k == "fineweb" else k] += v
        L["dev"] += r["dev_tokens"]
        L["tasks"] += 1
        if r.get("reason"):
            L["reasons"].append(r["reason"])
    for L in langs.values():
        L["total"] = L["fineweb2"] + L["wikipedia"] + L["madlad"]
        L["group"] = script_group(L["flores"][0])
    web = sum(L["total"] for L in langs.values())
    tot = dict(web_train_tokens=web, fineweb2=sum(L["fineweb2"] for L in langs.values()), wikipedia=sum(L["wikipedia"] for L in langs.values()),
               madlad=sum(L["madlad"] for L in langs.values()), web_dev_tokens=sum(L["dev"] for L in langs.values()),
               chat_train_tokens=(chat or {}).get("train_tokens", 0), languages=len(langs), tasks_pending=len(pending))
    groups = {}
    for L in langs.values():
        g = groups.setdefault(L["group"], dict(languages=0, tokens=0))
        g["languages"] += 1
        g["tokens"] += L["total"]
    low = sorted((L["total"], c) for c, L in langs.items() if L["total"] < LOW)
    short = sorted((c, L["total"], L["target"]) for c, L in langs.items() if L["total"] < 0.9 * L["target"] and L["target"] > 0)
    man = dict(totals=tot, groups=groups, languages=langs, chat={k: v for k, v in (chat or {}).items() if k != "languages_in_oasst2"},
               under_5M=[dict(config=c, tokens=t) for t, c in low], short_of_target=short, pending=pending,
               topped_up={c: dict(wikipedia=L["wikipedia"], madlad=L["madlad"]) for c, L in langs.items() if L["wikipedia"] or L["madlad"]})
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    print(json.dumps(tot))
    print("groups:", {g: (v["languages"], round(v["tokens"] / 1e9, 2)) for g, v in groups.items()})
    print("under 5M:", len(low), "short of target (<90%):", len(short), "pending tasks:", len(pending))
    print("top-ups:", len(man["topped_up"]), "languages, wikipedia", round(tot["wikipedia"] / 1e6), "M, madlad", round(tot["madlad"] / 1e6), "M")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["plan", "run", "merge"])
    ap.add_argument("--out", default=os.path.join(HERE, "pretrain50b"))
    ap.add_argument("--llm", default="Qwen/Qwen3.5-0.8B-Base")
    ap.add_argument("--total", type=float, default=TOTAL)
    ap.add_argument("--chat-est", type=float, default=80e6)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--rayon", type=int, default=2, help="tokenizer threads per worker")
    ap.add_argument("--deadline-min", type=float, default=600.0)
    ap.add_argument("--only", default=None, help="run: task ids or configs (a test)")
    ap.add_argument("--reset-claims", action="store_true")
    a = ap.parse_args()
    a.total = int(a.total)
    {"plan": cmd_plan, "run": cmd_run, "merge": cmd_merge}[a.cmd](a)


if __name__ == "__main__":
    main()
