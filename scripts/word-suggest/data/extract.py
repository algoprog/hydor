#!/usr/bin/env python3
"""Builds data/user_msgs.jsonl, agent_texts.jsonl, other_texts.jsonl and split.json (see SPEC.md, "Data").

Reads Hydor's database READ-ONLY (sqlite URI mode=ro). Raw transcripts are opened only for three narrow things the
index (chunk_text) cannot tell: cross-session messages (written by other agents, but indexed as plain user text),
slash commands (not indexed) and the tails of replies the index cut at 4000 characters. Everything stays in data/.

    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python data/extract.py
"""
import html as htmllib
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

DB = os.path.expanduser("~/.web-agent/web-agent.db")
OUT = Path(__file__).resolve().parent
DAY = 86400_000
CHUNK_CAP = 4000  # the indexer cuts every chunk at 4000 characters

# ---------------------------------------------------------------------------------------------------------------
# Which sessions did the user type in?

# Hydor writes a session's settings in app_sessions.extra. These say another part of Hydor started the session.
AGENT_EXTRA = {"parent", "stepUp", "stepJudged", "reported", "app", "automations", "research_child", "help"}
SCRIPTED_SOURCES = {"subagent", "exec"}  # Codex's own subagents; `codex exec` runs (scripts)

# What Hydor, other sessions and the programs put into the user's turn (never typed).
INJECTED = [
    r"^\[Reply from the (?:Hydor subagent|child session)",
    r"^\[The (?:Hydor subagent|child session)",
    r"^\[Swarm board",
    r"^\[Coordination note",
    r"^\[Cross-session",
    r"^\[[A-Z][^\]\n]{0,60} (?:finished|failed|started)\b",
    r"^Message from the session that started you",
    r"^<agent-message\b",
    r"^<send_user_message_question_reply>",
    r"^<task-notification",
    r"^<local-command",
    r"^<cross-session-message",
    r"^Another Claude session sent",
    r"^Caveat: The messages below",
    r"^\[Request interrupted",
    r"^<conversation-handoff",
    r"^Work reached its usage limit",
    r"^Work \d+ reached its usage limit",
    r"^\S+@\S+ reached its usage limit",
    r"^Continue where you left off\.?$",
    r"^<codex_internal_context",
    r"^<environment_context",
    r"^<user_action",
    r"^<turn_aborted",
]
INJECTED_RE = re.compile("|".join(INJECTED))

PASTED_RE = re.compile(r"<pasted_content\b[^>]*>[\s\S]*?(?:</pasted_content[^>]*>|\Z)")
WRAP_TAGS = ["system-reminder", "ide_selection", "ide_opened_file", "ide_diagnostics", "user-prompt-submit-hook",
             "local-command-caveat", "command-message", "command-name", "command-args", "local-command-stdout"]
WRAP_RE = re.compile(r"<(%s)>[\s\S]*?</\1>" % "|".join(WRAP_TAGS))
EXT_RE = re.compile(r"<(external_[a-z_]+)>[\s\S]*?</\1>")
IDE_RE = re.compile(r"^# (?:Context from my IDE setup|Files mentioned by the user|Files pasted by the user):[\s\S]*?\n## My request(?: for Codex)?:[ \t]*\n", re.M)
IDE_ONLY_RE = re.compile(r"^# (?:Context from my IDE setup|Files mentioned by the user|Files pasted by the user):")


def clean_user(text: str) -> str:
    """The typed part of an indexed user chunk ('' when nothing typed is left)."""
    t = text.strip()
    t = PASTED_RE.sub("", t)
    t = WRAP_RE.sub("", t)
    t = EXT_RE.sub("", t)
    t = t.strip()
    m = IDE_RE.match(t)
    if m:
        t = t[m.end():].strip()
    elif IDE_ONLY_RE.match(t):
        return ""
    if INJECTED_RE.match(t):
        return ""
    return t


# ---------------------------------------------------------------------------------------------------------------
# Language by script and simple cues

