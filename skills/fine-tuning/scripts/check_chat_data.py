#!/usr/bin/env python3
"""Check a fine-tuning dataset (JSONL) before training: format, roles, lengths, duplicates, leaks.

Standard library only (a real tokenizer is used when you pass --tokenizer and transformers is
installed). Rows may be conversational ({"messages": [{"role", "content"}, ...]}),
prompt-completion ({"prompt", "completion"}) or plain text ({"text"}), as TRL accepts them.

  python3 check_chat_data.py train.jsonl
  python3 check_chat_data.py train.jsonl --test test.jsonl --max-tokens 4096
  python3 check_chat_data.py train.jsonl --tokenizer Qwen/Qwen3-8B

It reports rows that are broken (bad JSON, no assistant reply, empty turns), length figures and
rows longer than --max-tokens, exact duplicates, and test rows that also appear in the training
data, exactly or sharing a run of --ngram words (13 by default). Exit code 1 when rows are broken.
"""
import argparse
import collections
import json
import re
import statistics
import sys

ROLES = {"system", "developer", "user", "assistant", "tool"}
WORD = re.compile(r"\w+", re.UNICODE)


def content_text(c):
    if c is None:
        return ""
    if isinstance(c, str):
        return c
    if isinstance(c, list):  # multimodal parts: keep the text ones
        return " ".join(p.get("text", "") for p in c if isinstance(p, dict))
    return str(c)


def row_parts(row):
    """(kind, full text, input-side text, problems)."""
    problems = []
    if "messages" in row:
        msgs = row["messages"]
        if not isinstance(msgs, list) or not msgs:
            return "messages", "", "", ["'messages' is empty or not a list"]
        texts, inputs, roles = [], [], []
        for i, m in enumerate(msgs):
            if not isinstance(m, dict) or "role" not in m:
                problems.append(f"message {i + 1} has no role")
                continue
            role = m["role"]
            roles.append(role)
            t = content_text(m.get("content"))
            if role not in ROLES:
                problems.append(f"message {i + 1} has an unknown role '{role}'")
            if not t.strip() and not (role == "assistant" and m.get("tool_calls")):
                problems.append(f"message {i + 1} ({role}) is empty")
            texts.append(t)
            if role != "assistant":
                inputs.append(t)
        if "assistant" not in roles:
            problems.append("no assistant reply: nothing to learn")
        elif roles[-1] != "assistant":
            problems.append("warning: ends with a non-assistant turn, which is not learned")
        if "system" in roles[1:]:
            problems.append("warning: a system message after the start")
        for x, y in zip(roles, roles[1:]):
            if x == y and x in ("user", "assistant"):
                problems.append(f"warning: two {x} turns in a row")
                break
        return "messages", "\n".join(texts), "\n".join(inputs), problems
    if "prompt" in row and "completion" in row:
        def side(v):
            return "\n".join(content_text(m.get("content")) for m in v) if isinstance(v, list) else content_text(v)
        p, c = side(row["prompt"]), side(row["completion"])
        if not c.strip():
            problems.append("the completion is empty")
        return "prompt-completion", p + "\n" + c, p, problems
    if "text" in row:
        t = content_text(row["text"])
        if not t.strip():
            problems.append("'text' is empty")
        return "text", t, t, problems
    return "unknown", "", "", ["no 'messages', 'prompt'/'completion' or 'text' field"]


def norm(t):
    return " ".join(WORD.findall(t.lower()))


