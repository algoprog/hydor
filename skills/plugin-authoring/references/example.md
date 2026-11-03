# A small plugin, whole

`word-count/` gives agents one tool that counts words in a text file, and a skill on when to use it.

## plugin.json

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "word-count",
  "version": "1.0.0",
  "description": "Counts words, sentences and reading time in text files.",
  "extensions": { "com.naget.agent": { "title": "Word count", "category": "writing", "requires": { "commands": ["python3"] } } }
}
```

## mcp.json

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": { "wordcount": { "type": "stdio", "command": "python3", "args": ["${PLUGIN_ROOT}/server.py"] } }
}
```

## server.py (Python's standard library only)

```python
import json, re, sys

TOOLS = [{
    "name": "count_words",
    "description": "Count words and sentences in a text file, with reading time at 230 words a minute.",
    "inputSchema": {"type": "object", "properties": {"path": {"type": "string", "description": "Full path to the file."}}, "required": ["path"]},
    "annotations": {"readOnlyHint": True},
}]

def count_words(path):
    text = open(path, encoding="utf-8").read()
    words = len(re.findall(r"\b\w+\b", text))
    sentences = len(re.findall(r"[.!?]+(\s|$)", text))
    return {"words": words, "sentences": sentences, "minutes": round(words / 230, 1)}

def answer(req):
    m, p = req.get("method"), req.get("params") or {}
    if m == "initialize":
        return {"protocolVersion": p.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}}, "serverInfo": {"name": "wordcount", "version": "1.0.0"}}
    if m == "tools/list":
        return {"tools": TOOLS}
    if m == "tools/call":
        try:
            out = count_words(**(p.get("arguments") or {}))
            return {"content": [{"type": "text", "text": json.dumps(out)}]}
        except Exception as e:
            return {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True}
    if m == "ping":
        return {}
    raise ValueError(f"Method not found: {m}")

for line in sys.stdin:
    if not line.strip():
        continue
    req = json.loads(line)
    if "id" not in req:
        continue  # a notification
    try:
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": answer(req)}) + "\n")
    except Exception as e:
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": str(e)}}) + "\n")
    sys.stdout.flush()
```

Check it by hand:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | python3 server.py
```

## skills/word-count/SKILL.md

```markdown
---
name: word-count
description: Use when a text's length matters: a word limit, a reading time, comparing drafts.
category: writing
---

# Word count

Use the `count_words` tool with the file's full path. Report words and reading time, and say how far
the text is from any limit the user gave.
```
