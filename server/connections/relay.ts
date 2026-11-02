// Where agents reach their connected apps, so no key or token is ever written into an agent's settings
// (which the app keeps on disk to restart it) or its command line:
//
//   POST /connections/mcp/<run token>/<app>      a remote app, through this server: it adds the sign-in
//                                                (renewed as needed, so long sessions keep working), keeps
//                                                only the tools that are on, masks known secrets in the
//                                                answers, speaks the older SSE transport for apps still on
//                                                it, and refuses an app turned off for the session. JSON in,
//                                                JSON out.
//   GET  /connections/launch/<run token>/<app>   a local app's command and environment, for the bridge
//                                                (bridge.ts) that starts it for the agent.
//   POST /connections/elicit/<run token>/<app>   a form a local app asks for mid-call, from the bridge:
//                                                shown in the session, answered when the user sends it.
//
// Forms a remote app asks for (MCP elicitation) come on its answer's event stream and are shown the
// same way (forms.ts); the agent is never asked.
//
// The run token is the session's own signed address (as for the app's MCP server), valid while it runs,
// and only from this machine.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { runOf } from '../mcp.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { authHeaders, connection, localCommand, onFor, remoteUrl, setStatus, toolFilter, toolOn, type Conn } from './apps.ts';
import { answerApp, askForm, withForms } from './forms.ts';
import { isRequest, postHttp, SseLink, Unauthorized, type Rpc } from './upstream.ts';
import { redact } from './vault.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// ---- a local app's command and environment, for the bridge ---------------------------------------------

/**
 * Served on a socket in the data folder, which only this user can open: a run token read off a process
 * list is then not enough to get a local app's keys. Null until it listens (the HTTP route serves then).
 */
let socketFile: string | null = null;
export const launchSocket = () => socketFile;

function launchSpec(d: Deps, token: string, app: string): { status: number; body: unknown } {
  const runId = runOf(token);
  const live = runId ? d.sessions.liveByRun(runId) : null;
  if (!runId || !live) return { status: 404, body: { error: 'No session runs with that address' } };
  const c = connection(d.db, app);
  if (!c || c.entry.server.transport !== 'stdio') return { status: 404, body: { error: 'That service is not connected here' } };
  if (!onFor(c, sessionExtra(d.db, live.key))) return { status: 403, body: { error: `${c.entry.name} is turned off for this session` } };
  const lc = localCommand(d.db, c);
  const f = toolFilter(c);
  return { status: 200, body: { name: c.entry.name, command: lc.command, args: lc.args, env: lc.env, only: f?.only ?? null, skip: f?.skip ?? [], mask: lc.secrets } };
}

export function startLaunchSocket(d: Deps) {
  const file = path.join(config.dataDir, 'conn.sock');
  // Too long for a socket's address on some systems: the HTTP route serves instead.
  if (Buffer.byteLength(file) > 100) return;
  try {
    fs.rmSync(file, { force: true });
  } catch {}
  const srv = http.createServer((req, res) => {
    const f = /^\/elicit\/([^/]+)\/([a-z0-9-]+)$/.exec(req.url ?? '');
    if (f && req.method === 'POST') return void elicitFromBridge(d, decodeURIComponent(f[1]), f[2], req, res);
    const m = /^\/launch\/([^/]+)\/([a-z0-9-]+)$/.exec(req.url ?? '');
    const r = m && req.method === 'GET' ? launchSpec(d, decodeURIComponent(m[1]), m[2]) : { status: 404, body: { error: 'Not found' } };
    res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(r.body));
  });
  srv.on('error', (e) => {
    socketFile = null;
    console.warn(`[connections] the local socket for apps is off (${e.message}); they start over HTTP instead`);
  });
  srv.listen(file, () => {
    try {
      fs.chmodSync(file, 0o600);
      socketFile = file;
    } catch {}
  });
  srv.unref();
}

