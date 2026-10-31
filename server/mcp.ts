// Naget Agent as an MCP server (Streamable HTTP, JSON replies, no event stream).
//
//   POST /mcp              other agents (Claude Code elsewhere, Cursor, …) with a bearer token from
//                          Settings → Connect other agents: list, read, start and message sessions.
//   POST /mcp/run/:id      the sessions this app runs, each with its own address (the run id, signed):
//                          show_html, a page shown in the conversation.
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Agent, SessionSummary, TimelineItem } from '../shared/types.ts';
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { signWithKey } from './links.ts';
import type { SessionManager } from './sessions.ts';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const PAGE_SERVER = 'naget-agent';
export const MAX_PAGE = 2 * 1024 * 1024;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, any>) => Promise<string>;
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

/** Answers one JSON-RPC message; null for notifications and responses (nothing to send back). */
async function answer(m: Rpc, tools: Tool[], info: { instructions?: string }): Promise<object | null> {
  if (m.id === undefined || m.id === null || !m.method) return null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'naget-agent', title: 'Naget Agent', version: config.version },
        ...(info.instructions ? { instructions: info.instructions } : {}),
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = tools.find((t) => t.name === m.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${m.params?.name}`);
      try {
        return ok({ content: [{ type: 'text', text: await tool.run(m.params?.arguments ?? {}) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${m.method}`);
  }
}

async function serve(req: FastifyRequest, reply: FastifyReply, tools: Tool[], info: { instructions?: string }) {
  const body = req.body as Rpc | Rpc[];
  const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.some((m) => !m || typeof m !== 'object')) return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  const out = (await Promise.all(list.map((m) => answer(m, tools, info)))).filter(Boolean);
  if (!out.length) return reply.code(202).send();
  return reply.type('application/json').send(Array.isArray(body) ? out : out[0]);
}

// ---- the sessions' own server: show_html ----------------------------------------------------------

/** The signed address segment for a run, so only that agent process can show pages in its session. */
export function runToken(runId: string): string {
  const sig = signWithKey(`mcp-run:${runId}`).slice(0, 22);
  return `${runId}.${sig}`;
}

export function runOf(token: string): string | null {
  const [runId] = token.split('.');
  if (!runId) return null;
  const want = runToken(runId);
  return want.length === token.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(token)) ? runId : null;
}

/** The page server's entry for an agent's MCP configuration. */
export function pageServerUrl(runId: string) {
  return `http://127.0.0.1:${config.port}/mcp/run/${runToken(runId)}`;
}

const SHOW_HTML: Omit<Tool, 'run'> = {
  name: 'show_html',
  description: [
    'Show the user an HTML page inside the conversation: a report, a chart, a table, a diagram, a mock-up of a UI.',
    'Use it when a visual is clearer than text, or when asked for one. The page renders in a sandboxed frame on a white background,',
    'as wide as the chat column (about 760px on a computer, 360px on a phone: make it fit both), and grows to its content height. Write a complete, self-contained page: inline CSS and',
    'JavaScript; scripts may load from CDNs (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com). It cannot reach this app or the',
    'user’s files, so embed the data. The user sees the page itself; do not repeat its contents in your reply.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short name for the page, shown above it.' },
      html: { type: 'string', description: 'The whole page, <!doctype html> included.' },
    },
    required: ['html'],
  },
};

// ---- other agents: sessions --------------------------------------------------------------------

interface McpToken {
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  lastUsed?: number;
}

const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function mcpTokens(db: DB): McpToken[] {
  try {
    return JSON.parse(kvGet(db, 'mcp_tokens') ?? '[]');
  } catch {
    return [];
  }
}

/** A new token; its value is returned once and only its hash is kept. */
export function createMcpToken(db: DB, name: string): { id: string; token: string } {
  const token = `ac_${crypto.randomBytes(24).toString('base64url')}`;
  const t: McpToken = { id: crypto.randomBytes(4).toString('hex'), name: name.trim().slice(0, 60) || 'Agent', hash: hashOf(token), createdAt: Date.now() };
  kvSet(db, 'mcp_tokens', JSON.stringify([...mcpTokens(db), t]));
  return { id: t.id, token };
}

