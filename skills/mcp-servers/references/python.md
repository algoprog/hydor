# MCP servers in Python (SDK 2.x)

Checked with `mcp` 2.3 on Python 3.13. Documentation: https://py.sdk.modelcontextprotocol.io/ . In mcp
2.x the class is `MCPServer`; mcp 1.x called it `FastMCP` (`from mcp.server.fastmcp import FastMCP`), and
importing that in 2.x fails with a pointer to the migration guide. The separate `fastmcp` package on PyPI
is another project with its own API.

## Set up

```bash
uv init notes-server && cd notes-server && uv add "mcp[cli]"
# or, in a virtual environment: python -m venv .venv && .venv/bin/pip install "mcp[cli]"
```

The `cli` extra adds the `mcp` command (`mcp dev`, `mcp run`).

## A stdio server

```python
# server.py
from typing import Annotated

from pydantic import Field

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

mcp = MCPServer("notes")
NOTES = {"welcome": "Read the README first."}


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True))
def list_notes(
    limit: Annotated[int, Field(ge=1, le=100, description="How many ids to return")] = 20,
) -> list[str]:
    """List note ids, newest first. Use read_note for a note's text."""
    return sorted(NOTES)[:limit]


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True))
def read_note(note_id: Annotated[str, Field(description="The note id, as list_notes shows it")]) -> str:
    """Read one note by its id."""
    if note_id not in NOTES:
        raise ToolError(f'No note "{note_id}". Known ids: {", ".join(sorted(NOTES))}.')
    return NOTES[note_id]


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False))
def delete_note(note_id: str) -> str:
    """Delete a note for good. Ask the user before calling it."""
    if NOTES.pop(note_id, None) is None:
        raise ToolError(f'No note "{note_id}". Call list_notes for the ids.')
    return f'Deleted "{note_id}".'


if __name__ == "__main__":
    mcp.run()  # stdio
```

- The function name is the tool name, the docstring its description, and the type hints its input
  schema; `Field(description=...)` documents each argument, and `ge`, `le`, `pattern` and similar
  constraints are checked before the function runs.
- A typed return value (`-> list[str]`, a pydantic model, a TypedDict) also gives the tool an output
  schema and structured content.
- `ToolError` sends its message to the model as a tool error ("Error executing tool read_note: No note
  ..."). Any other exception is logged with its traceback, and the model sees only "Error executing tool
  read_note": raise `ToolError` for failures the model can do something about.
- A tool can take a `ctx: Context` parameter (from `mcp.server.mcpserver`) for logging
  (`await ctx.info(...)`) and progress (`await ctx.report_progress(50, 100)`); make the tool `async`.
- Never `print()` in a stdio server: stdout carries the protocol. Use `logging` (which writes to stderr)
  or `ctx`.

## Over Streamable HTTP

```python
if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8000)   # served at http://127.0.0.1:8000/mcp
```

Or without changing the file: `mcp run server.py --transport streamable-http`. For anything beyond
localhost, put authentication in front (the SDK has auth support; see its documentation) and keep the
bind address explicit.

## Test it

The Inspector:

```bash
mcp dev server.py                                   # opens the Inspector's web UI with the server
npx @modelcontextprotocol/inspector --cli python server.py --method tools/list --format json
npx @modelcontextprotocol/inspector --cli python server.py --method tools/call \
  --tool-name read_note --tool-args-json '{"note_id":"welcome"}' --format json
```

In-process, for automated tests (`Client` accepts the server object itself):

```python
# test_server.py
import asyncio

from mcp import Client

from server import mcp


async def check() -> None:
    async with Client(mcp) as client:
        tools = await client.list_tools()
        assert {t.name for t in tools.tools} == {"list_notes", "read_note", "delete_note"}
        missing = await client.call_tool("read_note", {"note_id": "nope"})
        assert missing.is_error
        ok = await client.call_tool("read_note", {"note_id": "welcome"})
        assert ok.content[0].text == "Read the README first."


asyncio.run(check())
```

Through the real stdio process:

```python
import sys
from mcp import Client
from mcp.client.stdio import StdioServerParameters

async with Client(StdioServerParameters(command=sys.executable, args=["server.py"])) as client:
    ...
```

And against an HTTP server: `async with Client("http://127.0.0.1:8000/mcp") as client: ...`.

## Add it to an agent

Use the virtual environment's Python and absolute paths:

```bash
claude mcp add notes -- /abs/path/.venv/bin/python /abs/path/server.py
codex mcp add notes -- /abs/path/.venv/bin/python /abs/path/server.py
# with uv:
claude mcp add notes -- uv run --directory /abs/path python server.py
```

In this app: Settings, Agents, MCP servers, **Add server**, type **Command**, with the same command line.