/** A form a local app asks for, from its bridge: answered when the user sends it, cancelled if the bridge hangs up. */
function elicitFromBridge(d: Deps, token: string, app: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const done = (status: number, body: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (c: string) => {
    raw += c;
    if (raw.length > 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    const runId = runOf(token);
    const c = connection(d.db, app);
    if (!runId || !d.sessions.liveByRun(runId) || !c) return done(404, { error: 'No session runs with that address' });
    let params: any;
    try {
      params = JSON.parse(raw);
    } catch {
      return done(400, { error: 'Not JSON' });
    }
    const ac = new AbortController();
    res.once('close', () => ac.abort());
    askForm(d, runId, c.entry.name, params ?? {}, ac.signal).then(
      (r) => done(200, r),
      (e) => done(500, { error: (e as Error).message }),
    );
  });
}

/** The session a run token belongs to, if it runs, asked from this machine. */
function runFor(d: Deps, req: FastifyRequest): { runId: string; key: string } | null {
  if (!LOOPBACK.has(req.ip)) return null;
  const runId = runOf(String((req.params as { token?: string }).token ?? ''));
  const live = runId ? d.sessions.liveByRun(runId) : null;
  return runId && live ? { runId, key: live.key } : null;
}

const send = (reply: FastifyReply, body: unknown, sessionId?: string) => {
  if (sessionId) reply.header('mcp-session-id', sessionId);
  return reply.header('cache-control', 'no-store').type('application/json').send(redact(JSON.stringify(body)));
};

// ---- the older SSE transport: one open stream per agent session, kept here --------------------------

interface Link {
  link: SseLink;
  runId: string;
}
const links = new Map<string, Link>();

/** Closes links whose run has ended or that have been quiet for half an hour. */
export function sweepLinks(d: Deps) {
  for (const [k, l] of links) {
    if (l.link.closed || Date.now() - l.link.lastUsed > 30 * 60_000 || !d.sessions.liveByRun(l.runId)) {
      l.link.close();
      links.delete(k);
    }
  }
}

async function openLink(d: Deps, c: Conn): Promise<SseLink> {
  try {
    return await SseLink.open(remoteUrl(c), await authHeaders(d.db, c));
  } catch (e) {
    if (!(e instanceof Unauthorized) || c.entry.auth.type !== 'oauth') throw e;
    return SseLink.open(remoteUrl(c), await authHeaders(d.db, c, true));
  }
}

async function viaSse(d: Deps, c: Conn, run: { runId: string }, req: FastifyRequest, msgs: Rpc[], signal: AbortSignal): Promise<{ status?: undefined; text?: undefined; replies: Rpc[]; sessionId?: string }> {
  const init = msgs.find((m) => m.method === 'initialize');
  const sid = init ? crypto.randomBytes(12).toString('hex') : String(req.headers['mcp-session-id'] ?? '');
  const k = (s: string) => `${run.runId} ${c.id} ${s}`;
  let l = links.get(k(sid)) ?? (init ? undefined : links.get(k('')));
  if (!l || l.link.closed) {
    const was = l?.link.init;
    const link = await openLink(d, c);
    // The app's stream ended since: it is introduced to the app again, as the agent first did.
    if (!init && was) {
      const h = await authHeaders(d.db, c);
      await link.send({ ...was, id: 'again' }, h);
      await link.send({ jsonrpc: '2.0', method: 'notifications/initialized' }, h);
      link.init = was;
    }
    // What the app asks of its client while it works (a form) goes to the session.
    link.onRequest = (m) => answerApp(d, run.runId, c.entry.name, m);
    l = { link, runId: run.runId };
    links.set(k(sid), l);
    // Agents that keep no session id find it here.
    links.set(k(''), l);
  }
  if (init) l.link.init = init;
  const replies: Rpc[] = [];
  for (const m of msgs) {
    const r = await l.link.send(m, await authHeaders(d.db, c), { signal });
    if (r) replies.push(r);
  }
  return { replies, sessionId: sid || undefined };
}

async function viaHttp(d: Deps, c: Conn, run: { runId: string }, req: FastifyRequest, msgs: Rpc[], signal: AbortSignal) {
  const url = remoteUrl(c);
  const o = {
    sessionId: req.headers['mcp-session-id'] ? String(req.headers['mcp-session-id']) : undefined,
    protocol: req.headers['mcp-protocol-version'] ? String(req.headers['mcp-protocol-version']) : undefined,
    signal,
    // What the app asks of its client while it works (a form) goes to the session; it ends if the agent hangs up.
    onRequest: (m: Rpc) => answerApp(d, run.runId, c.entry.name, m, signal),
  };
  const body = msgs.length === 1 ? msgs[0] : msgs;
  try {
    return await postHttp(url, body, await authHeaders(d.db, c), o);
  } catch (e) {
    if (!(e instanceof Unauthorized) || c.entry.auth.type !== 'oauth') throw e;
    // The token may have ended early: renewed once, then tried again.
    return postHttp(url, body, await authHeaders(d.db, c, true), o);
  }
}

// ---- routes -------------------------------------------------------------------------------------------

export function relayRoutes(d: Deps) {
  d.app.post('/connections/mcp/:token/:app', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const run = runFor(d, req);
    if (!run) return reply.code(404).send({ error: 'No session runs with that address' });
    const body = req.body as Rpc | Rpc[];
    const list = Array.isArray(body) ? body : [body];
    if (!list.length || list.some((m) => !m || typeof m !== 'object')) return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    const asked = list.filter(isRequest);
    const out = (replies: Rpc[], sessionId?: string) => {
      if (!asked.length) return reply.code(202).send();
      const byId = new Map(replies.map((r) => [String(r.id), r]));
      const all = asked.map((m) => byId.get(String(m.id)) ?? { jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'The app gave no answer' } });
      return send(reply, Array.isArray(body) ? all : all[0], sessionId);
    };
    const fail = (message: string) => out(asked.map((m) => ({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message } })));
    const c = connection(d.db, String((req.params as { app: string }).app));
    if (!c || c.entry.server.transport === 'stdio') return fail('That service is not connected here');
    if (!onFor(c, sessionExtra(d.db, run.key))) return fail(`${c.entry.name} is turned off for this session`);
    if (c.status === 'signin') return fail(`${c.entry.name} needs connecting again (Settings → Connections)`);
    // Calls to tools that are off are answered here; the rest go to the app.
    const replies: Rpc[] = [];
    const forward: Rpc[] = [];
    // The agent hung up (it gave up on a call, or was stopped): a form waiting for the user ends with it.
    const ac = new AbortController();
    reply.raw.once('close', () => ac.abort());
    for (const m of list.map(withForms)) {
      const tool = String(m.params?.name ?? '');
      // A call to a tool that is off never reaches the app, answered or not (a call without an id is dropped).
      if (m.method === 'tools/call' && !toolOn(c, tool)) {
        if (isRequest(m)) replies.push({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `${c.entry.name}'s ${tool} tool is turned off (Settings → Connections).` }], isError: true } });
      } else forward.push(m);
    }
    let sessionId: string | undefined;
    if (forward.length) {
      try {
        const r = c.entry.server.transport === 'sse' ? await viaSse(d, c, run, req, forward, ac.signal) : await viaHttp(d, c, run, req, forward, ac.signal);
        if (r.status !== undefined) {
          // The app forgot the session (it restarted): told so, the agent starts a new one.
          if (r.status === 404 && req.headers['mcp-session-id']) return reply.code(404).send({ error: 'No such session' });
          if (!r.replies.length && r.status >= 400) return fail(`${c.entry.name} answered ${r.status}${r.text ? `: ${r.text.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
        }
        replies.push(...r.replies);
        sessionId = r.sessionId;
      } catch (e) {
        if (e instanceof Unauthorized) {
          const oauth = c.entry.auth.type === 'oauth';
          setStatus(d.db, c.id, oauth ? 'signin' : 'error', oauth ? 'The sign-in was refused: connect again' : 'The key was refused');
          return fail(oauth ? `${c.entry.name} refused the sign-in: the user needs to connect it again in Settings → Connections` : `${c.entry.name} refused its key (Settings → Connections)`);
        }
        return fail(`${c.entry.name}: ${(e as Error).message}`);
      }
    }
    // Only the tools that are on are listed.
    const lists = new Set(forward.filter((m) => m.method === 'tools/list').map((m) => String(m.id)));
    for (const r of replies) if (lists.has(String(r.id)) && Array.isArray(r.result?.tools)) r.result.tools = r.result.tools.filter((t: { name?: unknown }) => toolOn(c, String(t?.name)));
    return out(replies, sessionId);
  });

  // No stream from here to the agent: clients fall back to plain request and reply.
  d.app.get('/connections/mcp/:token/:app', async (_req, reply) => reply.code(405).header('Allow', 'POST, DELETE').send());
  d.app.delete('/connections/mcp/:token/:app', async (req, reply) => {
    const run = runFor(d, req);
    const c = run ? connection(d.db, String((req.params as { app: string }).app)) : null;
    const sid = String(req.headers['mcp-session-id'] ?? '');
    if (run && c && sid) {
      const l = links.get(`${run.runId} ${c.id} ${sid}`);
      if (l) {
        l.link.close();
        links.delete(`${run.runId} ${c.id} ${sid}`);
      } else if (c.entry.server.transport === 'http') {
        void authHeaders(d.db, c)
          .then((h) => fetch(remoteUrl(c), { method: 'DELETE', headers: { ...h, 'mcp-session-id': sid }, signal: AbortSignal.timeout(10_000), redirect: 'manual' }))
          .catch(() => {});
      }
    }
    return reply.code(204).send();
  });

  // Over HTTP only while the socket is not listening (it could not start).
  d.app.post('/connections/elicit/:token/:app', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (socketFile || !runFor(d, req)) return reply.code(404).send({ error: 'No session runs with that address' });
    const p = req.params as { token: string; app: string };
    const c = connection(d.db, p.app);
    if (!c) return reply.code(404).send({ error: 'That service is not connected here' });
    const ac = new AbortController();
    reply.raw.once('close', () => ac.abort());
    return askForm(d, runOf(p.token)!, c.entry.name, (req.body ?? {}) as Record<string, unknown>, ac.signal);
  });
  d.app.get('/connections/launch/:token/:app', async (req, reply) => {
    if (socketFile || !runFor(d, req)) return reply.code(404).send({ error: 'No session runs with that address' });
    const p = req.params as { token: string; app: string };
    const r = launchSpec(d, p.token, p.app);
    return reply.code(r.status).header('cache-control', 'no-store').send(r.body);
  });
}