def ngrams(words, n):
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def load(path, args, tok):
    rows, broken, kinds, lengths = [], [], collections.Counter(), []
    with open(path, encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                broken.append((ln, f"not valid JSON ({e.msg})"))
                continue
            if not isinstance(row, dict):
                broken.append((ln, "not a JSON object"))
                continue
            kind, full, inp, problems = row_parts(row)
            kinds[kind] += 1
            for pr in problems:
                broken.append((ln, pr))
            if tok is not None and kind == "messages":
                try:
                    n = len(tok.apply_chat_template(row["messages"], tokenize=True))
                except Exception:  # noqa: BLE001 - fall back to the rough count
                    n = len(full) // 4
            elif tok is not None:
                n = len(tok(full)["input_ids"])
            else:
                n = len(full) // 4  # rough: about 4 characters a token in English
            lengths.append(n)
            rows.append((ln, full, inp))
    return rows, broken, kinds, lengths


def main():
    p = argparse.ArgumentParser(description="Check a fine-tuning dataset before training.")
    p.add_argument("train", help="the training JSONL")
    p.add_argument("--test", help="a held-out JSONL to check for overlap with the training data")
    p.add_argument("--max-tokens", type=int, default=2048, help="the max_length you will train with (default 2048)")
    p.add_argument("--ngram", type=int, default=13, help="words in a shared run that counts as overlap (default 13)")
    p.add_argument("--tokenizer", help="a Hugging Face tokenizer for exact counts (needs transformers)")
    p.add_argument("--show", type=int, default=5, help="examples to show per finding (default 5)")
    a = p.parse_args()

    tok = None
    if a.tokenizer:
        try:
            from transformers import AutoTokenizer
            tok = AutoTokenizer.from_pretrained(a.tokenizer)
        except Exception as e:  # noqa: BLE001
            print(f"Could not load the tokenizer ({e}); using the rough count (characters / 4).")

    rows, broken, kinds, lengths = load(a.train, a, tok)
    how = "tokens" if tok is not None else "tokens, roughly (characters / 4)"
    print(f"{a.train}: {len(rows)} rows; " + ", ".join(f"{v} {k}" for k, v in kinds.items()))
    if len(kinds) > 1:
        print("  Mixed formats: use one format for the whole dataset.")

    errors = [(ln, m) for ln, m in broken if not m.startswith("warning")]
    warnings = [(ln, m[9:]) for ln, m in broken if m.startswith("warning")]
    for title, items in (("Problems", errors), ("Warnings", warnings)):
        if items:
            print(f"{title}: {len(items)}")
            for ln, m in items[: a.show]:
                print(f"  line {ln}: {m}")

    if lengths:
        q = statistics.quantiles(lengths, n=20) if len(lengths) >= 20 else [max(lengths)] * 19
        over = sum(n > a.max_tokens for n in lengths)
        print(f"Length in {how}: min {min(lengths)}, median {int(statistics.median(lengths))}, "
              f"95th percentile {int(q[18])}, max {max(lengths)}")
        if over:
            rows_are = "1 row is" if over == 1 else f"{over} rows are"
            print(f"  {rows_are} longer than --max-tokens {a.max_tokens}: cut in training (the end of a reply is lost).")

    seen, dups = {}, []
    for ln, full, _ in rows:
        k = norm(full)
        if k in seen:
            dups.append((ln, seen[k]))
        else:
            seen[k] = ln
    if dups:
        print(f"Exact duplicates: {len(dups)} " + ("row repeats" if len(dups) == 1 else "rows repeat") + " an earlier one")
        for ln, first in dups[: a.show]:
            print(f"  line {ln} repeats line {first}")

    if a.test:
        trows, tbroken, _, _ = load(a.test, a, tok)
        print(f"{a.test}: {len(trows)} rows" + (f", {len(tbroken)} with problems" if tbroken else ""))
        exact = [(ln, seen[norm(full)]) for ln, full, _ in trows if norm(full) in seen]
        # Index the (smaller) test side, then stream the training rows through it.
        index, short = collections.defaultdict(set), {}
        for ln, _full, inp in trows:
            words = norm(inp).split()
            if len(words) < a.ngram:
                if words:
                    short[" ".join(words)] = ln
                continue
            for g in ngrams(words, a.ngram):
                index[g].add(ln)
        hit = {}
        for tln, full, _ in rows:
            words = norm(full).split()
            for g in ngrams(words, a.ngram):
                for ln in index.get(g, ()):
                    hit.setdefault(ln, tln)
            joined = f" {' '.join(words)} "
            for s, ln in short.items():
                if f" {s} " in joined:
                    hit.setdefault(ln, tln)
        print(f"Test rows copied exactly in the training data: {len(exact)}")
        for ln, tln in exact[: a.show]:
            print(f"  test line {ln} = train line {tln}")
        print(f"Test rows whose question shares a {a.ngram}-word run with the training data: {len(hit)}")
        for ln, tln in sorted(hit.items())[: a.show]:
            print(f"  test line {ln} ~ train line {tln}")
        if exact or hit:
            print("  Remove these from the test set (or from training) before you trust its scores.")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
