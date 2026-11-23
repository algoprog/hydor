"""Build Examples (ws/types.py) from data/*.jsonl as SPEC.md describes.

chat  : data/user_msgs.jsonl     target = the message (segments of <= 100 words); agent_ctx = last A words of prev_agent;
                                  user_ctx = earlier typed words so that user_ctx + target <= T words.
doc   : data/other_texts.jsonl   target = a paragraph; doc_ctx = the D words before it in the text.
plain : data/multi/<lang>.jsonl  target = a paragraph; doc_ctx = the previous paragraph's last D words.

--ctx none|agent|agent+user: none clears every context; agent keeps agent_ctx (chat) and doc_ctx (doc, plain: the
document's own context); agent+user keeps agent_ctx, user_ctx and doc_ctx.
"""
from __future__ import annotations

import json
import os
import random
import re
import unicodedata
from typing import Iterable, Iterator, Optional

from .types import Example, is_nospace

A_WORDS = 100
T_WORDS = 100
D_WORDS = 100
SEG_WORDS = 100
CJK_LANGS = {"zh", "ja"}

_CJK = "぀-ヿ㐀-䶿一-鿿豈-﫿"
_WORD_RE = re.compile(r"\S+")
_WORD_CJK_RE = re.compile(rf"[{_CJK}]|[^\s{_CJK}]+")
_PARA_RE = re.compile(r"\n\s*\n")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def word_spans(text: str, lang: str = "") -> list[tuple[int, int]]:
    """(start, end) of each 'word' of the text: a maximal non-whitespace run; for zh/ja and the other languages written without
    spaces (Thai, Lao, Khmer, Burmese, Tibetan, ...) each character of their script is a word."""
    rx = _WORD_CJK_RE if is_nospace(lang) else _WORD_RE
    return [m.span() for m in rx.finditer(text)]


def last_words(text: str, n: int, lang: str = "") -> str:
    """The text from the n-th word from the end to the end ('' if n <= 0)."""
    if n <= 0:
        return ""
    sp = word_spans(text, lang)
    if not sp:
        return ""
    return text[sp[max(0, len(sp) - n)][0]:sp[-1][1]]


def segments(text: str, lang: str = "", size: int = SEG_WORDS) -> list[tuple[int, int]]:
    """Character ranges (start of the first word to the end of the last word) of chunks of at most `size` words."""
    sp = word_spans(text, lang)
    return [(sp[i][0], sp[min(i + size, len(sp)) - 1][1]) for i in range(0, len(sp), size)]


def nwords(text: str, lang: str = "") -> int:
    return len(word_spans(text, lang))


def read_jsonl(path: str) -> Iterator[dict]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def _norm(s: str) -> str:
    return unicodedata.normalize("NFC", s)


# ---- candidates: cheap records (no tokenization), sampled before the tokenizer runs -------------------------------------

def chat_candidates(path: str, split: str, ctx: str, lang: Optional[str] = None) -> Iterator[dict]:
    for r in read_jsonl(path):
        if split != "all" and r.get("split") != split:
            continue
        rl = r.get("lang", "other")
        if lang and rl not in lang.split(","):
            continue
        text = _norm((r.get("text") or "").strip())
        if not text:
            continue
        prev_agent = _norm(r.get("prev_agent") or "")
        prev_user = [_norm(u) for u in (r.get("prev_user") or [])]
        agent_all = last_words(prev_agent, A_WORDS, rl) if ctx in ("agent", "agent+user") else ""
        for si, (a, b) in enumerate(segments(text, rl)):
            seg = text[a:b]
            if si == 0:
                user = ""
                if ctx == "agent+user":
                    user = last_words("\n\n".join(prev_user), T_WORDS - nwords(seg, rl), rl)
            else:                              # later segment: the previous T words of the same message
                user = last_words(text[:a], T_WORDS, rl) if ctx == "agent+user" else ""
            yield dict(id=r["id"] if si == 0 else f"{r['id']}#{si}", surface="chat", lang=rl, agent_ctx=agent_all,
                       user_ctx=user, doc_ctx="", target=seg, ts=int(r.get("ts") or 0), split=r.get("split", ""),
                       meta=dict(session=r.get("session"), agent=r.get("agent"), source=r.get("source"), seg=si))


