---
name: mcp-servers
description: Use when building, changing or debugging an MCP (Model Context Protocol) server or its tools, or connecting one to Claude Code, Codex or another agent. Not for simply using the tools of a server that already works.
category: coding
triggers: [mcp server*, mcp tool*, model context protocol, modelcontextprotocol, fastmcp, mcpserver, mcp inspector, mcp sdk, streamable http, stdio transport, tool server*]
---

# MCP servers

An MCP server gives agents new tools (and optionally resources and prompts) over a standard protocol.
A good one has a few well-named tools with precise descriptions and input schemas, returns small,
focused results, and answers failures with messages an agent can act on. Build it with the official
SDK, test it with the MCP Inspector, then add it to the agent.

## 1. Decide what it offers

- List the tasks agents should be able to do, then the fewest tools that cover them. Prefer task-shaped
  tools (`search_orders`, `refund_order`) to one thin wrapper per API endpoint: fewer, clearer tools are
  picked correctly more often.
- For each tool write down: name, purpose in one sentence, inputs, output, side effects (read-only?
  destructive? safe to repeat? reaches outside services?) and the ways it can fail.
- Look for an existing server first: the service's own official MCP server, or a well-maintained one.

## 2. Choose the SDK and the transport

| | TypeScript | Python |
| --- | --- | --- |
| Package | `@modelcontextprotocol/server` (SDK v2) | `mcp` (SDK 2.x), class `MCPServer` |
| Older code you may meet | `@modelcontextprotocol/sdk` (v1): `server.tool()`, `McpError` | `mcp` 1.x: `FastMCP` from `mcp.server.fastmcp` |
| Input schemas | Zod (`import * as z from 'zod/v4'`) | Type hints, with pydantic `Field` for descriptions |
| Run during development | `npx tsx server.ts` | `python server.py`, or `mcp dev server.py` (Inspector) |

- The standalone `fastmcp` package is a different project from the official `mcp` package, with its own
  API. Check which one the project uses.
- APIs changed between major versions: check the installed version (`npm ls @modelcontextprotocol/server
  @modelcontextprotocol/sdk`, `pip show mcp`) and write code for that version; do not mix examples.
- **stdio:** the agent starts the server as a child process and talks over stdin and stdout. One user,
  local, simplest: the default for local files, local commands and local databases.
- **Streamable HTTP:** one server at an address, many clients, for remote or shared servers, behind
  authentication. (The older HTTP+SSE transport is deprecated.)

## 3. Write it

A stdio server in TypeScript (SDK v2):

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const notes = new Map([['welcome', 'Read the README first.']]);

