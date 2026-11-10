// A bridge for agents that take MCP servers only as commands (Hermes Agent, Goose…, whose ACP handshake does not offer
// HTTP): it speaks MCP's stdio transport (one JSON message per line) and forwards each message to the app's MCP server
// at the address in its first argument. Headers (a token, say) come in HYDOR_MCP_HEADERS as JSON. Built as
// dist/server/mcpbridge.js; the session starts it as the agent's MCP server (server/agents/acp.ts).
import readline from 'node:readline';

const url = process.argv[2];
if (!/^https?:\/\//.test(url ?? '')) {
  process.stderr.write('hydor MCP bridge: give it the address of the MCP server\n');
  process.exit(2);
}
let headers: Record<string, string> = {};
try {
  headers = JSON.parse(process.env.HYDOR_MCP_HEADERS ?? '{}');
} catch {}

const send = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');
const rl = readline.createInterface({ input: process.stdin });
let open = 0;
let closed = false;
const done = () => {
  if (closed && !open) process.exit(0);
};

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg: { id?: unknown; method?: string };
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  open++;
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: line })
    .then(async (r) => {
      // A notification is answered with 202 and no body.
      if (r.status === 202 || r.status === 204) return;
      const text = await r.text();
      if (!r.ok && msg.id != null && !text.trim().startsWith('{')) return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `The server answered ${r.status}` } });
      for (const part of text.split('\n')) {
        // A server may answer in an event stream: its data lines are the messages.
        const data = part.startsWith('data:') ? part.slice(5).trim() : part.trim().startsWith('{') || part.trim().startsWith('[') ? part.trim() : '';
        if (!data) continue;
        try {
          const o = JSON.parse(data);
          for (const m of Array.isArray(o) ? o : [o]) send(m);
        } catch {}
      }
    })
    .catch((e: Error) => {
      if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `Could not reach the app: ${e.message}` } });
    })
    .finally(() => {
      open--;
      done();
    });
});
rl.on('close', () => {
  closed = true;
  done();
});