export function revokeMcpToken(db: DB, id: string) {
  kvSet(db, 'mcp_tokens', JSON.stringify(mcpTokens(db).filter((t) => t.id !== id)));
}

function checkBearer(db: DB, req: FastifyRequest): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''));
  if (!m) return false;
  const h = hashOf(m[1]);
  const list = mcpTokens(db);
  const t = list.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
  if (!t) return false;
  // At most one write a minute for "last used".
  if (!t.lastUsed || Date.now() - t.lastUsed > 60_000) {
    t.lastUsed = Date.now();
    kvSet(db, 'mcp_tokens', JSON.stringify(list));
  }
  return true;
}

function line(s: SessionSummary): string {
  const st = s.live?.status ?? s.external?.status ?? 'idle';
  return `- ${s.key} · ${s.agent} · ${st}${s.goal ? ' · goal set' : ''} · ${s.title}${s.cwd ? ` · ${s.cwd}` : ''} · updated ${new Date(s.updatedAt ?? s.createdAt ?? 0).toISOString()}`;
}

function itemText(it: TimelineItem): string | null {
  switch (it.kind) {
    case 'user':
      return it.meta ? null : `USER: ${it.text}`;
    case 'assistant':
      return `ASSISTANT: ${it.text}`;
    case 'tool':
      return `  [${it.tool.category}] ${it.tool.title}${it.tool.status === 'error' ? ' (failed)' : ''}`;
    case 'system':
      return it.level === 'error' ? `  [error] ${it.text}` : null;
    default:
      return null;
  }
}

function sessionTools(sessions: SessionManager, publicUrl: (key: string) => string): Tool[] {
  const known = (key: unknown) => {
    const s = typeof key === 'string' ? sessions.summary(key) : null;
    if (!s) throw new Error('No session with that key. list_sessions gives the keys.');
    return s;
  };
  return [
    {
      name: 'list_sessions',
      description: 'The sessions in Naget Agent (Claude Code and Codex), most recent first: key, agent, status, title, folder.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Only titles or folders containing this.' }, limit: { type: 'number', description: 'How many (default 20, at most 100).' } },
      },
      run: async (a) => {
        const q = String(a.query ?? '').toLowerCase();
        const all = sessions.list({ limit: 400 }).sessions;
        const hits = all
          .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.cwd ?? '').toLowerCase().includes(q))
          .sort((x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0))
          .slice(0, Math.min(Number(a.limit) || 20, 100));
        return hits.length ? hits.map(line).join('\n') : 'No sessions match.';
      },
    },
    {
      name: 'read_session',
      description: 'What happened in a session lately: its messages and the steps the agent took, oldest first.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' }, last: { type: 'number', description: 'How many recent entries (default 40, at most 300).' } },
        required: ['key'],
      },
      run: async (a) => {
        const s = known(a.key);
        const tl = await sessions.timeline(s.key);
        const lines = tl.parser.items.map(itemText).filter((x): x is string => !!x);
        const n = Math.min(Number(a.last) || 40, 300);
        return `${line(s)}\n\n${lines.slice(-n).join('\n').slice(-60_000) || '(nothing yet)'}`;
      },
    },
    {
      name: 'start_session',
      description: 'Starts a new Claude Code or Codex session on this machine with a first message. Returns its key and a link the user can open.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: ['claude', 'codex'] },
          prompt: { type: 'string', description: 'The first message.' },
          cwd: { type: 'string', description: 'The folder to work in (default: the app’s default folder).' },
          model: { type: 'string', description: 'A model id from list_models; the agent’s default when left out.' },
          worktree: { type: 'boolean', description: 'Work on a new branch in a worktree of the folder’s git repository.' },
        },
        required: ['agent', 'prompt'],
      },
      run: async (a) => {
        if (a.agent !== 'claude' && a.agent !== 'codex') throw new Error('agent must be claude or codex');
        if (!String(a.prompt ?? '').trim()) throw new Error('prompt is empty');
        const key = await sessions.create({ agent: a.agent as Agent, prompt: String(a.prompt), cwd: a.cwd ? String(a.cwd) : '', model: a.model ? String(a.model) : undefined, worktree: !!a.worktree, remember: false });
        return `Started ${key}\nOpen: ${publicUrl(key)}`;
      },
    },
    {
      name: 'send_message',
      description: 'Sends a message to a session. If the agent is busy it waits in the session’s queue and goes out when the turn ends.',
      inputSchema: { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' } }, required: ['key', 'text'] },
      run: async (a) => {
        const s = known(a.key);
        if (!String(a.text ?? '').trim()) throw new Error('text is empty');
        const busy = ['working', 'waiting', 'starting'].includes(s.live?.status ?? '');
        await sessions.deliverOrQueue(s.key, String(a.text));
        return busy ? 'Queued: it goes out when the current turn ends.' : 'Sent.';
      },
    },
    {
      name: 'list_models',
      description: 'The models a new session can use, per agent.',
      inputSchema: { type: 'object', properties: { agent: { type: 'string', enum: ['claude', 'codex'] } } },
      run: async (a) => {
        const agents: Agent[] = a.agent === 'claude' || a.agent === 'codex' ? [a.agent] : ['claude', 'codex'];
        const out: string[] = [];
        for (const ag of agents) {
          const cat = await sessions.catalog(ag).catch(() => null);
          out.push(`${ag}: ${cat?.models?.map((m) => m.value).join(', ') || '(unknown until the agent has started once)'}`);
        }
        return out.join('\n');
      },
    },
  ];
}