def _paragraph_candidates(rid, text, lang, surface, ts, split, ctx, min_words, meta, paras=None) -> Iterator[dict]:
    """Paragraphs of one text as targets. doc: doc_ctx = the D words before the target in the text; plain: the previous
    paragraph's last D words (for a later segment of a long paragraph: the D words before it in that paragraph)."""
    starts: list[int] = []
    if paras is None:
        text = _norm(text)
        pos, plist = 0, []
        for m in list(_PARA_RE.finditer(text)) + [None]:
            end = m.start() if m else len(text)
            if text[pos:end].strip():
                plist.append(text[pos:end])
                starts.append(pos)
            pos = m.end() if m else end
    else:
        plist = [_norm(p) for p in paras if p and p.strip()]
    for pi, ptxt in enumerate(plist):
        for si, (a, b) in enumerate(segments(ptxt, lang)):
            seg = ptxt[a:b]
            if nwords(seg, lang) < min_words:
                continue
            if ctx == "none":
                dctx = ""
            elif surface == "doc" and starts:
                dctx = last_words(text[:starts[pi] + a], D_WORDS, lang)
            elif si > 0:
                dctx = last_words(ptxt[:a], D_WORDS, lang)
            else:
                dctx = last_words(plist[pi - 1], D_WORDS, lang) if pi > 0 else ""
            yield dict(id=f"{rid}:{pi}" + (f"#{si}" if si else ""), surface=surface, lang=lang, agent_ctx="",
                       user_ctx="", doc_ctx=dctx, target=seg, ts=ts, split=split, meta=dict(meta, para=pi, seg=si))


def doc_candidates(path: str, split: str, ctx: str, min_words: int, lang: Optional[str] = None) -> Iterator[dict]:
    for r in read_jsonl(path):
        if split != "all" and r.get("split") != split:
            continue
        rl = r.get("lang") or "en"
        if lang and rl not in lang.split(","):
            continue
        yield from _paragraph_candidates(r["id"], r.get("text") or "", rl, "doc", int(r.get("ts") or 0),
                                         r.get("split", ""), ctx, min_words,
                                         dict(source=r.get("source"), author=r.get("author")))


PLAIN_SPLITS = ("all", "dev", "test")


def plain_part_ok(plain_split: str, idx) -> bool:
    """plain_split 'dev' keeps the paragraphs with an even article paragraph number (idx), 'test' the odd ones, 'all' all.
    A record without a numeric idx counts as test only when asked for 'test' or 'all' (it is never used for gates)."""
    if plain_split == "all":
        return True
    if plain_split not in PLAIN_SPLITS:
        raise ValueError(f"unknown plain split {plain_split!r}")
    if not isinstance(idx, int):
        return plain_split == "test"
    return (idx % 2 == 0) == (plain_split == "dev")


def plain_candidates(dirpath: str, ctx: str, min_words: int, lang: Optional[str] = None,
                     plain_split: str = "all") -> Iterator[tuple[str, dict]]:
    """Yields (lang, candidate) for every data/multi/<lang>.jsonl; plain_split dev|test keeps the even|odd `idx`
    paragraphs only (the gate is fitted on dev, the test is scored on test), all keeps every one."""
    if not os.path.isdir(dirpath):
        return
    for fn in sorted(os.listdir(dirpath)):
        if not fn.endswith(".jsonl"):
            continue
        fl = fn[:-6]
        if lang and fl not in lang.split(","):
            continue
        for r in read_jsonl(os.path.join(dirpath, fn)):
            rl = r.get("lang") or fl
            if not plain_part_ok(plain_split, r.get("idx")):
                continue
            paras = r.get("paragraphs")
            if isinstance(r.get("prev"), str) or "prev" in r:
                # one paragraph with the article's previous paragraph as its context (data/multi.py)
                prev = _norm(r.get("prev") or "")
                gen = _paragraph_candidates(r["id"], r.get("text") or "", rl, "plain", 0, "test", ctx, min_words, {},
                                            paras=([prev] if prev else []) + [r.get("text") or ""])
                gen = (c for c in gen if c["meta"]["para"] == (1 if prev else 0))
                gen = (dict(c, id=r["id"] + (f"#{c['meta']['seg']}" if c["meta"]["seg"] else "")) for c in gen)
            elif isinstance(paras, list) and paras:
                gen = _paragraph_candidates(r["id"], "\n\n".join(paras), rl, "plain", 0, "test", ctx, min_words,
                                            {}, paras=paras)
            else:
                gen = _paragraph_candidates(r["id"], r.get("text") or "", rl, "plain", 0, "test", ctx, min_words, {})
            for c in gen:
                yield rl, c


def flores_candidates(dirpath: str, split: str, ctx: str, min_words: int, lang: Optional[str] = None) -> Iterator[tuple[str, dict]]:
    """Yields (lang, candidate) for every data/flores/<lang>.jsonl sentence of the split (dev | test = devtest | all); the
    context is the last D words of the article's earlier sentences (the file keeps the sentences in article order)."""
    if not os.path.isdir(dirpath):
        return
    want = {"dev": ("dev",), "test": ("devtest",), "devtest": ("devtest",), "all": ("dev", "devtest")}.get(split)
    if want is None:
        raise ValueError(f"flores split must be dev, test or all, not {split!r}")
    langs = set(lang.split(",")) if lang else None
    for fn in sorted(os.listdir(dirpath)):
        if not fn.endswith(".jsonl"):
            continue
        fl = fn[:-6]
        if langs and fl not in langs and fl.split("_")[0] not in langs:
            continue
        hist: list[str] = []
        art = None
        for r in read_jsonl(os.path.join(dirpath, fn)):
            key = (r.get("split"), r.get("article"))
            if key != art:
                art, hist = key, []
            text = _norm(r.get("text") or "")
            if r.get("split") in want and nwords(text, fl) >= min_words:
                dctx = last_words(" ".join(hist), D_WORDS, fl) if (hist and ctx != "none") else ""
                yield fl, dict(id=r["id"], surface="flores", lang=fl, agent_ctx="", user_ctx="", doc_ctx=dctx, target=text,
                               ts=0, split=r.get("split", ""), meta=dict(article=r.get("article"), idx=r.get("idx")))
            hist.append(text)
            if len(hist) > D_WORDS:
                hist = hist[-D_WORDS:]