SW = {
    "en": "the and to of is it in that for you this with not are be have can do what how why we on as if so but or just my me i it's don't i'm there from should would could will also they when then which here your about".split(),
    "de": "der die das und ist nicht ein eine ich du wir mit für auf den dem zu von auch aber wie was wenn bitte mach machen kannst dass noch nur schon oder sind wird werden kein ja nein hier mal dann es sie er".split(),
    "fr": "le la les des est une un et que pour pas dans vous nous je tu il elle avec sur qui ce cette mais ou comment peux pouvez faire fais merci aussi être avoir sont très bien oui non au aux du".split(),
    "es": "el los las del una un y que para por con no es en lo se su como pero más puedes puedo hacer haz gracias también está están muy sí hola qué cómo cuál donde".split(),
}
SWS = {k: set(v) for k, v in SW.items()}
GREEK = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]")
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
KANA = re.compile(r"[\u3040-\u30ff]")
HANGUL = re.compile(r"[\uac00-\ud7af]")
CYR = re.compile(r"[\u0400-\u04ff]")
LATIN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]")
URL_RE = re.compile(r"https?://\S+|\S+@\S+\.\S+|(?:/[\w.\-]+){2,}")


def detect_lang(text: str) -> str:
    t = URL_RE.sub(" ", text)
    g, c, k, h, cy, la = (len(r.findall(t)) for r in (GREEK, CJK, KANA, HANGUL, CYR, LATIN))
    letters = g + c + k + h + cy + la
    if letters == 0:
        return "other"
    if g / letters > 0.3:
        return "el"
    if (k + c) / letters > 0.2 and k > 0:
        return "ja"
    if c / letters > 0.2:
        return "zh"
    if h / letters > 0.3 or cy / letters > 0.3:
        return "other"
    if la / max(len(t.strip()), 1) < 0.3:
        return "other"
    words = re.findall(r"[a-zà-öø-ÿ'’]+", t.lower())
    score = {l: sum(1 for w in words if w in s) for l, s in SWS.items()}
    if re.search(r"[äöüß]", t.lower()):
        score["de"] += 1
    if re.search(r"[éèêàçùâîô]", t.lower()):
        score["fr"] += 1
    if re.search(r"[ñ¿¡áíóú]", t.lower()):
        score["es"] += 1
    best = max(("de", "fr", "es"), key=lambda l: score[l])
    if score[best] >= 2 and score[best] > score["en"]:
        return best
    if score[best] >= 1 and score["en"] == 0 and len(words) <= 4 and best != "es":
        return best if re.search(r"[äöüßéèêàçñ¿¡]", t.lower()) else "en"
    return "en"


# ---------------------------------------------------------------------------------------------------------------

def connect():
    c = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=5)
    c.execute("pragma query_only = 1")
    return c


def load_sessions(c):
    """sessions plus the signs that a session was not typed in. Returns {key: dict}."""
    started_by_other = defaultdict(set)  # key -> reasons
    for (k,) in c.execute("select key from app_runs where key is not null"):
        started_by_other[k].add("app_run")
    for (k,) in c.execute("select key from task_runs where key is not null"):
        started_by_other[k].add("task_run")
    for (k,) in c.execute("select last_key from tasks where last_key is not null"):
        started_by_other[k].add("task")
    for (data,) in c.execute("select data from session_notes where kind = 'child'"):
        try:
            ck = json.loads(data).get("child")
        except Exception:
            ck = None
        if ck:
            started_by_other[ck].add("child_note")
    out = {}
    q = """select s.key, s.agent, s.source, s.parent_key, s.hidden, s.cwd, s.created_at, s.path, s.first_prompt, s.user_msgs,
                  a.key is not null, a.created_by_app, a.extra, a.fork_from, a.handoff_from
           from sessions s left join app_sessions a on a.key = s.key"""
    for (key, agent, source, parent, hidden, cwd, created, path, first, um, has_app, by_app, extra, fork_from, handoff_from) in c.execute(q):
        try:
            ex = json.loads(extra) if extra else {}
        except Exception:
            ex = {}
        why = set(started_by_other.get(key, ()))
        if parent:
            why.add("parent_key")
        if source in SCRIPTED_SOURCES:
            why.add("source_" + source)
        for k in AGENT_EXTRA:
            if k in ex:
                why.add("extra_" + k)
        if source == "sdk-cli" and not has_app:
            why.add("sdk_cli_without_app_row")  # started by a script or test through the agent SDK, not by Hydor's page
        if source is None and not has_app:
            why.add("no_source")
        if (cwd or "").startswith(("/tmp/", "/dev/shm/")) and source in ("sdk-cli", None):
            why.add("scratch_cwd")
        out[key] = dict(key=key, agent=agent, source=source or "unknown", parent=parent, cwd=cwd, created=created, path=path,
                        user_msgs=um, why=sorted(why), typed=not why, extra=ex, fork_from=fork_from, handoff_from=handoff_from)
    return out


