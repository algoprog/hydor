"""A small MCP server over stdio, with only Python's standard library.

Each plugin that ships tools in Python keeps its own copy of this file, so the plugin stays
self-contained. Messages are JSON-RPC 2.0, one per line (the MCP stdio transport). Tools are plain
functions registered with @server.tool(...); what they return becomes the call's text, and an
exception they raise becomes an error result the agent can read and act on.
"""

import inspect
import json
import sys
import traceback

SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"]


class ToolError(Exception):
    """An error the agent should see as it is (no traceback)."""


class Server:
    def __init__(self, name, version, instructions=None):
        self.name = name
        self.version = version
        self.instructions = instructions
        self.tools = {}

    def tool(self, name, description, schema, read_only=False, destructive=False):
        def register(fn):
            self.tools[name] = {
                "fn": fn,
                "spec": {
                    "name": name,
                    "description": description,
                    "inputSchema": schema,
                    "annotations": {"readOnlyHint": read_only, "destructiveHint": destructive},
                },
            }
            return fn

        return register

    def _send(self, msg):
        sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    def _answer(self, req):
        method = req.get("method")
        params = req.get("params") or {}
        if method == "initialize":
            asked = params.get("protocolVersion")
            info = {
                "protocolVersion": asked if asked in SUPPORTED else SUPPORTED[0],
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": self.name, "version": self.version},
            }
            if self.instructions:
                info["instructions"] = self.instructions
            return info
        if method == "ping":
            return {}
        if method == "tools/list":
            return {"tools": [t["spec"] for t in self.tools.values()]}
        if method == "tools/call":
            t = self.tools.get(params.get("name"))
            if not t:
                raise LookupError(f"No tool named {params.get('name')}")
            args = params.get("arguments") or {}
            try:
                inspect.signature(t["fn"]).bind(**args)
            except TypeError as e:
                return {"content": [{"type": "text", "text": f"Wrong arguments: {e}"}], "isError": True}
            try:
                out = t["fn"](**args)
            except ToolError as e:
                return {"content": [{"type": "text", "text": str(e)}], "isError": True}
            except Exception as e:  # the agent gets the reason, the log gets the rest
                traceback.print_exc(file=sys.stderr)
                return {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True}
            text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, indent=2, default=str)
            return {"content": [{"type": "text", "text": text}]}
        raise NotImplementedError(f"Method not found: {method}")

    def run(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError:
                self._send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                continue
            if "id" not in req:  # a notification: nothing to answer
                continue
            try:
                self._send({"jsonrpc": "2.0", "id": req["id"], "result": self._answer(req)})
            except NotImplementedError as e:
                self._send({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": str(e)}})
            except Exception as e:
                self._send({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32603, "message": str(e)}})
