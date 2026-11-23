#!/usr/bin/env python3
"""data/typed/ (made from the folder that holds data/: WS_DATA): text that people typed (messages to an assistant, email) for continuing the SLM's pretraining on what people write.

Shards in the format of data/pretrain.py (tokens are Qwen3.5's ids; <s>.{train,dev}.{tok,off}.npy), in data/typed/:

  typed_conv      WildChat-1M (allenai/WildChat-1M, ODC-By 1.0: text may be used and redistributed with attribution; 68 languages, half of it
                  English, a fifth Chinese).  What the person typed is the target; the assistant turn before it is kept as context only
                  (the last 128 tokens, role 2: no loss on it, as the "messages" test shows an assistant message above the typed one).
                  Conversations flagged toxic or redacted are not used (the Hub copy has them out already); a turn longer than 1,500
                  characters (pasted articles, code, long templates), with a code fence, mostly symbols or with more than one link is
                  cut off there (the conversation ends before it); a turn seen already twice is not kept again.  Files: typed_conv.*
                  (as chat.*: .role.npy 1 user, 2 assistant context, .conv.npy, .lang.json, .src.json).
  typed_email_enron   Enron email (corbt/enron-emails: no licence stated; the CMU CALO release of the mail the FERC made public, a
                  public-record corpus; usable for research, not offered for redistribution here), cleaned as data/enron_email.py does, 10 to
                  600 words.  The 700 writers of the public test data/email_enron.jsonl are NOT in it (split by sender), nor is a message that
                  holds a paragraph of a test email; 1% of the other writers (by hash) are the dev part.
  typed_email_sinabis  Sinabis Oil, a synthetic mailbox of an energy company (sinabis-group/sinabis-100k-synthetic-emails, CC-BY-4.0; the
                  text was written by language models): the body of each email without its signature and quoted history, in English,
                  German, French and Italian: the only open email in more than one language.

Every text that holds a FLORES-200 sentence (a normalised 60-character prefix, any of the 204 variants), a paragraph of data/multi, of the
public messages test (data/messages_oasst2.jsonl: its message and the assistant message above it) or of the public email test is dropped.
No oasst2 validation tree and no Aya text is in here (the chat shard of data/pretrain200 has both).  Nothing from the owner's own messages.

    python data/typed.py wildchat [--files 0,1,..] [--keep-raw]       python data/typed.py enron      python data/typed.py sinabis
    python data/typed.py link --base data/pretrain200b                 (data/typed/corpus: the base shards plus these, as links)
    python data/typed.py mix --tokens 1e9 --typed typed_conv=300e6,..   (data/typed/mix_pilot.json from data/mix_complement.json)
    python data/typed.py report                                        (data/typed/manifest.json: tokens per source and language)
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import unicodedata

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("RAYON_NUM_THREADS", "8")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "true")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ws.vocab import DEFAULT_LLM, get_tokenizer  # noqa: E402
import pretrain as P6  # noqa: E402     (Store, is_dev, Blocklist)
import pretrain200 as P2  # noqa: E402   (KeySet, flores_keys, norm)

DATA = os.path.abspath(os.environ.get("WS_DATA", "data"))      # the data folder (the corpora and the tests are not in git): run from the folder that has it
OUT = os.path.join(DATA, "typed")
P2.FLORES = os.path.join(DATA, "flores")
RAW = os.path.join(OUT, "raw")
WILDCHAT = "allenai/WildChat-1M"
ENRON = "corbt/enron-emails"
SINABIS = "sinabis-group/sinabis-100k-synthetic-emails"

MAX_USER_CHARS = 1500          # a longer turn is pasted text, not typed
MIN_USER_CHARS = 2
MAX_TURNS = 8                  # user turns kept per conversation
MAX_CONV_TOKENS = 700          # a conversation stops at the turn that would go past this (the loader cuts at 768)
CTX_TOKENS = 128               # the assistant turn before a typed one: its last tokens
CTX_CHARS = 700
MAX_COPIES = 2                 # a user turn (normalised) is kept at most this many times in all
KEY = 60

# WildChat's language names -> the two-letter codes the chat shard uses
LANG = {"English": "en", "Chinese": "zh", "Russian": "ru", "French": "fr", "Spanish": "es", "German": "de", "Portuguese": "pt",
        "Italian": "it", "Japanese": "ja", "Korean": "ko", "Arabic": "ar", "Turkish": "tr", "Polish": "pl", "Vietnamese": "vi",
        "Indonesian": "id", "Dutch": "nl", "Ukrainian": "uk", "Czech": "cs", "Thai": "th", "Hebrew": "he", "Persian": "fa",
        "Hindi": "hi", "Swedish": "sv", "Romanian": "ro", "Hungarian": "hu", "Greek": "el", "Finnish": "fi", "Danish": "da",
        "Bulgarian": "bg", "Norwegian": "no", "Slovak": "sk", "Catalan": "ca", "Croatian": "hr", "Serbian": "sr", "Lithuanian": "lt",
        "Latvian": "lv", "Slovenian": "sl", "Estonian": "et", "Malay": "ms", "Bengali": "bn", "Tagalog": "tl", "Filipino": "tl",
        "Urdu": "ur", "Tamil": "ta", "Swahili": "sw", "Afrikaans": "af", "Latin": "la", "Welsh": "cy", "Basque": "eu", "Galician": "gl",
        "Albanian": "sq", "Armenian": "hy", "Azerbaijani": "az", "Belarusian": "be", "Georgian": "ka", "Kazakh": "kk", "Macedonian": "mk",
        "Mongolian": "mn", "Nepali": "ne", "Uzbek": "uz", "Icelandic": "is", "Irish": "ga", "Maltese": "mt", "Esperanto": "eo",
        "Bosnian": "bs", "Kannada": "kn", "Marathi": "mr", "Telugu": "te", "Gujarati": "gu", "Punjabi": "pa", "Malayalam": "ml",
        "Burmese": "my", "Khmer": "km", "Lao": "lo", "Sinhala": "si", "Amharic": "am", "Somali": "so", "Yoruba": "yo", "Zulu": "zu"}


def log(s):
    print(s, file=sys.stderr, flush=True)


# ---- the keys of what must stay out -----------------------------------------------------------------------------------------------------
def test_keys():
    """Normalised prefixes (KEY characters) of every FLORES sentence, and of the paragraphs of the public messages and email tests."""
    keys = set()
    for l in P2.flores_langs():
        keys |= P2.flores_keys(l)
    n_flores = len(keys)

    def add(text):
        for piece in re.split(r"\n\s*\n", text or ""):
            n = P2.norm(piece)
            if len(n) >= 40:
                keys.add(n[:KEY])

    for fn, fields in (("messages_oasst2.jsonl", ("text", "prev_agent")), ("email_enron.jsonl", ("text",))):
        p = os.path.join(DATA, fn)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                r = json.loads(line)
                for f in fields:
                    add(r.get(f))
    return P2.KeySet(keys), n_flores, len(keys) - n_flores


def test_writers():
    p = os.path.join(DATA, "email_enron.jsonl")
    return {json.loads(l)["writer"] for l in open(p, encoding="utf-8")} if os.path.exists(p) else set()


def digest(text):
    return hashlib.sha1(re.sub(r"\W+", "", text.casefold()).encode()).digest()[:12]


def is_dev(key):
    return P6.is_dev(key)


def save_docs(store_train, store_dev, name):
    store_train.save(os.path.join(OUT, f"{name}.train"))
    store_dev.save(os.path.join(OUT, f"{name}.dev"))


def write_manifest(name, info):
    info["finished"] = time.strftime("%Y-%m-%d %H:%M")
    with open(os.path.join(OUT, f"manifest.{name}.json"), "w") as f:
        json.dump(info, f, indent=1, ensure_ascii=False)


# ---- WildChat ---------------------------------------------------------------------------------------------------------------------------
BAD_SYMBOLS = re.compile(r"[^\w\s]", re.U)
LINK = re.compile(r"https?://|www\.")


def typed_ok(t):
    """A user turn that a person typed, as opposed to a pasted document or code."""
    if not (MIN_USER_CHARS <= len(t) <= MAX_USER_CHARS) or "```" in t:
        return False
    if len(LINK.findall(t)) > 1:
        return False
    if len(t) > 30 and len(BAD_SYMBOLS.findall(t)) > 0.3 * len(t):
        return False
    return True


def ctx_text(t):
    """The end of an assistant turn, from a word boundary."""
    t = (t or "").strip()
    if len(t) <= CTX_CHARS:
        return t
    t = t[-CTX_CHARS:]
    m = re.search(r"\s", t[:30])
    return t[m.end():] if m else t


def build_wildchat(a):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download, list_repo_files
    tok = get_tokenizer(DEFAULT_LLM)
    keyset, n_fl, n_other = test_keys()
    log(f"keys: {n_fl} FLORES sentences, {n_other} test paragraphs")
    files = sorted(f for f in list_repo_files(WILDCHAT, repo_type="dataset") if f.startswith("data/train-"))
    if a.files:
        files = [files[int(i)] for i in a.files.split(",")]
    st = {p: dict(turns=P6.Store(), role=[], conv=[0], lang=[], src=[]) for p in ("train", "dev")}
    seen: dict = {}
    drop = dict(conversations=0, toxic_or_redacted=0, first_turn_unusable=0, contaminated=0, copies=0, no_text=0)
    ntok = {"train": {}, "dev": {}}
    nconv = {"train": {}, "dev": {}}
    nturn = dict(user=0, ctx=0)
    t0 = time.time()
    for fi, f in enumerate(files):
        p = hf_hub_download(WILDCHAT, f, repo_type="dataset", local_dir=RAW)
        pf = pq.ParquetFile(p)
        for batch in pf.iter_batches(batch_size=4000, columns=["conversation_hash", "conversation", "language", "toxic", "redacted"]):
            convs = []                                   # (key, lang, [(role, text)])
            for r in batch.to_pylist():
                drop["conversations"] += 1
                if r["toxic"] or r["redacted"]:
                    drop["toxic_or_redacted"] += 1
                    continue
                turns, pending_ctx = [], None
                for m in r["conversation"]:
                    c = (m["content"] or "").strip()
                    if m["role"] == "user":
                        if not typed_ok(c) or len(turns) >= 2 * MAX_TURNS:
                            break
                        h = digest(c)
                        if seen.get(h, 0) >= MAX_COPIES:
                            drop["copies"] += 1
                            break
                        if keyset.hit(c):
                            drop["contaminated"] += 1
                            break
                        if pending_ctx is not None:
                            turns.append((2, pending_ctx))
                        turns.append((1, c))
                        pending_ctx = None
                        seen[h] = seen.get(h, 0) + 1
                    elif m["role"] == "assistant":
                        ct = ctx_text(c)
                        pending_ctx = ct if ct and not keyset.hit(ct) else None
                        if pending_ctx is None and turns:
                            break                       # no context to show: the conversation ends here
                if not any(role == 1 for role, _ in turns):
                    drop["first_turn_unusable"] += 1
                    continue
                convs.append((r["conversation_hash"], LANG.get(r["language"], (r["language"] or "und").lower()), turns))
            flat = [t for _, _, turns in convs for _, t in turns]
            enc = tok(flat, add_special_tokens=False)["input_ids"] if flat else []
            i = 0
            for key, lang, turns in convs:
                ids, roles, n = [], [], 0
                for role, _ in turns:
                    e = enc[i]
                    i += 1
                    if role == 2:
                        e = e[-CTX_TOKENS:]
                    if not e or (n + len(e) > MAX_CONV_TOKENS and ids):
                        break
                    ids.append(e)
                    roles.append(role)
                    n += len(e)
                while roles and roles[-1] == 2:        # a context with no typed turn after it
                    ids.pop()
                    roles.pop()
                if not roles:
                    drop["no_text"] += 1
                    continue
                part = "dev" if is_dev(key) else "train"
                s = st[part]
                for e, r_ in zip(ids, roles):
                    s["turns"].add(e)
                    s["role"].append(r_)
                s["conv"].append(len(s["role"]))
                s["lang"].append(lang)
                s["src"].append("wildchat")
                nu = sum(len(e) for e, r_ in zip(ids, roles) if r_ == 1)
                nturn["user"] += sum(r_ == 1 for r_ in roles)
                nturn["ctx"] += sum(r_ == 2 for r_ in roles)
                ntok[part][lang] = ntok[part].get(lang, 0) + sum(len(e) for e in ids)
                nconv[part][lang] = nconv[part].get(lang, 0) + 1
        os.remove(p)
        tr = sum(ntok["train"].values())
        log(f"  file {fi + 1}/{len(files)} {f}: {tr / 1e6:.1f}M train tokens, {len(st['train']['conv']) - 1} conversations, {time.time() - t0:.0f}s")
    for part, s in st.items():
        base = os.path.join(OUT, f"typed_conv.{part}")
        s["turns"].save(base)
        np.save(base + ".role.npy", np.asarray(s["role"], dtype=np.uint8))
        np.save(base + ".conv.npy", np.asarray(s["conv"], dtype=np.int64))
        for k in ("lang", "src"):
            with open(f"{base}.{k}.json", "w") as fh:
                json.dump(s[k], fh)
    # the user's own typed tokens (no context) per language, from the roles
    role = np.load(os.path.join(OUT, "typed_conv.train.role.npy"))
    off = np.load(os.path.join(OUT, "typed_conv.train.off.npy"))
    user_tokens = int(np.diff(off)[role == 1].sum())
    write_manifest("typed_conv", dict(dataset=WILDCHAT, licence="ODC-By 1.0", files=len(files), train_tokens=sum(ntok["train"].values()),
                                      dev_tokens=sum(ntok["dev"].values()), train_user_tokens=user_tokens,
                                      train_conversations=len(st["train"]["conv"]) - 1, dev_conversations=len(st["dev"]["conv"]) - 1,
                                      user_turns=nturn["user"], context_turns=nturn["ctx"], dropped=drop,
                                      train_tokens_by_language=dict(sorted(ntok["train"].items(), key=lambda kv: -kv[1])),
                                      train_conversations_by_language=dict(sorted(nconv["train"].items(), key=lambda kv: -kv[1])),
                                      keys=dict(flores=n_fl, test_paragraphs=n_other), seconds=round(time.time() - t0)))
    log(f"typed_conv: {sum(ntok['train'].values()) / 1e6:.1f}M train tokens ({user_tokens / 1e6:.1f}M typed), drops {drop}")


# ---- email ------------------------------------------------------------------------------------------------------------------------------
def build_enron(a):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download, list_repo_files
    import enron_email as E
    tok = get_tokenizer(DEFAULT_LLM)
    keyset, n_fl, n_other = test_keys()
    writers = test_writers()
    log(f"test writers kept out: {len(writers)}; keys: {n_fl} FLORES, {n_other} test paragraphs")
    files = sorted(f for f in list_repo_files(ENRON, repo_type="dataset") if f.startswith("data/train-"))
    train, dev = P6.Store(), P6.Store()
    seen = set()
    drop = dict(rows=0, not_enron_sender=0, test_writer=0, unusable=0, duplicate=0, contaminated=0)
    senders = {"train": set(), "dev": set()}
    buf = []
    ntok = {"train": 0, "dev": 0}

    def flush():
        nonlocal buf
        if not buf:
            return
        enc = tok([t for _, t in buf], add_special_tokens=False)["input_ids"]
        for (sender, _), ids in zip(buf, enc):
            ids = ids[:P6.MAX_DOC_TOKENS]
            if len(ids) < 20:
                continue
            part = "dev" if is_dev("enron-writer:" + sender) else "train"
            (dev if part == "dev" else train).add(ids)
            ntok[part] += len(ids)
            senders[part].add(sender)
        buf = []

    for f in files:
        p = hf_hub_download(ENRON, f, repo_type="dataset", local_dir=RAW)
        for batch in pq.ParquetFile(p).iter_batches(batch_size=5000, columns=["message_id", "from", "body"]):
            for r in batch.to_pylist():
                drop["rows"] += 1
                sender = (r["from"] or "").strip().lower()
                if not sender.endswith("@enron.com") or not r["body"]:
                    drop["not_enron_sender"] += 1
                    continue
                if sender in writers:
                    drop["test_writer"] += 1
                    continue
                t = E.clean(r["body"])
                if not E.plain_english(t, a.min_words, a.max_words):
                    drop["unusable"] += 1
                    continue
                h = digest(t)
                if h in seen:
                    drop["duplicate"] += 1
                    continue
                seen.add(h)
                if keyset.hit(t):
                    drop["contaminated"] += 1
                    continue
                buf.append((sender, t))
                if len(buf) >= 2000:
                    flush()
        os.remove(p)
        log(f"  {f}: {ntok['train'] / 1e6:.1f}M train tokens")
    flush()
    save_docs(train, dev, "typed_email_enron")
    write_manifest("typed_email_enron", dict(dataset=ENRON, licence="none stated (public-record corpus)", lang="en", min_words=a.min_words,
                                             max_words=a.max_words, train_tokens=ntok["train"], dev_tokens=ntok["dev"],
                                             train_docs=len(train.offs) - 1, dev_docs=len(dev.offs) - 1,
                                             writers_train=len(senders["train"]), writers_dev=len(senders["dev"]),
                                             test_writers_excluded=len(writers), dropped=drop))
    log(f"typed_email_enron: {ntok['train'] / 1e6:.1f}M train tokens, {len(senders['train'])} writers, drops {drop}")


SIG = re.compile(r"\n--[ \t]*\n")


def build_sinabis(a):
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download
    tok = get_tokenizer(DEFAULT_LLM)
    keyset, n_fl, n_other = test_keys()
    p = hf_hub_download(SINABIS, "data/train-00000-of-00001.parquet", repo_type="dataset", local_dir=RAW)
    train, dev = P6.Store(), P6.Store()
    seen = set()
    drop = dict(rows=0, duplicate=0, calendar=0, short=0, contaminated=0)
    by_lang = {}
    cols = ["case_id", "lang", "text", "calendar_method", "duplicate_of"]
    ntok = {"train": 0, "dev": 0}
    buf = []

    def flush():
        nonlocal buf
        if not buf:
            return
        enc = tok([t for _, _, t in buf], add_special_tokens=False)["input_ids"]
        for (key, lang, _), ids in zip(buf, enc):
            ids = ids[:P6.MAX_DOC_TOKENS]
            part = "dev" if is_dev("sinabis:" + key) else "train"
            (dev if part == "dev" else train).add(ids)
            ntok[part] += len(ids)
            if part == "train":
                by_lang[lang] = by_lang.get(lang, 0) + len(ids)
        buf = []

    for batch in pq.ParquetFile(p).iter_batches(batch_size=5000, columns=cols):
        for r in batch.to_pylist():
            drop["rows"] += 1
            if r["duplicate_of"]:
                drop["duplicate"] += 1
                continue
            if r["calendar_method"]:
                drop["calendar"] += 1
                continue
            t = (r["text"] or "").strip()
            m = SIG.search(t)
            if m:
                t = t[:m.start()].strip()
            if len(t.split()) < 15:
                drop["short"] += 1
                continue
            h = digest(t)
            if h in seen:
                drop["duplicate"] += 1
                continue
            seen.add(h)
            if keyset.hit(t):
                drop["contaminated"] += 1
                continue
            buf.append((str(r["case_id"]), r["lang"] or "und", t))
    flush()
    os.remove(p)
    save_docs(train, dev, "typed_email_sinabis")
    write_manifest("typed_email_sinabis", dict(dataset=SINABIS, licence="CC-BY-4.0 (synthetic: written by language models)", train_tokens=ntok["train"],
                                               dev_tokens=ntok["dev"], train_docs=len(train.offs) - 1, dev_docs=len(dev.offs) - 1,
                                               train_tokens_by_language=by_lang, dropped=drop))
    log(f"typed_email_sinabis: {ntok['train'] / 1e6:.1f}M train tokens {by_lang}, drops {drop}")


# ---- the corpus directory and the mix ----------------------------------------------------------------------------------------------------
def link(a):
    out = os.path.join(OUT, "corpus")
    os.makedirs(out, exist_ok=True)
    n = 0
    for fn in sorted(os.listdir(a.base)):
        if fn.endswith((".npy", ".json")) and not fn.startswith("manifest.") and not fn.startswith("old."):
            dst = os.path.join(out, fn)
            if not os.path.lexists(dst):
                os.symlink(os.path.realpath(os.path.join(a.base, fn)), dst)
                n += 1
    for fn in sorted(os.listdir(OUT)):
        if fn.startswith("typed_") and fn.endswith((".npy", ".json")):
            dst = os.path.join(out, fn)
            if os.path.lexists(dst):
                os.remove(dst)
            os.symlink(os.path.join(OUT, fn), dst)
            n += 1
    print(f"{out}: {n} links")


def mix(a):
    base = json.load(open(a.base_mix))
    typed = {k: int(float(v)) for k, v in (x.split("=") for x in a.typed.split(","))}
    scale = (a.tokens - sum(typed.values())) / base["total_tokens"]
    toks = {l: int(t * scale) for l, t in base["tokens"].items()}
    toks.update(typed)
    out = dict(total_tokens=sum(toks.values()), max_repeats=a.max_repeats,
               rule=f"the tokens per language of {os.path.basename(a.base_mix)} scaled to {1 - sum(typed.values()) / a.tokens:.0%} of the run, "
                    f"plus {', '.join(f'{k} {v / 1e6:.0f}M' for k, v in typed.items())}; at most {a.max_repeats} passes over a source", tokens=toks)
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
    print(f"{a.out}: {out['total_tokens'] / 1e9:.3f}B tokens, {len(toks)} sources")


def report(a):
    man = {}
    for fn in sorted(os.listdir(OUT)):
        if fn.startswith("manifest.") and fn != "manifest.json":
            man[fn[len("manifest."):-5]] = json.load(open(os.path.join(OUT, fn)))
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    for k, v in man.items():
        print(k, v.get("licence"), v.get("train_tokens"), v.get("dev_tokens"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("wildchat")
    w.add_argument("--files", default=None, help="comma list of file numbers (a smoke test: 0)")
    e = sub.add_parser("enron")
    e.add_argument("--min-words", type=int, default=10)
    e.add_argument("--max-words", type=int, default=600)
    sub.add_parser("sinabis")
    l = sub.add_parser("link")
    l.add_argument("--base", default=os.path.join(DATA, "pretrain200b"))
    m = sub.add_parser("mix")
    m.add_argument("--base-mix", default=os.path.join(DATA, "mix_complement.json"))
    m.add_argument("--tokens", type=float, default=1e9)
    m.add_argument("--typed", default="typed_conv=300e6,typed_email_enron=9e6,typed_email_sinabis=31e6", help="tokens of each typed source")
    m.add_argument("--max-repeats", type=float, default=10)
    m.add_argument("--out", default=os.path.join(OUT, "mix_pilot.json"))
    sub.add_parser("report")
    a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    {"wildchat": build_wildchat, "enron": build_enron, "sinabis": build_sinabis, "link": link, "mix": mix, "report": report}[a.cmd](a)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