# ---------------------------------------------------------------------------------------------------------------
# Raw transcripts: only what the index lacks.

PEER_RE = re.compile(r"^<cross-session-message\b[^>]*>([\s\S]*?)</cross-session-message>")


def iso_ms(s):
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return None


def raw_scan(path, agent):
    """(peer_prefixes: set, slash: [(ts, text)], full_by_prefix: {prefix: full text}) from one transcript."""
    peers, slash, full = set(), [], {}
    try:
        f = open(path, errors="replace")
    except OSError:
        return peers, slash, full
    with f:
        for line in f:
            if len(line) < 40:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if agent == "claude":
                t = d.get("type")
                msg = d.get("message") or {}
                content = msg.get("content")
                if t == "user" or t == "attachment":
                    if t == "attachment":
                        a = d.get("attachment") or {}
                        pr = a.get("prompt")
                        content = pr if a.get("type") == "queued_command" else None
                    text = content if isinstance(content, str) else "\n".join(b.get("text", "") for b in (content or []) if isinstance(b, dict) and b.get("type") == "text")
                    if "<cross-session-message" in text:
                        s = re.sub(r"^Another Claude session sent a message[^\n]*\n", "", text.strip()).strip()
                        m = PEER_RE.match(s)
                        if m:
                            peers.add(m.group(1).strip()[:300])
                    m = re.search(r"<command-name>([^<]*)</command-name>", text)
                    if t == "user" and m and not d.get("isMeta"):
                        args = re.search(r"<command-args>([\s\S]*?)</command-args>", text)
                        cmd = (m.group(1).strip() + (" " + args.group(1).strip() if args and args.group(1).strip() else "")).strip()
                        slash.append((iso_ms(d.get("timestamp") or ""), cmd))
                elif t == "assistant":
                    for b in content or []:
                        if isinstance(b, dict) and b.get("type") == "text":
                            tx = (b.get("text") or "").strip()
                            if len(tx) > CHUNK_CAP:
                                full[tx[:300]] = tx
            elif agent == "codex" and d.get("type") == "response_item":
                p = d.get("payload") or {}
                if p.get("type") == "message" and p.get("role") == "assistant":
                    for b in p.get("content") or []:
                        tx = (b.get("text") or "").strip() if isinstance(b, dict) else ""
                        if len(tx) > CHUNK_CAP:
                            full[tx[:300]] = tx
    return peers, slash, full


# ---------------------------------------------------------------------------------------------------------------

