// Hydor as an MCP server (Streamable HTTP, JSON replies, no event stream).
//
//   POST /mcp              other agents (Claude Code elsewhere, Cursor, …) with a bearer token from
//                          Settings → Connect other agents: list, read, start and message sessions.
//   POST /mcp/run/:id      the sessions this app runs, each with its own address (the run id, signed):
//                          show_html, a page shown in the conversation.
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isConfidential } from '../shared/confidential.ts';
import type { Agent, SessionSummary, TimelineItem } from '../shared/types.ts';
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { signWithKey } from './links.ts';
import { featureDeps, runTools } from './features/registry.ts';
import { appMcpTools } from './apps/mcp.ts';
import { frameHtml } from './pages/kit.ts';
import type { RunCtx, ToolOutput } from './features/types.ts';
import type { SessionManager } from './sessions.ts';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const PAGE_SERVER = 'hydor';
export { MAX_PAGE } from './pages/index.ts';

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  run: (args: Record<string, any>) => Promise<string | ToolOutput>;
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
        serverInfo: { name: 'hydor', title: 'Hydor', version: config.version },
        ...(info.instructions ? { instructions: info.instructions } : {}),
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
    case 'tools/call': {
      const tool = tools.find((t) => t.name === m.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${m.params?.name}`);
      try {
        const r = await tool.run(m.params?.arguments ?? {});
        if (typeof r === 'string') return ok({ content: [{ type: 'text', text: r }] });
        return ok({ content: [{ type: 'text', text: r.text }, ...(r.images ?? []).map((i) => ({ type: 'image', data: i.data, mimeType: i.mimeType }))], ...(r.isError ? { isError: true } : {}) });
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

// ---- the sessions' own server: the capabilities' tools (show_html, web_search…) --------------------

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

/** Most a call to a session's own server may carry (a page, a file's content). */
const MAX_RUN_BODY = 8 * 1024 * 1024;

/** The page server's entry for an agent's MCP configuration. */
export function pageServerUrl(runId: string) {
  return `http://127.0.0.1:${config.port}/mcp/run/${runToken(runId)}`;
}

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

/** A session as one line: key, agent, status, title, folder, last change. */
export function line(s: SessionSummary): string {
  const st = s.live?.status ?? s.external?.status ?? 'idle';
  return `- ${s.key} · ${s.agent} · ${st}${s.goal ? ' · goal set' : ''} · ${s.title}${s.cwd ? ` · ${s.cwd}` : ''} · updated ${new Date(s.updatedAt ?? s.createdAt ?? 0).toISOString()}`;
}

/** A timeline item as a line of text: messages in full, steps by their titles only. */
export function itemText(it: TimelineItem): string | null {
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
  // Confidential sessions stay on this computer: other agents neither see nor reach them (server/confidential).
  const known = (key: unknown) => {
    const s = typeof key === 'string' ? sessions.summary(key) : null;
    if (!s || isConfidential(s.extra)) throw new Error('No session with that key. list_sessions gives the keys.');
    return s;
  };
  return [
    {
      name: 'list_sessions',
      description: 'The sessions in Hydor (Claude Code and Codex), most recent first: key, agent, status, title, folder.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Only titles or folders containing this.' }, limit: { type: 'number', description: 'How many (default 20, at most 100).' } },
      },
      run: async (a) => {
        const q = String(a.query ?? '').toLowerCase();
        const all = sessions.list({ limit: 400 }).sessions.filter((s) => !isConfidential(s.extra));
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
  const info = { instructions: 'Hydor runs Claude Code and Codex sessions on this machine. Use list_sessions for keys, read_session to catch up, send_message to steer.' };
  app.post('/mcp', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (!checkBearer(db, req)) return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'A token from Settings → Connect other agents is needed' });
    // The user's apps (server/apps) come as tools too, as they are now.
    return serve(req, reply, [...tools, ...appMcpTools()], info);
  });
  app.post('/mcp/run/:token', { bodyLimit: MAX_RUN_BODY }, async (req, reply) => {
    const runId = runOf((req.params as { token: string }).token);
    const live = runId ? sessions.liveByRun(runId) : null;
    if (!runId || !live) return reply.code(404).send({ error: 'No session runs with that address' });
    // The agent may give up on a call (a tool's time limit): a card still waiting on the user then goes.
    const gone = new AbortController();
    reply.raw.on('close', () => reply.raw.writableFinished || gone.abort());
    const ctx: RunCtx = { runId, key: live.key, agent: live.agent, acpAgent: live.acpAgent, cwd: live.cwd, deps: featureDeps(), signal: gone.signal };
    const tools: Tool[] = runTools(ctx).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations, run: (a) => t.run(a, ctx) }));
    return serve(req, reply, tools, {});
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
 * The frame every page renders in (show_html, saved pages, a page's own address): sandboxed, its own
 * opaque origin, permissive inside. The parent posts the page, which replaces this document, with the
 * page kit first (server/pages/kit.ts): ready-made classes, and the bridge that reports the page's
 * height, sends the user's choices and keeps a saved page's storage, all by postMessage.
 */
export const PAGE_FRAME_HTML = frameHtml();
