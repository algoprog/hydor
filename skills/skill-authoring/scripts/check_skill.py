#!/usr/bin/env python3
"""Check a skill's SKILL.md: frontmatter, name, description, triggers, size, and the files it mentions.

Usage:
  python3 check_skill.py path/to/skill-folder        (or the SKILL.md itself; several paths allowed)

Prints ERROR and WARN lines, then a summary. Exit code 1 when there is any error, 0 otherwise.
Standard library only; if PyYAML is installed, the frontmatter is also parsed as strict YAML.
"""

import os
import re
import sys

NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SECRET = re.compile(
    r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bsk-ant-[\w-]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"
    r"|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_\w{40,}|\bxox[abposr]-[\w-]{10,}|\bAIza[\w-]{35}\b"
    r"|\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}|\bhf_[A-Za-z0-9]{30,}\b|\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}"
)
MAX_CHARS = 20_000


def unquote(v: str) -> str:
    v = v.strip()
    if len(v) > 1 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def inline_list(v: str) -> list[str]:
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1]
    items = re.findall(r'\s*("(?:[^"\\]|\\.)*"|\'(?:[^\']|\'\')*\'|[^,]+)\s*(?:,|$)', v)
    return [unquote(i) for i in items if i.strip()]


def frontmatter(text: str) -> tuple[dict, list[str], str] | None:
    m = re.match(r"---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", text, re.S)
    if not m:
        return None
    raw: dict[str, str] = {}
    lists: dict[str, list[str]] = {}
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        kv = re.match(r"^([A-Za-z_][\w-]*):[ \t]*(.*)$", lines[i])
        i += 1
        if not kv:
            continue
        key, value = kv.group(1), kv.group(2).strip()
        if not value or re.fullmatch(r"[|>][-+]?", value):
            block = []
            while i < len(lines) and (re.match(r"^\s+\S", lines[i]) or re.match(r"^-\s", lines[i])):
                block.append(lines[i].strip())
                i += 1
            if block and all(b.startswith("- ") for b in block):
                lists[key] = [unquote(b[2:]) for b in block]
                continue
            value = ("\n" if value.startswith("|") else " ").join(block)
        raw[key] = value
    triggers = lists.get("triggers") or (inline_list(raw["triggers"]) if raw.get("triggers") else [])
    return raw, triggers, text[m.end():]


def check(path: str) -> tuple[int, int]:
    if os.path.isdir(path):
        path = os.path.join(path, "SKILL.md")
    folder = os.path.dirname(os.path.abspath(path))
    errors = warnings = 0

    def error(msg: str) -> None:
        nonlocal errors
        errors += 1
        print(f"  ERROR {msg}")

    def warn(msg: str) -> None:
        nonlocal warnings
        warnings += 1
        print(f"  WARN  {msg}")

    print(path)
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        error(f"cannot read it: {e}")
        return errors, warnings

    if not text.startswith("---"):
        error("the first line must be --- (the frontmatter comes first)")
    parsed = frontmatter(text)
    if parsed is None:
        error("no frontmatter: start with ---, the fields, then --- on its own line")
        return errors, warnings
    raw, triggers, body = parsed

    try:
        import yaml  # optional

        block = re.match(r"---\r?\n(.*?)\r?\n---", text, re.S).group(1)
        data = yaml.safe_load(block)
        if not isinstance(data, dict):
            error("the frontmatter is not a set of key: value fields")
        elif "triggers" in data and not (isinstance(data["triggers"], list) and all(isinstance(t, str) for t in data["triggers"])):
            error("triggers is not a list of strings in strict YAML (quote items with commas or colons)")
    except ImportError:
        pass
    except Exception as e:  # yaml.YAMLError and friends
        error(f"the frontmatter is not valid YAML: {str(e).splitlines()[0]}")

    name = unquote(raw.get("name", ""))
    if not name:
        error("no name")
    elif not NAME.match(name):
        error(f"name {name!r}: use lowercase letters, digits and dashes")
    elif name != os.path.basename(folder):
        error(f"name {name!r} differs from its folder {os.path.basename(folder)!r}")

    desc = unquote(raw.get("description", ""))
    quoted = raw.get("description", "").strip()[:1] in ("'", '"')
    if not desc:
        error("no description")
    else:
        if not re.match(r"Use (when|before)\b", desc):
            error('the description should start with "Use when" (or "Use before") and say when to use it')
        if len(desc) > 300:
            error(f"the description is {len(desc)} characters: keep it under 240")
        elif len(desc) > 240:
            warn(f"the description is {len(desc)} characters: under 240 fits agents' skill lists best")
        if not quoted and (": " in desc or " #" in desc):
            error('the description has ": " or " #", which breaks YAML: reword it or put it in double quotes')

    if triggers:
        if len(triggers) > 12:
            error(f"{len(triggers)} triggers: at most 12")
        seen = set()
        for t in triggers:
            words = t.rstrip("*").split()
            if not 3 <= len(t) <= 40:
                error(f"trigger {t!r}: 3 to 40 characters")
            if t != t.lower():
                warn(f"trigger {t!r}: write triggers in lower case")
            if len(words) == 1 and not t.endswith("*") and len(t) <= 8:
                warn(f"trigger {t!r}: a short single word; make sure it does not appear in unrelated requests")
            if t.lower() in seen:
                warn(f"trigger {t!r} is listed twice")
            seen.add(t.lower())
    elif "triggers" in raw:
        warn("triggers is present but empty")

    if len(text) >= MAX_CHARS:
        error(f"{len(text)} characters: a skill must stay under {MAX_CHARS:,}")
    body_lines = body.strip("\n").splitlines()
    if not re.search(r"^# \S", body, re.M):
        warn("no '# Title' heading at the top of the body")
    if len(body_lines) < 10:
        warn(f"the body is {len(body_lines)} lines: is there enough to follow?")
    elif len(body_lines) > 200:
        warn(f"the body is {len(body_lines)} lines: move long material to references/ files")

    for ref in sorted(set(re.findall(r"`((?:references|scripts)/[\w./-]+)`", text))):
        if not os.path.exists(os.path.join(folder, ref)):
            error(f"mentions {ref}, which is not in the skill's folder")

    for n, line in enumerate(text.splitlines(), 1):
        if SECRET.search(line):
            error(f"line {n} looks like it holds a secret: take it out and say where it is kept instead")
        if re.search(r"[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]", line):
            warn(f"line {n} has invisible characters")

    print(f"  {errors} error(s), {warnings} warning(s); body {len(body_lines)} lines, {len(text)} characters, "
          f"{len(triggers)} trigger(s)")
    return errors, warnings


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if argv else 2
    total = sum(check(p)[0] for p in argv)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