def main():
    c = connect()
    sess = load_sessions(c)
    stat = Counter()

    rows = c.execute("select id, key, kind, ts, text from chunk_text where kind in ('user','assistant') order by key, id").fetchall()
    by_key = defaultdict(list)
    for r in rows:
        by_key[r[1]].append(r)

    users, agents = [], []
    seen_user, seen_agent = {}, {}  # (ts, text) -> session created_at, to drop copies made by forks / handoffs
    recover = 0

    # earliest session first, so the original keeps the message and the fork's copy goes
    order = sorted(by_key, key=lambda k: (sess[k]["created"] or 0, k) if k in sess else (0, k))
    for key in order:
        s = sess.get(key)
        if not s:
            continue
        events = by_key[key]
        need_raw = s["typed"] and os.path.exists(s["path"] or "")
        peers, slash, full = (raw_scan(s["path"], s["agent"]) if need_raw else (set(), [], {}))
        # sequence of ("u", ts, text, id) / ("a", ts, text, id), merged with slash commands by time
        seq = []
        for (cid, _k, kind, ts, text) in events:
            seq.append((ts, cid, "u" if kind == "user" else "a", text))
        for ts, cmd in slash:
            if ts is not None:
                seq.append((ts, 10**18, "s", cmd))
        seq.sort(key=lambda x: (x[0] if x[0] is not None else 0, x[1]))
        if s["agent"] == "acp":
            # ACP agents stream a reply in pieces that the index stores one by one ("Mass Amherst", ", in", ...): one reply again
            merged = []
            for it in seq:
                if it[2] == "a" and merged and merged[-1][2] == "a":
                    merged[-1] = (merged[-1][0], merged[-1][1], "a", (merged[-1][3] + " " + it[3]).replace(" ,", ",").replace(" .", "."))
                else:
                    merged.append(it)
            seq = merged

        prior_typed = []
        last_a = []  # consecutive assistant chunks since the last user row
        prev_agent_blocks = []
        for ts, cid, kind, text in seq:
            if kind == "a":
                txt, cut = text, len(text) >= CHUNK_CAP - 5
                if cut and full:
                    f = full.get(txt[:300])
                    if f:
                        txt, cut = f, False
                        recover += 1
                last_a.append((txt, cut))
                # agent_texts: every session's prose, once
                kk = (ts, text[:200], len(text))
                if kk in seen_agent and seen_agent[kk] != key:
                    stat["agent_dup_dropped"] += 1
                    continue
                seen_agent[kk] = key
                agents.append(dict(id="a%d" % cid, session=key, ts=ts, text=txt.strip(), agent=s["agent"], source=s["source"], typed_session=s["typed"],
                                   cut=cut))
                continue
            # a user row or a slash command: the reply block before it is whatever assistant chunks came since the last user row
            if last_a:
                prev_agent_blocks = last_a
                last_a = []
            if not s["typed"]:
                if kind == "u":
                    stat["user_rows_in_sessions_not_typed_in:" + s["why"][0]] += 1
                continue
            stat["user_rows_in_typed_sessions"] += 1
            if kind == "s":
                typed = text
            else:
                if text.strip()[:300] in peers:
                    stat["dropped_peer_message"] += 1
                    continue
                typed = clean_user(text)
                if not typed:
                    stat["dropped_injected_or_empty"] += 1
                    continue
                if len(text) >= CHUNK_CAP - 5:
                    stat["dropped_longer_than_4000"] += 1  # cut by the index; likely a paste or a brief
                    continue
            kk = (ts, typed)
            if kk in seen_user and seen_user[kk] != key:
                stat["dropped_copy_in_fork"] += 1
                continue
            seen_user[kk] = key
            users.append(dict(id=("u%d" % cid) if kind != "s" else ("s%d-%s" % (ts, key[-4:])), session=key, agent=s["agent"], source=s["source"], ts=ts,
                              text=typed, prev_agent="\n\n".join(b[0] for b in prev_agent_blocks).strip(), prev_agent_cut=bool(prev_agent_blocks and prev_agent_blocks[-1][1]),
                              prev_user=list(prior_typed),
                              slash=(kind == "s")))
            prior_typed.append(typed)
    stat["assistant_tails_recovered_from_raw"] = recover

    users.sort(key=lambda m: (m["ts"], m["id"]))
    # ---- split by time
    last = max(m["ts"] for m in users)
    test_days, dev_days = 14, 7
    while True:
        t_test = last - test_days * DAY
        t_dev = t_test - dev_days * DAY
        n_test = sum(1 for m in users if m["ts"] > t_test)
        n_dev = sum(1 for m in users if t_dev < m["ts"] <= t_test)
        grew = False
        if n_test < 600:
            test_days += 7
            grew = True
        if n_dev < 300:
            dev_days += 7
            grew = True
        if not grew:
            break
    # (the boundaries are applied to everything by ts)
    def split_of(ts):
        if ts is None:
            return "train"
        return "test" if ts > t_test else "dev" if ts > t_dev else "train"

    for m in users:
        m["split"] = split_of(m["ts"])
        m["lang"] = detect_lang(m["text"])
        m["words"] = len(m["text"].split())
    for a in agents:
        a["split"] = split_of(a["ts"])
        a["lang"] = detect_lang(a["text"][:2000])

    # ---- other texts
    others = other_texts(c)
    for o in others:
        o["split"] = split_of(o["ts"])

    def dump(name, items, fields):
        with open(OUT / name, "w") as f:
            for it in items:
                f.write(json.dumps({k: it[k] for k in fields if k in it}, ensure_ascii=False) + "\n")

    dump("user_msgs.jsonl", users, ["id", "session", "agent", "source", "ts", "split", "lang", "text", "prev_agent", "prev_user", "slash", "prev_agent_cut"])
    dump("agent_texts.jsonl", agents, ["id", "session", "ts", "split", "text", "agent", "source", "typed_session", "cut"])
    dump("other_texts.jsonl", others, ["id", "source", "ts", "split", "author", "text", "title"])

    counts = {}
    for name, items in (("user_msgs", users), ("agent_texts", agents), ("other_texts", others)):
        cc = Counter(i["split"] for i in items)
        counts[name] = {k: cc.get(k, 0) for k in ("train", "dev", "test")}
    ms = lambda t: datetime.fromtimestamp(t / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    split = dict(rule="test = last %d days of user messages, dev = the %d days before, train = earlier; the same boundaries by ts for agent_texts and other_texts (undated other texts: train)" % (test_days, dev_days),
                 last_user_msg_ts=last, test_from_ts=t_test, dev_from_ts=t_dev, test_days=test_days, dev_days=dev_days,
                 test_from=ms(t_test), dev_from=ms(t_dev), last_user_msg=ms(last), counts=counts,
                 extraction=dict(stat))
    (OUT / "split.json").write_text(json.dumps(split, indent=2))
    print(json.dumps(split, indent=2))
    # session classification, for the stats script
    with open(OUT / "sessions_typed.json", "w") as f:
        json.dump({k: dict(typed=v["typed"], why=v["why"], agent=v["agent"], source=v["source"]) for k, v in sess.items()}, f)


# ---------------------------------------------------------------------------------------------------------------
# Other texts: notes, wiki, pages, knowledge, project instructions

class _Text(HTMLParser):
    SKIP = {"script", "style", "head", "svg", "noscript"}
    BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article", "ul", "ol", "table", "blockquote"}

    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


def html_text(h):
    p = _Text()
    try:
        p.feed(h)
    except Exception:
        pass
    return paras("".join(p.out))


def paras(t):
    t = htmllib.unescape(t)
    lines = [re.sub(r"[ \t\u00a0]+", " ", l).strip() for l in t.split("\n")]
    return "\n\n".join(l for l in lines if l)


def tex_text(src):
    m = re.search(r"\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|\Z)", src)
    b = m.group(1) if m else src
    b = re.sub(r"%.*", "", b)
    b = re.sub(r"\\begin\{(?:tikzpicture|figure|table|tabular|equation|align|lstlisting|verbatim)\*?\}[\s\S]*?\\end\{(?:tikzpicture|figure|table|tabular|equation|align|lstlisting|verbatim)\*?\}", " ", b)
    b = re.sub(r"\$[^$]*\$", " ", b)
    b = re.sub(r"\\(?:section|subsection|subsubsection|paragraph|textbf|textit|emph|texttt|textsc|item)\*?\s*(?:\[[^\]]*\])?\{?", "\n", b)
    b = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?", " ", b)
    b = re.sub(r"[{}\\]", "", b)
    return paras(re.sub(r"\n\s*\n", "\n", b))


def json_paras(o, out):
    if isinstance(o, dict):
        if isinstance(o.get("runs"), list):
            out.append("".join(r.get("t", "") for r in o["runs"] if isinstance(r, dict)))
        for k, v in o.items():
            if k == "runs":
                continue
            if k in ("text", "title", "notes", "what", "intro", "tip", "warning", "label", "caption", "adapt", "name") and isinstance(v, str):
                out.append(v)
            else:
                json_paras(v, out)
    elif isinstance(o, list):
        for v in o:
            json_paras(v, out)


def page_text(kind, body):
    if kind == "tex":
        return tex_text(body)
    if kind in ("doc", "slides", "sheet", "board", "diagram"):
        try:
            d = json.loads(body)
        except Exception:
            return ""
        out = []
        if kind == "sheet":
            for sh in d.get("sheets", []):
                for row in (sh.get("cells") or {}).values() if isinstance(sh.get("cells"), dict) else []:
                    pass
            def walk(o):
                if isinstance(o, dict):
                    v = o.get("v")
                    if isinstance(v, str) and len(v.split()) >= 3:
                        out.append(v)
                    for x in o.values():
                        walk(x)
                elif isinstance(o, list):
                    for x in o:
                        walk(x)
            walk(d)
        else:
            json_paras(d, out)
        return paras("\n".join(x for x in out if x and x.strip()))
    if kind == "notebook":
        try:
            d = json.loads(body)
        except Exception:
            return ""
        return paras("\n\n".join("".join(cell.get("source", [])) if isinstance(cell.get("source"), list) else str(cell.get("source", ""))
                                 for cell in d.get("cells", []) if cell.get("cell_type") == "markdown"))
    return html_text(body)


def other_texts(c):
    out = []
    n = 0

    def add(source, ts, author, text, title=None):
        nonlocal n
        text = (text or "").strip()
        if len(text) < 20:
            return
        n += 1
        out.append(dict(id="o%d" % n, source=source, ts=ts, author=author, text=text, title=title))

    # memory notes: `source` is 'agent' (an agent's remember call) or 'auto' (Hydor's own notes from sessions): never typed by the user
    for (eid, scope, kind, status, text, created, source, title) in c.execute("select id, scope, kind, status, text, created_at, source, title from memory_entries where status = 'active'"):
        add("memory_" + kind, created, "agent", text, title)
    # project instructions typed in a project's settings (could also be set through the API: so 'unknown')
    for (sid, data, created) in c.execute("select id, data, created_at from spaces"):
        try:
            d = json.loads(data)
        except Exception:
            continue
        if d.get("instructions"):
            add("project_instructions", created, "unknown", d["instructions"], d.get("name"))
    # pages: the newest version of each; author from how that version was saved
    for (pid, title, kind, by, body, created) in c.execute(
            "select p.id, p.title, p.kind, pv.by, pv.html, pv.created_at from pages p join page_versions pv on pv.page_id = p.id and pv.version = p.version"):
        t = page_text(kind, body)
        add("page_" + (kind or "html"), created, "agent" if by == "agent" else "unknown", t, title)
    # wiki articles (Hydor's wiki memory: written by its digest agents)
    seen_paths = set()
    for (space, d) in c.execute("select space, dir from wiki_project_dirs"):
        pass
    # The wiki memory's folder (Settings → Memory → Wiki memory): WIKI_DIR, else the app's first default.
    for base in {Path(os.path.expanduser(os.environ.get("WIKI_DIR", "~/Hydor/.wiki"))) / "projects"}:
        if not base.exists():
            continue
        for p in sorted(base.glob("*/wiki/**/*.md")):
            rel = p.relative_to(base).parts
            if ".history" in rel or p in seen_paths:
                continue
            seen_paths.add(p)
            raw = p.read_text(errors="replace")
            raw = re.sub(r"\A---\n[\s\S]*?\n---\n", "", raw)
            add("wiki", int(p.stat().st_mtime * 1000), "agent", raw, p.stem)
    # knowledge documents the user added (kb_docs rows whose file is not a wiki file)
    for (path, title, fmt, mtime) in c.execute("select path, title, format, mtime from kb_docs"):
        if "/.wiki/" in path or Path(path) in seen_paths:
            continue
        try:
            body = Path(path).read_text(errors="replace")
        except OSError:
            continue
        add("knowledge", int(mtime * 1000) if mtime < 1e11 else int(mtime), "unknown", body, title)
    return out


if __name__ == "__main__":
    main()