def build_example(c: dict, tok) -> Example:
    enc = tok(c["target"], add_special_tokens=False, return_offsets_mapping=True)
    return Example(id=c["id"], surface=c["surface"], lang=c["lang"], agent_ctx=c["agent_ctx"], user_ctx=c["user_ctx"],
                   doc_ctx=c["doc_ctx"], target=c["target"], target_ids=list(enc["input_ids"]),
                   offsets=[tuple(o) for o in enc["offset_mapping"]], ts=c["ts"], split=c["split"], meta=c["meta"])


def load_examples(tok, split: str = "test", surface: str = "chat", ctx: str = "agent+user", limit: int = 0,
                  seed: int = 0, lang: Optional[str] = None, data_dir: str = DATA_DIR, min_words: int = 4,
                  max_target_tokens: int = 0, plain_split: str = "all") -> list[Example]:
    """Examples for one or several surfaces ('chat', 'doc', 'plain', 'all' or a comma list).

    limit: at most this many examples per surface (per language for 'plain' and 'flores'), chosen with random.Random(seed) after
    sorting by id, so the same arguments always give the same examples. 0 = all.
    plain_split: for 'plain' only, 'dev' = paragraphs with an even `idx`, 'test' = odd ones, 'all' = every one."""
    surfaces = ["chat", "doc", "plain"] if surface == "all" else surface.split(",")
    rng = random.Random(seed)
    out: list[Example] = []

    def pick(cands: list[dict]) -> list[dict]:
        cands.sort(key=lambda c: c["id"])
        if limit and len(cands) > limit:
            cands = [cands[i] for i in sorted(rng.sample(range(len(cands)), limit))]
        return cands

    for s in surfaces:
        if s == "chat":
            p = os.path.join(data_dir, "user_msgs.jsonl")
            cands = list(chat_candidates(p, split, ctx, lang)) if os.path.exists(p) else []
            groups = [cands]
        elif s == "doc":
            p = os.path.join(data_dir, "other_texts.jsonl")
            cands = list(doc_candidates(p, split, ctx, min_words, lang)) if os.path.exists(p) else []
            groups = [cands]
        elif s == "plain":
            by_lang: dict[str, list[dict]] = {}
            for rl, c in plain_candidates(os.path.join(data_dir, "multi"), ctx, min_words, lang, plain_split):
                by_lang.setdefault(rl, []).append(c)
            groups = [by_lang[k] for k in sorted(by_lang)]
        elif s == "flores":
            by_lang = {}
            for rl, c in flores_candidates(os.path.join(data_dir, "flores"), split, ctx, min_words, lang):
                by_lang.setdefault(rl, []).append(c)
            groups = [by_lang[k] for k in sorted(by_lang)]
        else:
            raise ValueError(f"unknown surface {s!r}")
        for g in groups:
            for c in pick(g):
                ex = build_example(c, tok)
                if not ex.target_ids or (max_target_tokens and len(ex.target_ids) > max_target_tokens):
                    continue
                out.append(ex)
    return out


def add_data_args(ap, plain_split: bool = False) -> None:
    """The command-line options every script shares for choosing examples (plain_split=True adds --plain-split; the
    script must then pass `plain_split=a.plain_split` to load_examples)."""
    if plain_split:
        ap.add_argument("--plain-split", default="all", choices=list(PLAIN_SPLITS),
                        help="plain surface only: dev = paragraphs with an even idx, test = odd idx, all = every paragraph")
    ap.add_argument("--split", default="test", help="train|dev|test|all (plain: its whole files unless --plain-split is dev or test; flores: dev = FLORES dev, test = devtest)")
    ap.add_argument("--surface", default="chat", help="chat|doc|plain|flores|all or a comma list (all = chat, doc, plain)")
    ap.add_argument("--lang", default=None, help="only these languages (comma list)")
    ap.add_argument("--ctx", default="agent+user", choices=["none", "agent", "agent+user"])
    ap.add_argument("--limit", type=int, default=0, help="examples per surface (per language for plain and flores); 0 = all")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--data", default=DATA_DIR)
    ap.add_argument("--min-words", type=int, default=4, help="shortest paragraph used as a doc/plain target")