function createServer() {
  const server = new McpServer({ name: 'notes', version: '1.0.0' });
  server.registerTool(
    'read_note',
    {
      title: 'Read a note',
      description: 'Read one note by its id. Use list_notes to find ids.',
      inputSchema: z.object({ id: z.string().describe('The note id, as list_notes shows it') }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const note = notes.get(id);
      if (!note) return { content: [{ type: 'text', text: `No note "${id}". Call list_notes to see the ids.` }], isError: true };
      return { content: [{ type: 'text', text: note }] };
    },
  );
  return server;
}

serveStdio(createServer);
console.error('notes server running on stdio'); // stdout carries the protocol: log to stderr only
```

The Python version, structured output, HTTP servers and tests: `references/python.md` and
`references/typescript.md`.

## 4. Design tools agents can use well

- **Names:** a verb and a noun, one style per server (`read_note` or `read-note`); letters, digits, `_`,
  `-` and `.` only, up to 128 characters. Agents see them with a prefix (`mcp__notes__read_note` in Claude
  Code), so keep them short.
- **Descriptions:** what it does, when to use it (and when another tool fits better), what it returns,
  and its limits. This is the only documentation the model reads.
- **Inputs:** precise types, enums for fixed choices, a description on every argument (`.describe()` in
  Zod, `Field(description=...)` in Python) with the format and an example, sensible defaults, as few
  required fields as possible. Accept the ids your other tools return.
- **Annotations** are hints for the client, not enforcement: `readOnlyHint` (default false),
  `destructiveHint` (default true; meaningful only when not read-only), `idempotentHint` (default false),
  `openWorldHint` (default true: it reaches the outside world). Set them honestly; hosts use them to
  decide what needs the user's approval.
- **Outputs:** small and focused. Return what the agent needs for its next step (ids, names, key
  fields); paginate with `limit` and a cursor; cut long text and say how to get the rest. Add
  `outputSchema` with `structuredContent` (TypeScript) or a typed return value (Python) when a program
  will read the result.
- **Errors:** a tool error the model can act on, saying what went wrong and what to do next: in
  TypeScript return `isError: true` with that text (a thrown error also becomes one); in Python raise
  `ToolError("...")` from `mcp.server.mcpserver.exceptions`. Other exceptions in Python reach the model
  only as "Error executing tool ...".
- **Safety:** check inputs again in the handler (paths stay inside an allowed folder, SQL uses
  parameters, outgoing URLs are allowlisted); make tools read-only unless writing is their purpose; give
  destructive actions their own tool or an explicit `confirm` argument; read secrets from environment
  variables, never from arguments, and never return them.

## 5. Test it

- The Inspector's web interface: `npx @modelcontextprotocol/inspector npx tsx server.ts` (or `mcp dev
  server.py` for Python). Click Connect, then try each tool.
- The Inspector's CLI, which an agent can run and read:

```bash
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list --format json
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name read_note \
  --tool-args-json '{"id":"welcome"}' --format json
npx @modelcontextprotocol/inspector --cli --transport http --server-url http://127.0.0.1:3000/mcp --method tools/list
```

  Exit code 0 is success, 5 a tool error, 4 an unreachable server, 3 a server that needs authentication.
- Try each tool with good input, wrong types, a missing field, something not found, and the guard on
  every destructive tool. Read each result as the model would: does it say what to do next?
- Automated tests with an in-process client: see the references.
- In a stdio server nothing but protocol messages may reach stdout: one `console.log` or `print` breaks
  the connection. Log to stderr.

## 6. Add it to an agent

- **In this app:** Settings, Agents, MCP servers, **Add server**: a Command (the whole command line, with
  absolute paths, and environment variables) or HTTP (the address, and headers for an API key), for
  Claude Code, Codex or both. Then **Check connections**. New sessions load it; Custom uses these servers
  too (all but SSE ones).
- **Claude Code:** `claude mcp add notes -- npx tsx /abs/path/server.ts` (`-s user` for every folder,
  `-s project` for a shared `.mcp.json`, `-e KEY=value` for environment). HTTP:
  `claude mcp add --transport http notes https://example.com/mcp`. Check with `claude mcp list`, or `/mcp`
  in a session.
- **Codex:** `codex mcp add notes -- npx tsx /abs/path/server.ts` (`--env KEY=value`); HTTP:
  `codex mcp add notes --url https://example.com/mcp --bearer-token-env-var NOTES_TOKEN`. Check with
  `codex mcp list`.
- Use absolute paths: agents start the server from their own working folder. Restart the session after
  adding it.

## 7. HTTP servers need more

- Bind to 127.0.0.1 unless it must be reachable from other machines.
- Validate the Host and Origin headers against DNS rebinding (the SDK's framework helpers do this by
  default on localhost binds).
- Require authentication for anything not on localhost: verify bearer tokens in front of the handler,
  or implement OAuth as the MCP authorization spec describes.
- Keep it stateless where possible (the v2 handler builds a server per request), so it scales and
  restarts cleanly.

## Pitfalls

- Writing to stdout in a stdio server.
- One tool per API endpoint: dozens of near-identical tools the model confuses.
- Vague descriptions ("Gets data") and arguments without descriptions.
- Huge results (whole files, every row) that crowd out the agent's context.
- Errors that say only "failed", or dump a stack trace.
- Examples from another SDK version pasted into this one.
- Trusting annotations for safety: enforce limits in the handler.
- Relative paths in the command the agent runs.
