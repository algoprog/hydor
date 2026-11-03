# MCP servers in TypeScript (SDK v2)

Checked with `@modelcontextprotocol/server` 2.4, `@modelcontextprotocol/client` 2.4,
`@modelcontextprotocol/node` 2.1 and the Inspector 2.13 on Node 22. Documentation:
https://ts.sdk.modelcontextprotocol.io/v2/ (v1, the `@modelcontextprotocol/sdk` package, is documented at
https://ts.sdk.modelcontextprotocol.io/).

## Set up

```bash
npm init -y
npm pkg set type=module
npm install @modelcontextprotocol/server zod
npm install -D tsx typescript @types/node
```

With TypeScript 6 or later, add `"types": ["node"]` to `compilerOptions` in `tsconfig.json`.

## A stdio server with two tools

```ts
// server-factory.ts
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const notes = new Map<string, string>([['welcome', 'Read the README first.']]);

export function createServer() {
  const server = new McpServer({ name: 'notes', version: '1.0.0' });

  server.registerTool(
    'list_notes',
    {
      description: 'List note ids and titles, newest first. Use read_note for a note\'s text.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20).describe('How many to return') }),
      outputSchema: z.object({ ids: z.array(z.string()) }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const ids = [...notes.keys()].slice(0, limit);
      return { content: [{ type: 'text', text: ids.join('\n') }], structuredContent: { ids } };
    },
  );

  server.registerTool(
    'delete_note',
    {
      description: 'Delete a note for good. Ask the user before calling it.',
      inputSchema: z.object({ id: z.string().describe('The note id') }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      if (!notes.delete(id)) {
        return { content: [{ type: 'text', text: `No note "${id}". Call list_notes for the ids.` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Deleted "${id}".` }] };
    },
  );

  return server;
}
```

```ts
// server.ts: the stdio entry point
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server-factory.ts';

serveStdio(createServer);
console.error('notes server running on stdio'); // stdout carries the protocol
```

- `inputSchema` is a Zod object schema; the SDK turns it into the JSON Schema clients see, validates the
  arguments before the handler runs, and types the handler's arguments. Invalid arguments come back to the
  model as a tool error.
- A tool with no arguments leaves out `inputSchema`.
- `outputSchema` makes the SDK check `structuredContent` before the result leaves the server.
- Content blocks can be `text`, `image` and `audio` (base64 `data` and a `mimeType`), `resource`
  (embedded contents) or `resource_link` (a `uri`).

Keeping `createServer` in a module of its own lets the HTTP entry point and the tests import it without
starting a stdio server. (`.ts` in import paths works with tsx and Node's type stripping; with `tsc` and
`"module": "NodeNext"`, write `./server-factory.js`.)

## Over Streamable HTTP (Node, no framework)

```bash
npm install @modelcontextprotocol/node
```

```ts
// http-server.ts
import { createServer } from 'node:http';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer as createMcp } from './server-factory.ts'; // the factory above

const handler = createMcpHandler(createMcp); // builds a fresh server for each request
const node = toNodeHandler(handler);
const validHost = localhostHostValidation();
const validOrigin = localhostOriginValidation();

createServer((req, res) => {
  if (!validHost(req, res) || !validOrigin(req, res)) return; // DNS rebinding protection
  void node(req, res);
}).listen(3000, '127.0.0.1', () => console.error('MCP on http://127.0.0.1:3000/mcp'));
```

- Keep the factory cheap: create database pools and caches once at module level and use them inside.
- With Express: `@modelcontextprotocol/express` provides `createMcpExpressApp()` (JSON parsing and the
  Host and Origin checks included) and `requireBearerAuth`; mount with
  `app.all('/mcp', (req, res) => void node(req, res, req.body))`.
- Binding to `0.0.0.0` turns off the localhost checks: name the allowed hosts and require authentication.

## Tests with an in-process client

```ts
// server.test.ts (node:test, Vitest or Jest)
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server-factory.ts';

const handler = createMcpHandler(createServer);
const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
  fetch: (url, init) => handler.fetch(new Request(url, init)),
});
const client = new Client({ name: 'tests', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(transport);

const missing = await client.callTool({ name: 'delete_note', arguments: { id: 'nope' } });
assert.equal(missing.isError, true);

await client.close();
await handler.close();
```

To test the stdio entry point itself, spawn it: `new StdioClientTransport({ command: 'npx', args:
['tsx', 'server.ts'] })` from `@modelcontextprotocol/client/stdio`.

## The Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx server.ts                       # web UI, click Connect
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list --format json
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call \
  --tool-name list_notes --tool-args-json '{"limit":5}' --format json
npx @modelcontextprotocol/inspector --cli --transport http --server-url http://127.0.0.1:3000/mcp \
  --method tools/list --format json
```

- Prefer `--tool-args-json` to `--tool-arg key=value`: the latter turns digit-only strings into numbers.
- Flags after the server command go to the server, except ones the Inspector defines itself. When they
  clash, end the server command with `--`: everything before it is the server's command line, everything
  after it the Inspector's options (`--cli node build/index.js --config x.conf -- --method tools/list`).
- Exit codes: 0 success, 1 usage error, 3 needs authentication, 4 unreachable, 5 tool error.
- In CI, pin the version (`npx --yes @modelcontextprotocol/inspector@2.13.0 --cli ...`).

## Coming from v1

| v1 (`@modelcontextprotocol/sdk`) | v2 |
| --- | --- |
| `server.tool(name, description, shape, handler)` | `server.registerTool(name, { description, inputSchema: z.object(...) }, handler)` |
| `new StdioServerTransport()` and `server.connect(transport)` | `serveStdio(factory)` (the transport class still exists) |
| `StreamableHTTPServerTransport` per request | `createMcpHandler(factory)` |
| `McpError`, `ErrorCode` | `ProtocolError`, `ProtocolErrorCode` |

The SDK's migration guide has a codemod: https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2
