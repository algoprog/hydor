#!/usr/bin/env python3
"""Checks N random user messages of data/user_msgs.jsonl against the raw transcripts (an independent reader).
For each: (1) the typed text is found in a raw user entry (and nothing but injected wrappers/pastes was removed),
(2) prev_agent's tail equals the text of the assistant blocks right before that entry in the raw file.
    .venv/bin/python data/validate.py [N] [seed]"""
import json, random, re, sqlite3, sys, os
from pathlib import Path

OUT = Path(__file__).resolve().parent
N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20261118
U = [json.loads(l) for l in open(OUT / "user_msgs.jsonl")]
db = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser("~/.web-agent/web-agent.db"), uri=True)
path_of = dict(db.execute("select key, path from sessions"))


def events(path, agent):
    """[(kind, text)]: 'u' typed-looking user entries (raw, uncleaned), 'a' assistant text blocks, in file order."""
    ev = []
    for line in open(path, errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if agent == "claude":
            t = d.get("type")
            if t == "user":
                c = (d.get("message") or {}).get("content")
                if isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
                    continue
                text = c if isinstance(c, str) else "\n".join(b.get("text", "") for b in (c or []) if isinstance(b, dict) and b.get("type") == "text")
                ev.append(("u", text))
            elif t == "attachment":
                a = d.get("attachment") or {}
                if a.get("type") == "queued_command" and (a.get("commandMode") == "prompt" or a.get("humanTurn")):
                    p = a.get("prompt")
                    ev.append(("u", p if isinstance(p, str) else "\n".join(b.get("text", "") for b in (p or []) if isinstance(b, dict) and b.get("type") == "text")))
            elif t == "assistant":
                for b in (d.get("message") or {}).get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "text" and (b.get("text") or "").strip():
                        ev.append(("a", b["text"].strip()))
        else:
            if d.get("type") == "response_item":
                p = d.get("payload") or {}
                if p.get("type") == "message" and p.get("role") in ("user", "assistant"):
                    text = "\n".join(b.get("text", "") for b in p.get("content") or [] if isinstance(b, dict))
                    ev.append(("u" if p["role"] == "user" else "a", text.strip()))
    return ev


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


random.seed(seed)
sample = random.sample([u for u in U if u["session"] in path_of], N)
res = []
for u in sample:
    ev = events(path_of[u["session"]], u["agent"] if u["agent"] in ("claude", "codex") else "claude")
    typed = norm(u["text"])
    hits = [i for i, (k, t) in enumerate(ev) if k == "u" and typed and typed in norm(t)]
    r = dict(id=u["id"], source=u["source"], found=bool(hits), text_exact=False, queued_while_working=False, wrapper_only_difference=False, prev_ok=None, note="")
    if not hits:
        r["note"] = "slash command or not found" if u.get("slash") else "not found"
        res.append(r)
        continue
    # the entry whose text is a closest match; prefer one whose previous assistant block matches
    best = None
    for i in hits:
        raw = ev[i][1]
        exact = norm(raw) == typed
        j = i - 1
        blocks = []
        while j >= 0 and ev[j][0] == "a":
            blocks.append(ev[j][1]); j -= 1
        if not blocks:  # a raw entry right after another user entry: the reply is further back
            while j >= 0 and ev[j][0] != "a":
                j -= 1
            while j >= 0 and ev[j][0] == "a":
                blocks.append(ev[j][1]); j -= 1
        blocks.reverse()
        a = norm(u["prev_agent"])
        prev_ok, dropped = False, 0
        # the index orders by the time the message was typed: a message typed while the agent still worked (queued) comes
        # before the agent's later blocks, so prev_agent may stop k blocks before the one that precedes it in the file
        for k in range(0, min(len(blocks), 8) + 1):
            b = norm("\n\n".join(blocks[: len(blocks) - k]))
            if (not a and not b) or (a and b.endswith(a[-200:])) or (b and a.endswith(b[-200:])):
                prev_ok, dropped = True, k
                break
        r["queued_while_working"] = r.get("queued_while_working", False) or (prev_ok and dropped > 0)
        cand = (prev_ok, exact, i, raw)
        if best is None or cand[:2] > best[:2]:
            best = cand
    r["prev_ok"], r["text_exact"] = best[0], best[1]
    if not best[1]:
        extra = norm(best[3]).replace(typed, "")
        r["wrapper_only_difference"] = True
        r["note"] = "raw entry also holds: " + re.sub(r"\S{40,}", "…", extra)[:80].strip() if len(extra) < 400 else "raw entry also holds %d more chars (context/paste)" % len(extra)
    res.append(r)

n = len(res)
found = sum(r["found"] for r in res)
exact = sum(r["text_exact"] for r in res)
ctx = sum(r["wrapper_only_difference"] for r in res)
prev = sum(1 for r in res if r["prev_ok"])
summary = dict(n=n, typed_text_found_in_raw=found, identical_to_raw_entry=exact, raw_entry_had_extra_wrapper_or_paste=ctx, prev_agent_matches_raw=prev, of_which_typed_while_agent_still_working=sum(1 for r in res if r.get("queued_while_working")),
               prev_agent_empty_in_both=sum(1 for r in res if r["found"] and r["prev_ok"] and not any(1 for u in sample if u["id"] == r["id"] and u["prev_agent"])), details=res)
(OUT / "validation.json").write_text(json.dumps(summary, indent=1))
print(json.dumps({k: v for k, v in summary.items() if k != "details"}))
for r in res:
    print(r["id"], r["source"], "found" if r["found"] else "MISSING", "exact" if r["text_exact"] else "extra", ("prev_ok_queued" if r.get("queued_while_working") else "prev_ok") if r["prev_ok"] else ("prev_BAD" if r["found"] else "-"), r["note"])