// ---- routes -------------------------------------------------------------------------------------

export function mcpRoutes(app: FastifyInstance, db: DB, sessions: SessionManager, publicUrl: (key: string) => string) {
  const tools = sessionTools(sessions, publicUrl);
  const info = { instructions: 'Naget Agent runs Claude Code and Codex sessions on this machine. Use list_sessions for keys, read_session to catch up, send_message to steer.' };
  app.post('/mcp', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (!checkBearer(db, req)) return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'A token from Settings → Connect other agents is needed' });
    return serve(req, reply, tools, info);
  });
  app.post('/mcp/run/:token', { bodyLimit: MAX_PAGE + 64 * 1024 }, async (req, reply) => {
    const runId = runOf((req.params as { token: string }).token);
    const live = runId ? sessions.liveByRun(runId) : null;
    if (!live) return reply.code(404).send({ error: 'No session runs with that address' });
    const show: Tool = {
      ...SHOW_HTML,
      run: async (a) => {
        const html = String(a.html ?? '');
        if (!html.trim()) throw new Error('html is empty');
        if (Buffer.byteLength(html) > MAX_PAGE) throw new Error('The page is over 2 MB; keep it smaller (embed less data).');
        return 'The page is showing in the conversation.';
      },
    };
    return serve(req, reply, [show], {});
  });
  // No event stream: clients fall back to plain request and reply.
  for (const p of ['/mcp', '/mcp/run/:token']) {
    app.get(p, async (_req, reply) => reply.code(405).header('Allow', 'POST').send());
    app.delete(p, async (_req, reply) => reply.code(405).header('Allow', 'POST').send());
  }
}


/** Pages may run scripts, open links, submit forms and show alerts, from their own opaque origin. */
export const PAGE_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'";

/**
 * The frame a page from show_html renders in (sandboxed, its own opaque origin, permissive inside):
 * the parent posts the page, which replaces this document; a small script added at its end reports
 * the page's height so the frame can fit it.
 */
export const PAGE_FRAME_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head><body><script>
addEventListener('message', function (e) {
  if (e.source !== parent || !e.data || e.data.type !== 'wa-html-page') return;
  var fit = '<script>(function(){function s(){var d=document.documentElement,b=document.body;parent.postMessage({type:"wa-html-size",h:Math.max(d.scrollHeight,b?b.scrollHeight:0)},"*")}' +
    'new ResizeObserver(s).observe(document.documentElement);addEventListener("load",s);setTimeout(s,300);s()})()<\\/script>';
  document.open();
  document.write(String(e.data.html) + fit);
  document.close();
});
parent.postMessage({ type: 'wa-html-ready' }, '*');
</script></body></html>`;
